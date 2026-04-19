import { Link } from 'react-router-dom'
import logo from './assets/logo.png'

function App() {
  return (
    <div className="min-h-screen bg-surface text-primary">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <img src={logo} alt="FlightOps Log" className="w-10 h-10 rounded-lg" />
          <span className="text-xl font-bold tracking-tight">FlightOps Log</span>
        </div>
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Download on the App Store
        </a>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 py-20 max-w-3xl mx-auto">
        <img
          src={logo}
          alt="FlightOps Log app icon"
          className="w-32 h-32 rounded-2xl shadow-lg mb-8"
        />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Your flights. <span className="text-accent">One logbook.</span>
        </h1>
        <p className="text-secondary-text text-lg max-w-xl mb-8">
          A professional pilot logbook built for military and civilian aviators.
          Bridge military flight categories with FAA requirements — all synced
          across your devices.
        </p>
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-8 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity"
        >
          Get it free on the App Store
        </a>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Built for real pilots</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            title="Military & Civilian"
            description="Log Primary, Secondary, Instructor, and Evaluator time alongside PIC, SIC, and Dual Given — all in one entry."
          />
          <FeatureCard
            title="iCloud Sync"
            description="Your logbook syncs automatically across all your Apple devices. Local-first design means it works offline."
          />
          <FeatureCard
            title="Free to Use"
            description="Everything you need to log your flights — no subscriptions, no ads. The tools that matter are free, always."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-secondary-text text-sm py-8 border-t border-secondary-text/20">
        <p>&copy; {new Date().getFullYear()} FlightOps Log. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/support" className="text-secondary-text hover:text-primary transition-colors">
            Support
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-card rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-secondary-text">{description}</p>
    </div>
  )
}

export default App
