import { describe, expect, it } from 'vitest'
import type { PoseLandmark } from '../types/poseGuide'
import { PoseGuideStabilizer } from './poseStabilizer'

function poseAt(centerX: number, visibility = 0.9): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: centerX + (index % 2 === 0 ? 0.02 : -0.02),
    y: 0.2 + index * 0.01,
    z: 0,
    visibility,
    presence: visibility,
  }))
}

describe('PoseGuideStabilizer', () => {
  it('smooths landmarks and waits for consecutive visibility', () => {
    const stabilizer = new PoseGuideStabilizer()
    const first = stabilizer.update([poseAt(0.2)], 0)
    const second = stabilizer.update([poseAt(0.4)], 125)

    expect(first.poses[0].landmarks[11].displayed).toBe(false)
    expect(second.poses[0].landmarks[11].displayed).toBe(true)
    expect(second.poses[0].landmarks[11].x).toBeCloseTo(0.22, 2)
    expect(second.detectedCount).toBe(1)
  })

  it('keeps a missing pose briefly and fades it out', () => {
    const stabilizer = new PoseGuideStabilizer()
    stabilizer.update([poseAt(0.3)], 0)
    stabilizer.update([poseAt(0.3)], 125)

    const missing = stabilizer.update([], 250)
    const expired = stabilizer.update([], 1400)

    expect(missing.poses).toHaveLength(1)
    expect(missing.poses[0].opacity).toBeCloseTo(0.9, 1)
    expect(missing.detectedCount).toBe(1)
    expect(expired.poses).toHaveLength(0)
  })

  it('keeps visible joints through a short low-confidence interval', () => {
    const stabilizer = new PoseGuideStabilizer()
    stabilizer.update([poseAt(0.3)], 0)
    stabilizer.update([poseAt(0.3)], 125)

    let result = stabilizer.update([poseAt(0.3, 0)], 250)
    for (let frame = 2; frame <= 7; frame += 1) {
      result = stabilizer.update([poseAt(0.3, 0)], 125 * (frame + 1))
    }
    expect(result.poses[0].landmarks[11].displayed).toBe(true)

    result = stabilizer.update([poseAt(0.3, 0)], 1125)
    expect(result.poses[0].landmarks[11].displayed).toBe(false)
  })

  it('keeps person IDs when detector order changes', () => {
    const stabilizer = new PoseGuideStabilizer()
    const first = stabilizer.update([poseAt(0.2), poseAt(0.8)], 0)
    const second = stabilizer.update([poseAt(0.78), poseAt(0.22)], 125)

    expect(second.poses.map((pose) => pose.id)).toEqual(
      first.poses.map((pose) => pose.id),
    )
    expect(second.poses[0].landmarks[11].x).toBeLessThan(0.4)
    expect(second.poses[1].landmarks[11].x).toBeGreaterThan(0.6)
  })

  it('requires repeated frames before changing the displayed count', () => {
    const stabilizer = new PoseGuideStabilizer()

    expect(stabilizer.update([poseAt(0.3)], 0).detectedCount).toBe(0)
    expect(stabilizer.update([poseAt(0.3)], 125).detectedCount).toBe(1)
    expect(stabilizer.update([], 250).detectedCount).toBe(1)
    expect(stabilizer.update([poseAt(0.3)], 375).detectedCount).toBe(1)
  })
})

