import { render, screen } from '@testing-library/react'
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
    vi.unstubAllGlobals()
    sessionStorage.clear()
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
})
