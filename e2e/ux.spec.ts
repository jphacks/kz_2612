import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import {
  FOLDER_ID,
  PNG,
  mockBackend,
  seedFailedResult,
  seedUnlocked,
} from './mocks'

// スマホ幅で「主な操作がスクロールなしで見えるか」「axe で serious 以上の問題がないか」を確かめる。
// スクショは e2e-screenshots/<画面の幅>/ に保存する（コミットしない。CI では artifact になる）。

const F = '/folders/' + FOLDER_ID

test.beforeEach(async ({ page }) => {
  await mockBackend(page)
})

/**
 * 今は失敗するのが分かっている項目（起票済みの UX の問題。#31・#32）。
 * 該当する幅では検査を飛ばし、test.fixme にする。スクショは先に撮るので artifact には残る。
 * 直ったら、この印を外す。
 */
interface Known {
  issue: string
  /** 失敗する画面の幅（project 名）。省略すると両方 */
  projects?: string[]
}

function applies(known: Known | undefined, project: string) {
  return Boolean(known && (!known.projects || known.projects.includes(project)))
}

/** 見えている（ファーストビューに全部入っている）うえに、ほかの要素に隠されず押せることを確かめる */
async function expectReachable(locator: Locator) {
  const target = locator.first()
  await expect.soft(target).toBeInViewport({ ratio: 0.99 })
  // 押せない状態（disabled）のボタンは、隠れていないかの確認（trial クリック）を飛ばす
  if (await target.isDisabled()) return
  // trial: 押す直前の確認（隠れていないか）だけして、実際には押さない
  await expect
    .soft(target.click({ trial: true, timeout: 2000 }))
    .resolves.toBeUndefined()
}

async function shot(page: Page, project: string, name: string) {
  await page.screenshot({ path: `e2e-screenshots/${project}/${name}.png` })
}

async function expectNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect
    .soft(
      serious.map(
        (v) =>
          `${v.id}: ${v.nodes.length}件 (${v.help}) 例: ` +
          v.nodes
            .slice(0, 2)
            .map((n) => n.target.join(' '))
            .join(' , '),
      ),
      'axe の serious 以上',
    )
    .toEqual([])
}

interface CheckOptions {
  /** スクロールなしで見えるべき操作 */
  targets?: Locator[]
  /** axe（serious 以上 0 件）を確かめるか */
  axe?: boolean
  viewKnown?: Known
  axeKnown?: Known
}

/** 画面ごとの共通の流れ: スクショ → 主な操作が見えるか → axe。既知の問題は最後に fixme にする */
async function check(
  page: Page,
  info: TestInfo,
  name: string,
  { targets = [], axe = true, viewKnown, axeKnown }: CheckOptions,
) {
  const project = info.project.name
  await page.waitForTimeout(600) // アニメーションが落ち着くのを待つ
  await shot(page, project, name)
  const skipView = applies(viewKnown, project)
  const skipAxe = applies(axeKnown, project)
  if (!skipView) for (const target of targets) await expectReachable(target)
  if (axe && !skipAxe) await expectNoSeriousA11y(page)
  const issues = [skipView && viewKnown?.issue, skipAxe && axeKnown?.issue].filter(Boolean)
  test.fixme(issues.length > 0, 'UX の問題として起票済み: ' + issues.join(' '))
}

const VIEW: Known = { issue: '#31' }
const AXE: Known = { issue: '#32' }

test('トップ: ログイン', async ({ page }, info) => {
  await page.goto('/')
  await check(page, info, '01-top', {
    targets: [page.getByRole('link', { name: 'ログイン' })],
    axeKnown: AXE, // トップの図のキャプションの色
  })
})

test('トップ: はじめるボタン（カプセルをつくる）', async ({ page }, info) => {
  await page.goto('/')
  await check(page, info, '01-top-cta', {
    targets: [page.getByRole('link', { name: 'カプセルをつくる' })],
    axe: false,
    viewKnown: VIEW,
  })
})

test('ログイン画面: 進むボタン', async ({ page }, info) => {
  await page.goto('/login')
  await check(page, info, '02-login', {
    targets: [page.getByRole('button', { name: '開発用アカウントで進む' })],
    viewKnown: VIEW,
  })
})

test('フォルダ一覧: 作る・各フォルダ', async ({ page }, info) => {
  await page.goto('/folders')
  await page.getByText('高校の文化祭').first().waitFor()
  await check(page, info, '03-folders', {
    targets: [
      page.getByRole('link', { name: '新しいフォルダをつくる' }),
      page.getByRole('link', { name: /高校の文化祭/ }),
    ],
    viewKnown: VIEW,
  })
})

test('フォルダ一覧: 2つ目のフォルダ', async ({ page }, info) => {
  await page.goto('/folders')
  await page.getByText('高校の文化祭').first().waitFor()
  await check(page, info, '03-folders-2nd', {
    targets: [page.getByRole('link', { name: /サークル旅行/ })],
    axe: false,
    viewKnown: VIEW,
  })
})

// 作成の各ステップ。「次へ」（最後は「フォルダをつくる」）が見えるか
const createSteps = [
  { n: 1, button: '次へ' },
  { n: 2, button: '次へ' },
  { n: 3, button: '次へ' },
  { n: 4, button: '次へ' },
  { n: 5, button: '次へ' },
  { n: 6, button: 'フォルダをつくる' },
]
for (const { n, button } of createSteps) {
  test(`作成 ステップ${n}: ${button}`, async ({ page }, info) => {
    await page.goto('/folders/new')
    await page.getByRole('textbox').first().fill('テストのフォルダ')
    for (let step = 1; step < n; step++) {
      if (step === 3) {
        // ステップ3は鍵写真を選ぶ画面（選ばないと「次へ」が押せない）
        await page.locator('input[type=file]').first().setInputFiles({
          name: 'key.png',
          mimeType: 'image/png',
          buffer: PNG,
        })
      }
      await page.getByRole('button', { name: '次へ' }).click()
    }
    await check(page, info, `04-create-step${n}`, {
      targets: [page.getByRole('button', { name: button })],
      axeKnown: AXE, // 進み具合の aria-label
    })
  })
}

test('招待: リンクのコピー', async ({ page }, info) => {
  await page.goto(F + '/invite-members')
  await page.getByText('招待リンク', { exact: true }).waitFor()
  await check(page, info, '05-invite', {
    targets: [page.getByRole('button', { name: '招待リンクをコピー' })],
    axeKnown: AXE, // 進み具合の aria-label
  })
})

test('解除: 鍵写真の確認（写真認証をはじめる）', async ({ page }, info) => {
  await page.goto(F + '/unlock')
  await expect(
    page.getByRole('button', { name: '写真認証をはじめる' }),
  ).toBeEnabled()
  await check(page, info, '06-unlock', {
    targets: [page.getByRole('button', { name: '写真認証をはじめる' })],
    viewKnown: VIEW,
  })
})

test('解除: カメラの準備', async ({ page }, info) => {
  await page.goto(F + '/camera-permission')
  await check(page, info, '07-camera-permission', {
    targets: [page.getByRole('button', { name: 'カメラを許可して進む' })],
  })
})

test('解除: カメラ（撮影ボタン）', async ({ page }, info) => {
  await page.goto(F + '/camera')
  await expect(page.getByRole('button', { name: '撮影する' })).toBeEnabled({
    timeout: 15_000,
  })
  await check(page, info, '08-camera', {
    targets: [page.getByRole('button', { name: '撮影する' })],
    viewKnown: { issue: '#31', projects: ['w375'] },
  })
})

test('失敗したとき: もう一度・直し方の案内', async ({ page }, info) => {
  await seedFailedResult(page)
  await page.goto(F + '/auth-result')
  await page.getByText('もう一度合わせよう').waitFor()
  await check(page, info, '09-result-failed', {
    targets: [
      page.getByRole('button', { name: 'もう一度撮る' }),
      page.getByText(/ひじをもう少し上げて/),
    ],
  })
})

test('アルバム: 写真の追加', async ({ page }, info) => {
  await seedUnlocked(page)
  await page.goto(F + '/photos')
  await page.getByText('枚の思い出').waitFor()
  await check(page, info, '10-album', {
    targets: [page.getByRole('link', { name: '写真を追加' })],
    axeKnown: AXE, // 写真リンク・設定リンクの名前
  })
})

test('写真の追加画面: 追加ボタン', async ({ page }, info) => {
  await seedUnlocked(page)
  await page.goto(F + '/upload')
  await page.getByRole('heading', { name: '思い出を、フォルダに入れよう' }).waitFor()
  await check(page, info, '11-upload', {
    targets: [page.getByRole('button', { name: /写真を選んでください|枚を追加する/ })],
  })
})
