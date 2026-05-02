import { onRequestPost } from './handlers/linear-create-issue'

declare global {
  interface Env {
    LINEAR_API_KEY: string
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/linear-create-issue' && request.method === 'POST') {
      return onRequestPost({ request, env })
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
