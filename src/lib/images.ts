import { ApiError } from '../api/client'

const MAX_INPUT_BYTES = 15 * 1024 * 1024
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024

export async function normalizeImage(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new ApiError(413, 'image_too_large', '画像は1枚15MBまでです。')
  }

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= MAX_OUTPUT_BYTES) {
      return file
    }
    throw new ApiError(
      400,
      'invalid_image',
      'この画像形式を読み込めませんでした。JPEG・PNG・WebPをお試しください。',
    )
  }

  const maxDimension = 2400
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new ApiError(0, 'canvas_error', '画像を処理できませんでした。')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of [0.88, 0.75, 0.62]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size <= MAX_OUTPUT_BYTES) return blob
  }

  throw new ApiError(413, 'image_too_large', '画像を10MB以下に調整できませんでした。')
}

export async function captureVideoFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) {
    throw new ApiError(0, 'camera_not_ready', 'カメラの準備ができていません。')
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) throw new ApiError(0, 'canvas_error', '写真を撮影できませんでした。')

  // video は画面上だけ鏡像にする。サーバーへ送る画像は反転させない。
  context.drawImage(video, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  )
  if (!blob) throw new ApiError(0, 'capture_failed', '写真を撮影できませんでした。')
  return blob
}
