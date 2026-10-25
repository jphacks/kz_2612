import { describe, expect, it } from 'vitest'
import { placeKeyPoses } from './keyPoseGuide'

const stage = { width: 400, height: 800 }

describe('placeKeyPoses', () => {
  it('写っている人たちの範囲を、画面の真ん中に大きく置く', () => {
    const [pose] = placeKeyPoses(
      [{ left_shoulder: [0.6, 0.4], right_shoulder: [0.4, 0.4], left_hip: [0.6, 0.6], right_hip: [0.4, 0.6] }],
      1,
      stage,
      false,
    )
    // 範囲 0.2×0.2 を、余白12%を除いた幅 304px に合わせる（縦はまだ余る）
    expect(pose.right_shoulder![0]).toBeCloseTo(48)
    expect(pose.left_shoulder![0]).toBeCloseTo(352)
    expect(pose.left_shoulder![1]).toBeCloseTo(400 - 152)
    expect(pose.left_hip![1]).toBeCloseTo(400 + 152)
  })

  it('写真の縦横比を保つ（横長の写真では横の間隔が広がる）', () => {
    const poses = [
      { left_shoulder: [0.3, 0.4] as [number, number], right_shoulder: [0.2, 0.4] as [number, number] },
      { left_shoulder: [0.8, 0.5] as [number, number], right_shoulder: [0.7, 0.5] as [number, number] },
    ]
    const square = placeKeyPoses(poses, 1, stage, false)
    const wide = placeKeyPoses(poses, 2, stage, false)
    const ratio = (placed: typeof square) =>
      (placed[1].left_shoulder![0] - placed[0].right_shoulder![0]) /
      (placed[1].left_shoulder![1] - placed[0].right_shoulder![1])
    expect(ratio(wide)).toBeCloseTo(ratio(square) * 2)
  })

  it('インカメラでは左右を反転し、左の人が右に来る', () => {
    const poses = [
      { left_shoulder: [0.3, 0.4] as [number, number], right_shoulder: [0.2, 0.4] as [number, number] },
      { left_shoulder: [0.8, 0.4] as [number, number], right_shoulder: [0.7, 0.4] as [number, number] },
    ]
    const normal = placeKeyPoses(poses, 1, stage, false)
    const mirrored = placeKeyPoses(poses, 1, stage, true)
    expect(normal[0].left_shoulder![0]).toBeLessThan(normal[1].left_shoulder![0])
    expect(mirrored[0].left_shoulder![0]).toBeGreaterThan(mirrored[1].left_shoulder![0])
    expect(mirrored[0].left_shoulder![0]).toBeCloseTo(stage.width - normal[0].left_shoulder![0])
  })

  it('写っていない点は null のまま。点が1つもなければ何も出さない', () => {
    const [pose] = placeKeyPoses(
      [{ left_shoulder: [0.6, 0.4], right_shoulder: [0.4, 0.4], left_wrist: null }],
      1,
      stage,
      false,
    )
    expect(pose.left_wrist).toBeNull()
    expect(placeKeyPoses([{ left_wrist: null }], 1, stage, false)).toEqual([])
  })
})
