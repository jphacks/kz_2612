import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Constellation, seededPoses } from '../components/Constellation'
import { Button } from '../components/Ui'
import {
  defaultDevelopmentEmail,
  getDevelopmentIdentity,
  setDevelopmentIdentity,
} from '../lib/developmentIdentity'
import {
  beginGoogleSignIn,
  getSignedInUser,
  isCognitoConfigured,
} from '../lib/auth'

const STAR = 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z'
// ログイン画面の見本のポーズ（毎回同じ形）
const SAMPLE_POSES = seededPoses('pose-to-open', 3)

function GoogleMark() {
  return (
    <span className="google-mark" aria-hidden="true">
      G
    </span>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState(
    getDevelopmentIdentity().email || defaultDevelopmentEmail,
  )

  const continueWithDevelopmentAccount = () => {
    if (!email.trim()) return
    setDevelopmentIdentity(email)
    navigate('/folders')
  }

  const returnTo =
    new URLSearchParams(location.search).get('returnTo') || '/folders'

  const continueWithGoogle = async () => {
    const signedIn = getSignedInUser()
    if (signedIn) {
      navigate(returnTo, { replace: true })
      return
    }
    setSigningIn(true)
    setError('')
    try {
      await beginGoogleSignIn(returnTo)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ログインに失敗しました。')
      setSigningIn(false)
    }
  }

  return (
    <AppShell>
      <div className="login-page lux-login">
        <header className="lux-brand">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={STAR} /></svg>
          <span>Webタイムカプセル</span>
        </header>

        <h1 className="lux-login__title">
          あの日の写真のポーズで、<br />みんなのフォルダが開く。
        </h1>

        <div className="lux-login__hero" aria-hidden="true">
          <span className="lux-orbit" />
          <span className="lux-orbit lux-orbit--inner" />
          <div className="lux-polaroid">
            <Constellation poses={SAMPLE_POSES} className="lux-polaroid__pose" />
            <span>あの日の写真</span>
          </div>
        </div>

        <p className="lux-lead">
          思い出の写真を1枚「鍵」にして、写真フォルダをつくります。
          当時のメンバーがもう一度集まって同じポーズをとると、フォルダが開きます。
        </p>

        <ol className="lux-steps">
          <li><span>01</span>鍵にする写真を1枚選ぶ</li>
          <li><span>02</span>みんなで集まって、同じポーズで撮る</li>
          <li><span>03</span>ポーズと顔がそろったらフォルダが開き、写真を見たり入れたりできる</li>
        </ol>

        <div className="login-actions lux-login__actions">
          {!isCognitoConfigured && (
            <label className="development-account-field">
              <span>開発用メールアドレス</span>
              <input
                type="email"
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          <Button
            fullWidth
            loading={signingIn}
            disabled={!isCognitoConfigured && !email.trim()}
            onClick={
              isCognitoConfigured
                ? continueWithGoogle
                : continueWithDevelopmentAccount
            }
          >
            {isCognitoConfigured && <GoogleMark />}
            {isCognitoConfigured ? 'Googleで続ける' : '開発用アカウントで進む'}
          </Button>
          {!isCognitoConfigured && (
            <small className="development-note">
              Cognito未設定のため開発用アカウントを使用します
            </small>
          )}
          {error && <div className="api-error" role="alert">{error}</div>}
          <p>ログインすると利用規約とプライバシーポリシーに同意したことになります</p>
        </div>
      </div>
    </AppShell>
  )
}
