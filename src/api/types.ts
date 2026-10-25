import type { components } from './generated'

// API の型は backend の OpenAPI（docs/openapi.json）から自動で作っている（generated.ts）。
// ここでは画面側で使いやすい名前の別名を付ける。API の型は手で書き足さない。
type Schemas = components['schemas']

export type CapsuleSummary = Schemas['CapsuleSummary']
export type CapsuleRole = CapsuleSummary['role']
export type GuidePerson = Schemas['GuidePerson']
export type CapsuleDetail = Schemas['CapsuleDetail']
export type UploadTicket = Schemas['UploadResponse']
export type ContentView = Schemas['ContentView']
export type OpenedContents = Schemas['OpenedContents']
export type FacePersonResult = Schemas['FacePersonOut']
export type MatchResult = Schemas['MatchResultOut']
export type OpenFailureReason = MatchResult['reason']
export type OpenResponse = Schemas['OpenResponse']
export type MemberView = Schemas['MemberOut']
export type InviteCreated = Schemas['InviteCreated']
export type InvitePreview = Schemas['InvitePreview']

// 以下は画面だけで使う型（API の入出力そのものではない）
export interface CreateCapsuleInput {
  name: string
  keyPhotoS3Key: string
  coverPhotoS3Key?: string
  initialPhotoS3Keys?: string[]
}

export interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}
