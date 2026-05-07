import type { Timestamp } from 'firebase/firestore'

export type FeedbackCategory = 'bug' | 'feature' | 'other' | 'question'
export type FeedbackStatus = 'new' | 'triaged'

export interface Attachment {
  kind: 'image' | 'csv'
  filename: string
  sizeBytes: number
  contentType: 'image/jpeg' | 'text/csv'
  downloadURL: string
}

export interface Feedback {
  id: string
  createdAt: Timestamp
  category: FeedbackCategory
  body: string
  status: FeedbackStatus
  subject?: string
  contactEmail?: string
  appVersion: string
  buildNumber: string
  iosVersion: string
  deviceModel: string
  locale: string
  flightCount: number
  pendingSyncCount: number
  conflictCount: number
  iCloudState: string
  originScreen: string
  logs?: string
  linearIssueUrl?: string
  triageNote?: string
  attachments?: Attachment[]
  attachmentUploadFailures?: number
  attachmentsArchivedToLinear?: boolean
}
