import type { Attachment } from './types'

interface Props {
  attachments: Attachment[]
  archivedToLinear: boolean
}

export default function AttachmentsBlock({ attachments, archivedToLinear }: Props) {
  const images = attachments.filter((a) => a.kind === 'image')
  const csvs = attachments.filter((a) => a.kind === 'csv')

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-secondary-text uppercase tracking-wide">
        Attachments
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((a) => (
            <a
              key={a.filename}
              href={a.downloadURL}
              target="_blank"
              rel="noreferrer"
              className="block"
              title={`${a.filename} — ${formatSize(a.sizeBytes)}`}
            >
              <img
                src={a.downloadURL}
                alt={a.filename}
                loading="lazy"
                className="w-24 h-24 object-cover rounded-md border border-secondary-text/20"
              />
              <div className="mt-1 text-xs text-secondary-text max-w-24 truncate">
                {formatSize(a.sizeBytes)}
              </div>
            </a>
          ))}
        </div>
      )}

      {csvs.map((a) => (
        <a
          key={a.filename}
          href={a.downloadURL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-action hover:underline"
        >
          <span aria-hidden>📎</span>
          <span>{a.filename}</span>
          <span className="text-xs text-secondary-text">({formatSize(a.sizeBytes)})</span>
        </a>
      ))}

      {archivedToLinear && (
        <div className="text-xs text-secondary-text italic">
          Archived to Linear — eligible for storage cleanup.
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
