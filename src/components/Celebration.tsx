import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { LockKeyhole } from 'lucide-react'
import { DateStamp, Sticker } from './Decor'

const SPARK_PATH = 'M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z'

type Stage = 'tap' | 'open' | 'flash' | 'reveal'

// 弾ける光の行き先（x, y）と大きさ
const BURST: Array<[number, number, number]> = [
  [-150, -170, 1.2], [140, -180, 1], [-30, -230, 0.8], [60, -210, 1.3], [-180, -40, 0.9],
  [175, -60, 1.1], [-120, 90, 0.7], [125, 100, 0.9], [-70, -120, 0.6], [85, -100, 0.7],
  [0, -260, 1], [-200, -120, 0.6], [205, -130, 0.8], [30, 140, 0.6],
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * 認証成功の演出。ぼかしたあの日の写真をタップ → 鍵が外れて写真がふるえる → 白く光る
 * → 写真がはっきり見え、今日撮った写真が左上に小さく重なる（BeReal の2枚撮りのように）。
 * 終わったら onDone を呼ぶ（結果の文字やボタンを出すため）。動きを減らす設定の人には、最初から開いた状態を見せる。
 */
export function PhotoReveal({
  thenPhotoUrl,
  nowPhotoUrl,
  onDone,
}: {
  thenPhotoUrl: string
  /** 今撮った写真。サーバーには残さないので、このタブで撮ったときだけある */
  nowPhotoUrl?: string
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
      window.setTimeout(() => setStage('flash'), 900),
      window.setTimeout(() => setStage('reveal'), 1300),
    ]
  }

  return (
    <div className={'rv rv--' + stage}>
      <div className="rv__intro">
        <Sticker tone="pink" tilt={-4}>POSE MATCHED</Sticker>
        <h1>みんなが、そろいました</h1>
        <p>{stage === 'reveal' ? 'あの日と、今日。' : 'タップして、あの日をひらく'}</p>
      </div>

      <div className="rv__stage">
        <figure className="rv__photo">
          <img src={thenPhotoUrl} alt="鍵の写真（あの日）" />
          <figcaption>あの日</figcaption>
          <span className="rv__lock" aria-hidden="true"><LockKeyhole size={26} /></span>
        </figure>

        {nowPhotoUrl && (
          <figure className="rv__inset">
            <img src={nowPhotoUrl} alt="いま撮った写真（今日）" />
            <figcaption>今日</figcaption>
            <DateStamp date={new Date()} />
          </figure>
        )}

        {BURST.map(([x, y, scale], index) => (
          <svg
            className="rv__spark"
            viewBox="0 0 24 24"
            aria-hidden="true"
            key={index}
            style={{
              '--x': x + 'px',
              '--y': y + 'px',
              '--s': scale,
              animationDelay: (index % 4) * 0.06 + 's',
            } as CSSProperties}
          >
            <path fill="currentColor" d={SPARK_PATH} />
          </svg>
        ))}

        {stage === 'tap' && (
          <button className="rv__tap" type="button" aria-label="写真をひらく" onClick={open}>
            <span>TAP TO OPEN</span>
          </button>
        )}
      </div>

      <div className="rv__flash" aria-hidden="true" />
    </div>
  )
}
