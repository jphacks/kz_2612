import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  Camera,
  Check,
  FolderHeart,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  UserRound,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { createCapsule, listCapsules, uploadImage } from '../api/client'
import type { CapsuleListItem } from '../api/types'
import { AppShell, PageHeader } from '../components/AppShell'
import { Badge, Button, Card, EmptyState } from '../components/Ui'
import { normalizeImage } from '../lib/images'
import { getUnlockSession } from '../lib/unlockSession'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '処理に失敗しました。もう一度お試しください。'
}


export function FolderListPage() {
  const [folders, setFolders] = useState<CapsuleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    listCapsules()
      .then((items) => active && setFolders(items))
      .catch((reason: unknown) => active && setError(errorMessage(reason)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [reloadKey])

  const reload = () => {
    setLoading(true)
    setError('')
    setReloadKey((value) => value + 1)
  }

  return (
    <AppShell showNavigation>
      <div className="screen screen--folders lux-home">
        <header className="lux-home__header">
          <h1>思い出フォルダ</h1>
          <p className="lux-count">
            <strong>{folders.length}</strong>個
          </p>
          <Link className="lux-account" to="/account" aria-label="アカウント">
            <UserRound size={18} />
          </Link>
        </header>
        <p className="lux-home__lead">写真のポーズをみんなで再現すると、フォルダが開きます。</p>

        <Link className="lux-create" to="/folders/new">
          <span className="lux-create__plus"><Plus size={18} /></span>
          <span>
            <strong>新しいフォルダをつくる</strong>
            <small>鍵になる写真を1枚選んではじめよう</small>
          </span>
          <ArrowRight size={18} />
        </Link>

        {loading && (
          <div className="api-state" role="status">
            <LoaderCircle className="button__spinner" size={24} />
            フォルダを読み込んでいます
          </div>
        )}

        {!loading && error && (
          <EmptyState
            icon={<RefreshCw size={25} />}
            title="フォルダを読み込めませんでした"
            description={error}
            action={<Button onClick={reload}>再読み込み</Button>}
          />
        )}

        {!loading && !error && folders.length === 0 && (
          <EmptyState
            icon={<FolderHeart size={27} />}
            title="まだフォルダがありません"
            description="鍵になる写真を選んで、最初のフォルダをつくりましょう。"
            action={<Button onClick={() => location.assign('/folders/new')}>フォルダをつくる</Button>}
          />
        )}

        <ul className="lux-folders">
          {folders.map((folder, index) => {
            const isUnlocked = Boolean(getUnlockSession(folder.capsule_id))
            const destination = isUnlocked
              ? '/folders/' + folder.capsule_id + '/photos'
              : '/folders/' + folder.capsule_id + '/unlock'

            return (
              <li key={folder.capsule_id} style={{ '--i': index } as CSSProperties}>
                <Link className={'lux-folder' + (isUnlocked ? ' is-open' : '')} to={destination}>
                  <span className="lux-folder__photo">
                    {/* 写真が読めないときは、下のアイコンが見える */}
                    <FolderHeart size={26} aria-hidden="true" />
                    {folder.key_photo_url && (
                      <img
                        src={folder.key_photo_url}
                        alt=""
                        onError={(event) => { event.currentTarget.style.display = 'none' }}
                      />
                    )}
                    <span className="lux-folder__state">
                      {isUnlocked ? <LockKeyholeOpen size={13} /> : <LockKeyhole size={13} />}
                      {isUnlocked ? '開いています' : '鍵がかかっています'}
                    </span>
                  </span>
                  <span className="lux-folder__body">
                    <strong>{folder.name}</strong>
                    <small>
                      <Users size={13} aria-hidden="true" />
                      {folder.people_count}人のポーズで開く
                      <span aria-hidden="true">・</span>
                      {folder.role === 'owner' ? '作成者' : '参加中'}
                    </small>
                  </span>
                  <ArrowRight className="lux-folder__arrow" size={18} aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>

      </div>
    </AppShell>
  )
}

type CreateStep = 1 | 2 | 3 | 4

const stepTitles: Record<CreateStep, string> = {
  1: '基本情報',
  2: '鍵写真',
  3: '写真を確認',
  4: '最終確認',
}

export function CreateFolderPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<CreateStep>(1)
  const [folderName, setFolderName] = useState('')
  const [keyPhoto, setKeyPhoto] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const previewUrl = useMemo(
    () => (keyPhoto ? URL.createObjectURL(keyPhoto) : ''),
    [keyPhoto],
  )

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const next = async () => {
    setError('')
    if (step < 4) {
      setStep((step + 1) as CreateStep)
      return
    }
    if (!keyPhoto) return

    setSubmitting(true)
    try {
      const normalized = await normalizeImage(keyPhoto)
      const s3Key = await uploadImage(normalized, 'key')
      const created = await createCapsule(folderName.trim(), s3Key)
      navigate('/folders/' + created.capsule_id + '/invite-members', {
        replace: true,
      })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSubmitting(false)
    }
  }

  const previous = () => {
    setError('')
    if (step === 1) {
      navigate('/folders')
      return
    }
    setStep((step - 1) as CreateStep)
  }

  return (
    <AppShell>
      <div className="screen screen--create">
        <PageHeader
          title="フォルダをつくる"
          eyebrow={'STEP ' + step + ' / 4'}
          backTo="/folders"
        />

        <div className="progress-steps" aria-label="作成の進み具合">
          {[1, 2, 3, 4].map((item) => (
            <span
              className={item <= step ? 'is-active' : ''}
              key={item}
              aria-label={stepTitles[item as CreateStep]}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="flow-panel">
            <div className="flow-heading">
              <span className="flow-heading__icon"><FolderHeart size={22} /></span>
              <div>
                <p>まずは</p>
                <h2>フォルダの情報を入力</h2>
              </div>
            </div>

            <label className="field">
              <span>フォルダ名</span>
              <input
                value={folderName}
                maxLength={40}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="例：夏合宿 2026"
              />
              <small>{folderName.length} / 40</small>
            </label>

            <div className="notice-box">
              作成したアカウントは自動で参加者になります。作成後に招待リンクを共有できます。
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flow-panel">
            <div className="flow-heading">
              <span className="flow-heading__icon"><ImagePlus size={22} /></span>
              <div>
                <p>つぎに</p>
                <h2>鍵になる写真を1枚選ぶ</h2>
              </div>
            </div>
            <p className="flow-description">
              フォルダを開くとき、みんなでこの写真の人数・立ち位置・ポーズを再現します。
            </p>
            <label className={'photo-picker ' + (keyPhoto ? 'has-photo' : '')}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={(event) => setKeyPhoto(event.target.files?.[0] ?? null)}
              />
              {keyPhoto ? (
                <>
                  <img className="selected-photo-preview" src={previewUrl} alt="選択した鍵写真" />
                  <strong>{keyPhoto.name}</strong>
                  <span>タップして選び直す</span>
                </>
              ) : (
                <>
                  <span className="photo-picker__icon"><Upload size={26} /></span>
                  <strong>端末から写真を選ぶ</strong>
                  <span>JPEG・PNG・WebP・HEIC / 最大15MB</span>
                </>
              )}
            </label>
            <Card className="guide-card">
              <Camera size={20} />
              <div>
                <strong>選びやすい写真</strong>
                <p>2〜4人の肩と手足が写り、人物同士が重なっていない写真</p>
              </div>
            </Card>
          </div>
        )}

        {step === 3 && (
          <div className="flow-panel">
            <div className="flow-heading">
              <span className="flow-heading__icon flow-heading__icon--success"><Check size={22} /></span>
              <div>
                <p>写真を確認</p>
                <h2>このポーズを鍵にします</h2>
              </div>
            </div>
            <div className="key-photo-preview key-photo-preview--real">
              <img src={previewUrl} alt="鍵写真の確認" />
              <Badge tone="accent">2〜4人で撮影</Badge>
            </div>
            <div className="check-list">
              <span><Check size={18} />肩と手足が見えている</span>
              <span><Check size={18} />人物同士が大きく重なっていない</span>
              <span><Check size={18} />登録時にサーバーでポーズを解析</span>
            </div>
            <button className="text-button" type="button" onClick={() => setStep(2)}>
              別の写真を選ぶ
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="flow-panel">
            <div className="flow-heading">
              <span className="flow-heading__icon"><Sparkles size={22} /></span>
              <div>
                <p>最後に</p>
                <h2>この内容でつくりますか？</h2>
              </div>
            </div>
            <Card className="summary-card">
              <img className="summary-card__photo summary-card__photo--real" src={previewUrl} alt="" />
              <div className="summary-card__content">
                <small>フォルダ名</small>
                <strong>{folderName || '名称未設定'}</strong>
                <span><Users size={16} />鍵写真は2〜4人</span>
              </div>
            </Card>
            <div className="notice-box">
              作成後はフォルダ名と鍵写真を変更できません。続けて参加者を招待します。
            </div>
          </div>
        )}

        {error && <div className="api-error" role="alert">{error}</div>}

        <div className="sticky-actions">
          <Button variant="ghost" onClick={previous} disabled={submitting}>戻る</Button>
          <Button
            onClick={next}
            loading={submitting}
            disabled={step === 1 ? !folderName.trim() : step >= 2 ? !keyPhoto : false}
          >
            {step === 4 ? (submitting ? '解析して作成中' : 'フォルダをつくる') : '次へ'}
            {!submitting && <ArrowRight size={18} />}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
