import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_BASE_URL, getContents, listCapsules } from './client'

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
        attempt_photo_url: 'attempt.jpg',
        contents: [],
        url_expires_in: 60,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getContents('capsule-1', 'unlock-token')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('X-Unlock-Token')).toBe('unlock-token')
  })
})
