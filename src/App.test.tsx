import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App routes', () => {
  it('shows the login screen', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('button', { name: 'Googleでログイン' }),
    ).toBeInTheDocument()
  })

  it('shows participating folders', () => {
    render(
      <MemoryRouter initialEntries={['/folders']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '思い出フォルダ' })).toBeInTheDocument()
    expect(screen.getByText('夏合宿 2026')).toBeInTheDocument()
    expect(screen.getByText('放課後メモリーズ')).toBeInTheDocument()
  })
})
