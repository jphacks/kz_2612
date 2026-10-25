import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { classNames } from '../lib/classNames'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  fullWidth?: boolean
  loading?: boolean
}

export function Button({
  children,
  className,
  variant = 'primary',
  fullWidth = false,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(
        'button',
        'button--' + variant,
        fullWidth && 'button--full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoaderCircle className="button__spinner" size={18} />}
      {children}
    </button>
  )
}

export function Card({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return <section className={classNames('card', className)}>{children}</section>
}

export function Badge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'accent' }>) {
  return <span className={'badge badge--' + tone}>{children}</span>
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}
