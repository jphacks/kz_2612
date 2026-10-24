export type PoseLandmark = {
  x: number
  y: number
  z: number
  visibility: number
  presence?: number
}

export type PoseGuideStatus = 'disabled' | 'loading' | 'ready' | 'error'

export type PoseWorkerInput =
  | { type: 'INIT'; numPoses: number }
  | { type: 'DETECT'; bitmap: ImageBitmap; timestampMs: number }
  | { type: 'CLOSE' }

export type PoseWorkerOutput =
  | { type: 'READY' }
  | {
      type: 'RESULT'
      landmarks: PoseLandmark[][]
      inferenceTimeMs: number
      timestampMs: number
    }
  | { type: 'ERROR'; message: string }

