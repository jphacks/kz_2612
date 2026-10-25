import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  Camera,
  Check,
  FolderHeart,
  ImagePlus,
  LoaderCircle,
  LockKeyholeOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { createCapsule, listCapsules, uploadImage } from '../api/client'
import type { CapsuleSummary } from '../api/types'
import { AppShell, PageHeader } from '../components/AppShell'
import { Twinkles } from '../components/Decor'
import { Badge, Button, Card, EmptyState } from '../components/Ui'
import { normalizeImage } from '../lib/images'
import { getUnlockSession } from '../lib/unlockSession'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '処理に失敗しました。もう一度お試しください。'
}


export function FolderListPage() {
  const [folders, setFolders] = useState<CapsuleSummary[]>([])
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
      <div className="screen screen--folders real-feed">
        {/* BeReal のような上のバー: 左に新規作成、真ん中にタイトル、右にアカウント */}
        <header className="real-topbar">
          <Link className="real-icon-button" to="/folders/new" aria-label="新しいフォルダをつくる">
            <Plus size={20} />
          </Link>
          <h1>思い出フォルダ</h1>
          <Link className="real-icon-button" to="/account" aria-label="アカウント">
            <UserRound size={19} />
          </Link>
        </header>
        <p className="real-feed__lead">
          <strong>{folders.length}</strong>個のフォルダ
        </p>

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

        <ul className="real-posts">
          {folders.map((folder, index) => {
            const isUnlocked = Boolean(getUnlockSession(folder.capsule_id))
            const destination = isUnlocked
              ? '/folders/' + folder.capsule_id + '/photos'
              : '/folders/' + folder.capsule_id + '/unlock'
            return (
              <li key={folder.capsule_id} style={{ '--i': index } as CSSProperties}>
                <Link className={'real-post' + (isUnlocked ? ' is-open' : '')} to={destination}>
                  <span className="real-post__head">
                    <span className="real-avatar" aria-hidden="true"><Users size={16} /></span>
                    <span className="real-post__title">
                      <strong>{folder.name}</strong>
                      <small>
                        {folder.people_count}人
                        <span aria-hidden="true">・</span>
                        {folder.role === 'owner' ? '作成者' : '参加中'}
                      </small>
                    </span>
                    <ArrowRight className="real-post__arrow" size={18} aria-hidden="true" />
                  </span>

                  <span className="real-post__frame" aria-hidden="true">
                    <span className="real-post__corners" />
                    {folder.cover_photo_url ? (
                      <img
                        className="real-post__cover"
                        src={folder.cover_photo_url}
                        alt=""
                        onError={(event) => { event.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <FolderHeart className="real-post__placeholder" size={32} />
                    )}
                    <Twinkles count={3} />
                  </span>

                  {isUnlocked && (
                    <span className="real-post__state is-open">
                      <LockKeyholeOpen size={14} />開いています
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

      </div>
    </AppShell>
  )
}

type CreateStep = 1 | 2 | 3 | 4 | 5 | 6

const stepTitles: Record<CreateStep, string> = {
  1: '基本情報',
  2: '表紙画像',
  3: '鍵写真',
  4: '鍵写真を確認',
  5: '最初の写真',
  6: '最終確認',
}

export function CreateFolderPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<CreateStep>(1)
  const [folderName, setFolderName] = useState('')
  const [coverPhoto, setCoverPhoto] = useState<File | null>(null)
  const [keyPhoto, setKeyPhoto] = useState<File | null>(null)
  const [initialPhotos, setInitialPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitLabel, setSubmitLabel] = useState('')
  const [error, setError] = useState('')
  const keyPreviewUrl = useMemo(
    () => (keyPhoto ? URL.createObjectURL(keyPhoto) : ''),
    [keyPhoto],
  )
  const coverPreviewUrl = useMemo(
    () => (coverPhoto ? URL.createObjectURL(coverPhoto) : ''),
    [coverPhoto],
  )
  const initialPreviewUrls = useMemo(
    () => initialPhotos.map((photo) => URL.createObjectURL(photo)),
    [initialPhotos],
  )

  useEffect(() => () => {
    if (keyPreviewUrl) URL.revokeObjectURL(keyPreviewUrl)
  }, [keyPreviewUrl])

  useEffect(() => () => {
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl)
  }, [coverPreviewUrl])

  useEffect(() => () => {
    initialPreviewUrls.forEach((url) => URL.revokeObjectURL(url))
  }, [initialPreviewUrls])

  const next = async () => {
    setError('')
    if (step < 6) {
      setStep((step + 1) as CreateStep)
      return
    }
    if (!keyPhoto) return

    setSubmitting(true)
    try {
      setSubmitLabel('鍵写真を準備しています')
      const normalized = await normalizeImage(keyPhoto)
      const keyPhotoS3Key = await uploadImage(normalized, 'key')

      let coverPhotoS3Key: string | undefined
      if (coverPhoto) {
        setSubmitLabel('表紙画像を準備しています')
        coverPhotoS3Key = await uploadImage(await normalizeImage(coverPhoto), 'cover')
      }

      const initialPhotoS3Keys: string[] = []
      for (const [index, photo] of initialPhotos.entries()) {
        setSubmitLabel(`写真を保存しています（${index + 1} / ${initialPhotos.length}）`)
        initialPhotoS3Keys.push(await uploadImage(await normalizeImage(photo), 'content'))
      }

      setSubmitLabel('フォルダを作成しています')
      const created = await createCapsule({
        name: folderName.trim(),
        keyPhotoS3Key,
        coverPhotoS3Key,
        initialPhotoS3Keys,
      })
      navigate('/folders/' + created.capsule_id + '/invite-members', {
        replace: true,
      })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSubmitting(false)
      setSubmitLabel('')
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
          eyebrow={'STEP ' + step + ' / 7'}
          backTo="/folders"
        />

        <div className="progress-steps" aria-label="作成の進み具合">
          {[1, 2, 3, 4, 5, 6, 7].map((item) => (
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
              <span className="flow-heading__icon"><FolderHeart size={22} /></span>
              <div>
                <p>任意で</p>
                <h2>フォルダの表紙を選ぶ</h2>
              </div>
            </div>
            <p className="flow-description">
              一覧に表示する画像です。設定しない場合は、通常のフォルダ表紙になります。鍵写真は表紙に使いません。
            </p>
            <label className={'photo-picker photo-picker--cover ' + (coverPhoto ? 'has-photo' : '')}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={(event) => setCoverPhoto(event.target.files?.[0] ?? null)}
              />
              {coverPhoto ? (
                <>
                  <img className="selected-photo-preview" src={coverPreviewUrl} alt="選択した表紙画像" />
                  <strong>{coverPhoto.name}</strong>
                  <span>タップして選び直す</span>
                </>
              ) : (
                <>
                  <span className="photo-picker__icon"><ImagePlus size={26} /></span>
                  <strong>表紙画像を選ぶ</strong>
                  <span>選ばなくても作成できます</span>
                </>
              )}
            </label>
            {coverPhoto && (
              <button className="text-button" type="button" onClick={() => setCoverPhoto(null)}>
                表紙画像を設定しない
              </button>
            )}
          </div>
        )}

        {step === 3 && (
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
                  <img className="selected-photo-preview" src={keyPreviewUrl} alt="選択した鍵写真" />
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

        {step === 4 && (
          <div className="flow-panel">
            <div className="flow-heading">
              <span className="flow-heading__icon flow-heading__icon--success"><Check size={22} /></span>
              <div>
                <p>写真を確認</p>
                <h2>このポーズを鍵にします</h2>
              </div>
            </div>
            <div className="key-photo-preview key-photo-preview--real">
              <img src={keyPreviewUrl} alt="鍵写真の確認" />
              <Badge tone="accent">2〜4人で撮影</Badge>
            </div>
            <div className="check-list">
              <span><Check size={18} />肩と手足が見えている</span>
              <span><Check size={18} />人物同士が大きく重なっていない</span>
              <span><Check size={18} />登録時にサーバーでポーズを解析</span>
            </div>
            <button className="text-button" type="button" onClick={() => setStep(3)}>
              別の写真を選ぶ
            </button>
          </div>
        )}

        {step === 5 && (
          <div className="flow-panel">
            <div className="flow-heading">
              <span className="flow-heading__icon"><ImagePlus size={22} /></span>
              <div>
                <p>フォルダの中に</p>
                <h2>最初の写真を入れる</h2>
              </div>
            </div>
            <p className="flow-description">
              0〜20枚まで選べます。今は入れず、作成後に追加することもできます。
            </p>
            <label className="initial-photo-picker">
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? [])
                  if (selected.length > 20) {
                    setError('最初に選べる写真は20枚までです。')
                    setInitialPhotos(selected.slice(0, 20))
                  } else {
                    setError('')
                    setInitialPhotos(selected)
                  }
                }}
              />
              <Upload size={22} />
              <strong>{initialPhotos.length ? '写真を選び直す' : '端末から写真を選ぶ'}</strong>
              <span>{initialPhotos.length} / 20枚</span>
            </label>
            {initialPhotos.length > 0 && (
              <div className="initial-photo-grid" aria-label="最初に入れる写真">
                {initialPhotos.map((photo, index) => (
                  <div className="initial-photo-item" key={`${photo.name}-${photo.lastModified}-${index}`}>
                    <img src={initialPreviewUrls[index]} alt="" />
                    <button
                      type="button"
                      aria-label={`${photo.name}を削除`}
                      onClick={() => setInitialPhotos((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="flow-panel">
            <div className="flow-heading">
              <span className="flow-heading__icon"><Sparkles size={22} /></span>
              <div>
                <p>最後に</p>
                <h2>この内容でつくりますか？</h2>
              </div>
            </div>
            <Card className="summary-card">
              <div className="summary-card__photo summary-card__cover-preview">
                {coverPreviewUrl ? <img src={coverPreviewUrl} alt="表紙画像" /> : <FolderHeart size={32} />}
              </div>
              <div className="summary-card__content">
                <small>フォルダ名</small>
                <strong>{folderName || '名称未設定'}</strong>
                <span><Users size={16} />鍵写真は2〜4人</span>
                <span><ImagePlus size={16} />最初の写真 {initialPhotos.length}枚</span>
              </div>
            </Card>
            <div className="notice-box">
              作成後はフォルダ名・鍵写真・表紙画像を変更できません。続けて参加者を招待します。
            </div>
          </div>
        )}

        {error && <div className="api-error" role="alert">{error}</div>}

        <div className="sticky-actions">
          <Button variant="ghost" onClick={previous} disabled={submitting}>戻る</Button>
          <Button
            onClick={next}
            loading={submitting}
            disabled={!folderName.trim() || (step >= 3 && !keyPhoto)}
          >
            {step === 6 ? (submitting ? submitLabel || '作成中' : 'フォルダをつくる') : '次へ'}
            {!submitting && <ArrowRight size={18} />}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
