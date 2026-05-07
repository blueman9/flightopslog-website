import { useEffect } from 'react'
import type { Feedback } from './types'

interface Props {
  eligible: Feedback[]
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function CleanupModal({ eligible, busy, onConfirm, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const fileCount = eligible.reduce((sum, f) => sum + (f.attachments?.length ?? 0), 0)
  const byteSum = eligible.reduce(
    (sum, f) => sum + (f.attachments?.reduce((s, a) => s + a.sizeBytes, 0) ?? 0),
    0,
  )
  const sizeStr =
    byteSum < 1024 * 1024
      ? `${Math.round(byteSum / 1024)} KB`
      : `${(byteSum / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-xl shadow-lg w-full max-w-md">
        <div className="p-6 border-b border-secondary-text/20">
          <h2 className="text-lg font-bold">Clean up Storage</h2>
        </div>
        <div className="p-6 space-y-3 text-sm">
          <p>
            About to delete <strong>{fileCount}</strong> attachment(s) across{' '}
            <strong>{eligible.length}</strong> feedback item(s), freeing ~<strong>{sizeStr}</strong>.
          </p>
          <p className="text-secondary-text text-xs">
            Eligible items are triaged and either already archived to Linear, or were discarded
            without filing. This cannot be undone.
          </p>
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
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 bg-error text-white rounded-lg disabled:opacity-50"
          >
            {busy ? 'Cleaning…' : 'Confirm cleanup'}
          </button>
        </div>
      </div>
    </div>
  )
}
