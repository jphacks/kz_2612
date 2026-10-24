import { useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  ImagePlus,
  Info,
  MoreHorizontal,
  Settings,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell, PageHeader } from '../components/AppShell'
import { Badge, Button, Card } from '../components/Ui'
import { getFolder, members, photos } from '../data/mockData'

function folderPath(folderId: string | undefined, suffix: string) {
  return '/folders/' + (folderId ?? 'summer-2026') + suffix
}

export function GalleryPage() {
  const { folderId } = useParams()
  const folder = getFolder(folderId)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const togglePhoto = (photoId: string) => {
    setSelected((current) =>
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId],
    )
  }

  return (
    <AppShell showNavigation>
      <div className="screen screen--gallery">
        <PageHeader
          title={selecting ? selected.length + '枚を選択' : folder.name}
          eyebrow={selecting ? 'SELECT PHOTOS' : 'OPEN · あと11時間'}
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
            <div className="avatar-stack">
              {members.slice(0, 4).map((member) => <i key={member.email}>{member.initials}</i>)}
            </div>
            <span>{folder.photoCount}枚の思い出</span>
            <button type="button" onClick={() => setSelecting(true)}>選択</button>
          </div>
        )}

        <div className="photo-grid">
          {photos.map((photo, index) => {
            const isSelected = selected.includes(photo.id)
            const content = (
              <>
                <div className={'photo-grid__image photo-tone--' + photo.tone}>
                  <span className="photo-grid__shape" />
                  {selecting && (
                    <span className={'select-check ' + (isSelected ? 'is-selected' : '')}>
                      {isSelected && <Check size={15} />}
                    </span>
                  )}
                </div>
                {(index === 0 || index === 2 || index === 4) && (
                  <span className="photo-grid__date">{photo.capturedAt}</span>
                )}
              </>
            )

            return selecting ? (
              <button
                className="photo-grid__item"
                type="button"
                key={photo.id}
                onClick={() => togglePhoto(photo.id)}
              >
                {content}
              </button>
            ) : (
              <Link
                className="photo-grid__item"
                key={photo.id}
                to={folderPath(folderId, '/photos/' + photo.id)}
              >
                {content}
              </Link>
            )
          })}
        </div>

        {selecting ? (
          <div className="selection-bar">
            <span>{selected.length ? selected.length + '枚を選択中' : '写真を選んでください'}</span>
            <Button variant="danger" disabled={!selected.length}>
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
  const photoIndex = Math.max(photos.findIndex((item) => item.id === photoId), 0)
  const photo = photos[photoIndex]
  const previous = photos[(photoIndex - 1 + photos.length) % photos.length]
  const next = photos[(photoIndex + 1) % photos.length]

  return (
    <AppShell fullBleed>
      <div className="photo-detail">
        <div className="photo-detail__top">
          <button type="button" onClick={() => navigate(folderPath(folderId, '/photos'))}>
            <X size={24} />
          </button>
          <span>{photoIndex + 1} / {photos.length}</span>
          <button type="button" aria-label="その他"><MoreHorizontal size={24} /></button>
        </div>

        <div className={'photo-detail__image photo-tone--' + photo.tone}>
          <span className="photo-detail__shape" />
          <Link
            className="photo-detail__arrow photo-detail__arrow--left"
            to={folderPath(folderId, '/photos/' + previous.id)}
          >
            <ChevronLeft size={25} />
          </Link>
          <Link
            className="photo-detail__arrow photo-detail__arrow--right"
            to={folderPath(folderId, '/photos/' + next.id)}
          >
            <ChevronRight size={25} />
          </Link>
        </div>

        <div className="photo-detail__caption">
          <div>
            <strong>{photo.label}</strong>
            <span>{photo.capturedAt}</span>
          </div>
          <button type="button" aria-label="保存"><Download size={21} /></button>
          <button type="button" aria-label="削除"><Trash2 size={21} /></button>
        </div>
      </div>
    </AppShell>
  )
}

export function UploadPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const [selectedCount, setSelectedCount] = useState(0)

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
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(event) => setSelectedCount(Math.min(event.target.files?.length ?? 0, 8))}
          />
          <span><Upload size={26} /></span>
          <strong>写真を選ぶ</strong>
          <small>JPEG・PNG・WebP・HEIC / 1枚15MBまで</small>
        </label>

        {selectedCount > 0 && (
          <Card className="upload-queue">
            <div className="upload-queue__heading">
              <strong>{selectedCount}枚を選択中</strong>
              <Badge tone="accent">残り{8 - selectedCount}枚</Badge>
            </div>
            <div className="upload-queue__items">
              {Array.from({ length: selectedCount }).map((_, index) => (
                <span className={'photo-tone--' + ['sunset', 'ocean', 'forest'][index % 3]} key={index}>
                  <Check size={15} />
                </span>
              ))}
            </div>
          </Card>
        )}

        <Card className="guide-card">
          <Info size={20} />
          <div>
            <strong>アップロード時に自動調整</strong>
            <p>向きとサイズを整え、位置情報を削除して保存します。</p>
          </div>
        </Card>

        <div className="sticky-actions sticky-actions--single">
          <Button
            fullWidth
            disabled={!selectedCount}
            onClick={() => navigate(folderPath(folderId, '/photos'))}
          >
            {selectedCount ? selectedCount + '枚を追加する' : '写真を選んでください'}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

export function FolderSettingsPage() {
  const { folderId } = useParams()
  const navigate = useNavigate()
  const folder = getFolder(folderId)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const matchingMembers = useMemo(() => members.slice(0, folder.memberCount), [folder.memberCount])

  return (
    <AppShell>
      <div className="screen screen--settings">
        <PageHeader title="フォルダ情報" backTo={folderPath(folderId, '/photos')} />

        <Card className="settings-summary">
          <div className={'settings-summary__cover photo-tone--' + folder.accent}>
            <Users size={28} />
          </div>
          <div>
            <small>フォルダ名</small>
            <h2>{folder.name}</h2>
            <span>{folder.photoCount} / 20枚</span>
          </div>
        </Card>

        <section className="settings-section">
          <div className="settings-section__heading">
            <h3>参加者</h3>
            <Badge tone="accent">{matchingMembers.length}人</Badge>
          </div>
          <div className="member-list">
            {matchingMembers.map((member) => (
              <div className="member-row" key={member.email}>
                <i>{member.initials}</i>
                <span><strong>{member.name}</strong><small>{member.email}</small></span>
                {member.name === 'あなた' && <Badge>自分</Badge>}
              </div>
            ))}
          </div>
        </section>

        <div className="notice-box">
          フォルダ名・参加者・鍵写真は作成後に変更できません。
        </div>

        <section className="danger-zone">
          <h3>危険な操作</h3>
          <p>参加者全員がフォルダを削除できます。削除後は元に戻せません。</p>
          <Button variant="danger" fullWidth onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={18} />フォルダを削除
          </Button>
        </section>

        {confirmingDelete && (
          <div className="modal-backdrop" role="presentation">
            <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
              <span className="confirm-modal__icon"><Trash2 size={24} /></span>
              <h2 id="delete-title">本当に削除しますか？</h2>
              <p>鍵写真・保存写真・認証データがすべて削除され、元に戻せません。</p>
              <label className="field">
                <span>確認のため「{folder.name}」と入力</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
              <Button
                variant="danger"
                fullWidth
                disabled={confirmation !== folder.name}
                onClick={() => navigate('/folders')}
              >
                完全に削除する
              </Button>
              <Button variant="ghost" fullWidth onClick={() => setConfirmingDelete(false)}>
                キャンセル
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
