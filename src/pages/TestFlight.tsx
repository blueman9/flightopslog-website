import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import DownloadCTA from '../components/DownloadCTA'
import Footer from '../components/Footer'

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/x77FsCXN'
const FEEDBACK_EMAIL =
  'mailto:support@flightopslog.com?subject=FlightOps%20Log%20Beta%20Feedback'

function TestFlight() {
  return (
    <div className="min-h-screen bg-surface text-primary">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link to="/" className="flex items-center gap-3 no-underline text-primary">
          <img src={logo} alt="FlightOps Log" className="w-10 h-10 rounded-lg" />
          <span className="text-xl font-bold tracking-tight">FlightOps Log</span>
        </Link>
        <DownloadCTA />
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-12 pb-8 max-w-3xl mx-auto">
        <img
          src={logo}
          alt="FlightOps Log app icon"
          className="w-24 h-24 rounded-2xl shadow-lg mb-6"
        />
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
          FlightOps Log <span className="text-accent">Public Beta</span>
        </h1>
        <p className="text-secondary-text text-lg max-w-xl mb-6">
          A professional pilot logbook built for military and civilian aviators.
          Free, in active development, and open to anyone who wants to help shape it.
        </p>
        <a
          href={TESTFLIGHT_URL}
          className="bg-action text-white px-8 py-3 rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity"
        >
          Join the Beta
        </a>
        <p className="text-secondary-text text-sm mt-3">
          Requires an iPhone running iOS 17 or later.
        </p>
      </section>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-8">
        <div className="space-y-10 text-[15px] leading-relaxed">
          <Section title="What to expect">
            <ul className="list-disc list-outside ml-5 space-y-2">
              <li>
                You're testing pre-release software — things may change, break, or
                look rough in spots.
              </li>
              <li>
                Updates roll out often. TestFlight will notify you when a new build
                is available.
              </li>
              <li>
                Your flight data is safe — the beta uses the same iCloud sync as
                release builds. Keeping a CSV export as a backup is still a good
                habit.
              </li>
              <li>
                Beta builds automatically expire when a new build replaces them —
                TestFlight handles the upgrade for you.
              </li>
            </ul>
          </Section>

          <Section title="How to install">
            <p className="mb-3">
              Already have TestFlight? Tap <strong>Join the Beta</strong> above on
              your iPhone — that's it.
            </p>
            <details className="bg-card rounded-lg border border-secondary-text/20">
              <summary className="font-semibold cursor-pointer px-4 py-3">
                First time using TestFlight?
              </summary>
              <div className="px-4 pb-4 text-secondary-text">
                <ol className="list-decimal list-outside ml-5 space-y-2">
                  <li>
                    Install Apple's <strong>TestFlight</strong> app from the App
                    Store.
                  </li>
                  <li>
                    Tap <strong>Join the Beta</strong> above on your iPhone.
                  </li>
                  <li>Accept the invitation in TestFlight.</li>
                  <li>
                    Tap <strong>Install</strong> to get FlightOps Log.
                  </li>
                </ol>
              </div>
            </details>
          </Section>

          <Section title="Sending feedback">
            <p className="mb-3">
              <strong>Quick bugs and screenshots.</strong> Take a screenshot in
              FlightOps Log, then tap <strong>Share Beta Feedback</strong>.
              TestFlight attaches device info and diagnostics automatically.
            </p>
            <p>
              <strong>Ideas, questions, longer feedback.</strong> Email{' '}
              <a href={FEEDBACK_EMAIL} className="text-action underline">
                support@flightopslog.com
              </a>{' '}
              — the subject is pre-filled so we can route it quickly.
            </p>
          </Section>
        </div>
      </article>

      <Footer />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      {children}
    </section>
  )
}

export default TestFlight
