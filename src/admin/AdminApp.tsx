import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from './firebase'
import SignIn from './SignIn'
import FeedbackList from './FeedbackList'

const ADMIN_EMAIL = 'blueman9@gmail.com'

type AuthState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: User }

export default function AdminApp() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setState(user ? { kind: 'signed-in', user } : { kind: 'signed-out' })
    })
  }, [])

  if (state.kind === 'loading') {
    return <div className="min-h-screen bg-surface" />
  }
  if (state.kind === 'signed-out') {
    return <SignIn />
  }

  const { user } = state
  if (user.email !== ADMIN_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-primary px-4">
        <div className="bg-card rounded-xl p-8 shadow-sm max-w-md w-full text-center">
          <h1 className="text-xl font-bold mb-2">Not authorized</h1>
          <p className="text-secondary-text mb-6">
            <code className="text-sm">{user.email ?? '(no email)'}</code> isn't allowed here.
          </p>
          <button
            onClick={() => void signOut(auth)}
            className="bg-action text-white rounded-lg px-4 py-2"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface text-primary">
      <header className="border-b border-secondary-text/20 px-6 py-3 flex items-center justify-between">
        <span className="font-bold">FlightOps Log Admin</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-secondary-text">{user.email}</span>
          <button onClick={() => void signOut(auth)} className="text-action hover:underline">
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6">
        <FeedbackList />
      </main>
    </div>
  )
}
