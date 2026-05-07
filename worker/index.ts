import { onRequestPost as linearCreateIssue } from './handlers/linear-create-issue'
import { onRequestPost as cleanupAttachments } from './handlers/cleanup-attachments'

declare global {
  interface Env {
    LINEAR_API_KEY: string
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/linear-create-issue' && request.method === 'POST') {
      return linearCreateIssue({ request, env })
    }
    if (url.pathname === '/api/cleanup-attachments' && request.method === 'POST') {
      return cleanupAttachments({ request })
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
