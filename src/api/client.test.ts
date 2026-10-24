import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptInvite,
  API_BASE_URL,
  createInvite,
  deleteCapsule,
  getContents,
  getInvite,
  listCapsules,
} from './client'
import { setDevelopmentIdentity } from '../lib/developmentIdentity'

function jsonResponse(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  } as Response
}

describe('API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('uses the development account selected on the login screen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    setDevelopmentIdentity('friend@example.com')

    await listCapsules()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('X-User-Id')).toBe('dev:friend@example.com')
    expect(headers.get('X-User-Email')).toBe('friend@example.com')
  })

  it('loads the current user capsules with development identity headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await listCapsules()

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(API_BASE_URL + '/capsules')
    expect(new Headers(init.headers).get('X-User-Id')).toBe('demo-user')
  })

  it('sends the folder unlock token when loading contents', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        key_photo_url: 'key.jpg',
        contents: [],
        url_expires_in: 60,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getContents('capsule-1', 'unlock-token')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('X-Unlock-Token')).toBe('unlock-token')
  })

  it('calls the invitation creation, preview, and acceptance endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'invite-token', expires_at: '2026-11-01' }))
      .mockResolvedValueOnce(jsonResponse({ capsule_id: 'capsule-1' }))
      .mockResolvedValueOnce(jsonResponse({ capsule_id: 'capsule-1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createInvite('capsule-1')
    await getInvite('invite-token')
    await acceptInvite('invite-token')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      API_BASE_URL + '/capsules/capsule-1/invites',
      API_BASE_URL + '/invites/invite-token',
      API_BASE_URL + '/invites/invite-token/accept',
    ])
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('POST')
  })
  it('deletes a folder through the capsule endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined,
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await deleteCapsule('capsule-1')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(API_BASE_URL + '/capsules/capsule-1')
    expect(init.method).toBe('DELETE')
  })

})
