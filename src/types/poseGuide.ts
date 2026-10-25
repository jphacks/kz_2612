export type PoseLandmark = {
  x: number
  y: number
  z: number
  visibility: number
  presence?: number
}

export type StabilizedLandmark = PoseLandmark & {
  displayed: boolean
}

export type StabilizedPose = {
  id: number
  landmarks: StabilizedLandmark[]
  opacity: number
}

export type PoseGuideStatus = 'disabled' | 'loading' | 'ready' | 'error'

