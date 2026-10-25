import { LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Button, Card } from '../components/Ui'
import { beginSignOut, getSignedInUser, isCognitoConfigured } from '../lib/auth'
import {
  clearDevelopmentIdentity,
  getDevelopmentIdentity,
} from '../lib/developmentIdentity'
import { clearAllCapsuleSessionData } from '../lib/unlockSession'

export function AccountPage() {
  const navigate = useNavigate()
  const account = isCognitoConfigured
    ? getSignedInUser()
    : getDevelopmentIdentity()

  const signOut = () => {
    clearAllCapsuleSessionData()
    clearDevelopmentIdentity()
    if (!beginSignOut()) navigate('/login', { replace: true })
  }

  return (
    <AppShell showNavigation>
      <div className="screen screen--account">
        <div className="account-heading">
          <span><UserRound size={27} /></span>
          <div>
            <p>ACCOUNT</p>
            <h1>アカウント</h1>
          </div>
        </div>

        <Card className="account-card">
          <span className="account-card__avatar"><UserRound size={28} /></span>
          <div>
            <small>ログイン中</small>
            <strong>{account?.email ?? account?.userId ?? 'アカウント情報なし'}</strong>
          </div>
        </Card>

        <div className="account-detail-list">
          <div>
            <Mail size={19} />
            <span>
              <small>ログイン方法</small>
              <strong>{isCognitoConfigured ? 'Googleアカウント' : '開発用アカウント'}</strong>
            </span>
          </div>
          <div>
            <ShieldCheck size={19} />
            <span>
              <small>写真の閲覧</small>
              <strong>フォルダごとに写真認証が必要</strong>
            </span>
          </div>
        </div>

        <div className="account-signout">
          <p>ログアウトすると、この端末に保存されたフォルダの解除状態も消えます。</p>
          <Button variant="secondary" fullWidth onClick={signOut}>
            <LogOut size={18} />ログアウト
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
