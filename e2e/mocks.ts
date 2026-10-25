import type { Page, Route } from '@playwright/test'

// バックエンド（src/api/client.ts の呼び出し先）の代わりに返す偽の応答。
export const API = 'http://api.test'
export const FOLDER_ID = 'c1'

// 1x1 の PNG。画像の URL や、アップロードするファイルの代わりに使う
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
export const PNG = Buffer.from(PNG_BASE64, 'base64')

const point = (x: number, y: number): [number, number] => [x, y]
const person = (cx: number) => ({
  left_shoulder: point(cx - 0.05, 0.4),
  right_shoulder: point(cx + 0.05, 0.4),
  left_elbow: point(cx - 0.09, 0.5),
  right_elbow: point(cx + 0.09, 0.5),
  left_wrist: point(cx - 0.08, 0.36),
  right_wrist: point(cx + 0.08, 0.36),
  left_hip: point(cx - 0.04, 0.6),
  right_hip: point(cx + 0.04, 0.6),
})

export const folderDetail = {
  capsule_id: FOLDER_ID,
  name: '高校の文化祭',
  open_date: null,
  days_until_open: null,
  status: 'locked',
  people_count: 3,
  role: 'owner',
  poses: [person(0.25), person(0.5), person(0.75)],
  cover_photo_url: 'http://img.test/cover.png',
  key_photo_url: 'http://img.test/key.png',
  preview_url: null,
  url_expires_in: 60,
  guide: [0.25, 0.5, 0.75].map((cx, position) => ({
    position,
    angles: {},
    points: person(cx),
    face_registered: true,
  })),
  can_open_now: true,
  locked_until: null,
  attempts_left: null,
  contents_count: 6,
  opened_at: null,
}

const summaries = [
  folderDetail,
  {
    ...folderDetail,
    capsule_id: 'c2',
    name: 'サークル旅行 2019 夏の北海道（ずっと長い名前のフォルダ）',
    people_count: 4,
    role: 'member',
    cover_photo_url: null,
  },
  { ...folderDetail, capsule_id: 'c3', name: '家族写真', people_count: 2 },
]

const photos = Array.from({ length: 6 }, (_, i) => ({
  content_id: 'p' + i,
  type: 'photo',
  author_id: 'demo-user',
  created_at: '2026-10-0' + (i + 1) + 'T09:00:00Z',
  url: 'http://img.test/photo' + i + '.png',
}))

export const failedResult = {
  ok: false,
  result: {
    ok: false,
    reason: 'pose_mismatch',
    score: 42,
    message: 'あと少し。左の人のひじをもう少し上げてみよう。',
    expected_people: 3,
    detected_people: 3,
    mirrored: false,
    faces: [],
  },
  attempts_left: null,
  locked_until: null,
  opened: null,
  unlock: null,
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  })
}

/** 外部への通信を止め、API・画像・アップロード先を偽の応答にする */
export async function mockBackend(page: Page) {
  // 外部（フォント・MoveNet のモデルなど）は読み込まない。モデルの読み込み失敗でも撮影ボタンは出る
  await page.route(
    (url) =>
      !['127.0.0.1', 'api.test', 'img.test', 'upload.test'].includes(url.hostname),
    (route) => route.abort(),
  )
  await page.route('http://img.test/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PNG }),
  )
  await page.route('http://upload.test/**', (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' } }),
  )
  await page.route(API + '/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      })
    }
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path === '/capsules' && method === 'GET') return json(route, summaries)
    if (path === '/capsules' && method === 'POST') return json(route, folderDetail, 201)
    if (path === '/uploads') {
      return json(route, {
        upload_url: 'http://upload.test/put',
        method: 'PUT',
        headers: {},
        s3_key: 'uploads/x.png',
        expires_in: 300,
      })
    }
    if (path.endsWith('/members')) {
      return json(route, [
        { user_id: 'demo-user', role: 'owner', email: 'demo@example.com' },
      ])
    }
    if (path.endsWith('/invites')) {
      return json(route, { token: 'tok123', expires_at: '2026-11-01T00:00:00Z' })
    }
    if (path.endsWith('/contents') && method === 'GET') {
      return json(route, {
        key_photo_url: folderDetail.key_photo_url,
        contents: photos,
        url_expires_in: 60,
      })
    }
    if (path.endsWith('/open')) return json(route, failedResult)
    if (path.startsWith('/capsules/')) return json(route, folderDetail)
    return json(route, { error: { code: 'not_found', message: 'not mocked: ' + path } }, 404)
  })
}

/** 解除済み（写真を見られる）状態にする。セッションはタブごとなので sessionStorage に入れる */
export async function seedUnlocked(page: Page) {
  await page.addInitScript((id) => {
    sessionStorage.setItem(
      'web-time-capsule:unlock:' + id,
      JSON.stringify({ token: 't', expiresAt: Date.now() + 3600_000 }),
    )
  }, FOLDER_ID)
}

/** 「もう一度」の画面（失敗した結果）を出せる状態にする */
export async function seedFailedResult(page: Page) {
  await page.addInitScript(
    ([id, value]) => {
      sessionStorage.setItem('web-time-capsule:result:' + id, value)
    },
    [FOLDER_ID, JSON.stringify(failedResult)],
  )
}
