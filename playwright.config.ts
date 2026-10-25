import { defineConfig } from '@playwright/test'

// スマホ幅の UX 検査（issue #22）。API は e2e/mocks.ts でモックするので、バックエンドは要らない。
const PORT = 5174

// 画面の大きさ: iPhone SE と、最近の iPhone
const viewports = [
  { name: 'w375', width: 375, height: 667 },
  { name: 'w390', width: 390, height: 844 },
]

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-screenshots/.results',
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  retries: 0,
  workers: 2,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    hasTouch: true,
    isMobile: true,
    locale: 'ja-JP',
    launchOptions: {
      // カメラの代わりにダミーの映像を流し、許可のダイアログも出さない
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
    permissions: ['camera'],
  },
  projects: viewports.map(({ name, width, height }) => ({
    name,
    use: { browserName: 'chromium', viewport: { width, height } },
  })),
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_API_BASE_URL: 'http://api.test' },
  },
})
