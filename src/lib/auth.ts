export interface SignedInUser {
  userId: string
  email: string | null
}

interface StoredTokens {
  accessToken: string
  idToken: string
  refreshToken: string | null
  expiresAt: number
}

interface PendingLogin {
  state: string
  verifier: string
  returnTo: string
}

const TOKEN_KEY = 'web-time-capsule:cognito-tokens'
const PENDING_KEY = 'web-time-capsule:cognito-pending'
const cognitoDomain = (import.meta.env.VITE_COGNITO_DOMAIN || '').replace(/\/$/, '')
const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID || ''

export const isCognitoConfigured = Boolean(cognitoDomain && cognitoClientId)

function callbackUrl() {
  return (
    import.meta.env.VITE_COGNITO_REDIRECT_URI ||
    window.location.origin + '/auth/callback'
  )
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function randomValue(size = 32) {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return encodeBase64Url(bytes)
}

function decodeJwtPayload(token: string) {
  const encoded = token.split('.')[1]
  if (!encoded) return null
  try {
    const unpadded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const base64 = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '=')
    const decoded = decodeURIComponent(
      Array.from(atob(base64))
        .map((character) =>
          '%' + character.charCodeAt(0).toString(16).padStart(2, '0'),
        )
        .join(''),
    )
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

function readTokens(): StoredTokens | null {
  try {
    const saved = localStorage.getItem(TOKEN_KEY)
    return saved ? (JSON.parse(saved) as StoredTokens) : null
  } catch {
    return null
  }
}

function saveTokens(
  payload: {
    access_token: string
    id_token: string
    refresh_token?: string
    expires_in: number
  },
  previousRefreshToken?: string | null,
) {
  const tokens: StoredTokens = {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token || previousRefreshToken || null,
    expiresAt: Date.now() + payload.expires_in * 1000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
  return tokens
}

async function requestTokens(body: URLSearchParams) {
  const response = await fetch(cognitoDomain + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    throw new Error('Googleログインを完了できませんでした。もう一度お試しください。')
  }
  return (await response.json()) as {
    access_token: string
    id_token: string
    refresh_token?: string
    expires_in: number
  }
}

export function getSignedInUser(): SignedInUser | null {
  if (!isCognitoConfigured) return null
  const tokens = readTokens()
  if (!tokens) return null
  const claims = decodeJwtPayload(tokens.idToken)
  const userId = typeof claims?.sub === 'string' ? claims.sub : ''
  if (!userId) return null
  return {
    userId,
    email: typeof claims?.email === 'string' ? claims.email : null,
  }
}

export async function getBearerToken() {
  if (!isCognitoConfigured) return null
  const tokens = readTokens()
  if (!tokens) return null
  if (tokens.expiresAt > Date.now() + 30_000) return tokens.idToken
  if (!tokens.refreshToken) {
    signOutLocally()
    return null
  }

  try {
    const refreshed = await requestTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: cognitoClientId,
        refresh_token: tokens.refreshToken,
      }),
    )
    return saveTokens(refreshed, tokens.refreshToken).idToken
  } catch {
    signOutLocally()
    return null
  }
}

export async function beginGoogleSignIn(returnTo = '/folders') {
  if (!isCognitoConfigured) {
    throw new Error('Googleログインの接続先が設定されていません。')
  }

  const verifier = randomValue(64)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  )
  const state = randomValue()
  const pending: PendingLogin = { state, verifier, returnTo }
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))

  const url = new URL(cognitoDomain + '/oauth2/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: cognitoClientId,
    redirect_uri: callbackUrl(),
    scope: 'openid email profile',
    identity_provider: 'Google',
    state,
    code_challenge: encodeBase64Url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
  }).toString()
  window.location.assign(url)
}

export async function completeGoogleSignIn(search: string) {
  const params = new URLSearchParams(search)
  if (params.get('error')) {
    throw new Error('Googleログインがキャンセルされました。')
  }

  const code = params.get('code')
  const state = params.get('state')
  const saved = sessionStorage.getItem(PENDING_KEY)
  const pending = saved ? (JSON.parse(saved) as PendingLogin) : null
  if (!code || !state || !pending || state !== pending.state) {
    throw new Error('ログイン情報を確認できませんでした。最初からやり直してください。')
  }

  const payload = await requestTokens(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: cognitoClientId,
      code,
      redirect_uri: callbackUrl(),
      code_verifier: pending.verifier,
    }),
  )
  saveTokens(payload)
  sessionStorage.removeItem(PENDING_KEY)
  return pending.returnTo.startsWith('/') ? pending.returnTo : '/folders'
}

export function signOutLocally() {
  localStorage.removeItem(TOKEN_KEY)
}

export function beginSignOut() {
  signOutLocally()
  if (!isCognitoConfigured) return false

  const url = new URL(cognitoDomain + '/logout')
  url.search = new URLSearchParams({
    client_id: cognitoClientId,
    logout_uri: window.location.origin,
  }).toString()
  window.location.assign(url)
  return true
}
