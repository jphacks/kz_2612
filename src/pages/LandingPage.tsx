import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowRight, LockKeyhole, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Twinkles } from '../components/Decor'
import '../landing.css'

/*
 * トップページ「See You There.」
 * 動きはすべて CSS 変数で作る:
 * - --p  : その場面をどこまでスクロールしたか（0〜1）。スクロール1つのリスナーでまとめて書き込む
 * - --mx, --my : ヒーローでのポインターの位置（-1〜1）
 * 動きを減らす設定では CSS 側で --p を 1 に固定し、最後の状態をはじめから見せる。
 */

type Scene = 'beach' | 'roof' | 'festival' | 'mountain' | 'station' | 'campfire'

/** セピアのポラロイド。写真は SVG で描くので、画像の読み込みに失敗することがない */
function Polaroid({ scene, caption, className, style }: {
  scene: Scene
  caption?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <figure className={'syt-polaroid' + (className ? ' ' + className : '')} style={style}>
      <svg className="syt-polaroid__photo" viewBox="0 0 100 82" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <SceneArt scene={scene} />
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

/** 人の後ろ姿（頭と肩） */
function People({ xs, y, scale = 1 }: { xs: number[]; y: number; scale?: number }) {
  return (
    <g fill="#3b2a1d">
      {xs.map((x, i) => (
        <g key={i} transform={'translate(' + x + ' ' + y + ') scale(' + scale + ')'}>
          <circle cx="0" cy="-15" r="4" />
          <path d="M-7 0 Q-7 -10 0 -10 Q7 -10 7 0 Z" />
        </g>
      ))}
    </g>
  )
}

function SceneArt({ scene }: { scene: Scene }) {
  switch (scene) {
    case 'beach':
      return (
        <>
          <rect width="100" height="82" fill="#e9cfa4" />
          <circle cx="68" cy="38" r="11" fill="#f6e3bf" />
          <rect y="44" width="100" height="14" fill="#b8956a" />
          <rect y="56" width="100" height="26" fill="#d9b98b" />
          <People xs={[30, 42, 54, 66]} y={66} />
        </>
      )
    case 'roof':
      return (
        <>
          <rect width="100" height="82" fill="#ecd8b4" />
          <path d="M0 48 L18 40 L30 46 L46 34 L60 44 L78 36 L100 46 V82 H0 Z" fill="#c4a37a" />
          <rect y="58" width="100" height="24" fill="#a88560" />
          <rect x="6" y="52" width="88" height="2" fill="#7a5c3e" />
          <People xs={[36, 50, 64]} y={70} />
        </>
      )
    case 'festival':
      return (
        <>
          <rect width="100" height="82" fill="#5b4330" />
          <path d="M0 14 Q50 30 100 14" stroke="#e9c98f" strokeWidth="0.6" fill="none" />
          {[8, 22, 36, 50, 64, 78, 92].map((x, i) => (
            <circle key={i} cx={x} cy={14 + Math.sin((x / 100) * Math.PI) * 8} r="3" fill="#f2cf8e" opacity="0.9" />
          ))}
          <circle cx="72" cy="40" r="9" fill="none" stroke="#f2d9a6" strokeWidth="0.8" strokeDasharray="1.5 2" />
          <People xs={[24, 38, 52]} y={74} />
        </>
      )
    case 'mountain':
      return (
        <>
          <rect width="100" height="82" fill="#efdcb8" />
          <path d="M0 60 L28 26 L44 44 L62 18 L100 60 Z" fill="#b39168" />
          <path d="M56 26 L62 18 L68 26 Z" fill="#f6ead2" />
          <rect y="58" width="100" height="24" fill="#9c7b55" />
          <People xs={[40, 54]} y={72} />
        </>
      )
    case 'station':
      return (
        <>
          <rect width="100" height="82" fill="#dcc29a" />
          <rect x="10" y="12" width="80" height="6" fill="#8a6a49" />
          <rect x="18" y="18" width="2" height="40" fill="#8a6a49" />
          <rect x="80" y="18" width="2" height="40" fill="#8a6a49" />
          <rect x="40" y="22" width="20" height="8" rx="1" fill="#f3e4c6" />
          <rect y="58" width="100" height="24" fill="#b0906a" />
          <People xs={[30, 44, 58, 72]} y={70} scale={0.9} />
        </>
      )
    case 'campfire':
      return (
        <>
          <rect width="100" height="82" fill="#3f2e22" />
          {[12, 30, 78, 88, 58].map((x, i) => (
            <circle key={i} cx={x} cy={8 + (i % 3) * 7} r="0.7" fill="#f5e2bd" />
          ))}
          <path d="M50 52 Q44 44 50 34 Q56 44 50 52 Z" fill="#f0c47f" />
          <ellipse cx="50" cy="56" rx="26" ry="9" fill="#e8b46a" opacity="0.25" />
          <People xs={[26, 74]} y={66} />
        </>
      )
  }
}

// ヒーローの写真: 位置（%）、傾き、奥行き（大きいほど手前で、よく動く）
const HERO_PHOTOS: Array<{ scene: Scene; x: number; y: number; r: number; depth: number }> = [
  { scene: 'beach', x: 8, y: 16, r: -8, depth: 1.4 },
  { scene: 'roof', x: 74, y: 10, r: 6, depth: 0.8 },
  { scene: 'festival', x: 82, y: 58, r: -5, depth: 1.6 },
  { scene: 'mountain', x: 4, y: 64, r: 7, depth: 0.7 },
  { scene: 'station', x: 56, y: 76, r: 3, depth: 1.1 },
  { scene: 'campfire', x: 28, y: 4, r: 4, depth: 0.5 },
]

// 「思い出を残す」: ばらばらの位置（vw/vh）から、中央の束へ
const GATHER: Array<{ scene: Scene; caption: string; sx: number; sy: number; sr: number; ex: number; ey: number; er: number }> = [
  { scene: 'station', caption: '卒業式の朝', sx: -38, sy: -30, sr: -18, ex: -4, ey: -2, er: -6 },
  { scene: 'beach', caption: '2019.08.14', sx: 36, sy: -28, sr: 14, ex: 3, ey: 1, er: 4 },
  { scene: 'festival', caption: '最後の夏祭り', sx: -34, sy: 30, sr: 10, ex: -2, ey: 3, er: 9 },
  { scene: 'roof', caption: '放課後の屋上', sx: 40, sy: 26, sr: -12, ex: 2, ey: -1, er: -2 },
]

// 「再会」: 中央から外へ広がる写真
const REUNION: Array<{ scene: Scene; x: number; y: number; r: number }> = [
  { scene: 'campfire', x: -36, y: -26, r: -10 },
  { scene: 'mountain', x: 34, y: -30, r: 8 },
  { scene: 'beach', x: -40, y: 22, r: 6 },
  { scene: 'station', x: 38, y: 24, r: -7 },
  { scene: 'roof', x: -6, y: -40, r: 3 },
  { scene: 'festival', x: 4, y: 38, r: -4 },
]

/** スクロールに合わせて、data-scene を付けた要素に --p（0〜1）を書き込む */
function useSceneProgress() {
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const vh = window.innerHeight
      document.querySelectorAll<HTMLElement>('[data-scene]').forEach((el) => {
        const rect = el.getBoundingClientRect()
        // sticky の場面: 上端が画面の上に着いてから、下端が画面の下に着くまで
        // ふつうの場面: 画面の下から入ってきて、上へ抜けるまで
        // 先頭の場面: 画面の上に抜けていくまで
        const mode = el.dataset.scene
        const p = mode === 'sticky'
          ? -rect.top / Math.max(1, rect.height - vh)
          : mode === 'top'
            ? -rect.top / Math.max(1, rect.height)
            : (vh - rect.top) / (rect.height + vh)
        el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(4))
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])
}

/** 画面に入ったら .is-in を付ける（文字がふわっと出る） */
function useReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll('.syt-reveal')
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'))
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.3 })
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/** 文字を1字ずつ出すために span で包む（読み上げは元の文のまま） */
function Letters({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      <span className="syt-sr">{text}</span>
      <span aria-hidden="true">
        {Array.from(text).map((ch, i) => (
          <span key={i} className="syt-letter" style={{ '--i': i + delay } as CSSProperties}>
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </span>
    </>
  )
}

function Section({ id, className, sticky, children, label }: {
  id: string
  className: string
  sticky?: boolean
  children: ReactNode
  label: string
}) {
  return (
    <section id={id} className={'syt-scene ' + className} data-scene={sticky ? 'sticky' : 'flow'} aria-label={label}>
      {children}
    </section>
  )
}

type OpenStage = 'tap' | 'open' | 'flash' | 'reveal'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * 開封の演出の見本。ぼやけたあの日の写真をタップ → 鍵が外れてふるえる → 白く光る
 * → はっきり見え、今日の写真が左上に重なる。写真は SVG の絵なので読み込みに失敗しない。
 */
function OpenDemo() {
  const [stage, setStage] = useState<OpenStage>('tap')
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  const open = () => {
    if (prefersReducedMotion()) {
      setStage('reveal')
      return
    }
    setStage('open')
    timers.current = [
      window.setTimeout(() => setStage('flash'), 800),
      window.setTimeout(() => setStage('reveal'), 1150),
    ]
  }

  return (
    <div className={'syt-open syt-open--' + stage}>
      <div className="syt-open__card" onClick={stage === 'tap' ? open : undefined}>
        <svg className="syt-open__photo" viewBox="0 0 100 82" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <SceneArt scene="beach" />
        </svg>
        <span className="syt-open__label syt-open__label--then">あの日</span>
        <span className="syt-open__lock" aria-hidden="true"><LockKeyhole size={24} /></span>
        <span className="syt-open__inset" aria-hidden="true">
          <svg viewBox="0 0 100 82" preserveAspectRatio="xMidYMid slice"><SceneArt scene="station" /></svg>
          <span className="syt-open__label">今日</span>
        </span>
        {stage === 'reveal' && <Twinkles count={6} />}
        <span className="syt-open__flash" aria-hidden="true" />
      </div>

      {stage === 'reveal' ? (
        <button className="syt-open__button" type="button" onClick={() => setStage('tap')}>
          <RotateCcw size={15} aria-hidden="true" />もう一度
        </button>
      ) : (
        <button className="syt-open__button" type="button" onClick={open} disabled={stage !== 'tap'}>
          タップしてひらく
        </button>
      )}
      <p className="syt-sr" aria-live="polite">{stage === 'reveal' ? 'あの日の写真がひらきました' : ''}</p>
    </div>
  )
}

export function LandingPage() {
  const heroRef = useRef<HTMLElement>(null)

  useSceneProgress()
  useReveal()

  // ほかの画面はスマホ幅の枠で見せるため body に余白と夜空の色がある。トップページの間だけ外す
  useEffect(() => {
    document.documentElement.classList.add('syt-page')
    return () => document.documentElement.classList.remove('syt-page')
  }, [])

  // ヒーローの写真がポインターに少しだけついてくる
  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    let frame = 0
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        hero.style.setProperty('--mx', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3))
        hero.style.setProperty('--my', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div className="syt">
      <div className="syt-grain" aria-hidden="true" />

      <header className="syt-header">
        <span className="syt-brand">EMO CAPSULE</span>
        <Link className="syt-header__link" to="/login">ログイン</Link>
      </header>

      <main>
        {/* 1. ヒーロー */}
        <section
          ref={heroRef}
          className="syt-scene syt-hero"
          data-scene="top"
          aria-labelledby="syt-title"
        >
          <div className="syt-hero__photos" aria-hidden="true">
            <Twinkles count={6} />
            {HERO_PHOTOS.map((photo, i) => (
              <div
                key={photo.scene}
                className="syt-hero__float"
                style={{
                  left: photo.x + '%',
                  top: photo.y + '%',
                  '--d': photo.depth,
                  '--r': photo.r + 'deg',
                  '--i': i,
                } as CSSProperties}
              >
                <Polaroid scene={photo.scene} />
              </div>
            ))}
          </div>

          <div className="syt-hero__copy">
            <p className="syt-kicker">EMO CAPSULE — a web time capsule</p>
            <h1 id="syt-title" className="syt-title">
              <Letters text="See You There." />
            </h1>
            <p className="syt-hero__ja">そこでまた会おう。</p>
          </div>

          <a className="syt-scroll" href="#syt-keep">
            <span>Scroll</span>
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        </section>

        {/* 2. 思い出を残す */}
        <Section id="syt-keep" className="syt-keep" sticky label="思い出を残す">
          <div className="syt-stage">
            <div className="syt-keep__copy">
              <p className="syt-chapter">Chapter 1</p>
              <h2>思い出を、残す。</h2>
              <p>ばらばらになった写真を、ひとつのカプセルに。<br />あの日のポーズが、そのまま鍵になります。</p>
            </div>
            <div className="syt-keep__stack">
              {GATHER.map((photo, i) => (
                <div
                  key={photo.caption}
                  className="syt-keep__item"
                  style={{
                    '--sx': photo.sx + 'vw', '--sy': photo.sy + 'vh', '--sr': photo.sr + 'deg',
                    '--ex': photo.ex + 'vmin', '--ey': photo.ey + 'vmin', '--er': photo.er + 'deg',
                    '--i': i,
                  } as CSSProperties}
                >
                  <Polaroid scene={photo.scene} caption={photo.caption} />
                </div>
              ))}
              <p className="syt-note syt-note--a">また来年も、って言ったよね。</p>
              <p className="syt-note syt-note--b">2019.08.14 — 4人で</p>
            </div>
          </div>
        </Section>

        {/* 3. ひらく瞬間（アプリの開封の演出と同じ流れを、ここで試せる） */}
        <Section id="syt-open" className="syt-open-scene" label="ひらく瞬間">
          <div className="syt-open-scene__copy syt-reveal">
            <p className="syt-chapter">Chapter 2</p>
            <h2>そろったら、ひらく。</h2>
            <p>ぼやけた写真は、あの日のメンバーが同じポーズでそろったときだけ、はっきり見えます。</p>
          </div>
          <OpenDemo />
        </Section>

        {/* 4. 再会 */}
        <Section id="syt-reunion" className="syt-reunion" sticky label="再会">
          <div className="syt-stage">
            <div className="syt-reunion__photos" aria-hidden="true">
              {REUNION.map((photo, i) => (
                <div
                  key={photo.scene + i}
                  className="syt-reunion__item"
                  style={{ '--x': photo.x + 'vw', '--y': photo.y + 'vh', '--r': photo.r + 'deg', '--i': i } as CSSProperties}
                >
                  <Polaroid scene={photo.scene} />
                </div>
              ))}
            </div>
            <p className="syt-reunion__copy">
              <span>あの日の写真も、言えなかった言葉も。</span>
              <span>未来のあなたたちへ、そっと残そう。</span>
            </p>
          </div>
        </Section>

        {/* 5. CTA */}
        <section className="syt-cta" aria-labelledby="syt-cta-title">
          <div className="syt-reveal">
            <h2 id="syt-cta-title" className="syt-cta__title">See You There.</h2>
            <p>思い出の写真を1枚選んで、カプセルをつくろう。</p>
            <div className="syt-cta__actions">
              <Link className="button button--primary syt-cta__primary" to="/folders/new">
                カプセルをつくる
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="syt-cta__secondary" to="/folders">参加中のカプセルを見る</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="syt-footer">© EMO CAPSULE — JPHACKS 2026</footer>
    </div>
  )
}
