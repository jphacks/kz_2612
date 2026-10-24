import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  ImagePlus,
  Info,
  LoaderCircle,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  addPhoto,
  deleteContent,
  getCapsule,
  getContents,
  listMembers,
  uploadImage,
} from '../api/client'
import type { CapsuleDetail, MemberView, OpenedContents } from '../api/types'
import { AppShell, PageHeader } from '../components/AppShell'
import { Badge, Button, Card, EmptyState } from '../components/Ui'
import { normalizeImage } from '../lib/images'
import { clearUnlockSession, getUnlockSession } from '../lib/unlockSession'

function folderPath(folderId: string | undefined, suffix: string) {
  return '/folders/' + (folderId ?? '') + suffix
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '処理に失敗しました。もう一度お試しください。'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function useUnlockedContents(folderId: string | undefined) {
  const navigate = useNavigate()
  const [data, setData] = useState<OpenedContents | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const handleSessionError = (reason: unknown) => {
    if (
      folderId &&
      reason instanceof ApiError &&
      (reason.code === 'unlock_required' || reason.code === 'unlock_expired')
    ) {
      clearUnlockSession(folderId)
      navigate(folderPath(folderId, '/unlock'), { replace: true })
      return true
    }
    return false
  }

  const reload = async () => {
    if (!folderId) return
    const session = getUnlockSession(folderId)
    if (!session) {
      navigate(folderPath(folderId, '/unlock'), { replace: true })
      return
    }
    setLoading(true)
    setError('')
    try {
      setData(await getContents(folderId, session.token))
    } catch (reason) {
      if (handleSessionError(reason)) return
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!folderId) return
    const session = getUnlockSession(folderId)
    if (!session) {
      navigate(folderPath(folderId, '/unlock'), { replace: true })
      return
    }
    let active = true
    getContents(folderId, session.token)
      .then((contents) => {
        if (active) setData(contents)
      })
      .catch((reason: unknown) => {
        if (!active || handleSessionError(reason)) return
        setError(errorMessage(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // folderId が変わると新しい解除セッションを読み込む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, navigate])

  return { data, setData, loading, error, setError, reload }
}

export function GalleryPage() {
  const { folderId } = useParams()
  const [folder, setFolder] = useState<CapsuleDetail | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const { data, setData, loading, error, setError, reload } = useUnlockedContents(folderId)
  const photos = useMemo(
    () => data?.contents.filter((item) => item.type === 'photo' && item.url) ?? [],
    [data],
  )
  const messages = useMemo(
    () => data?.contents.filter((item) => item.type === 'message') ?? [],
    [data],
  )

  useEffect(() => {
    if (!folderId) return
    getCapsule(folderId).then(setFolder).catch(() => undefined)
  }, [folderId])

  const togglePhoto = (photoId: string) => {
    setSelected((current) =>
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId],
    )
  }

  const removeSelected = async () => {
    if (!folderId) return
    const session = getUnlockSession(folderId)
    if (!session) return
    setDeleting(true)
    setError('')
    try {
      for (const contentId of selected) {
        await deleteContent(folderId, contentId, session.token)
      }
      setData((current) => current
        ? { ...current, contents: current.contents.filter((item) => !selected.includes(item.content_id)) }
        : current)
      setSelected([])
      setSelecting(false)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AppShell showNavigation>
      <div className="screen screen--gallery">
        <PageHeader
          title={selecting ? selected.length + '枚を選択' : folder?.name ?? '思い出'}
          eyebrow={selecting ? 'SELECT PHOTOS' : 'OPEN · 最大12時間'}
          backTo="/folders"
          right={
            selecting ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSelecting(false)
                  setSelected([])
                }}
              >
                完了
              </button>
            ) : (
              <Link className="icon-button" to={folderPath(folderId, '/settings')}>
                <Settings size={21} />
              </Link>
            )
          }
        />

        {!selecting && (
          <div className="gallery-summary">
            <span>{photos.length}枚の思い出</span>
            {photos.length > 0 && <button type="button" onClick={() => setSelecting(true)}>選択</button>}
          </div>
        )}

        {loading && (
          <div className="api-state" role="status">
            <LoaderCircle className="button__spinner" size={24} />写真を読み込んでいます
          </div>
        )}
        {error && <div className="api-error" role="alert">{error}<button onClick={() => void reload()}>再読み込み</button></div>}

        {!loading && !error && messages.map((message) => (
          <Card className="message-card" key={message.content_id}>
            <small>{formatDate(message.created_at)}</small>
            <p>{message.text}</p>
          </Card>
        ))}

        {!loading && !error && photos.length === 0 && (
          <EmptyState
            icon={<ImagePlus size={27} />}
            title="まだ写真がありません"
            description="最初の思い出をこのフォルダに追加しましょう。"
          />
        )}

        <div className="photo-grid">
          {photos.map((photo) => {
            const isSelected = selected.includes(photo.content_id)
            const content = (
              <>
                <div className="photo-grid__image photo-grid__image--real">
                  <img src={photo.url ?? ''} alt="" onError={() => void reload()} />
                  {selecting && (
                    <span className={'select-check ' + (isSelected ? 'is-selected' : '')}>
                      {isSelected && <Check size={15} />}
                    </span>
                  )}
                </div>
                <span className="photo-grid__date">{formatDate(photo.created_at)}</span>
              </>
            )

            return selecting ? (
              <button
                className="photo-grid__item"
                type="button"
                key={photo.content_id}
                onClick={() => togglePhoto(photo.content_id)}
              >
                {content}
              </button>
            ) : (
              <Link
                className="photo-grid__item"
                key={photo.content_id}
                to={folderPath(folderId, '/photos/' + photo.content_id)}
              >
                {content}
              </Link>
            )
          })}
        </div>

        {selecting ? (
          <div className="selection-bar">
            <span>{selected.length ? selected.length + '枚を選択中' : '写真を選んでください'}</span>
            <Button
              variant="danger"
              disabled={!selected.length}
              loading={deleting}
              onClick={() => void removeSelected()}
            >
              <Trash2 size={18} />削除
            </Button>
          </div>
        ) : (
          <Link className="floating-add" to={folderPath(folderId, '/upload')}>
            <ImagePlus size={23} />
            <span>写真を追加</span>
          </Link>
        )}
      </div>
    </AppShell>
  )
}

export function PhotoDetailPage() {
  const { folderId, photoId } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useUnlockedContents(folderId)
  const photos = data?.contents.filter((item) => item.type === 'photo' && item.url) ?? []
  const photoIndex = Math.max(photos.findIndex((item) => item.content_id === photoId), 0)
  const photo = photos[photoIndex]
  const previous = photos.length ? photos[(photoIndex - 1 + photos.length) % photos.length] : null
  const next = photos.length ? photos[(photoIndex + 1) % photos.length] : null

  const remove = async () => {
    if (!folderId || !photo) return
    const session = getUnlockSession(folderId)
    if (!session) return
    try {
      await deleteContent(folderId, photo.content_id, session.token)
      navigate(folderPath(folderId, '/photos'), { replace: true })
    } catch {
      void reload()
    }
  }

  if (loading) {
    return <AppShell><div className="status-page"><LoaderCircle className="button__spinner" /><p>写真を読み込んでいます</p></div></AppShell>
  }
  if (error || !photo) {
    return <AppShell><div className="status-page"><h1>写真を表示できません</h1><p>{error}</p><Button onClick={() => navigate(folderPath(folderId, '/photos'))}>一覧に戻る</Button></div></AppShell>
  }

  return (
    <AppShell fullBleed>
      <div className="photo-detail">
        <div className="photo-detail__top">
          <button type="button" onClick={() => navigate(folderPath(folderId, '/photos'))}>
            <X size={24} />
          </button>
          <span>{photoIndex + 1} / {photos.length}</span>
          <button type="button" aria-label="削除" onClick={() => void remove()}><Trash2 size={22} /></button>
        </div>

        <div className="photo-detail__image photo-detail__image--real">
          <img src={photo.url ?? ''} alt="保存された思い出" onError={() => void reload()} />
          {previous && (
            <Link
              className="photo-detail__arrow photo-detail__arrow--left"
              to={folderPath(folderId, '/photos/' + previous.content_id)}
            >
              <ChevronLeft size={25} />
            </Link>
          )}
          {next && (
            <Link
              className="photo-detail__arrow photo-detail__arrow--right"
              to={folderPath(folderId, '/photos/' + next.content_id)}
            >
              <ChevronRight size={25} />
            </Link>
          )}
        </div>

        <div className="photo-detail__caption">
          <div>
            <strong>思い出の写真</strong>
            <span>{formatDate(photo.created_at)}</span>
          </div>
          <a href={photo.url ?? ''} download aria-label="保存"><Download size={21} /></a>
          <button type="button" aria-label="削除" onClick={() => void remove()}><Trash2 size={21} /></button>
        </div>
      </div>
    </AppShell>
  )
}

export function UploadPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [currentCount, setCurrentCount] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!folderId) return
    const session = getUnlockSession(folderId)
    if (!session) {
      navigate(folderPath(folderId, '/unlock'), { replace: true })
      return
    }
    getContents(folderId, session.token)
      .then((contents) => setCurrentCount(contents.contents.filter((item) => item.type === 'photo').length))
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [folderId, navigate])

  const available = Math.max(0, 20 - currentCount)
  const selectFiles = (selected: FileList | null) => {
    setFiles(Array.from(selected ?? []).slice(0, Math.min(10, available)))
    setError('')
  }

  const submit = async () => {
    if (!folderId || files.length === 0) return
    setUploading(true)
    setError('')
    try {
      for (const file of files) {
        const normalized = await normalizeImage(file)
        const s3Key = await uploadImage(normalized, 'content')
        await addPhoto(folderId, s3Key)
      }
      navigate(folderPath(folderId, '/photos'), { replace: true })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setUploading(false)
    }
  }

  return (
    <AppShell>
      <div className="screen screen--upload">
        <PageHeader title="写真を追加" backTo={folderPath(folderId, '/photos')} />

        <div className="upload-copy">
          <span className="upload-copy__icon"><CloudUpload size={29} /></span>
          <h1>思い出を追加しよう</h1>
          <p>一度に10枚、フォルダ全体で20枚まで追加できます。</p>
        </div>

        <label className="upload-dropzone">
          <input
            type="file"
            multiple
            disabled={available === 0 || uploading}
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(event) => selectFiles(event.target.files)}
          />
          <span><Upload size={26} /></span>
          <strong>{available ? '写真を選ぶ' : '20枚まで追加済みです'}</strong>
          <small>JPEG・PNG・WebP・HEIC / 1枚15MBまで</small>
        </label>

        {files.length > 0 && (
          <Card className="upload-queue">
            <div className="upload-queue__heading">
              <strong>{files.length}枚を選択中</strong>
              <Badge tone="accent">追加後 {currentCount + files.length} / 20枚</Badge>
            </div>
            <div className="upload-file-list">
              {files.map((file) => <span key={file.name + file.lastModified}>{file.name}</span>)}
            </div>
          </Card>
        )}

        <Card className="guide-card">
          <Info size={20} />
          <div>
            <strong>アップロード時に自動調整</strong>
            <p>向きとサイズを整え、JPEGに変換して保存します。</p>
          </div>
        </Card>

        {error && <div className="api-error" role="alert">{error}</div>}

        <div className="sticky-actions sticky-actions--single">
          <Button
            fullWidth
            disabled={!files.length}
            loading={uploading}
            onClick={() => void submit()}
          >
            {uploading ? 'アップロード中' : files.length ? files.length + '枚を追加する' : '写真を選んでください'}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

export function FolderSettingsPage() {
  const { folderId } = useParams()
  const [folder, setFolder] = useState<CapsuleDetail | null>(null)
  const [members, setMembers] = useState<MemberView[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!folderId) return
    Promise.all([getCapsule(folderId), listMembers(folderId)])
      .then(([detail, memberList]) => {
        setFolder(detail)
        setMembers(memberList)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [folderId])

  return (
    <AppShell>
      <div className="screen screen--settings">
        <PageHeader title="フォルダ情報" backTo={folderPath(folderId, '/photos')} />

        {error && <div className="api-error" role="alert">{error}</div>}
        {!folder && !error && <div className="api-state"><LoaderCircle className="button__spinner" />読み込み中</div>}

        {folder && (
          <>
            <Card className="settings-summary">
              <div className="settings-summary__cover settings-summary__cover--real">
                <img src={folder.key_photo_url} alt="鍵写真" />
              </div>
              <div>
                <small>フォルダ名</small>
                <h2>{folder.name}</h2>
                <span>{folder.contents_count} / 20枚</span>
              </div>
            </Card>

            <section className="settings-section">
              <div className="settings-section__heading">
                <h3>参加アカウント</h3>
                <Badge tone="accent">{members.length}人</Badge>
              </div>
              <div className="member-list">
                {members.map((member) => (
                  <div className="member-row" key={member.user_id}>
                    <i>{member.user_id.slice(0, 2).toUpperCase()}</i>
                    <span>
                      <strong>{member.email ?? member.user_id}</strong>
                      <small>{member.role === 'owner' ? '作成者' : '参加者'}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="notice-box">
              フォルダ名と鍵写真は作成後に変更できません。
            </div>

            <section className="danger-zone">
              <h3>フォルダの削除</h3>
              <p>削除APIがバックエンドにまだ無いため、この操作は接続待ちです。</p>
              <Button variant="danger" fullWidth disabled>
                <Trash2 size={18} />バックエンド対応待ち
              </Button>
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}
