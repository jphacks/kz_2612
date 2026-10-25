import { useEffect, useRef, useState, type CSSProperties } from 'react'

const SPARK_PATH = 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z'

type Stage = 'tap' | 'open' | 'glow' | 'reveal'

// 弾ける星の行き先（x, y）と大きさ
const BURST: Array<[number, number, number]> = [
  [-150, -170, 1.2], [140, -180, 1], [-30, -230, 0.8], [60, -210, 1.3], [-180, -40, 0.9],
  [175, -60, 1.1], [-120, 90, 0.7], [125, 100, 0.9], [-70, -120, 0.6], [85, -100, 0.7],
  [0, -260, 1], [-200, -120, 0.6], [205, -130, 0.8], [30, 140, 0.6],
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * 認証成功の演出。箱をタップ → リボンがほどけて光る → 箱が光にほどけて星が弾ける
 * → 当時と今の写真が浮かぶ。終わったら onDone を呼ぶ（結果の文字やボタンを出すため）。
 * 動きを減らす設定の人には、最初から開いた状態を見せる。
 */
export function GiftReveal({
  thenPhotoUrl,
  nowPhotoUrl,
  onDone,
}: {
  thenPhotoUrl: string
  nowPhotoUrl: string
  onDone: () => void
}) {
  const [stage, setStage] = useState<Stage>(() => (prefersReducedMotion() ? 'reveal' : 'tap'))
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (stage === 'reveal') onDone()
  }, [stage, onDone])

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  const open = () => {
    setStage('open')
    timers.current = [
      window.setTimeout(() => setStage('glow'), 1000),
      window.setTimeout(() => setStage('reveal'), 2200),
    ]
  }

  return (
    <div className={'nt-reveal nt-stage-' + stage}>
      <div className="nt-halo" aria-hidden="true" />

      <div className="nt-reveal__intro">
        <span className="badge badge--success">POSE MATCHED</span>
        <h1>みんなが、そろいました</h1>
        <p>あの日からの贈りものが届いています</p>
      </div>

      <div className="nt-gift" aria-hidden="true">
        <div className="nt-gift__box"><div className="nt-gift__ribbon" /></div>
        <div className="nt-gift__lid">
          <div className="nt-gift__ribbon" />
          <div className="nt-gift__bow nt-gift__bow--left" />
          <div className="nt-gift__bow nt-gift__bow--right" />
        </div>
      </div>

      {BURST.map(([x, y, scale], index) => (
        <svg
          className="nt-burst"
          viewBox="0 0 24 24"
          aria-hidden="true"
          key={index}
          style={{
            '--x': x + 'px',
            '--y': y + 'px',
            '--s': scale,
            animationDelay: (index % 4) * 0.08 + 's',
            color: index % 3 === 0 ? 'var(--nt-lavender)' : undefined,
          } as CSSProperties}
        >
          <path fill="currentColor" d={SPARK_PATH} />
        </svg>
      ))}

      <figure className="nt-photo nt-photo--then">
        <img src={thenPhotoUrl} alt="鍵の写真（あの日）" />
        <figcaption>あの日</figcaption>
      </figure>
      <figure className="nt-photo nt-photo--now">
        <img src={nowPhotoUrl} alt="いま撮った写真（今日）" />
        <figcaption>今日</figcaption>
      </figure>

      {stage === 'tap' && (
        <>
          <button className="nt-tapzone" type="button" aria-label="贈りものを開ける" onClick={open} />
          <p className="nt-tap-hint">TAP TO OPEN</p>
        </>
      )}
    </div>
  )
}
