import type { OpenResponse } from '../api/types'

const MAX_SESSION_MS = 12 * 60 * 60 * 1000
const STORAGE_PREFIX = 'web-time-capsule:unlock:'
const RESULT_PREFIX = 'web-time-capsule:result:'

export interface StoredUnlockSession {
  token: string
  expiresAt: number
}

function sessionKey(capsuleId: string) {
  return STORAGE_PREFIX + capsuleId
}

export function saveUnlockSession(capsuleId: string, response: OpenResponse) {
  if (!response.ok || !response.unlock) return
  const localLimit = Date.now() + MAX_SESSION_MS
  const serverLimit = response.unlock.expires_at
    ? new Date(response.unlock.expires_at).getTime()
    : localLimit
  const value: StoredUnlockSession = {
    token: response.unlock.token,
    expiresAt: Math.min(localLimit, serverLimit),
  }
  sessionStorage.setItem(sessionKey(capsuleId), JSON.stringify(value))
}

export function getUnlockSession(capsuleId: string): StoredUnlockSession | null {
  const raw = sessionStorage.getItem(sessionKey(capsuleId))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as StoredUnlockSession
    if (!value.token || value.expiresAt <= Date.now()) {
      clearUnlockSession(capsuleId)
      return null
    }
    return value
  } catch {
    clearUnlockSession(capsuleId)
    return null
  }
}

export function clearUnlockSession(capsuleId: string) {
  sessionStorage.removeItem(sessionKey(capsuleId))
}

export function clearCapsuleSessionData(capsuleId: string) {
  sessionStorage.removeItem(sessionKey(capsuleId))
  sessionStorage.removeItem(RESULT_PREFIX + capsuleId)
}

export function clearAllCapsuleSessionData() {
  const keys = Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index),
  )
  keys.forEach((key) => {
    if (key?.startsWith(STORAGE_PREFIX) || key?.startsWith(RESULT_PREFIX)) {
      sessionStorage.removeItem(key)
    }
  })
}

export function saveAuthResult(capsuleId: string, response: OpenResponse) {
  sessionStorage.setItem(RESULT_PREFIX + capsuleId, JSON.stringify(response))
}

export function getAuthResult(capsuleId: string): OpenResponse | null {
  const raw = sessionStorage.getItem(RESULT_PREFIX + capsuleId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as OpenResponse
  } catch {
    return null
  }
}
