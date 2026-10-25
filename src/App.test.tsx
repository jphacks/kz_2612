import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { OpenResponse } from './api/types'
import { saveAuthResult } from './lib/unlockSession'

describe('App routes', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            capsule_id: 'summer-2026',
            name: '夏合宿 2026',
            open_date: null,
            days_until_open: null,
            status: 'locked',
            people_count: 4,
            role: 'owner',
          },
          {
            capsule_id: 'after-school',
            name: '放課後メモリーズ',
            open_date: null,
            days_until_open: null,
            status: 'opened',
            people_count: 3,
            role: 'member',
          },
        ],
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('shows the top page with a link to create a capsule', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'See You There.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'カプセルをつくる' })).toHaveAttribute('href', '/folders/new')
  })

  it('shows the login screen', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('button', { name: '開発用アカウントで進む' }),
    ).toBeInTheDocument()
  })

  it('shows participating folders returned by the API', async () => {
    render(
      <MemoryRouter initialEntries={['/folders']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '思い出フォルダ' })).toBeInTheDocument()
    expect(await screen.findByText('夏合宿 2026')).toBeInTheDocument()
    expect(await screen.findByText('放課後メモリーズ')).toBeInTheDocument()
  })

  it('explains that the camera is used for pose and face matching', () => {
    render(
      <MemoryRouter initialEntries={['/folders/capsule-1/camera-permission']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('顔の特徴を照合')).toBeInTheDocument()
    expect(screen.queryByText('顔は見ません')).not.toBeInTheDocument()
  })

  it('shows each face verification result returned by the backend', () => {
    const response: OpenResponse = {
      ok: false,
      result: {
        ok: false,
        reason: 'face_mismatch',
        score: 93,
        message: '右の人の顔を確かめられませんでした',
        expected_people: 2,
        detected_people: 2,
        mirrored: false,
        faces: [
          {
            position: 0,
            visible: true,
            checked: true,
            ok: true,
            similarity: 0.82,
            others: 0.11,
          },
          {
            position: 1,
            visible: true,
            checked: true,
            ok: false,
            similarity: 0.18,
            others: 0.09,
          },
        ],
      },
      attempts_left: null,
      locked_until: null,
      opened: null,
      unlock: null,
    }
    saveAuthResult('capsule-1', response)

    render(
      <MemoryRouter initialEntries={['/folders/capsule-1/auth-result']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('顔認証')).toBeInTheDocument()
    expect(screen.getByText('左から1人目')).toBeInTheDocument()
    expect(screen.getByText('顔が一致しました')).toBeInTheDocument()
    expect(screen.getByText('左から2人目')).toBeInTheDocument()
    expect(screen.getByText('顔が一致しません')).toBeInTheDocument()
  })

  it('lets an invited account join a folder', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/invites/invite-token/accept') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            capsule_id: 'capsule-1',
            name: '夏合宿',
            role: 'member',
          }),
        })
      }
      if (url.endsWith('/capsules/capsule-1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            capsule_id: 'capsule-1',
            name: '夏合宿',
            open_date: null,
            days_until_open: null,
            status: 'locked',
            people_count: 3,
            role: 'member',
            key_photo_url: 'key.jpg',
            preview_url: null,
            url_expires_in: 60,
            guide: [],
            can_open_now: true,
            locked_until: null,
            attempts_left: null,
            contents_count: 0,
            opened_at: null,
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          capsule_id: 'capsule-1',
          capsule_name: '夏合宿',
          open_date: null,
          days_until_open: null,
          people_count: 3,
          members_count: 1,
          invited_by: 'demo-user',
          expires_at: '2026-11-01T00:00:00Z',
          already_member: false,
        }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/invite/invite-token']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '夏合宿' })).toBeInTheDocument()
    expect(screen.getByText(/鍵写真の人物と参加アカウントを照合/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '招待を承認して参加' }))

    await waitFor(() => {
      const acceptance = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/invites/invite-token/accept') &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(acceptance).toBeDefined()
    })
  })
  it('shows the current account and clears unlock sessions on logout', () => {
    sessionStorage.setItem(
      'web-time-capsule:unlock:capsule-1',
      JSON.stringify({ token: 'unlock-token', expiresAt: Date.now() + 60_000 }),
    )

    render(
      <MemoryRouter initialEntries={['/account']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('demo@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(
      screen.getByRole('button', { name: '開発用アカウントで進む' }),
    ).toBeInTheDocument()
    expect(
      sessionStorage.getItem('web-time-capsule:unlock:capsule-1'),
    ).toBeNull()
  })

  it('lets a participant permanently delete a folder after confirmation', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/capsules/capsule-1') && init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => undefined,
        })
      }
      if (url.endsWith('/capsules/capsule-1/members')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              user_id: 'demo-user',
              email: 'demo@example.com',
              role: 'member',
            },
          ],
        })
      }
      if (url.endsWith('/capsules/capsule-1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            capsule_id: 'capsule-1',
            name: '夏合宿',
            open_date: null,
            days_until_open: null,
            status: 'locked',
            people_count: 3,
            role: 'member',
            key_photo_url: 'key.jpg',
            preview_url: null,
            url_expires_in: 60,
            guide: [],
            can_open_now: true,
            locked_until: null,
            attempts_left: null,
            contents_count: 2,
            opened_at: null,
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/folders/capsule-1/settings']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '夏合宿' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを削除' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '完全に削除' }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/capsules/capsule-1') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      )).toBe(true)
    })
    expect(await screen.findByRole('heading', { name: '思い出フォルダ' })).toBeInTheDocument()
  })

})
