import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import DownloadCTA from '../components/DownloadCTA'

const faqs = [
  {
    question: 'How do I sync my logbook across devices?',
    answer:
      'Sign into iCloud on each device, then enable iCloud sync in the app\u2019s settings. Your flight data will sync automatically across all your Apple devices.',
  },
  {
    question: 'How do I export my flight data?',
    answer:
      'Open the app and navigate to the export feature. You can export your flights to CSV for use in spreadsheets, or create a full backup in .plbbackup format for safekeeping or transferring to another device.',
  },
  {
    question: 'How do I bulk import existing flights?',
    answer: (
      <>
        Download our CSV import template, fill it in with your flights in a spreadsheet app, and
        import the file from Settings → Data Management → Import from CSV. See the full guide on
        the{' '}
        <Link to="/import-template" className="text-action underline">
          Import Template
        </Link>{' '}
        page.
      </>
    ),
  },
  {
    question: 'What iOS version is required?',
    answer: 'FlightOps Log requires iOS 17.0 or later.',
  },
  {
    question: 'Is my data private and secure?',
    answer:
      'Yes. Your flight data is stored locally on your device and, if you enable iCloud sync, in your personal iCloud container that only you can access. We do not collect, store, or have access to your data.',
  },
  {
    question: 'How do I recover deleted flights?',
    answer:
      'Deleted flights are retained for 30 days before permanent removal. During that window, you can recover them from within the app.',
  },
]

function Support() {
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

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Support</h1>
        <p className="text-secondary-text mb-8">
          Have a question or need help? We're here for you.
        </p>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <Section title="Contact Us">
            <p>
              For questions, feedback, or issues, email us at{' '}
              <a href="mailto:support@flightopslog.com" className="text-action underline">
                support@flightopslog.com
              </a>
              . Replies may take a few days — thanks for your patience.
            </p>
          </Section>

          <Section title="Frequently Asked Questions">
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="bg-card rounded-lg border border-secondary-text/20"
                >
                  <summary className="font-semibold cursor-pointer px-4 py-3">
                    {faq.question}
                  </summary>
                  <p className="text-secondary-text px-4 pb-4">{faq.answer}</p>
                </details>
              ))}
            </div>
          </Section>

          <p className="text-secondary-text">
            For details on how we handle your data, see our{' '}
            <Link to="/privacy" className="text-action underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </article>

      {/* Footer */}
      <footer className="text-center text-secondary-text text-sm py-8 border-t border-secondary-text/20">
        <p>&copy; {new Date().getFullYear()} FlightOps Log. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link to="/privacy" className="text-secondary-text hover:text-primary transition-colors">
            Privacy Policy
          </Link>
          <Link to="/import-template" className="text-secondary-text hover:text-primary transition-colors">
            Import Template
          </Link>
          <Link to="/testflight" className="text-secondary-text hover:text-primary transition-colors">
            Beta
          </Link>
        </div>
      </footer>
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

export default Support
