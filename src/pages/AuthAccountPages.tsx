import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import {
  completeGoogleSignIn,
  getSignedInUser,
  isCognitoConfigured,
} from '../lib/auth'

const callbackRequests = new Map<string, Promise<string>>()

function completeLoginOnce(search: string) {
  const existing = callbackRequests.get(search)
  if (existing) return existing
  const request = completeGoogleSignIn(search).catch((error: unknown) => {
    callbackRequests.delete(search)
    throw error
  })
  callbackRequests.set(search, request)
  return request
}

export function RequireAccount() {
  const location = useLocation()
  if (!isCognitoConfigured || getSignedInUser()) return <Outlet />
  const returnTo = location.pathname + location.search
  return (
    <Navigate
      to={'/login?returnTo=' + encodeURIComponent(returnTo)}
      replace
    />
  )
}

export function AuthCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    completeLoginOnce(location.search)
      .then((returnTo) => {
        if (active) navigate(returnTo, { replace: true })
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Googleログインに失敗しました。',
          )
        }
      })
    return () => {
      active = false
    }
  }, [location.search, navigate])

  return (
    <AppShell>
      <div className="auth-callback">
        {error ? (
          <>
            <h1>ログインできませんでした</h1>
            <p role="alert">{error}</p>
            <button type="button" onClick={() => navigate('/login', { replace: true })}>
              ログイン画面へ戻る
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="button__spinner" size={30} />
            <h1>Googleログインを確認しています</h1>
            <p>このまま少しお待ちください。</p>
          </>
        )}
      </div>
    </AppShell>
  )
}
