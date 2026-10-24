import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  Check,
  ChevronRight,
  Image,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCapsule, openCapsule, uploadImage } from '../api/client'
import type { CapsuleDetail } from '../api/types'
import { AppShell, PageHeader } from '../components/AppShell'
import { PoseOverlay } from '../components/PoseOverlay'
import { Badge, Button, Card } from '../components/Ui'
import { usePoseGuide } from '../hooks/usePoseGuide'
import { captureVideoFrame } from '../lib/images'
import { getPoseGuideFeedback } from '../lib/poseGuide'
import {
  getAuthResult,
  getUnlockSession,
  saveAuthResult,
  saveUnlockSession,
} from '../lib/unlockSession'

function folderPath(folderId: string | undefined, suffix: string) {
  return '/folders/' + (folderId ?? '') + suffix
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '処理に失敗しました。もう一度お試しください。'
}

function facePositionLabel(position: number, total: number) {
  return total === 1 ? 'あなた' : `左から${position + 1}人目`
}

function faceResultLabel(face: {
  visible: boolean
  checked: boolean
  ok: boolean
}) {
  if (!face.checked) {
    return face.visible ? '顔を登録しました' : '顔は未登録です'
  }
  if (!face.visible) return '顔が見えません'
  return face.ok ? '顔が一致しました' : '顔が一致しません'
}

function faceResultSucceeded(face: {
  visible: boolean
  checked: boolean
  ok: boolean
}) {
  return face.ok && (face.checked || face.visible)
}

export function UnlockPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const [folder, setFolder] = useState<CapsuleDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!folderId) return
    getCapsule(folderId).then(setFolder).catch((reason: unknown) => setError(errorMessage(reason)))
  }, [folderId])

  const activeSession = folderId ? getUnlockSession(folderId) : null
  const peopleCount = folder?.people_count ?? 0
  const registeredFaceCount =
    folder?.guide.filter((person) => person.face_registered).length ?? 0

  return (
    <AppShell>
      <div className="screen screen--unlock">
        <PageHeader title={folder?.name ?? '写真認証'} backTo="/folders" />
        <div className="unlock-hero">
          {folder?.preview_url ? (
            <img className="unlock-hero__photo" src={folder.preview_url} alt="鍵写真のポーズガイド" />
          ) : (
            <>
              <div className="unlock-hero__orbit unlock-hero__orbit--one" />
              <div className="unlock-hero__orbit unlock-hero__orbit--two" />
              <span className="unlock-hero__lock"><LockKeyhole size={32} /></span>
            </>
          )}
          <div className="unlock-hero__people" aria-hidden="true">
            {Array.from({ length: peopleCount || 2 }).map((_, index) => <span key={index} />)}
          </div>
        </div>

        <div className="unlock-copy">
          <p className="eyebrow">
            {peopleCount ? peopleCount + ' PEOPLE · POSE TO OPEN' : 'POSE TO OPEN'}
          </p>
          <h1>みんなでポーズを<br />再現して開こう</h1>
          <p>
            鍵写真と同じメンバーで、同じ立ち位置・ポーズをカメラの前で再現します。
            ポーズが合うと顔も照合します。
          </p>
          {folder && registeredFaceCount < peopleCount && (
            <small className="face-registration-note">
              顔が未登録の人は、最初に開いたときの顔を記憶します。
            </small>
          )}
        </div>

        {error && <div className="api-error" role="alert">{error}</div>}

        <Card className="how-to-card">
          <span><i>1</i>鍵写真と同じメンバーで並ぶ</span>
          <ChevronRight size={16} />
          <span><i>2</i>顔を向けてポーズを合わせる</span>
        </Card>

        <div className="unlock-actions">
          {activeSession ? (
            <Button fullWidth onClick={() => navigate(folderPath(folderId, '/photos'))}>
              開封中の思い出を見る
              <ChevronRight size={18} />
            </Button>
          ) : (
            <Button
              fullWidth
              disabled={!folder || Boolean(error)}
              onClick={() => navigate(folderPath(folderId, '/camera-permission'))}
            >
              <Camera size={19} />
              写真認証をはじめる
            </Button>
          )}
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
          <p>ポーズと顔を照合するために、カメラへのアクセスを許可してください。</p>
        </div>
        <div className="privacy-list">
          <span>
            <ShieldCheck size={20} />
            <span><strong>判定に使用</strong><small>撮影画像は保存写真には追加しません</small></span>
          </span>
          <span>
            <RefreshCw size={20} />
            <span><strong>何度でも撮り直し</strong><small>失敗回数によるペナルティはありません</small></span>
          </span>
          <span>
            <Users size={20} />
            <span><strong>顔の特徴を照合</strong><small>顔の切り抜きではなく、特徴量で比較します</small></span>
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const [folder, setFolder] = useState<CapsuleDetail | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [cameraReady, setCameraReady] = useState(false)
  const [guideEnabled, setGuideEnabled] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const poseGuide = usePoseGuide({
    videoRef,
    enabled: guideEnabled,
    cameraReady,
    sessionKey: facingMode,
  })
  const expectedCount = folder?.people_count ?? 0
  const detectedCount = poseGuide.detectedCount
  const guideFeedback = getPoseGuideFeedback(
    poseGuide.status,
    detectedCount,
    expectedCount,
  )
  const countMatches =
    poseGuide.status === 'ready' &&
    expectedCount > 0 &&
    detectedCount === expectedCount

  useEffect(() => {
    if (!folderId) return
    getCapsule(folderId).then(setFolder).catch((reason: unknown) => setError(errorMessage(reason)))
  }, [folderId])

  useEffect(() => {
    let active = true
    let stream: MediaStream | null = null

    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError('このブラウザではカメラを利用できません。'))
      return
    }

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then((value) => {
        if (!active) {
          value.getTracks().forEach((track) => track.stop())
          return
        }
        stream = value
        if (videoRef.current) {
          videoRef.current.srcObject = value
          void videoRef.current.play()
        }
      })
      .catch(() => setError('カメラを開始できませんでした。ブラウザの権限設定を確認してください。'))

    return () => {
      active = false
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [facingMode])

  const capture = async () => {
    if (!folderId || !videoRef.current || processing) return
    setProcessing(true)
    setError('')
    try {
      const image = await captureVideoFrame(videoRef.current)
      const s3Key = await uploadImage(image, 'attempt')
      const response = await openCapsule(folderId, s3Key)
      saveAuthResult(folderId, response)
      saveUnlockSession(folderId, response)
      navigate(folderPath(folderId, '/auth-result'))
    } catch (reason) {
      setError(errorMessage(reason))
      setProcessing(false)
    }
  }

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
            <span>
              {poseGuide.status === 'ready' && expectedCount
                ? detectedCount + ' / ' + expectedCount + '人を検出'
                : '鍵写真は' + (folder?.people_count ?? '—') + '人'}
            </span>
            <small>
              {guideEnabled ? 'MoveNet撮影ガイド' : '撮影ガイドOFF'}
            </small>
          </div>
          <button
            className="camera-flip"
            type="button"
            aria-label="カメラ切替"
            disabled={processing}
            onClick={() => {
              setCameraReady(false)
              setError('')
              setFacingMode((value) => value === 'user' ? 'environment' : 'user')
            }}
          >
            <RefreshCw size={21} />
          </button>
        </div>

        <div className="camera-stage">
          <video
            ref={videoRef}
            className={'camera-video ' + (facingMode === 'user' ? 'is-mirrored' : '')}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={() => setCameraReady(true)}
          />
          <PoseOverlay
            videoRef={videoRef}
            poses={poseGuide.poses}
            mirrored={facingMode === 'user'}
            visible={guideEnabled && poseGuide.status === 'ready'}
          />
          <div className="camera-stage__frame" />
          {!cameraReady && !error && (
            <div className="camera-hint"><LoaderCircle className="button__spinner" size={17} />カメラを準備中</div>
          )}
          {cameraReady && !error && !processing && (
            <div
              className={'camera-hint camera-hint--' + guideFeedback.tone}
              role="status"
              aria-live="polite"
            >
              {poseGuide.status === 'loading' && (
                <LoaderCircle className="button__spinner" size={17} />
              )}
              {guideFeedback.text}
            </div>
          )}
          {error && <div className="camera-hint camera-hint--error">{error}</div>}
          {processing && (
            <div className="camera-processing">
              <LoaderCircle className="button__spinner" size={30} />
              <strong>ポーズを見比べています</strong>
              <span>人数と手足の位置を確認中…</span>
            </div>
          )}
        </div>

        <div className="camera-screen__bottom">
          <button
            className={'camera-help ' + (guideEnabled ? 'is-active' : '')}
            type="button"
            aria-pressed={guideEnabled}
            onClick={() => setGuideEnabled((value) => !value)}
          >
            <Image size={18} />
            ガイド{guideEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            className="shutter-button"
            type="button"
            aria-label="撮影する"
            disabled={!cameraReady || processing}
            onClick={capture}
          >
            <span />
          </button>
          <div className="camera-auto">
            <strong>
              {processing ? '判定中' : countMatches ? '人数OK' : 'READY'}
            </strong>
            <small>
              {processing
                ? 'そのまま待ってね'
                : countMatches
                  ? '顔を向けてポーズを合わせよう'
                  : '撮影できます'}
            </small>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export function VerifyingPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()

  return (
    <AppShell>
      <div className="status-page">
        <div className="status-page__loader">
          <span /><span /><span />
          <Sparkles size={27} />
        </div>
        <p className="eyebrow">CHECKING POSE</p>
        <h1>カメラから撮影してください</h1>
        <Button onClick={() => navigate(folderPath(folderId, '/camera'))}>カメラに戻る</Button>
      </div>
    </AppShell>
  )
}

export function ResultPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const result = folderId ? getAuthResult(folderId) : null
  const success = Boolean(result?.ok)
  const faceResults = result?.result.faces ?? []

  if (!result) {
    return (
      <AppShell>
        <div className="status-page">
          <h1>認証結果がありません</h1>
          <Button onClick={() => navigate(folderPath(folderId, '/camera'))}>撮影する</Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="screen screen--result">
        <div className={'result-heading ' + (success ? '' : 'result-heading--failed')}>
          <span className="result-heading__check">
            {success ? <Check size={28} /> : <X size={28} />}
          </span>
          <Badge tone={success ? 'success' : 'neutral'}>
            {success ? 'MATCH!' : 'TRY AGAIN'}
          </Badge>
          <h1>{success ? '開きました！' : 'もう一度合わせよう'}</h1>
          <p>{result.result.message}</p>
          <strong className="result-score">一致度 {result.result.score}%</strong>
        </div>

        {result.opened && (
          <div className="comparison comparison--key-only">
            <div>
              <span>鍵写真</span>
              <img className="comparison__photo" src={result.opened.key_photo_url} alt="鍵写真" />
            </div>
          </div>
        )}

        {faceResults.length > 0 && (
          <Card className="face-result-card">
            <div className="face-result-card__heading">
              <ShieldCheck size={20} />
              <div>
                <strong>顔認証</strong>
                <small>鍵写真と顔の特徴を照合しました</small>
              </div>
            </div>
            <div className="face-result-list" aria-label="顔認証結果">
              {faceResults.map((face) => (
                <div
                  className={
                    'face-result-row ' +
                    (faceResultSucceeded(face) ? 'is-ok' : 'is-failed')
                  }
                  key={face.position}
                >
                  <span className="face-result-row__mark">
                    {faceResultSucceeded(face) ? <Check size={15} /> : <X size={15} />}
                  </span>
                  <div>
                    <strong>{facePositionLabel(face.position, faceResults.length)}</strong>
                    <small>{faceResultLabel(face)}</small>
                  </div>
                  {face.checked && face.similarity !== null && (
                    <span className="face-result-row__score">
                      類似度 {face.similarity.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {success && (
          <Card className="session-card">
            <LockKeyhole size={19} />
            <div>
              <strong>このタブでは開封状態をキープ</strong>
              <p>画面を更新しても、最大12時間はそのまま見られます。</p>
            </div>
          </Card>
        )}

        <div className="result-actions">
          <Button
            fullWidth
            onClick={() => navigate(folderPath(folderId, success ? '/photos' : '/camera'))}
          >
            {success ? '思い出を見る' : 'もう一度撮る'}
            <ChevronRight size={18} />
          </Button>
          {!success && <small>試行回数に制限はありません</small>}
        </div>
      </div>
    </AppShell>
  )
}
