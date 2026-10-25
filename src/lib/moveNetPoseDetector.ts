import type {
  Pose,
  PoseDetector,
} from '@tensorflow-models/pose-detection'
import type { PoseLandmark } from '../types/poseGuide'

const MEDIAPIPE_LANDMARK_COUNT = 33
let sharedDetectorPromise: Promise<PoseDetector> | null = null

// MoveNet's 17 COCO keypoints mapped to the MediaPipe indices already used by
// the overlay and stabilizer. Unmapped face/hand/foot details remain hidden.
const MOVENET_TO_MEDIAPIPE = [
  0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28,
] as const

async function loadMoveNetPoseDetector(): Promise<PoseDetector> {
  const tf = await import('@tensorflow/tfjs-core')
  await import('@tensorflow/tfjs-backend-webgl')
  const [{ load }, { MULTIPOSE_LIGHTNING }, { TrackerType }] =
    await Promise.all([
      import('@tensorflow-models/pose-detection/dist/movenet/detector'),
      import('@tensorflow-models/pose-detection/dist/movenet/constants'),
      import('@tensorflow-models/pose-detection/dist/calculators/types'),
    ])

  await tf.setBackend('webgl')
  await tf.ready()

  return load({
    modelType: MULTIPOSE_LIGHTNING,
    enableSmoothing: true,
    enableTracking: true,
    trackerType: TrackerType.BoundingBox,
    multiPoseMaxDimension: 256,
    minPoseScore: 0.15,
  })
}

/**
 * MoveNet is expensive to download and initialise on mobile devices. Keep one
 * detector for the lifetime of the page so camera flips and route changes do
 * not parse the model and compile the WebGL backend again.
 */
export function getMoveNetPoseDetector(): Promise<PoseDetector> {
  if (!sharedDetectorPromise) {
    sharedDetectorPromise = loadMoveNetPoseDetector().catch((error: unknown) => {
      // Allow a later retry after a temporary network/WebGL failure.
      sharedDetectorPromise = null
      throw error
    })
  }
  return sharedDetectorPromise
}

export function preloadMoveNetPoseDetector() {
  return getMoveNetPoseDetector().then(() => undefined)
}

export function moveNetPoseToLandmarks(
  pose: Pose,
  imageWidth: number,
  imageHeight: number,
): PoseLandmark[] {
  const landmarks = Array.from(
    { length: MEDIAPIPE_LANDMARK_COUNT },
    (): PoseLandmark => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0,
      presence: 0,
    }),
  )

  if (imageWidth <= 0 || imageHeight <= 0) return landmarks

  pose.keypoints.forEach((keypoint, moveNetIndex) => {
    const mediaPipeIndex = MOVENET_TO_MEDIAPIPE[moveNetIndex]
    if (mediaPipeIndex === undefined) return

    const confidence = keypoint.score ?? 0
    landmarks[mediaPipeIndex] = {
      x: keypoint.x / imageWidth,
      y: keypoint.y / imageHeight,
      z: 0,
      visibility: confidence,
      presence: confidence,
    }
  })

  return landmarks
}
