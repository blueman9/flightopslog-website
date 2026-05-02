import { useState, useEffect } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Feedback } from './types'
import { createLinearIssue, LinearError } from './linearClient'

interface Props {
  feedback: Feedback
  onClose: () => void
  onCreated: (feedbackId: string, linearIssueUrl: string) => void
  onPartialFailure: (feedbackId: string, linearIssueUrl: string) => void
}

export default function ConvertToLinearModal({
  feedback,
  onClose,
  onCreated,
  onPartialFailure,
}: Props) {
  const [title, setTitle] = useState(deriveTitle(feedback))
  const [description, setDescription] = useState(deriveDescription(feedback))
  const [labelFeedback, setLabelFeedback] = useState(true)
  const [labelBug, setLabelBug] = useState(feedback.category === 'bug')
  const [labelFeature, setLabelFeature] = useState(feedback.category === 'feature')
  const [labelQuestion, setLabelQuestion] = useState(feedback.category === 'question')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function submit() {
    setError(null)
    setBusy(true)
    const labels: string[] = []
    if (labelFeedback) labels.push('feedback')
    if (labelBug) labels.push('Bug')
    if (labelFeature) labels.push('Feature')
    if (labelQuestion) labels.push('question')

    let url: string
    try {
      const issue = await createLinearIssue({ title, description, labels })
      url = issue.url
    } catch (err: unknown) {
      const e = err instanceof LinearError ? err : null
      const msg = (() => {
        if (!e) return err instanceof Error ? err.message : 'Unknown error.'
        if (e.status === 401) return 'Authentication expired. Sign out and back in.'
        if (e.status === 403) return "This account isn't allowed to create Linear issues."
        if (e.status === 400) return `Invalid request: ${e.message}`
        if (e.status === 504) return "Couldn't reach Linear. Try again."
        if (e.status === 502 && e.code === 'linear_lookup_failed')
          return "Couldn't find the FlightOpsLog team in Linear."
        if (e.status === 502) return e.message
        if (e.status === 500) return "Server isn't configured. Set LINEAR_API_KEY in Pages."
        if (e.status === 0) return `Network error: ${e.message}`
        return e.message || 'Unknown error.'
      })()
      setError(msg)
      setBusy(false)
      return
    }

    try {
      await updateDoc(doc(db, 'feedback', feedback.id), {
        status: 'triaged',
        linearIssueUrl: url,
      })
      onCreated(feedback.id, url)
    } catch {
      onPartialFailure(feedback.id, url)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-secondary-text/20">
          <h2 className="text-lg font-bold">Convert to Linear issue</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              className="w-full bg-surface rounded-lg px-3 py-2 border border-secondary-text/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={50000}
              rows={12}
              className="w-full bg-surface rounded-lg px-3 py-2 border border-secondary-text/20 font-mono text-sm"
            />
          </div>
          <div>
            <span className="block text-sm font-medium mb-2">Labels</span>
            <div className="flex flex-wrap gap-3 text-sm">
              <Checkbox checked={labelFeedback} onChange={setLabelFeedback} label="feedback" />
              <Checkbox checked={labelBug} onChange={setLabelBug} label="Bug" />
              <Checkbox checked={labelFeature} onChange={setLabelFeature} label="Feature" />
              <Checkbox checked={labelQuestion} onChange={setLabelQuestion} label="question" />
            </div>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-secondary-text/20 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-secondary-text hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="px-4 py-2 bg-action text-white rounded-lg disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create issue'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function deriveTitle(f: Feedback): string {
  if (f.subject) return f.subject
  const head = f.body.split('\n')[0].trim()
  const truncated = head.length > 80 ? head.slice(0, 80).trimEnd() + '…' : head
  return `[${f.category}] ${truncated}`
}

function deriveDescription(f: Feedback): string {
  const lines = [f.body, '', '---']
  lines.push(`App version: ${f.appVersion} (${f.buildNumber})`)
  lines.push(`iOS: ${f.iosVersion} — ${f.deviceModel}`)
  lines.push(`Locale: ${f.locale}`)
  lines.push(`Origin screen: ${f.originScreen}`)
  lines.push(`iCloud: ${f.iCloudState}`)
  lines.push(
    `Counts: ${f.flightCount} flights, ${f.pendingSyncCount} pending sync, ${f.conflictCount} conflicts`,
  )
  if (f.contactEmail) lines.push(`Contact: ${f.contactEmail}`)
  lines.push(`Feedback ID: ${f.id}`)
  return lines.join('\n')
}
