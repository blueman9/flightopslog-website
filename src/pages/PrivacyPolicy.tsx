import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-surface text-primary">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link to="/" className="flex items-center gap-3 no-underline text-primary">
          <img src={logo} alt="FlightOps Log" className="w-10 h-10 rounded-lg" />
          <span className="text-xl font-bold tracking-tight">FlightOps Log</span>
        </Link>
        <a
          href="https://apps.apple.com"
          className="bg-action text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Download on the App Store
        </a>
      </nav>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-secondary-text mb-8">Effective date: April 12, 2026</p>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <Section title="Introduction">
            <p>
              FlightOps Log ("we," "our," or "the app") is committed to protecting your
              privacy. This Privacy Policy explains how we collect, use, and safeguard your
              information when you use our iOS application.
            </p>
          </Section>

          <Section title="Information We Collect">
            <p>
              FlightOps Log is designed with a privacy-first approach. The app stores your
              flight log data locally on your device and syncs it to your personal iCloud
              account using Apple's CloudKit service.
            </p>
            <p className="mt-3">We do <strong>not</strong> collect:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Personal identification information (name, email, phone number)</li>
              <li>Location or GPS data</li>
              <li>Advertising identifiers</li>
            </ul>
          </Section>

          <Section title="Analytics and Crash Reporting">
            <p>
              FlightOps Log uses Firebase Crashlytics to collect crash reports and
              error diagnostics. This helps us identify and fix issues to improve app
              stability. Crash reports may include device type, OS version, and the
              state of the app at the time of the error.
            </p>
            <p className="mt-3">
              The app also uses Firebase Analytics to collect anonymous usage data
              such as session information, device type, and feature usage. This data
              helps us understand how the app is used so we can improve it. No
              personally identifiable information is collected, and this data is never
              used for advertising.
            </p>
          </Section>

          <Section title="Data Storage and Sync">
            <p>
              All flight log data is stored locally on your device and, if you are signed
              into iCloud, synced to your personal iCloud account via Apple's CloudKit.
              This data is governed by Apple's privacy policy and your iCloud account
              settings. We do not have access to your iCloud data.
            </p>
          </Section>

          <Section title="Third-Party Services">
            <p>
              FlightOps Log uses the following third-party services:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <strong>Apple CloudKit</strong> — iCloud sync of your flight data, governed
                by{' '}
                <a
                  href="https://www.apple.com/legal/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action underline"
                >
                  Apple's Privacy Policy
                </a>
              </li>
              <li>
                <strong>Firebase Crashlytics</strong> — crash and error reporting for app
                stability
              </li>
              <li>
                <strong>Firebase Analytics</strong> — anonymous usage analytics for app
                improvement
              </li>
            </ul>
            <p className="mt-3">
              No advertising services or ad networks are integrated into the app.
            </p>
          </Section>

          <Section title="Data Retention">
            <p>
              Your flight log data remains on your device and in your iCloud account for
              as long as you choose to keep it. Deleted flights are retained locally for
              30 days before permanent removal to allow for recovery. You can export or
              delete your data at any time from within the app.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              FlightOps Log is not directed at children under the age of 13 and does not
              knowingly collect personal information from children.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Any changes will be
              reflected on this page with an updated effective date. We encourage you to
              review this policy periodically.
            </p>
          </Section>

          <Section title="Contact Us">
            <p>
              If you have any questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:support@flightopslog.com" className="text-action underline">
                support@flightopslog.com
              </a>.
            </p>
          </Section>
        </div>
      </article>

      {/* Footer */}
      <footer className="text-center text-secondary-text text-sm py-8 border-t border-secondary-text/20">
        <p>&copy; {new Date().getFullYear()} FlightOps Log. All rights reserved.</p>
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

export default PrivacyPolicy
