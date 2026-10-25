import { afterEach, describe, expect, it, vi } from 'vitest'

function jwt(payload: Record<string, unknown>) {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return encode({ alg: 'RS256' }) + '.' + encode(payload) + '.signature'
}

describe('Cognito authentication', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('restores the signed-in Google account from Cognito tokens', async () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://example.auth.ap-northeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-id')
    vi.resetModules()
    const auth = await import('./auth')
    const idToken = jwt({
      sub: 'google-user-1',
      email: 'member@example.com',
    })
    localStorage.setItem(
      'web-time-capsule:cognito-tokens',
      JSON.stringify({
        accessToken: 'access-token',
        idToken,
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60_000,
      }),
    )

    expect(auth.isCognitoConfigured).toBe(true)
    expect(auth.getSignedInUser()).toEqual({
      userId: 'google-user-1',
      email: 'member@example.com',
    })
    expect(await auth.getBearerToken()).toBe(idToken)
  })

  it('sends the Cognito token instead of development identity headers', async () => {
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://example.auth.ap-northeast-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-id')
    vi.resetModules()
    const idToken = jwt({ sub: 'google-user-1', email: 'member@example.com' })
    localStorage.setItem(
      'web-time-capsule:cognito-tokens',
      JSON.stringify({
        accessToken: 'access-token',
        idToken,
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60_000,
      }),
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })
    vi.stubGlobal('fetch', fetchMock)
    const { listCapsules } = await import('../api/client')

    await listCapsules()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer ' + idToken)
    expect(headers.has('X-User-Id')).toBe(false)
    vi.unstubAllGlobals()
  })
})
