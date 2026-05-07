const LINEAR_API = 'https://api.linear.app/graphql'

let cachedTeamId: string | null = null
const cachedLabelIds = new Map<string, string>()

export async function linearGraphQL(
  apiKey: string,
  query: string,
  variables?: object,
): Promise<Record<string, unknown>> {
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

export async function resolveTeamId(apiKey: string, teamName: string): Promise<string> {
  if (cachedTeamId) return cachedTeamId
  const data = await linearGraphQL(
    apiKey,
    `query { teams(first: 100) { nodes { id name } } }`,
  )
  const nodes = (data.teams as { nodes: { id: string; name: string }[] }).nodes
  const team = nodes.find((t) => t.name === teamName)
  if (!team) {
    const available = nodes.map((t) => t.name).join(', ') || '(none)'
    throw new Error(`Team named "${teamName}" not found. Visible teams: ${available}`)
  }
  cachedTeamId = team.id
  return team.id
}

export async function resolveLabelIds(
  apiKey: string,
  teamId: string,
  names: string[],
): Promise<string[]> {
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

export interface CreatedIssue {
  id: string
  url: string
  identifier: string
}

export async function createIssue(
  apiKey: string,
  input: { teamId: string; title: string; description: string; labelIds: string[] },
): Promise<CreatedIssue> {
  const data = (await linearGraphQL(
    apiKey,
    `mutation($input: IssueCreateInput!) {
       issueCreate(input: $input) {
         success
         issue { id url identifier }
       }
     }`,
    { input },
  )) as {
    issueCreate?: {
      success: boolean
      issue?: CreatedIssue
    }
  }
  if (!data.issueCreate?.success || !data.issueCreate.issue) {
    throw new Error('issueCreate returned success=false')
  }
  return data.issueCreate.issue
}

interface FileUploadResponse {
  fileUpload: {
    success: boolean
    uploadFile: {
      uploadUrl: string
      assetUrl: string
      headers: { key: string; value: string }[]
    }
  }
}

export interface AttachmentInput {
  filename: string
  contentType: string
  sizeBytes: number
  downloadURL: string
}

// Upload bytes from a public URL to Linear's storage and attach to the issue.
// Throws on any failure; caller handles all-or-nothing rollback semantics.
export async function uploadAttachmentToLinear(
  apiKey: string,
  issueId: string,
  attachment: AttachmentInput,
): Promise<void> {
  const srcRes = await fetch(attachment.downloadURL)
  if (!srcRes.ok) {
    throw new Error(`source fetch ${srcRes.status} for ${attachment.filename}`)
  }
  const bytes = await srcRes.arrayBuffer()

  const upload = (await linearGraphQL(
    apiKey,
    `mutation($filename: String!, $contentType: String!, $size: Int!) {
       fileUpload(filename: $filename, contentType: $contentType, size: $size) {
         success
         uploadFile {
           uploadUrl
           assetUrl
           headers { key value }
         }
       }
     }`,
    {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: bytes.byteLength,
    },
  )) as unknown as FileUploadResponse
  if (!upload.fileUpload?.success || !upload.fileUpload.uploadFile) {
    throw new Error(`fileUpload returned success=false for ${attachment.filename}`)
  }
  const { uploadUrl, assetUrl, headers: requiredHeaders } = upload.fileUpload.uploadFile

  const putHeaders = new Headers()
  for (const h of requiredHeaders) putHeaders.set(h.key, h.value)
  putHeaders.set('content-type', attachment.contentType)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: putHeaders,
    body: bytes,
  })
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '')
    throw new Error(`PUT ${putRes.status} for ${attachment.filename}: ${text.slice(0, 200)}`)
  }

  const attached = (await linearGraphQL(
    apiKey,
    `mutation($input: AttachmentCreateInput!) {
       attachmentCreate(input: $input) { success }
     }`,
    {
      input: { issueId, url: assetUrl, title: attachment.filename },
    },
  )) as { attachmentCreate?: { success: boolean } }
  if (!attached.attachmentCreate?.success) {
    throw new Error(`attachmentCreate returned success=false for ${attachment.filename}`)
  }
}
