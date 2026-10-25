import type {
  ApiErrorPayload,
  CapsuleDetail,
  CapsuleSummary,
  ContentView,
  InviteCreated,
  InvitePreview,
  MemberView,
  OpenedContents,
  OpenResponse,
  UploadTicket,
} from './types'
import { getDevelopmentIdentity } from '../lib/developmentIdentity'
import { getBearerToken, isCognitoConfigured } from '../lib/auth'

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function apiHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  if (isCognitoConfigured) {
    const token = await getBearerToken()
    if (token) headers.set('Authorization', 'Bearer ' + token)
    return headers
  }
  const identity = getDevelopmentIdentity()
  headers.set('X-User-Id', identity.userId)
  headers.set('X-User-Email', identity.email)
  return headers
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response

  try {
    response = await fetch(API_BASE_URL + path, {
      ...init,
      headers: await apiHeaders(init.headers),
    })
  } catch {
    throw new ApiError(
      0,
      'network_error',
      'バックエンドに接続できません。APIサーバーが起動しているか確認してください。',
    )
  }

  if (!response.ok) {
    let payload: ApiErrorPayload = {}
    try {
      payload = (await response.json()) as ApiErrorPayload
    } catch {
      // JSON 以外のエラーでも共通メッセージを返す。
    }
    throw new ApiError(
      response.status,
      payload.error?.code || 'request_failed',
      payload.error?.message || '通信に失敗しました。もう一度お試しください。',
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function listCapsules() {
  return request<CapsuleSummary[]>('/capsules')
}

export function getCapsule(capsuleId: string) {
  return request<CapsuleDetail>('/capsules/' + encodeURIComponent(capsuleId))
}

export function deleteCapsule(capsuleId: string) {
  return request<void>('/capsules/' + encodeURIComponent(capsuleId), {
    method: 'DELETE',
  })
}

export async function uploadImage(
  file: Blob,
  purpose: 'key' | 'attempt' | 'content',
) {
  const contentType = file.type === 'image/png' || file.type === 'image/webp'
    ? file.type
    : 'image/jpeg'
  const ticket = await request<UploadTicket>('/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose, content_type: contentType }),
  })

  let uploadResponse: Response
  try {
    uploadResponse = await fetch(ticket.upload_url, {
      method: ticket.method,
      headers: ticket.headers,
      body: file,
    })
  } catch {
    throw new ApiError(0, 'upload_network_error', '画像のアップロードに失敗しました。')
  }

  if (!uploadResponse.ok) {
    throw new ApiError(
      uploadResponse.status,
      'upload_failed',
      '画像のアップロードに失敗しました。もう一度お試しください。',
    )
  }

  return ticket.s3_key
}

export function createCapsule(name: string, keyPhotoS3Key: string) {
  return request<CapsuleDetail>('/capsules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, key_photo_s3_key: keyPhotoS3Key }),
  })
}

export function openCapsule(capsuleId: string, s3Key: string) {
  return request<OpenResponse>(
    '/capsules/' + encodeURIComponent(capsuleId) + '/open',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3_key: s3Key }),
    },
  )
}

function unlockHeaders(token: string) {
  return { 'X-Unlock-Token': token }
}

export function getContents(capsuleId: string, token: string) {
  return request<OpenedContents>(
    '/capsules/' + encodeURIComponent(capsuleId) + '/contents',
    { headers: unlockHeaders(token) },
  )
}

export function addPhoto(capsuleId: string, s3Key: string) {
  return request<ContentView>(
    '/capsules/' + encodeURIComponent(capsuleId) + '/contents',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'photo', s3_key: s3Key }),
    },
  )
}

export function deleteContent(capsuleId: string, contentId: string, token: string) {
  return request<void>(
    '/capsules/' + encodeURIComponent(capsuleId) + '/contents/' + encodeURIComponent(contentId),
    { method: 'DELETE', headers: unlockHeaders(token) },
  )
}

export function listMembers(capsuleId: string) {
  return request<MemberView[]>(
    '/capsules/' + encodeURIComponent(capsuleId) + '/members',
  )
}

export function createInvite(capsuleId: string) {
  return request<InviteCreated>(
    '/capsules/' + encodeURIComponent(capsuleId) + '/invites',
    { method: 'POST' },
  )
}

export function getInvite(token: string) {
  return request<InvitePreview>('/invites/' + encodeURIComponent(token))
}

export function acceptInvite(token: string) {
  return request<CapsuleSummary>(
    '/invites/' + encodeURIComponent(token) + '/accept',
    { method: 'POST' },
  )
}
