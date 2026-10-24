import { useEffect } from 'react'
import {
  Camera,
  Check,
  ChevronRight,
  Image,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell, PageHeader } from '../components/AppShell'
import { Badge, Button, Card } from '../components/Ui'
import { getFolder } from '../data/mockData'

function folderPath(folderId: string | undefined, suffix: string) {
  return '/folders/' + (folderId ?? 'summer-2026') + suffix
}

export function UnlockPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const folder = getFolder(folderId)

  return (
    <AppShell>
      <div className="screen screen--unlock">
        <PageHeader title={folder.name} backTo="/folders" />
        <div className="unlock-hero">
          <div className="unlock-hero__orbit unlock-hero__orbit--one" />
          <div className="unlock-hero__orbit unlock-hero__orbit--two" />
          <span className="unlock-hero__lock"><LockKeyhole size={32} /></span>
          <div className="unlock-hero__people" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        </div>

        <div className="unlock-copy">
          <p className="eyebrow">4 PEOPLE · POSE TO OPEN</p>
          <h1>みんなでポーズを<br />再現して開こう</h1>
          <p>
            鍵写真と同じ人数・立ち位置・ポーズをカメラの前で再現します。
            同じ人である必要はありません。
          </p>
        </div>

        <Card className="how-to-card">
          <span><i>1</i>4人でカメラの前に並ぶ</span>
          <ChevronRight size={16} />
          <span><i>2</i>骨格ガイドにポーズを合わせる</span>
        </Card>

        <div className="unlock-actions">
          <Button
            fullWidth
            onClick={() => navigate(folderPath(folderId, '/camera-permission'))}
          >
            <Camera size={19} />
            写真認証をはじめる
          </Button>
          <small>何度でも撮り直せます</small>
        </div>
      </div>
    </AppShell>
  )
}

export function CameraPermissionPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()

  return (
    <AppShell>
      <div className="screen screen--permission">
        <PageHeader
          title="カメラの準備"
          backTo={folderPath(folderId, '/unlock')}
        />
        <div className="permission-visual">
          <span><Camera size={38} /></span>
          <i className="permission-visual__spark">✦</i>
        </div>
        <div className="permission-copy">
          <h1>カメラを使います</h1>
          <p>写真のポーズを再現するために、カメラへのアクセスを許可してください。</p>
        </div>
        <div className="privacy-list">
          <span>
            <ShieldCheck size={20} />
            <span><strong>判定だけに使用</strong><small>撮影画像は保存写真に追加しません</small></span>
          </span>
          <span>
            <RefreshCw size={20} />
            <span><strong>判定後に削除</strong><small>成功・失敗にかかわらず破棄します</small></span>
          </span>
          <span>
            <Users size={20} />
            <span><strong>顔は見ません</strong><small>人数とポーズだけを比較します</small></span>
          </span>
        </div>
        <div className="permission-actions">
          <Button
            fullWidth
            onClick={() => navigate(folderPath(folderId, '/camera'))}
          >
            カメラを許可して進む
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate('/folders')}>
            今はやめる
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

export function CameraPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()

  return (
    <AppShell fullBleed>
      <div className="camera-screen">
        <div className="camera-screen__top">
          <button
            className="camera-close"
            type="button"
            aria-label="閉じる"
            onClick={() => navigate(folderPath(folderId, '/unlock'))}
          >
            <X size={24} />
          </button>
          <div>
            <span>4 / 4人を検出</span>
            <small>ガイドは目安です</small>
          </div>
          <button className="camera-flip" type="button" aria-label="カメラ切替">
            <RefreshCw size={21} />
          </button>
        </div>

        <div className="camera-stage">
          <div className="camera-glow camera-glow--one" />
          <div className="camera-glow camera-glow--two" />
          <div className="pose-guide pose-guide--1"><i /><b /><em /><span /></div>
          <div className="pose-guide pose-guide--2"><i /><b /><em /><span /></div>
          <div className="pose-guide pose-guide--3"><i /><b /><em /><span /></div>
          <div className="pose-guide pose-guide--4"><i /><b /><em /><span /></div>
          <div className="camera-stage__frame" />
          <div className="camera-hint">
            <Sparkles size={17} />
            あと少し！右の人の左ひじを上へ
          </div>
        </div>

        <div className="camera-screen__bottom">
          <button className="camera-help" type="button">
            <Image size={18} />
            ガイド
          </button>
          <button
            className="shutter-button"
            type="button"
            aria-label="撮影する"
            onClick={() => navigate(folderPath(folderId, '/verifying'))}
          >
            <span />
          </button>
          <div className="camera-auto">
            <strong>AUTO</strong>
            <small>待機中</small>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export function VerifyingPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    const timer = window.setTimeout(
      () => navigate(folderPath(folderId, '/auth-result')),
      1500,
    )
    return () => window.clearTimeout(timer)
  }, [folderId, navigate])

  return (
    <AppShell>
      <div className="status-page">
        <div className="status-page__loader">
          <span /><span /><span />
          <Sparkles size={27} />
        </div>
        <p className="eyebrow">CHECKING POSE</p>
        <h1>ポーズを見比べています</h1>
        <p>人数と手足の位置を確認中…</p>
      </div>
    </AppShell>
  )
}

export function ResultPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()

  return (
    <AppShell>
      <div className="screen screen--result">
        <div className="result-heading">
          <span className="result-heading__check"><Check size={28} /></span>
          <Badge tone="success">MATCH!</Badge>
          <h1>開きました！</h1>
          <p>みんなのポーズがぴったりです</p>
        </div>

        <div className="comparison">
          <div>
            <span>鍵写真</span>
            <div className="comparison__photo photo-tone--sunset">
              <div className="mini-people"><i /><i /><i /><i /></div>
            </div>
          </div>
          <div className="comparison__equal">＝</div>
          <div>
            <span>いまの写真</span>
            <div className="comparison__photo photo-tone--violet">
              <div className="mini-people"><i /><i /><i /><i /></div>
            </div>
          </div>
        </div>

        <Card className="session-card">
          <LockKeyhole size={19} />
          <div>
            <strong>このタブでは開封状態をキープ</strong>
            <p>画面を更新しても、最大12時間はそのまま見られます。</p>
          </div>
        </Card>

        <div className="result-actions">
          <Button
            fullWidth
            onClick={() => navigate(folderPath(folderId, '/photos'))}
          >
            思い出を見る
            <ChevronRight size={18} />
          </Button>
          <small>今回の認証写真は画面を離れると削除されます</small>
        </div>
      </div>
    </AppShell>
  )
}
