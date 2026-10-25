import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

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
})
