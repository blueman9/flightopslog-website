import { useState, useEffect, useRef } from 'react'
import { doc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'

interface Props {
  feedback: Feedback
  onChanged: (id: string, patch: Partial<Feedback>) => void
  onDeleted: (id: string) => void
  onConvert: (feedback: Feedback) => void
}

export default function FeedbackRow({ feedback, onChanged, onDeleted, onConvert }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState<null | 'triage' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    },
    [],
  )

  async function markTriaged() {
    setError(null)
    setBusy('triage')
    try {
      await updateDoc(doc(db, 'feedback', feedback.id), { status: 'triaged' })
      onChanged(feedback.id, { status: 'triaged' })
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      setError(
        code === 'permission-denied'
          ? 'Permission denied. Rules may need redeploying.'
          : "Couldn't save. Try again.",
      )
    } finally {
      setBusy(null)
    }
  }

  function clickDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      confirmTimer.current = window.setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmDelete(false)
    void doDelete()
  }

  async function doDelete() {
    setError(null)
    setBusy('delete')
    try {
      await deleteDoc(doc(db, 'feedback', feedback.id))
      onDeleted(feedback.id)
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      setError(
        code === 'permission-denied'
          ? 'Permission denied. Rules may need redeploying.'
          : "Couldn't delete. Try again.",
      )
      setBusy(null)
    }
  }

  const ago = formatRelative(feedback.createdAt.toDate())
  const preview = feedback.subject ?? truncate(feedback.body, 120)

  return (
    <div className="bg-card rounded-xl shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <span className="text-xs text-secondary-text w-20 flex-shrink-0">{ago}</span>
        <CategoryPill category={feedback.category} />
        <StatusPill status={feedback.status} />
        <span className="flex-1 text-sm truncate">{preview}</span>
        {feedback.contactEmail && (
          <span className="text-xs text-secondary-text hidden sm:inline">
            {feedback.contactEmail}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-secondary-text/20 px-4 py-3 space-y-3">
          <pre className="whitespace-pre-wrap text-sm font-sans">{feedback.body}</pre>
          <TriageNoteEditor feedback={feedback} onChanged={onChanged} />
          <DiagnosticsBlock feedback={feedback} />
          {feedback.logs && (
            <details className="text-xs">
              <summary className="cursor-pointer text-action">View logs</summary>
              <pre className="mt-2 bg-surface rounded p-2 overflow-auto max-h-96">
                {feedback.logs}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="border-t border-secondary-text/20 px-4 py-2 flex items-center gap-3 text-sm">
        {feedback.linearIssueUrl ? (
          <a
            href={feedback.linearIssueUrl}
            target="_blank"
            rel="noreferrer"
            className="text-action hover:underline"
          >
            ↗ Linear issue
          </a>
        ) : (
          <button
            onClick={() => onConvert(feedback)}
            disabled={busy !== null}
            className="text-action hover:underline disabled:opacity-50"
          >
            Convert to Linear
          </button>
        )}
        {feedback.status !== 'triaged' && (
          <button
            onClick={markTriaged}
            disabled={busy !== null}
            className="text-action hover:underline disabled:opacity-50"
          >
            {busy === 'triage' ? 'Saving…' : 'Mark triaged'}
          </button>
        )}
        <span className="flex-1" />
        <button
          onClick={clickDelete}
          disabled={busy !== null}
          className={`hover:underline disabled:opacity-50 ${
            confirmDelete ? 'text-error font-semibold' : 'text-secondary-text'
          }`}
        >
          {busy === 'delete' ? 'Deleting…' : confirmDelete ? 'Confirm delete?' : 'Delete'}
        </button>
      </div>

      {error && (
        <div className="border-t border-error/20 px-4 py-2 text-xs text-error">{error}</div>
      )}
    </div>
  )
}

function TriageNoteEditor({
  feedback,
  onChanged,
}: {
  feedback: Feedback
  onChanged: (id: string, patch: Partial<Feedback>) => void
}) {
  const [note, setNote] = useState(feedback.triageNote ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const original = feedback.triageNote ?? ''
  const dirty = note !== original

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const trimmed = note.trim()
      const fieldValue = trimmed.length === 0 ? deleteField() : trimmed
      await updateDoc(doc(db, 'feedback', feedback.id), { triageNote: fieldValue })
      onChanged(feedback.id, { triageNote: trimmed.length === 0 ? undefined : trimmed })
      setNote(trimmed)
      setSavedAt(Date.now())
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      setError(
        code === 'permission-denied'
          ? 'Permission denied. Rules may need redeploying.'
          : "Couldn't save. Try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-secondary-text uppercase tracking-wide">
          Triage note
        </label>
        {savedAt !== null && !dirty && !saving && (
          <span className="text-xs text-secondary-text">Saved</span>
        )}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={5000}
        rows={3}
        placeholder="Optional — your thoughts on this feedback"
        className="w-full bg-surface rounded-lg px-3 py-2 border border-secondary-text/20 text-sm"
      />
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-action hover:underline disabled:opacity-50 disabled:hover:no-underline"
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
        {error && <span className="text-xs text-error">{error}</span>}
      </div>
    </div>
  )
}

function CategoryPill({ category }: { category: Feedback['category'] }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
      {category}
    </span>
  )
}

function StatusPill({ status }: { status: Feedback['status'] }) {
  const cls = status === 'triaged' ? 'bg-success/10 text-success' : 'bg-action/10 text-action'
  return <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${cls}`}>{status}</span>
}

function DiagnosticsBlock({ feedback }: { feedback: Feedback }) {
  const rows: Array<[string, string | number]> = [
    ['App version', `${feedback.appVersion} (${feedback.buildNumber})`],
    ['iOS', `${feedback.iosVersion} — ${feedback.deviceModel}`],
    ['Locale', feedback.locale],
    ['Origin screen', feedback.originScreen],
    ['iCloud', feedback.iCloudState],
    [
      'Counts',
      `${feedback.flightCount} flights, ${feedback.pendingSyncCount} pending sync, ${feedback.conflictCount} conflicts`,
    ],
  ]
  if (feedback.contactEmail) rows.push(['Contact', feedback.contactEmail])
  rows.push(['Feedback ID', feedback.id])

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-secondary-text">{k}</dt>
          <dd className="font-mono break-all">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

function formatRelative(d: Date): string {
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return d.toISOString().slice(0, 10)
}
