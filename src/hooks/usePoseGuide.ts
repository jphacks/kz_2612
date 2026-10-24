import { useEffect, useState, type RefObject } from 'react'
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { PoseGuideStabilizer } from '../lib/poseStabilizer'
import type {
  PoseGuideStatus,
  StabilizedPose,
  PoseWorkerInput,
  PoseWorkerOutput,
} from '../types/poseGuide'

const FRAME_INTERVAL_MS = 125
const FALLBACK_FRAME_INTERVAL_MS = 250

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
  const [workerState, setWorkerState] = useState<PoseGuideState>(EMPTY_STATE)

  useEffect(() => {
    if (!enabled || !cameraReady) return

    let disposed = false
    let ready = false
    let inFlight = false
    let lastFrameAt = 0
    let animationFrame = 0
    let fallbackLandmarker: PoseLandmarker | null = null
    const stabilizer = new PoseGuideStabilizer()

    queueMicrotask(() => {
      if (!disposed) setWorkerState(EMPTY_STATE)
    })

    if (
      typeof Worker === 'undefined' ||
      typeof createImageBitmap === 'undefined'
    ) {
      const tickFallback = (timestampMs: number) => {
        if (disposed) return
        const video = videoRef.current
        if (
          fallbackLandmarker &&
          video &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0 &&
          timestampMs - lastFrameAt >= FALLBACK_FRAME_INTERVAL_MS
        ) {
          lastFrameAt = timestampMs
          const startedAt = performance.now()
          try {
            const result = fallbackLandmarker.detectForVideo(video, timestampMs)
            const stabilized = stabilizer.update(result.landmarks, timestampMs)
            setWorkerState({
              status: 'ready',
              ...stabilized,
              inferenceTimeMs: performance.now() - startedAt,
            })
          } catch {
            setWorkerState({
              status: 'error',
              poses: [],
              detectedCount: 0,
              inferenceTimeMs: null,
            })
            return
          }
        }
        animationFrame = requestAnimationFrame(tickFallback)
      }

      void import('../lib/mediaPipePoseLandmarker')
        .then(({ createMediaPipePoseLandmarker }) =>
          createMediaPipePoseLandmarker(4),
        )
        .then((landmarker) => {
          if (disposed) {
            landmarker.close()
            return
          }
          fallbackLandmarker = landmarker
          setWorkerState({
            status: 'ready',
            poses: [],
            detectedCount: 0,
            inferenceTimeMs: null,
          })
          animationFrame = requestAnimationFrame(tickFallback)
        })
        .catch((error: unknown) => {
          console.warn('MediaPipe fallback initialization failed.', error)
          if (!disposed) {
            setWorkerState({
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
        fallbackLandmarker?.close()
      }
    }

    const worker = new Worker(
      new URL('../workers/poseLandmarker.worker.ts', import.meta.url),
      { type: 'module' },
    )

    const detectFrame = async (timestampMs: number) => {
      const video = videoRef.current
      if (
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        inFlight = false
        return
      }

      try {
        const bitmap = await createImageBitmap(video)
        if (disposed) {
          bitmap.close()
          return
        }
        const message: PoseWorkerInput = {
          type: 'DETECT',
          bitmap,
          timestampMs,
        }
        worker.postMessage(message, [bitmap])
      } catch {
        inFlight = false
        if (!disposed) {
          setWorkerState({
            status: 'error',
            poses: [],
            detectedCount: 0,
            inferenceTimeMs: null,
          })
        }
      }
    }

    const tick = (timestampMs: number) => {
      if (disposed) return
      if (
        ready &&
        !inFlight &&
        timestampMs - lastFrameAt >= FRAME_INTERVAL_MS
      ) {
        inFlight = true
        lastFrameAt = timestampMs
        void detectFrame(timestampMs)
      }
      animationFrame = requestAnimationFrame(tick)
    }

    worker.onmessage = (event: MessageEvent<PoseWorkerOutput>) => {
      if (disposed) return

      if (event.data.type === 'READY') {
        ready = true
        setWorkerState({
          status: 'ready',
          poses: [],
          detectedCount: 0,
          inferenceTimeMs: null,
        })
        return
      }

      if (event.data.type === 'RESULT') {
        inFlight = false
        const stabilized = stabilizer.update(
          event.data.landmarks,
          event.data.timestampMs,
        )
        setWorkerState({
          status: 'ready',
          ...stabilized,
          inferenceTimeMs: event.data.inferenceTimeMs,
        })
        return
      }

      ready = false
      inFlight = false
      console.warn('MediaPipe worker stopped.', event.data.message)
      setWorkerState({
        status: 'error',
        poses: [],
        detectedCount: 0,
        inferenceTimeMs: null,
      })
    }

    worker.onerror = (event) => {
      ready = false
      inFlight = false
      console.warn('MediaPipe worker failed.', event.message)
      setWorkerState({
        status: 'error',
        poses: [],
        detectedCount: 0,
        inferenceTimeMs: null,
      })
    }

    const initMessage: PoseWorkerInput = { type: 'INIT', numPoses: 4 }
    worker.postMessage(initMessage)
    animationFrame = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      const closeMessage: PoseWorkerInput = { type: 'CLOSE' }
      worker.postMessage(closeMessage)
      worker.terminate()
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
  return workerState
}

