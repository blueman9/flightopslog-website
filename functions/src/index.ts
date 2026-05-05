import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'

const ADMIN_URL = 'https://flightopslog.com/admin'

export const onFeedbackCreated = onDocumentCreated(
  {
    document: 'feedback/{id}',
    region: 'us-central1',
    secrets: ['PUSHOVER_TOKEN', 'PUSHOVER_USER'],
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return

    const category = String(data.category ?? 'other')
    const subject = typeof data.subject === 'string' ? data.subject.trim() : ''
    const body = typeof data.body === 'string' ? data.body.trim() : ''
    const appVersion = String(data.appVersion ?? '?')
    const buildNumber = String(data.buildNumber ?? '?')
    const deviceModel = String(data.deviceModel ?? '?')

    const snippet = body.length > 200 ? body.slice(0, 200) + '…' : body
    const lines: string[] = []
    if (subject) lines.push(subject)
    if (snippet) lines.push(snippet)
    lines.push(`v${appVersion} (${buildNumber}) · ${deviceModel}`)

    const form = new URLSearchParams({
      token: process.env.PUSHOVER_TOKEN ?? '',
      user: process.env.PUSHOVER_USER ?? '',
      title: `New feedback: ${category}`,
      message: lines.join('\n'),
      url: ADMIN_URL,
      url_title: 'Open admin',
    })

    try {
      const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const text = await res.text()
        logger.error('Pushover non-2xx', { status: res.status, body: text })
        return
      }
      logger.info('Pushover sent', { feedbackId: event.params.id, category })
    } catch (err) {
      logger.error('Pushover request failed', { err: String(err) })
    }
  },
)
