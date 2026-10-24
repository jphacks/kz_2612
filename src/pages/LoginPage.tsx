import { Camera, Images, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Ui'
import {
  defaultDevelopmentEmail,
  getDevelopmentIdentity,
  setDevelopmentIdentity,
} from '../lib/developmentIdentity'

function GoogleMark() {
  return (
    <span className="google-mark" aria-hidden="true">
      G
    </span>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState(
    getDevelopmentIdentity().email || defaultDevelopmentEmail,
  )

  const continueWithDevelopmentAccount = () => {
    if (!email.trim()) return
    setDevelopmentIdentity(email)
    navigate('/folders')
  }

  return (
    <AppShell>
      <div className="login-page">
        <div className="brand-lockup">
          <span className="brand-lockup__mark">
            <Sparkles size={22} />
          </span>
          <span>Webタイムカプセル</span>
        </div>

        <div className="login-visual" aria-hidden="true">
          <div className="login-visual__photo login-visual__photo--back">
            <Images size={34} />
          </div>
          <div className="login-visual__photo login-visual__photo--front">
            <div className="pose-person pose-person--one" />
            <div className="pose-person pose-person--two" />
            <div className="pose-person pose-person--three" />
          </div>
          <span className="login-visual__spark login-visual__spark--one">✦</span>
          <span className="login-visual__spark login-visual__spark--two">✦</span>
        </div>

        <div className="login-copy">
          <p className="eyebrow">POSE TO OPEN</p>
          <h1>
            あのポーズで、
            <br />
            思い出がひらく。
          </h1>
          <p>
            みんなで写真のポーズを再現すると開く、
            <br />
            ちょっと特別な共有フォルダ。
          </p>
        </div>

        <div className="login-actions">
          <label className="development-account-field">
            <span>開発用メールアドレス</span>
            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <Button
            fullWidth
            variant="secondary"
            disabled={!email.trim()}
            onClick={continueWithDevelopmentAccount}
          >
            <GoogleMark />
            開発用アカウントで進む
          </Button>
          <small className="development-note">Googleログインはバックエンド実装待ちです</small>
          <p>ログインすると利用規約とプライバシーポリシーに同意したことになります</p>
        </div>

        <div className="login-feature">
          <Camera size={18} />
          <span>写真認証では、鍵写真のポーズと顔の特徴を照合します</span>
        </div>
      </div>
    </AppShell>
  )
}
