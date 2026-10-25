import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenResponse } from '../api/types'
import { getUnlockSession, saveUnlockSession } from './unlockSession'

const successResponse: OpenResponse = {
  ok: true,
  result: {
    ok: true,
    reason: null,
    score: 95,
    message: '開きました',
    expected_people: 2,
    detected_people: 2,
    mirrored: false,
    people: [],
    faces: [],
  },
  attempts_left: null,
  locked_until: null,
  opened: null,
  unlock: { token: 'unlock-token', expires_at: null },
}

describe('unlock session', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.useRealTimers()
  })

  it('keeps a successful unlock in the current tab', () => {
    saveUnlockSession('capsule-1', successResponse)
    expect(getUnlockSession('capsule-1')?.token).toBe('unlock-token')
  })

  it('expires the local session after twelve hours', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
    saveUnlockSession('capsule-1', successResponse)
    vi.setSystemTime(new Date('2026-10-24T12:00:01Z'))
    expect(getUnlockSession('capsule-1')).toBeNull()
  })
})
