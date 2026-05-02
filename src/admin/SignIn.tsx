import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from './firebase'

export default function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setError(null)
    setBusy(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: string }).code
          : undefined
      if (code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. Try again.')
      } else if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the sign-in popup. Allow popups for flightopslog.com.')
      } else if (code === 'auth/network-request-failed') {
        setError("Couldn't reach Google. Check your connection.")
      } else {
        setError(err instanceof Error ? err.message : 'Sign-in failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-primary px-4">
      <div className="bg-card rounded-xl p-8 shadow-sm max-w-sm w-full">
        <h1 className="text-xl font-bold mb-4 text-center">Admin sign-in</h1>
        <button
          onClick={onClick}
          disabled={busy}
          className="w-full bg-action text-white rounded-lg py-3 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && <p className="mt-4 text-sm text-error">{error}</p>}
      </div>
    </div>
  )
}
