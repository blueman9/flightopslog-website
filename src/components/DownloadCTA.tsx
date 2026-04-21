import { Link } from 'react-router-dom'

type DownloadCTAProps = {
  size?: 'compact' | 'large'
  className?: string
}

const compactClasses =
  'bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity'
const largeClasses =
  'bg-action text-white px-8 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity'

function DownloadCTA({ size = 'compact', className }: DownloadCTAProps) {
  const label =
    size === 'large' ? 'Join the public beta on TestFlight' : 'Try the public beta'
  const base = size === 'large' ? largeClasses : compactClasses

  return (
    <Link to="/testflight" className={className ? `${base} ${className}` : base}>
      {label}
    </Link>
  )
}

export default DownloadCTA
