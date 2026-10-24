import { Camera, Images, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Ui'

function GoogleMark() {
  return (
    <span className="google-mark" aria-hidden="true">
      G
    </span>
  )
}

export function LoginPage() {
  const navigate = useNavigate()

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
          <Button fullWidth variant="secondary" onClick={() => navigate('/folders')}>
            <GoogleMark />
            Googleでログイン
          </Button>
          <p>ログインすると利用規約とプライバシーポリシーに同意したことになります</p>
        </div>

        <div className="login-feature">
          <Camera size={18} />
          <span>写真認証は本人確認ではなく、ポーズを楽しむ仕掛けです</span>
        </div>
      </div>
    </AppShell>
  )
}
