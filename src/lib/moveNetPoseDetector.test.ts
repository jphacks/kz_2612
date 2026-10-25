import type { Pose } from '@tensorflow-models/pose-detection'
import { describe, expect, it } from 'vitest'
import { moveNetPoseToLandmarks } from './moveNetPoseDetector'

function samplePose(): Pose {
  return {
    keypoints: Array.from({ length: 17 }, (_, index) => ({
      x: 20 + index * 5,
      y: 40 + index * 4,
      score: 0.9,
    })),
  }
}

describe('moveNetPoseToLandmarks', () => {
  it('maps MoveNet body joints to the indices used by the overlay', () => {
    const landmarks = moveNetPoseToLandmarks(samplePose(), 200, 400)

    expect(landmarks).toHaveLength(33)
    expect(landmarks[11]).toMatchObject({
      x: 45 / 200,
      y: 60 / 400,
      visibility: 0.9,
    })
    expect(landmarks[28]).toMatchObject({
      x: 100 / 200,
      y: 104 / 400,
      visibility: 0.9,
    })
    expect(landmarks[1].visibility).toBe(0)
  })

  it('returns hidden landmarks when the video size is unavailable', () => {
    const landmarks = moveNetPoseToLandmarks(samplePose(), 0, 0)

    expect(landmarks.every((landmark) => landmark.visibility === 0)).toBe(true)
  })
})
