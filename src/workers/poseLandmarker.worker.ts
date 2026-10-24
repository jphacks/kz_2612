import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { createMediaPipePoseLandmarker } from '../lib/mediaPipePoseLandmarker'
import type {
  PoseWorkerInput,
  PoseWorkerOutput,
} from '../types/poseGuide'

type WorkerRuntime = {
  onmessage: ((event: MessageEvent<PoseWorkerInput>) => void) | null
  postMessage: (message: PoseWorkerOutput) => void
  close: () => void
}

const workerRuntime = self as unknown as WorkerRuntime
let poseLandmarker: PoseLandmarker | null = null

function send(message: PoseWorkerOutput) {
  workerRuntime.postMessage(message)
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : '姿勢推定を開始できませんでした。'
}

async function handleMessage(message: PoseWorkerInput) {
  if (message.type === 'INIT') {
    poseLandmarker?.close()
    poseLandmarker = await createMediaPipePoseLandmarker(message.numPoses, true)
    send({ type: 'READY' })
    return
  }

  if (message.type === 'CLOSE') {
    poseLandmarker?.close()
    poseLandmarker = null
    workerRuntime.close()
    return
  }

  if (!poseLandmarker) {
    message.bitmap.close()
    send({ type: 'ERROR', message: '骨格モデルの準備が完了していません。' })
    return
  }

  const startedAt = performance.now()
  try {
    const result = poseLandmarker.detectForVideo(
      message.bitmap,
      message.timestampMs,
    )
    send({
      type: 'RESULT',
      landmarks: result.landmarks,
      inferenceTimeMs: performance.now() - startedAt,
      timestampMs: message.timestampMs,
    })
  } finally {
    message.bitmap.close()
  }
}

workerRuntime.onmessage = (event) => {
  void handleMessage(event.data).catch((error: unknown) => {
    send({ type: 'ERROR', message: messageFrom(error) })
  })
}

