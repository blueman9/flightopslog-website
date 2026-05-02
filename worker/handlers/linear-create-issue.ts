import { jwtVerify, createRemoteJWKSet } from 'jose'

interface Env {
  LINEAR_API_KEY: string
}

interface RequestContext {
  request: Request
  env: Env
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

const ADMIN_EMAIL = 'blueman9@gmail.com'
const FIREBASE_PROJECT_ID = 'flightopslog'
const LINEAR_TEAM_KEY = 'FlightOpsLog'
const LINEAR_API = 'https://api.linear.app/graphql'

let cachedTeamId: string | null = null
const cachedLabelIds = new Map<string, string>()

interface RequestBody {
  title: string
  description: string
  labels?: string[]
}

function jsonResponse(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function linearGraphQL(apiKey: string, query: string, variables?: object) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Linear HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  const data = (await res.json()) as { data?: unknown; errors?: { message: string }[] }
  if (data.errors?.length) {
    throw new Error(`Linear: ${data.errors.map((e) => e.message).join('; ')}`)
  }
  return data.data as Record<string, unknown>
}

async function resolveTeamId(apiKey: string): Promise<string> {
  if (cachedTeamId) return cachedTeamId
  const data = await linearGraphQL(
    apiKey,
    `query($key: String!) {
       teams(filter: { key: { eq: $key } }) { nodes { id key } }
     }`,
    { key: LINEAR_TEAM_KEY },
  )
  const nodes = (data.teams as { nodes: { id: string; key: string }[] }).nodes
  const id = nodes[0]?.id
  if (!id) throw new Error(`Team key "${LINEAR_TEAM_KEY}" not found in Linear`)
  cachedTeamId = id
  return id
}

async function resolveLabelIds(apiKey: string, teamId: string, names: string[]): Promise<string[]> {
  const lower = names.map((n) => n.toLowerCase())
  const missing = lower.some((n) => !cachedLabelIds.has(n))
  if (missing) {
    const data = await linearGraphQL(
      apiKey,
      `query($teamId: String!) {
         team(id: $teamId) { labels { nodes { id name } } }
       }`,
      { teamId },
    )
    const labelNodes = (data.team as { labels: { nodes: { id: string; name: string }[] } })
      .labels.nodes
    for (const node of labelNodes) {
      cachedLabelIds.set(node.name.toLowerCase(), node.id)
    }
  }
  const ids: string[] = []
  for (const n of lower) {
    const id = cachedLabelIds.get(n)
    if (id) ids.push(id)
  }
  return ids
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  if (!env.LINEAR_API_KEY) {
    return jsonResponse(500, { error: 'misconfigured' })
  }

  const auth = request.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'unauthorized' })
  }
  const token = auth.slice('Bearer '.length)

  let payload: { email?: string; email_verified?: boolean }
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    })
    payload = result.payload as typeof payload
  } catch {
    return jsonResponse(401, { error: 'unauthorized' })
  }

  if (payload.email !== ADMIN_EMAIL || payload.email_verified !== true) {
    return jsonResponse(403, { error: 'forbidden' })
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return jsonResponse(400, { error: 'invalid_request', detail: 'body is not JSON' })
  }

  if (typeof body.title !== 'string' || body.title.length === 0 || body.title.length > 300) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'title invalid' })
  }
  if (typeof body.description !== 'string' || body.description.length > 50000) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'description invalid' })
  }
  const labelNames = Array.isArray(body.labels) ? body.labels : ['feedback']
  if (
    labelNames.length > 10 ||
    labelNames.some((l) => typeof l !== 'string' || l.length === 0 || l.length > 50)
  ) {
    return jsonResponse(400, { error: 'invalid_request', detail: 'labels invalid' })
  }

  let teamId: string
  try {
    teamId = await resolveTeamId(env.LINEAR_API_KEY)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'lookup failed'
    return jsonResponse(502, { error: 'linear_lookup_failed', detail })
  }

  let labelIds: string[]
  try {
    labelIds = await resolveLabelIds(env.LINEAR_API_KEY, teamId, labelNames)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'lookup failed'
    return jsonResponse(502, { error: 'linear_lookup_failed', detail })
  }

  let created: {
    issueCreate?: {
      success: boolean
      issue?: { id: string; url: string; identifier: string }
    }
  }
  try {
    created = (await linearGraphQL(
      env.LINEAR_API_KEY,
      `mutation($input: IssueCreateInput!) {
         issueCreate(input: $input) {
           success
           issue { id url identifier }
         }
       }`,
      {
        input: {
          teamId,
          title: body.title,
          description: body.description,
          labelIds,
        },
      },
    )) as typeof created
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'create failed'
    return jsonResponse(502, { error: 'linear_create_failed', detail })
  }

  if (!created.issueCreate?.success || !created.issueCreate.issue) {
    return jsonResponse(502, {
      error: 'linear_create_failed',
      detail: 'issueCreate returned success=false',
    })
  }
  const { id, url, identifier } = created.issueCreate.issue
  return jsonResponse(200, { id, url, identifier })
}
