import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  LoaderCircle,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  addPhoto,
  deleteContent,
  deleteCapsule,
  getCapsule,
  getContents,
  listMembers,
  uploadImage,
} from '../api/client'
import type { CapsuleDetail, MemberView, OpenedContents } from '../api/types'
import { AppShell, PageHeader } from '../components/AppShell'
import { DateStamp } from '../components/Decor'
import { Badge, Button, Card, EmptyState } from '../components/Ui'
import { normalizeImage } from '../lib/images'
import {
  clearCapsuleSessionData,
  clearUnlockSession,
  getUnlockSession,
} from '../lib/unlockSession'

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
          eyebrow={selecting ? '削除する写真を選ぶ' : 'ひらいたアルバム'}
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
              <Link className="icon-button" to={folderPath(folderId, '/settings')} aria-label="フォルダの設定">
                <Settings size={21} />
              </Link>
            )
          }
        />

        {!selecting && (
          <div className="album-intro">
            <p className="album-intro__count">
              <strong>{photos.length}</strong>枚の思い出
            </p>
            {photos.length > 0 && (
              <button className="album-intro__select" type="button" onClick={() => setSelecting(true)}>
                選んで削除
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="api-state" role="status">
            <LoaderCircle className="button__spinner" size={24} />写真を読み込んでいます
          </div>
        )}
        {error && <div className="api-error" role="alert">{error}<button onClick={() => void reload()}>再読み込み</button></div>}


        {!loading && !error && photos.length === 0 && (
          <EmptyState
            icon={<ImagePlus size={27} />}
            title="まだ写真がありません"
            description="最初の思い出をこのフォルダに追加しましょう。"
          />
        )}

        {/* 写真はポラロイドにして、少しずつ傾けて貼る */}
        <ul className={'album-grid' + (selecting ? ' is-selecting' : '')}>
          {photos.map((photo, index) => {
            const isSelected = selected.includes(photo.content_id)
            const content = (
              <>
                <span className="album-photo__image">
                  <img src={photo.url ?? ''} alt="思い出の写真" onError={() => void reload()} />
                  {selecting && (
                    <span className={'select-check ' + (isSelected ? 'is-selected' : '')}>
                      {isSelected && <Check size={15} />}
                    </span>
                  )}
                </span>
                <DateStamp date={photo.created_at} className="album-photo__date" />
              </>
            )

            return (
              <li key={photo.content_id} style={{ '--i': index } as CSSProperties}>
                {selecting ? (
                  <button
                    className={'album-photo' + (isSelected ? ' is-selected' : '')}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => togglePhoto(photo.content_id)}
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    className="album-photo"
                    to={folderPath(folderId, '/photos/' + photo.content_id)}
                  >
                    {content}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>

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
    <AppShell>
      <div className="photo-view">
        <div className="photo-view__top">
          <button type="button" aria-label="一覧に戻る" onClick={() => navigate(folderPath(folderId, '/photos'))}>
            <X size={22} />
          </button>
          <span>{photoIndex + 1} / {photos.length}</span>
          <a href={photo.url ?? ''} download aria-label="保存"><Download size={20} /></a>
        </div>

        {/* 1枚を大きなポラロイドにして、机の上に置いたように見せる */}
        <figure className="photo-view__polaroid" key={photo.content_id}>
          <span className="photo-view__image">
            <img src={photo.url ?? ''} alt="保存された思い出" onError={() => void reload()} />
            <DateStamp date={photo.created_at} />
          </span>
          <figcaption>
            <span>思い出の写真</span>
            <time dateTime={photo.created_at}>{formatDate(photo.created_at)}</time>
          </figcaption>
        </figure>

        <div className="photo-view__nav">
          {previous && photos.length > 1 ? (
            <Link aria-label="前の写真" to={folderPath(folderId, '/photos/' + previous.content_id)}>
              <ChevronLeft size={22} />
            </Link>
          ) : <span />}
          <button className="photo-view__delete" type="button" onClick={() => void remove()}>
            <Trash2 size={17} />この写真を削除
          </button>
          {next && photos.length > 1 ? (
            <Link aria-label="次の写真" to={folderPath(folderId, '/photos/' + next.content_id)}>
              <ChevronRight size={22} />
            </Link>
          ) : <span />}
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

  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

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

        <div className="paper-upload__copy">
          <h1>思い出を、フォルダに入れよう</h1>
          <p>一度に10枚、フォルダ全体で20枚まで追加できます。いまは {currentCount} / 20枚。</p>
        </div>

        <label className={'paper-upload__drop' + (available === 0 ? ' is-full' : '')}>
          <input
            type="file"
            multiple
            disabled={available === 0 || uploading}
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(event) => selectFiles(event.target.files)}
          />
          <span className="paper-upload__stack" aria-hidden="true">
            <i /><i /><i><ImagePlus size={24} /></i>
          </span>
          <strong>{available ? (files.length ? '選び直す' : '写真を選ぶ') : '20枚まで追加済みです'}</strong>
          <small>JPEG・PNG・WebP・HEIC / 1枚15MBまで。向きとサイズは自動で整えます</small>
        </label>

        {files.length > 0 && (
          <section className="paper-upload__queue" aria-label="追加する写真">
            <p>
              <strong>{files.length}枚</strong>を追加します
              <span>追加後 {currentCount + files.length} / 20枚</span>
            </p>
            <ul>
              {files.map((file, index) => (
                <li key={file.name + file.lastModified} style={{ '--i': index } as CSSProperties}>
                  <img src={previews[index]} alt={file.name} />
                </li>
              ))}
            </ul>
          </section>
        )}

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
  const navigate = useNavigate()
  const [folder, setFolder] = useState<CapsuleDetail | null>(null)
  const [members, setMembers] = useState<MemberView[]>([])
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!folderId) return
    Promise.all([getCapsule(folderId), listMembers(folderId)])
      .then(([detail, memberList]) => {
        setFolder(detail)
        setMembers(memberList)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [folderId])

  const removeFolder = async () => {
    if (!folderId) return
    setDeleting(true)
    setError('')
    try {
      await deleteCapsule(folderId)
      clearCapsuleSessionData(folderId)
      navigate('/folders', { replace: true })
    } catch (reason) {
      setError(errorMessage(reason))
      setDeleting(false)
    }
  }


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
              <p>参加者は誰でも削除できます。鍵写真・写真・顔の特徴量・招待情報がすべて消えます。</p>
              {confirmingDelete ? (
                <div className="delete-confirmation" role="alertdialog" aria-labelledby="delete-folder-title">
                  <strong id="delete-folder-title">「{folder.name}」を削除しますか？</strong>
                  <p>この操作は元に戻せません。</p>
                  <div>
                    <Button
                      variant="ghost"
                      disabled={deleting}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      キャンセル
                    </Button>
                    <Button
                      variant="danger"
                      loading={deleting}
                      onClick={() => void removeFolder()}
                    >
                      <Trash2 size={18} />完全に削除
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="danger" fullWidth onClick={() => setConfirmingDelete(true)}>
                  <Trash2 size={18} />フォルダを削除
                </Button>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}
