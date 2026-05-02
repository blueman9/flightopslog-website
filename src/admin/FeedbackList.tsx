import { useEffect, useState, useCallback } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'
import FeedbackRow from './FeedbackRow'
import ConvertToLinearModal from './ConvertToLinearModal'

export default function FeedbackList() {
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Feedback | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  function onCreated(feedbackId: string, url: string) {
    patchItem(feedbackId, { status: 'triaged', linearIssueUrl: url })
    setConvertTarget(null)
  }

  function onPartialFailure(feedbackId: string, url: string) {
    patchItem(feedbackId, { linearIssueUrl: url })
    setConvertTarget(null)
    setToast(
      `Issue created at ${url}, but couldn't mark this feedback as triaged. Click 'Mark triaged' to fix it.`,
    )
  }

  const filtered = items?.filter((f) => showAll || f.status !== 'triaged') ?? []

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
    </div>
  )
}
