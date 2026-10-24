import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

export async function createMediaPipePoseLandmarker(
  numPoses: number,
  useModule = false,
) {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT, useModule)
  const sharedOptions = {
    runningMode: 'VIDEO' as const,
    numPoses,
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.3,
    outputSegmentationMasks: false,
  }

  try {
    return await PoseLandmarker.createFromOptions(vision, {
      ...sharedOptions,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    })
  } catch {
    const cpuVision = await FilesetResolver.forVisionTasks(WASM_ROOT, useModule)
    return PoseLandmarker.createFromOptions(cpuVision, {
      ...sharedOptions,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    })
  }
}

