import type { CSSProperties, ReactNode } from 'react'

/*
 * プリクラ風の飾り。白のシンプルな画面に、少しだけシール・日付・キラキラを足す。
 * どれも飾りなので読み上げない（中身の文字は、必要なら呼ぶ側で別に書く）。
 */

const SPARK = 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z'
const COLORS = ['var(--pk-pink)', 'var(--pk-yellow)', 'var(--pk-cyan)', '#fff']

// キラキラの位置（%）・大きさ（px）・瞬きの遅れ（秒）
const SPOTS: Array<[number, number, number, number]> = [
  [12, 18, 18, 0], [86, 14, 12, 0.8], [90, 70, 20, 1.6], [8, 78, 12, 2.2], [60, 8, 10, 1.2], [40, 90, 14, 0.4],
]

/** 写真やファインダーのまわりで瞬くキラキラ */
export function Twinkles({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <span className={'pk-sparkles' + (className ? ' ' + className : '')} aria-hidden="true">
      {SPOTS.slice(0, count).map(([x, y, size, delay], index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          style={{
            left: x + '%',
            top: y + '%',
            width: size,
            height: size,
            color: COLORS[index % COLORS.length],
            animationDelay: delay + 's',
          } as CSSProperties}
        >
          <path fill="currentColor" d={SPARK} />
        </svg>
      ))}
    </span>
  )
}

/** 少し傾けて貼ったシール */
export function Sticker({
  children,
  tone = 'pink',
  tilt = -6,
  className,
}: {
  children: ReactNode
  tone?: 'pink' | 'yellow' | 'cyan' | 'white'
  tilt?: number
  className?: string
}) {
  return (
    <span
      className={'pk-sticker pk-sticker--' + tone + (className ? ' ' + className : '')}
      style={{ '--tilt': tilt + 'deg' } as CSSProperties}
    >
      {children}
    </span>
  )
}

/** 使い捨てカメラのような、写真の角のオレンジの日付 */
export function DateStamp({ date, className }: { date: string | Date; className?: string }) {
  const d = typeof date === 'string' ? new Date(date) : date
  const text = Number.isNaN(d.getTime())
    ? ''
    : "'" + String(d.getFullYear()).slice(2) + ' ' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getDate()).padStart(2, '0')
  if (!text) return null
  return <span className={'pk-date' + (className ? ' ' + className : '')} aria-hidden="true">{text}</span>
}
