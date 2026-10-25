import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  FolderHeart,
  LoaderCircle,
  LogIn,
  Send,
  Share2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  acceptInvite,
  createInvite,
  getInvite,
  listMembers,
} from '../api/client'
import type { InviteCreated, InvitePreview, MemberView } from '../api/types'
import { AppShell, PageHeader } from '../components/AppShell'
import { Button, Card } from '../components/Ui'
import {
  getDevelopmentIdentity,
  setDevelopmentIdentity,
} from '../lib/developmentIdentity'
import {
  beginGoogleSignIn,
  getSignedInUser,
  isCognitoConfigured,
} from '../lib/auth'

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : '処理に失敗しました。もう一度お試しください。'
}

const inviteRequests = new Map<string, Promise<InviteCreated>>()

function invitationStorageKey(folderId: string) {
  return 'web-time-capsule:invite:' + folderId
}

function getOrCreateInvitation(folderId: string) {
  const saved = sessionStorage.getItem(invitationStorageKey(folderId))
  if (saved) {
    try {
      return Promise.resolve(JSON.parse(saved) as InviteCreated)
    } catch {
      sessionStorage.removeItem(invitationStorageKey(folderId))
    }
  }

  const existingRequest = inviteRequests.get(folderId)
  if (existingRequest) return existingRequest

  const request = createInvite(folderId)
    .then((invite) => {
      sessionStorage.setItem(
        invitationStorageKey(folderId),
        JSON.stringify(invite),
      )
      return invite
    })
    .catch((error: unknown) => {
      inviteRequests.delete(folderId)
      throw error
    })
  inviteRequests.set(folderId, request)
  return request
}

export function InviteMembersPage() {
  const { folderId = '' } = useParams()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<InviteCreated | null>(null)
  const [members, setMembers] = useState<MemberView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    if (!folderId) return
    Promise.all([getOrCreateInvitation(folderId), listMembers(folderId)])
      .then(([created, memberItems]) => {
        setInvite(created)
        setMembers(memberItems)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [folderId])

  useEffect(() => {
    load()
  }, [load])

  const invitationUrl = invite
    ? window.location.origin + '/invite/' + invite.token
    : ''

  const copyInvitation = async () => {
    await navigator.clipboard.writeText(invitationUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const shareInvitation = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Webタイムカプセルへの招待',
        text: 'このリンクからフォルダに参加してね',
        url: invitationUrl,
      })
      return
    }
    await copyInvitation()
  }

  return (
    <AppShell>
      <div className="screen screen--invite">
        <PageHeader title="メンバーを招待" eyebrow="FOLDER CREATED" />

        <div className="invite-hero">
          <span><Check size={28} /></span>
          <p>フォルダを作成しました</p>
          <h1>一緒に使う人を<br />招待しよう</h1>
          <small>鍵写真に写っている人数と、招待する人数は別で構いません。</small>
        </div>

        {loading && (
          <div className="api-state" role="status">
            <LoaderCircle className="button__spinner" size={23} />
            招待リンクを準備しています
          </div>
        )}

        {!loading && error && (
          <div className="invite-error">
            <div className="api-error" role="alert">{error}</div>
            <Button onClick={() => {
              setLoading(true)
              setError('')
              load()
            }}>
              もう一度試す
            </Button>
          </div>
        )}

        {!loading && invite && (
          <>
            <Card className="invite-link-card">
              <div className="invite-link-card__heading">
                <span><Send size={20} /></span>
                <div>
                  <strong>招待リンク</strong>
                  <small>このリンクを参加者に送ってください</small>
                </div>
              </div>
              <div className="invite-url">
                <span>{invitationUrl}</span>
                <button type="button" onClick={copyInvitation} aria-label="招待リンクをコピー">
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
              <Button fullWidth onClick={shareInvitation}>
                <Share2 size={18} />
                {copied ? 'コピーしました' : '招待リンクを共有'}
              </Button>
              <p className="invite-expiry">
                招待リンクには期限があります。期限後の再発行は今回のMVPでは行いません。
              </p>
            </Card>

            <section className="settings-section">
              <div className="settings-section__heading">
                <h2>現在の参加者</h2>
                <span>{members.length} / 4人</span>
              </div>
              <div className="member-list">
                {members.map((member) => (
                  <div className="member-row" key={member.user_id}>
                    <i>{member.role === 'owner' ? 'YOU' : 'MEM'}</i>
                    <span>
                      <strong>{member.email || member.user_id}</strong>
                      <small>{member.role === 'owner' ? '作成者' : '参加者'}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <div className="notice-box">
              作成者を含めて最大4人です。参加後は全員が写真の追加・削除と
              フォルダ削除を同じ権限で行えます。
            </div>
          </>
        )}

        <div className="sticky-actions sticky-actions--single">
          <Button
            fullWidth
            disabled={loading}
            onClick={() => navigate('/folders/' + folderId + '/unlock', { replace: true })}
          >
            招待を終えてフォルダへ
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

export function InviteAcceptPage() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState(getDevelopmentIdentity().email)
  const autoJoinStarted = useRef(false)
  const signedInUser = getSignedInUser()

  const loadPreview = useCallback(() => {
    if (!token) return
    getInvite(token)
      .then(setPreview)
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    loadPreview()
  }, [loadPreview])

  const switchDevelopmentAccount = () => {
    if (!email.trim()) return
    setDevelopmentIdentity(email)
    setLoading(true)
    setError('')
    loadPreview()
  }

  const join = useCallback(async () => {
    setJoining(true)
    setError('')
    try {
      const folder = await acceptInvite(token)
      navigate('/folders/' + folder.capsule_id + '/unlock', { replace: true })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setJoining(false)
    }
  }, [navigate, token])

  const joinOrSignIn = async () => {
    if (isCognitoConfigured && !signedInUser) {
      setJoining(true)
      setError('')
      try {
        await beginGoogleSignIn('/invite/' + token + '?join=1')
      } catch (reason) {
        setError(errorMessage(reason))
        setJoining(false)
      }
      return
    }
    await join()
  }

  useEffect(() => {
    const shouldJoin = new URLSearchParams(location.search).get('join') === '1'
    if (
      shouldJoin &&
      signedInUser &&
      preview &&
      !preview.already_member &&
      preview.members_count < 4 &&
      !autoJoinStarted.current
    ) {
      autoJoinStarted.current = true
      void join()
    }
  }, [join, location.search, preview, signedInUser])

  return (
    <AppShell>
      <div className="screen screen--invite-accept">
        <div className="invite-brand"><FolderHeart size={22} />Webタイムカプセル</div>

        {loading && (
          <div className="api-state invite-loading" role="status">
            <LoaderCircle className="button__spinner" size={25} />
            招待を確認しています
          </div>
        )}

        {!loading && error && !preview && (
          <div className="invite-error">
            <div className="api-error" role="alert">{error}</div>
            <Button onClick={() => {
              setLoading(true)
              setError('')
              loadPreview()
            }}>
              もう一度試す
            </Button>
          </div>
        )}

        {!loading && preview && (
          <>
            <div className="invite-accept-visual">
              <span><UserPlus size={34} /></span>
            </div>
            <div className="invite-accept-copy">
              <p>フォルダへの招待が届いています</p>
              <h1>{preview.capsule_name}</h1>
              <span><Users size={16} />現在 {preview.members_count}人が参加中</span>
            </div>

            {!isCognitoConfigured && <Card className="development-account-card">
              <div>
                <LogIn size={19} />
                <strong>参加する開発用アカウント</strong>
              </div>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <button type="button" onClick={switchDevelopmentAccount}>
                このアカウントに切り替える
              </button>
              <small>Googleログイン実装後は、この入力欄をログイン画面に置き換えます。</small>
            </Card>}

            {isCognitoConfigured && signedInUser && (
              <Card className="signed-in-account">
                <Check size={19} />
                <div>
                  <strong>Googleでログイン済み</strong>
                  <small>{signedInUser.email || signedInUser.userId}</small>
                </div>
              </Card>
            )}

            <div className="notice-box">
              参加すると、自分のフォルダ一覧にこのフォルダが表示されます。
              鍵写真の人物と参加アカウントを照合することはありません。
            </div>

            {!preview.already_member && preview.members_count >= 4 && (
              <div className="api-error" role="alert">
                このフォルダは参加上限の4人に達しています。
              </div>
            )}

            {error && <div className="api-error" role="alert">{error}</div>}

            <div className="invite-accept-actions">
              <Button
                fullWidth
                loading={joining}
                disabled={!preview.already_member && preview.members_count >= 4}
                onClick={preview.already_member
                  ? () => navigate('/folders/' + preview.capsule_id + '/unlock')
                  : joinOrSignIn}
              >
                {preview.already_member
                  ? 'フォルダを開く'
                  : preview.members_count >= 4
                    ? '参加人数が上限です'
                    : isCognitoConfigured && !signedInUser
                    ? 'Googleで参加する'
                    : '招待を承認して参加'}
              </Button>
              <Button fullWidth variant="ghost" onClick={() => navigate('/folders')}>
                あとで
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
