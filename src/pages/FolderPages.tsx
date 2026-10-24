import { useState } from 'react'
import {
  ArrowRight,
  Camera,
  Check,
  FolderHeart,
  ImagePlus,
  Mail,
  MoreHorizontal,
  Plus,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell, PageHeader } from '../components/AppShell'
import { Badge, Button, Card } from '../components/Ui'
import { folders } from '../data/mockData'

export function FolderListPage() {
  return (
    <AppShell showNavigation>
      <div className="screen screen--folders">
        <header className="home-header">
          <div>
            <span className="home-header__greeting">おかえりなさい</span>
            <h1>思い出フォルダ</h1>
          </div>
          <button className="avatar-button" type="button" aria-label="アカウント">
            YO
          </button>
        </header>

        <Link className="create-banner" to="/folders/new">
          <span className="create-banner__icon"><Plus size={22} /></span>
          <span>
            <strong>新しいフォルダをつくる</strong>
            <small>鍵になる1枚を選んではじめよう</small>
          </span>
          <ArrowRight size={20} />
        </Link>

        <div className="section-heading">
          <h2>参加中</h2>
          <span>{folders.length} folders</span>
        </div>

        <div className="folder-list">
          {folders.map((folder) => {
            const destination =
              folder.status === 'open'
                ? '/folders/' + folder.id + '/photos'
                : '/folders/' + folder.id + '/unlock'

            return (
              <Link className="folder-card" to={destination} key={folder.id}>
                <div className={'folder-card__cover photo-tone--' + folder.accent}>
                  <span className="folder-card__shine" />
                  <FolderHeart size={27} />
                  <Badge tone={folder.status === 'open' ? 'success' : 'neutral'}>
                    {folder.status === 'open' ? '開封中' : 'ロック中'}
                  </Badge>
                </div>
                <div className="folder-card__body">
                  <div className="folder-card__title-row">
                    <h3>{folder.name}</h3>
                    <MoreHorizontal size={19} />
                  </div>
                  <div className="folder-card__meta">
                    <span><Users size={15} />{folder.memberCount}人</span>
                    <span>{folder.photoCount}枚</span>
                    <span>{folder.updatedAt}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <Card className="tip-card">
          <span className="tip-card__icon"><Sparkles size={19} /></span>
          <div>
            <strong>ポーズのコツ</strong>
            <p>肩と手足が見えるように、少しカメラから離れて撮ろう。</p>
          </div>
        </Card>
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
  const [folderName, setFolderName] = useState('夏の思い出')
  const [keyPhotoSelected, setKeyPhotoSelected] = useState(false)

  const next = () => {
    if (step === 4) {
      navigate('/folders')
      return
    }
    setStep((step + 1) as CreateStep)
  }

  const previous = () => {
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

            <div className="field-group">
              <div className="field-group__label">
                <span>参加者のGoogleメール</span>
                <Badge tone="accent">2〜4人</Badge>
              </div>
              <div className="member-input member-input--you">
                <span className="member-input__avatar">YO</span>
                <span>
                  <strong>you@example.com</strong>
                  <small>あなた・自動で追加</small>
                </span>
                <Check size={18} />
              </div>
              <label className="member-input">
                <Mail size={19} />
                <input type="email" defaultValue="haru@example.com" aria-label="参加者2" />
              </label>
              <button className="add-member-button" type="button">
                <Plus size={18} />参加者を追加
              </button>
            </div>

            <div className="notice-box">
              作成後はフォルダ名と参加者を変更できません。
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
            <label className={'photo-picker ' + (keyPhotoSelected ? 'has-photo' : '')}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={() => setKeyPhotoSelected(true)}
              />
              {keyPhotoSelected ? (
                <>
                  <div className="mock-key-photo">
                    <div className="pose-person pose-person--one" />
                    <div className="pose-person pose-person--two" />
                  </div>
                  <strong>写真を選択しました</strong>
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
                <p>解析できました</p>
                <h2>2人のポーズを検出</h2>
              </div>
            </div>
            <div className="key-photo-preview">
              <div className="skeleton skeleton--left"><i /><b /><em /></div>
              <div className="skeleton skeleton--right"><i /><b /><em /></div>
              <Badge tone="success">鍵にできます</Badge>
            </div>
            <div className="check-list">
              <span><Check size={18} />参加者数と写真の人数が一致</span>
              <span><Check size={18} />肩と比較ポイントを検出</span>
              <span><Check size={18} />立ち位置を判定可能</span>
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
              <div className="summary-card__photo photo-tone--sunset">
                <Users size={30} />
              </div>
              <div className="summary-card__content">
                <small>フォルダ名</small>
                <strong>{folderName || '名称未設定'}</strong>
                <span><Users size={16} />2人で参加</span>
              </div>
            </Card>
            <div className="summary-members">
              <span><i>YO</i>you@example.com</span>
              <span><i>HA</i>haru@example.com</span>
            </div>
            <div className="notice-box">
              作成後は、フォルダ名・参加者・鍵写真を変更できません。
            </div>
          </div>
        )}

        <div className="sticky-actions">
          <Button variant="ghost" onClick={previous}>戻る</Button>
          <Button
            onClick={next}
            disabled={step === 1 ? !folderName.trim() : step === 2 ? !keyPhotoSelected : false}
          >
            {step === 4 ? 'フォルダをつくる' : '次へ'}
            <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
