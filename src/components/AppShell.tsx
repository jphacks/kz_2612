import type { PropsWithChildren, ReactNode } from 'react'
import { ArrowLeft, FolderHeart, Plus, UserRound } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { classNames } from '../lib/classNames'

export function AppShell({
  children,
  showNavigation = false,
  fullBleed = false,
}: PropsWithChildren<{
  showNavigation?: boolean
  fullBleed?: boolean
}>) {
  return (
    <div className={classNames('app-frame', fullBleed && 'app-frame--full-bleed')}>
      {!fullBleed && <div className="paper-grain" aria-hidden="true" />}
      <main className="app-content">{children}</main>
      {showNavigation && <BottomNavigation />}
    </div>
  )
}

export function PageHeader({
  title,
  eyebrow,
  backTo,
  right,
  inverse = false,
}: {
  title: string
  eyebrow?: string
  backTo?: string
  right?: ReactNode
  inverse?: boolean
}) {
  const navigate = useNavigate()

  return (
    <header className={classNames('page-header', inverse && 'page-header--inverse')}>
      <div className="page-header__side">
        {backTo && (
          <button
            className="icon-button"
            type="button"
            aria-label="戻る"
            onClick={() => navigate(backTo)}
          >
            <ArrowLeft size={22} />
          </button>
        )}
      </div>
      <div className="page-header__title">
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      <div className="page-header__side page-header__side--right">{right}</div>
    </header>
  )
}

function BottomNavigation() {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <NavLink
        to="/folders"
        className={({ isActive }) => classNames('bottom-nav__item', isActive && 'is-active')}
      >
        <FolderHeart size={21} />
        <span>フォルダ</span>
      </NavLink>
      <NavLink
        to="/folders/new"
        className={({ isActive }) =>
          classNames('bottom-nav__item', 'bottom-nav__item--create', isActive && 'is-active')
        }
      >
        <span className="bottom-nav__plus"><Plus size={22} /></span>
        <span>つくる</span>
      </NavLink>
      <button className="bottom-nav__item" type="button">
        <UserRound size={21} />
        <span>アカウント</span>
      </button>
    </nav>
  )
}
