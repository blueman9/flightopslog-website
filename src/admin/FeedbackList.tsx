import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'
import FeedbackRow from './FeedbackRow'
import ConvertToLinearModal from './ConvertToLinearModal'
import CleanupModal from './CleanupModal'
import { cleanupAttachments } from './linearClient'

export default function FeedbackList() {
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Feedback | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const snap = await getDocs(
        query(collection(db, 'feedback'), orderBy('createdAt', 'desc')),
      )
      const docs: Feedback[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Feedback, 'id'>),
      }))
      setItems(docs)
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      setError(
        code === 'permission-denied'
          ? 'Firestore denied this read. Rules may not be deployed yet.'
          : "Couldn't reach Firestore.",
      )
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function patchItem(id: string, patch: Partial<Feedback>) {
    setItems((prev) => (prev ? prev.map((f) => (f.id === id ? { ...f, ...patch } : f)) : prev))
  }

  function removeItem(id: string) {
    setItems((prev) => (prev ? prev.filter((f) => f.id !== id) : prev))
  }

  function onCreated(feedbackId: string, url: string, archived: boolean) {
    const patch: Partial<Feedback> = { status: 'triaged', linearIssueUrl: url }
    if (archived) patch.attachmentsArchivedToLinear = true
    patchItem(feedbackId, patch)
    setConvertTarget(null)
  }

  function onPartialFailure(feedbackId: string, url: string, archived: boolean) {
    const patch: Partial<Feedback> = { linearIssueUrl: url }
    if (archived) patch.attachmentsArchivedToLinear = true
    patchItem(feedbackId, patch)
    setConvertTarget(null)
    setToast(
      `Issue created at ${url}, but couldn't mark this feedback as triaged. Click 'Mark triaged' to fix it.`,
    )
  }

  const filtered = items?.filter((f) => showAll || f.status !== 'triaged') ?? []

  const eligibleForCleanup = useMemo(() => {
    if (!items) return []
    return items.filter((f) => {
      if (f.status !== 'triaged') return false
      if (!f.attachments || f.attachments.length === 0) return false
      const hasLinear = typeof f.linearIssueUrl === 'string' && f.linearIssueUrl.length > 0
      const archived = f.attachmentsArchivedToLinear === true
      return archived || !hasLinear
    })
  }, [items])

  async function runCleanup() {
    setCleanupBusy(true)
    try {
      const ids = eligibleForCleanup.map((f) => f.id)
      const resp = await cleanupAttachments(ids)
      const cleanedSet = new Set(
        resp.results.filter((r) => r.status === 'cleaned').map((r) => r.feedbackId),
      )
      setItems((prev) =>
        prev
          ? prev.map((f) => (cleanedSet.has(f.id) ? { ...f, attachments: undefined } : f))
          : prev,
      )
      const { cleaned, skipped, partial, failed } = resp.summary
      setToast(`Cleaned ${cleaned}. Skipped ${skipped}. Partial ${partial}. Failed ${failed}.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cleanup failed.'
      setToast(`Cleanup failed: ${msg}`)
    } finally {
      setCleanupBusy(false)
      setCleanupOpen(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold">Feedback</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show triaged
        </label>
        <span className="flex-1" />
        <button
          onClick={() => setCleanupOpen(true)}
          disabled={eligibleForCleanup.length === 0 || cleanupBusy}
          className="text-sm text-action hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          Clean up Storage ({eligibleForCleanup.length})
        </button>
        <button
          onClick={() => void load()}
          disabled={refreshing}
          className="text-sm text-action hover:underline disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-error/10 text-error rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      {toast && (
        <div className="bg-warning/10 text-primary border border-warning/40 rounded-lg px-4 py-2 text-sm flex items-start gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-secondary-text">
            ✕
          </button>
        </div>
      )}

      {items === null && !error && <p className="text-secondary-text text-sm">Loading…</p>}

      {items !== null && filtered.length === 0 && !error && (
        <p className="text-secondary-text text-sm">No feedback to triage.</p>
      )}

      <div className="space-y-3">
        {filtered.map((f) => (
          <FeedbackRow
            key={f.id}
            feedback={f}
            onChanged={patchItem}
            onDeleted={removeItem}
            onConvert={setConvertTarget}
          />
        ))}
      </div>

      {convertTarget && (
        <ConvertToLinearModal
          feedback={convertTarget}
          onClose={() => setConvertTarget(null)}
          onCreated={onCreated}
          onPartialFailure={onPartialFailure}
        />
      )}

      {cleanupOpen && (
        <CleanupModal
          eligible={eligibleForCleanup}
          busy={cleanupBusy}
          onConfirm={() => void runCleanup()}
          onClose={() => setCleanupOpen(false)}
        />
      )}
    </div>
  )
}
