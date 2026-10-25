import { useState, type CSSProperties } from 'react'

/** 体の点の座標（0〜1、画像の左上が原点）。写っていない点は null */
export type PosePoints = Record<string, [number, number] | null>

// 星座の線: 肩・腕・胴・脚
const BONES: Array<[string, string]> = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'], ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
]

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function random(seed: number) {
  let s = seed || 1
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507)
    s = Math.imul(s ^ (s >>> 13), 3266489909)
    s ^= s >>> 16
    return (s >>> 0) / 4294967296
  }
}

/**
 * 骨格の点がないフォルダ用に、フォルダごとに決まった形の「人の星座」を作る。
 * 同じ id なら毎回同じ形になる（一覧で開くたびに形が変わらないように）。
 */
export function seededPoses(seed: string, people: number): PosePoints[] {
  const rnd = random(hash(seed))
  const count = Math.max(1, Math.min(4, people))
  return Array.from({ length: count }, (_, i) => {
    const cx = (i + 0.5) / count
    const w = 0.13 / Math.max(1, count * 0.55)
    const sy = 0.38 + rnd() * 0.04
    const hy = sy + 0.24
    // 腕は上げる・横に広げる・下ろす のどれか（左右で別々）
    const arm = (side: number) => {
      const kind = rnd()
      const sx = cx + side * w
      if (kind < 0.4) return { e: [sx + side * w * 0.6, sy - 0.12], w: [sx + side * w * 0.2, sy - 0.26] }
      if (kind < 0.75) return { e: [sx + side * w * 1.3, sy + 0.02], w: [sx + side * w * 2.4, sy - 0.04 - rnd() * 0.08] }
      return { e: [sx + side * w * 0.5, sy + 0.12], w: [sx + side * w * 0.6, sy + 0.24] }
    }
    const l = arm(1)
    const r = arm(-1)
    return {
      left_shoulder: [cx + w, sy], right_shoulder: [cx - w, sy],
      left_elbow: l.e as [number, number], left_wrist: l.w as [number, number],
      right_elbow: r.e as [number, number], right_wrist: r.w as [number, number],
      left_hip: [cx + w * 0.7, hy], right_hip: [cx - w * 0.7, hy],
      left_knee: [cx + w * 0.9, hy + 0.15], right_knee: [cx - w * 0.9, hy + 0.15],
      left_ankle: [cx + w, hy + 0.3], right_ankle: [cx - w, hy + 0.3],
    }
  })
}

/**
 * あの日のポーズを星座として描く。点が星、骨格が星座の線。
 * 線は描かれていくように現れ、星はゆっくり瞬く。
 */
export function Constellation({
  poses,
  className,
  draw = true,
  label,
}: {
  poses: PosePoints[]
  className?: string
  draw?: boolean
  label?: string
}) {
  const all = poses.flatMap((pose) => Object.values(pose).filter((p): p is [number, number] => Boolean(p)))
  if (all.length === 0) return null

  // 星座がちょうど収まるように、点の範囲から表示範囲を決める（縦横比はそのまま）
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY, 0.05)
  const pad = span * 0.22
  const viewBox = [
    (minX + maxX) / 2 - span / 2 - pad,
    (minY + maxY) / 2 - span / 2 - pad,
    span + pad * 2,
    span + pad * 2,
  ].join(' ')
  const unit = span / 100

  let lineIndex = 0
  let starIndex = 0

  return (
    <svg
      className={'constellation' + (draw ? ' constellation--draw' : '') + (className ? ' ' + className : '')}
      viewBox={viewBox}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {poses.map((pose, p) => {
        const ls = pose.left_shoulder
        const rs = pose.right_shoulder
        // 頭の星: 両肩の中心から、肩幅の分だけ上
        const head: [number, number] | null = ls && rs
          ? [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2 - Math.hypot(ls[0] - rs[0], ls[1] - rs[1]) * 0.85]
          : null
        const bones = BONES.filter(([a, b]) => pose[a] && pose[b])
        const stars = Object.values(pose).filter((pt): pt is [number, number] => Boolean(pt))
        return (
          <g key={p}>
            {bones.map(([a, b]) => {
              const [x1, y1] = pose[a]!
              const [x2, y2] = pose[b]!
              const i = lineIndex++
              return (
                <line
                  key={a + b}
                  className="constellation__line"
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  pathLength={1}
                  strokeWidth={unit * 0.7}
                  style={{ '--i': i } as CSSProperties}
                />
              )
            })}
            {head && ls && rs && (
              <line
                className="constellation__line"
                x1={(ls[0] + rs[0]) / 2} y1={(ls[1] + rs[1]) / 2} x2={head[0]} y2={head[1]}
                pathLength={1}
                strokeWidth={unit * 0.7}
                style={{ '--i': lineIndex++ } as CSSProperties}
              />
            )}
            {[...stars, ...(head ? [head] : [])].map(([x, y], s) => {
              const i = starIndex++
              const big = head && s === stars.length
              return (
                <g key={s} className="constellation__star" style={{ '--i': i } as CSSProperties}>
                  <circle cx={x} cy={y} r={unit * (big ? 4.2 : 2.6)} className="constellation__glow" />
                  <circle cx={x} cy={y} r={unit * (big ? 1.6 : 1.1)} className="constellation__core" />
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/**
 * 鍵の写真に、あの日のポーズの線を重ねて見せる。
 * 点は写真の幅・高さに対する割合なので、写真が読み込めてから実寸で重ねる。
 */
export function PhotoWithPose({
  src,
  poses,
  alt,
  className,
}: {
  src: string
  poses: PosePoints[]
  alt: string
  className?: string
}) {
  const [size, setSize] = useState<[number, number] | null>(null)
  const [failed, setFailed] = useState(false)
  const [w, h] = size ?? [1, 1]
  const r = w / 100

  let lineIndex = 0
  let starIndex = 0

  // 写真が読めないとき（期限切れ・消えた画像など）は、ファインダーにポーズの線だけを出す
  if (failed) {
    return (
      <figure className={'pose-photo pose-photo--missing' + (className ? ' ' + className : '')}>
        <span className="real-post__frame" role="img" aria-label={alt}>
          <span className="real-post__corners" />
          <Constellation poses={poses} draw={false} className="real-post__pose" />
        </span>
      </figure>
    )
  }

  return (
    <figure className={'pose-photo' + (className ? ' ' + className : '')}>
      <img
        src={src}
        alt={alt}
        onLoad={(event) => setSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])}
        onError={() => setFailed(true)}
      />
      {size && (
        <svg className="pose-photo__lines constellation--draw" viewBox={'0 0 ' + w + ' ' + h} aria-hidden="true">
          {poses.map((pose, p) => (
            <g key={p}>
              {BONES.filter(([a, b]) => pose[a] && pose[b]).map(([a, b]) => {
                const [x1, y1] = pose[a]!
                const [x2, y2] = pose[b]!
                return (
                  <line
                    key={a + b}
                    className="constellation__line"
                    x1={x1 * w} y1={y1 * h} x2={x2 * w} y2={y2 * h}
                    pathLength={1}
                    style={{ '--i': lineIndex++ } as CSSProperties}
                  />
                )
              })}
              {Object.values(pose).filter((pt): pt is [number, number] => Boolean(pt)).map(([x, y], s) => (
                <circle
                  key={s}
                  className="constellation__star pose-photo__dot"
                  cx={x * w} cy={y * h} r={r * 0.9}
                  style={{ '--i': starIndex++ } as CSSProperties}
                />
              ))}
            </g>
          ))}
        </svg>
      )}
    </figure>
  )
}
