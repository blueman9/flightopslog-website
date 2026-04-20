import { useState } from 'react'
import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'

type SpreadsheetApp = 'excel' | 'numbers' | 'sheets'

const tabs: { id: SpreadsheetApp; label: string }[] = [
  { id: 'excel', label: 'Microsoft Excel' },
  { id: 'numbers', label: 'Apple Numbers' },
  { id: 'sheets', label: 'Google Sheets' },
]

function ImportTemplate() {
  const [activeTab, setActiveTab] = useState<SpreadsheetApp>('excel')
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
        <h1 className="text-3xl font-bold mb-2">Import Template</h1>
        <p className="text-secondary-text mb-8">
          Bringing flights over from a paper logbook, another app, or a spreadsheet?
          Use our CSV template to enter them in bulk, then import the file into FlightOps Log.
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed">
          <Section title="Download the template">
            <a
              href="/flight_import_template.csv"
              download
              className="inline-block bg-action text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Download flight_import_template.csv
            </a>
            <p className="text-secondary-text mt-3">
              The template includes one example row showing the expected format —
              delete or overwrite it with your own flights.
            </p>
          </Section>

          <Section title="Quick steps">
            <ol className="list-decimal list-outside ml-5 space-y-2">
              <li>Download the template above.</li>
              <li>Open it in your spreadsheet app (Excel, Numbers, or Google Sheets).</li>
              <li>Replace the example row with your flights — one row per flight.</li>
              <li>Save or export the file as CSV (see the next section for per-app instructions).</li>
              <li>
                Open the CSV on your iPhone or iPad, then in FlightOps Log go to{' '}
                <strong>Settings → Data Management → Import from CSV</strong>.
              </li>
            </ol>
          </Section>

          <Section title="Editing in Excel, Numbers, or Google Sheets">
            <p className="mb-4">
              Each app has its own way of exporting CSV. Use the exact option listed
              below — other "CSV" options can mangle characters or change the format.
            </p>

            <div
              role="tablist"
              aria-label="Spreadsheet app"
              className="flex gap-1 border-b border-secondary-text/20 mb-4"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    id={`tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={
                      'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ' +
                      (isActive
                        ? 'border-action text-action'
                        : 'border-transparent text-secondary-text hover:text-primary')
                    }
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {activeTab === 'excel' && (
              <div
                role="tabpanel"
                id="panel-excel"
                aria-labelledby="tab-excel"
                className="bg-card rounded-lg border border-secondary-text/20 p-5"
              >
                <ul className="list-disc list-outside ml-5 space-y-1">
                  <li>Edit normally.</li>
                  <li>
                    When saving, choose{' '}
                    <strong>File → Save As → CSV UTF-8 (Comma delimited) (*.csv)</strong>.
                  </li>
                  <li>
                    Do <em>not</em> use the plain "CSV (Comma delimited)" option — it
                    can corrupt non-ASCII characters in remarks.
                  </li>
                </ul>
              </div>
            )}

            {activeTab === 'numbers' && (
              <div
                role="tabpanel"
                id="panel-numbers"
                aria-labelledby="tab-numbers"
                className="bg-card rounded-lg border border-secondary-text/20 p-5"
              >
                <ul className="list-disc list-outside ml-5 space-y-1">
                  <li>Edit normally.</li>
                  <li>
                    Export via <strong>File → Export To → CSV…</strong>.
                  </li>
                  <li>
                    Expand <strong>Advanced Options</strong> and set{' '}
                    <strong>Text Encoding: Unicode (UTF-8)</strong>.
                  </li>
                </ul>
              </div>
            )}

            {activeTab === 'sheets' && (
              <div
                role="tabpanel"
                id="panel-sheets"
                aria-labelledby="tab-sheets"
                className="bg-card rounded-lg border border-secondary-text/20 p-5"
              >
                <ul className="list-disc list-outside ml-5 space-y-1">
                  <li>Edit normally.</li>
                  <li>
                    Export via{' '}
                    <strong>File → Download → Comma Separated Values (.csv)</strong>.
                  </li>
                  <li>Google Sheets uses UTF-8 by default — no extra settings needed.</li>
                </ul>
              </div>
            )}

            <p className="text-secondary-text mt-4">
              Heads up: spreadsheet apps will "helpfully" strip leading zeros from
              tail and flight numbers. See the pitfalls below to work around this.
            </p>
          </Section>

          <Section title="Common pitfalls">
            <ul className="list-disc list-outside ml-5 space-y-3">
              <li>
                <strong>Flight times are decimal hours, not <code>H:MM</code></strong> —
                use <code>1.5</code> for one and a half hours, not <code>1:30</code>.
              </li>
              <li>
                <strong>Leave cells blank when a field doesn't apply</strong> —
                don't enter <code>0</code> where there's nothing to log. It keeps
                your totals honest.
              </li>
              <li>
                <strong>Format Tail Number and Flight Number columns as Text</strong>{' '}
                so leading zeros survive save and export.
              </li>
              <li>
                <strong>Date and Total Time are the only required columns</strong> —
                everything else is optional.
              </li>
              <li>
                <strong>Column order and header names are flexible.</strong> The app
                auto-detects common variants (e.g., <code>Tail</code>,{' '}
                <code>Registration</code>, <code>N-Number</code>) and lets you map
                anything it doesn't recognize in one tap during import.
              </li>
            </ul>
          </Section>

          <Section title="Troubleshooting">
            <p>
              If the import fails, open your CSV in a plain text editor (TextEdit,
              Notepad) and confirm it's comma-separated with the original header row
              intact. Still stuck? Email{' '}
              <a href="mailto:support@flightopslog.com" className="text-action underline">
                support@flightopslog.com
              </a>
              .
            </p>
          </Section>
        </div>
      </article>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      {children}
    </section>
  )
}


export default ImportTemplate
