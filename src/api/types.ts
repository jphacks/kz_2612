export type CapsuleRole = 'owner' | 'member'

export interface CapsuleSummary {
  capsule_id: string
  name: string
  open_date: string | null
  days_until_open: number | null
  status: 'locked' | 'opened'
  people_count: number
  role: CapsuleRole
}

export interface GuidePerson {
  position: number
  angles: Record<string, number | null>
  points: Record<string, [number, number] | null>
  face_registered: boolean
}

export interface CapsuleDetail extends CapsuleSummary {
  key_photo_url: string
  preview_url: string | null
  url_expires_in: number
  guide: GuidePerson[]
  can_open_now: boolean
  locked_until: string | null
  attempts_left: number | null
  contents_count: number
  opened_at: string | null
}

export interface UploadTicket {
  upload_url: string
  method: 'PUT'
  headers: Record<string, string>
  s3_key: string
  expires_in: number
}

export interface ContentView {
  content_id: string
  type: 'photo'
  author_id: string
  created_at: string
  url: string
}

export interface OpenedContents {
  key_photo_url: string
  contents: ContentView[]
  url_expires_in: number
}

export type OpenFailureReason =
  | 'count_mismatch'
  | 'pose_mismatch'
  | 'body_not_visible'
  | 'no_person'
  | 'face_not_visible'
  | 'face_mismatch'
  | null

export interface FacePersonResult {
  position: number
  visible: boolean
  checked: boolean
  ok: boolean
  similarity: number | null
  others: number | null
}

export interface MatchResult {
  ok: boolean
  reason: OpenFailureReason
  score: number
  message: string
  expected_people: number
  detected_people: number
  mirrored: boolean
  faces: FacePersonResult[]
}

export interface OpenResponse {
  ok: boolean
  result: MatchResult
  attempts_left: number | null
  locked_until: string | null
  opened: OpenedContents | null
  unlock: { token: string; expires_at: string | null } | null
}

export interface MemberView {
  user_id: string
  role: CapsuleRole
  email: string | null
}

export interface InviteCreated {
  token: string
  expires_at: string
}

export interface InvitePreview {
  capsule_id: string
  capsule_name: string
  open_date: string | null
  days_until_open: number | null
  people_count: number
  members_count: number
  invited_by: string
  expires_at: string
  already_member: boolean
}

export interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}
