import type { PosePoints } from '../components/Constellation'

/** 画面上の座標（px）に置き換えたポーズ。写っていない点は null */
export type PlacedPose = Record<string, [number, number] | null>

/**
 * 鍵の写真の骨格（写真の幅・高さに対する 0〜1 の割合）を、撮影画面の上の位置（px）に置き換える。
 *
 * - 写っている人たちの範囲を、画面いっぱい（まわりに余白 padding）に広げて真ん中に置く。並び・縦横比は変えない
 *   （判定は肩幅を1にそろえて比べるので、画面の上の大きさや位置は合否に関係しない。大きく見せるほうが合わせやすい）
 * - mirrored: インカメラの映像は左右反転して見せているので、ガイドも反転する
 */
export function placeKeyPoses(
  poses: PosePoints[],
  imageAspect: number,
  stage: { width: number; height: number },
  mirrored: boolean,
  padding = 0.12,
): PlacedPose[] {
  const points = poses.flatMap((pose) =>
    Object.values(pose).filter((p): p is [number, number] => Boolean(p)),
  )
  if (!points.length || stage.width <= 0 || stage.height <= 0) return []

  // 写真の縦横比を保つため、x に写真の縦横比（幅÷高さ）を掛けて、縦と同じ物差しにする
  const xs = points.map(([x]) => x * imageAspect)
  const ys = points.map(([, y]) => y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  // 1人で手を下ろしているときなど、範囲が細すぎて極端に拡大しないよう、最小の幅・高さを決める
  const spanX = Math.max(maxX - minX, 0.2)
  const spanY = Math.max(maxY - minY, 0.2)
  const scale = Math.min(
    (stage.width * (1 - padding * 2)) / spanX,
    (stage.height * (1 - padding * 2)) / spanY,
  )
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return poses.map((pose) =>
    Object.fromEntries(
      Object.entries(pose).map(([name, p]) => {
        if (!p) return [name, null]
        const x = stage.width / 2 + (p[0] * imageAspect - centerX) * scale
        const y = stage.height / 2 + (p[1] - centerY) * scale
        return [name, [mirrored ? stage.width - x : x, y]]
      }),
    ),
  )
}
