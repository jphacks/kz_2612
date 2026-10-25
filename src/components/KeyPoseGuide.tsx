import { useEffect, useRef, useState } from 'react'
import { placeKeyPoses } from '../lib/keyPoseGuide'
import { BONES, type PosePoints } from './Constellation'

/**
 * 撮影画面に、鍵の写真のポーズを白い点線で重ねる（お手本）。
 * サーバーから受け取った骨格の点を使うので、ブラウザの姿勢推定（MoveNet）の読み込みを待たずにすぐ出せる。
 */
export function KeyPoseGuide({
  poses,
  imageSrc,
  mirrored,
  visible,
}: {
  poses: PosePoints[]
  /** 鍵の写真。縦横比を知るためだけに読む（画面には出さない） */
  imageSrc?: string
  mirrored: boolean
  visible: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  // 写真の縦横比（幅÷高さ）。読み込めないときは、よくある横長の 4:3 とみなす
  const [aspect, setAspect] = useState(4 / 3)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setStage({ width: rect.width, height: rect.height })
    // 画面の向きや大きさが変わったら置き直す（ResizeObserver のない古い環境では最初の大きさのまま）
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!imageSrc) return
    const image = new Image()
    image.onload = () => {
      if (image.naturalWidth && image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight)
    }
    image.src = imageSrc
  }, [imageSrc])

  const placed = visible ? placeKeyPoses(poses, aspect, stage, mirrored) : []

  return (
    <svg ref={svgRef} className="key-pose-guide" aria-hidden="true">
      {placed.map((pose, p) => (
        <g key={p}>
          {BONES.filter(([a, b]) => pose[a] && pose[b]).map(([a, b]) => {
            const [x1, y1] = pose[a]!
            const [x2, y2] = pose[b]!
            return <line key={a + b} className="key-pose-guide__line" x1={x1} y1={y1} x2={x2} y2={y2} />
          })}
          {Object.entries(pose).map(([name, pt]) =>
            pt ? <circle key={name} className="key-pose-guide__dot" cx={pt[0]} cy={pt[1]} r={5} /> : null,
          )}
        </g>
      ))}
    </svg>
  )
}
