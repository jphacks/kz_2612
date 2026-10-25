import { useEffect, useState, type RefObject } from 'react'
import type { PoseDetector } from '@tensorflow-models/pose-detection'
import {
  createMoveNetPoseDetector,
  moveNetPoseToLandmarks,
} from '../lib/moveNetPoseDetector'
import { PoseGuideStabilizer } from '../lib/poseStabilizer'
import type { PoseGuideStatus, StabilizedPose } from '../types/poseGuide'

const FRAME_INTERVAL_MS = 125

type UsePoseGuideOptions = {
  videoRef: RefObject<HTMLVideoElement | null>
  enabled: boolean
  cameraReady: boolean
  sessionKey: string
}

type PoseGuideState = {
  status: PoseGuideStatus
  poses: StabilizedPose[]
  detectedCount: number
  inferenceTimeMs: number | null
}

const EMPTY_STATE: PoseGuideState = {
  status: 'loading',
  poses: [],
  detectedCount: 0,
  inferenceTimeMs: null,
}

export function usePoseGuide({
  videoRef,
  enabled,
  cameraReady,
  sessionKey,
}: UsePoseGuideOptions): PoseGuideState {
  const [guideState, setGuideState] = useState<PoseGuideState>(EMPTY_STATE)

  useEffect(() => {
    if (!enabled || !cameraReady) return

    let disposed = false
    let failed = false
    let inFlight = false
    let lastFrameAt = 0
    let animationFrame = 0
    let detector: PoseDetector | null = null
    const stabilizer = new PoseGuideStabilizer()

    queueMicrotask(() => {
      if (!disposed) setGuideState(EMPTY_STATE)
    })

    const detectFrame = async (timestampMs: number) => {
      const video = videoRef.current
      if (
        !detector ||
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        inFlight = false
        return
      }

      const startedAt = performance.now()
      try {
        const poses = await detector.estimatePoses(
          video,
          { maxPoses: 4, flipHorizontal: false },
          timestampMs,
        )
        if (disposed) return

        const rawLandmarks = poses
          .sort((first, second) => (second.score ?? 0) - (first.score ?? 0))
          .slice(0, 4)
          .map((pose) =>
            moveNetPoseToLandmarks(
              pose,
              video.videoWidth,
              video.videoHeight,
            ),
          )
        const stabilized = stabilizer.update(rawLandmarks, timestampMs)
        setGuideState({
          status: 'ready',
          ...stabilized,
          inferenceTimeMs: performance.now() - startedAt,
        })
      } catch (error) {
        failed = true
        console.warn('MoveNet pose guide failed.', error)
        if (!disposed) {
          setGuideState({
            status: 'error',
            poses: [],
            detectedCount: 0,
            inferenceTimeMs: null,
          })
        }
      } finally {
        inFlight = false
      }
    }

    const tick = (timestampMs: number) => {
      if (disposed || failed) return
      if (
        detector &&
        !inFlight &&
        timestampMs - lastFrameAt >= FRAME_INTERVAL_MS
      ) {
        inFlight = true
        lastFrameAt = timestampMs
        void detectFrame(timestampMs)
      }
      animationFrame = requestAnimationFrame(tick)
    }

    void createMoveNetPoseDetector()
      .then((createdDetector) => {
        if (disposed) {
          createdDetector.dispose()
          return
        }
        detector = createdDetector
        setGuideState({
          status: 'ready',
          poses: [],
          detectedCount: 0,
          inferenceTimeMs: null,
        })
        animationFrame = requestAnimationFrame(tick)
      })
      .catch((error: unknown) => {
        console.warn('MoveNet initialization failed.', error)
        if (!disposed) {
          setGuideState({
            status: 'error',
            poses: [],
            detectedCount: 0,
            inferenceTimeMs: null,
          })
        }
      })

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      detector?.dispose()
    }
  }, [cameraReady, enabled, sessionKey, videoRef])

  if (!enabled) {
    return {
      status: 'disabled',
      poses: [],
      detectedCount: 0,
      inferenceTimeMs: null,
    }
  }

  if (!cameraReady) return EMPTY_STATE
  return guideState
}

