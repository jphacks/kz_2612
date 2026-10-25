import { useEffect, useRef, type RefObject } from 'react'
import type {
  StabilizedLandmark,
  StabilizedPose,
} from '../types/poseGuide'

const LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
const CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
] as const
// 人ごとの色（紙とセピアの画面に合う暖かい色で、見分けがつくように）
const PERSON_COLORS = ['#fbf0d6', '#f2c27b', '#e8a598', '#b9d3a8']
type PoseOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  poses: StabilizedPose[]
  mirrored: boolean
  visible: boolean
}

function isVisible(landmark: StabilizedLandmark | undefined) {
  return Boolean(
    landmark &&
      landmark.displayed &&
      landmark.x >= 0 &&
      landmark.x <= 1 &&
      landmark.y >= 0 &&
      landmark.y <= 1,
  )
}

export function PoseOverlay({
  videoRef,
  poses,
  mirrored,
  visible,
}: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const context = canvas.getContext('2d')
    if (!context) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)

    if (
      !visible ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) return

    // video の object-fit: contain と同じ計算にして、全画角に線を重ねる。
    // max（cover）にすると画面外へ切れた部分を基準にしてしまう。
    const scale = Math.min(
      width / video.videoWidth,
      height / video.videoHeight,
    )
    const renderedWidth = video.videoWidth * scale
    const renderedHeight = video.videoHeight * scale
    const offsetX = (width - renderedWidth) / 2
    const offsetY = (height - renderedHeight) / 2

    const point = (landmark: StabilizedLandmark) => {
      const sourceX = offsetX + landmark.x * renderedWidth
      return {
        x: mirrored ? width - sourceX : sourceX,
        y: offsetY + landmark.y * renderedHeight,
      }
    }

    poses.forEach((pose) => {
      const color = PERSON_COLORS[(pose.id - 1) % PERSON_COLORS.length]
      context.globalAlpha = pose.opacity
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = 4
      context.strokeStyle = color
      context.shadowColor = color
      context.shadowBlur = 8

      CONNECTIONS.forEach(([startIndex, endIndex]) => {
        const start = pose.landmarks[startIndex]
        const end = pose.landmarks[endIndex]
        if (!isVisible(start) || !isVisible(end)) return
        const startPoint = point(start)
        const endPoint = point(end)
        context.beginPath()
        context.moveTo(startPoint.x, startPoint.y)
        context.lineTo(endPoint.x, endPoint.y)
        context.stroke()
      })

      LANDMARK_INDICES.forEach((index) => {
        const landmark = pose.landmarks[index]
        if (!isVisible(landmark)) return
        const landmarkPoint = point(landmark)
        context.beginPath()
        context.arc(landmarkPoint.x, landmarkPoint.y, 5, 0, Math.PI * 2)
        context.fillStyle = color
        context.fill()
        context.lineWidth = 2
        context.strokeStyle = '#ffffff'
        context.stroke()
      })
    })
    context.globalAlpha = 1
  }, [mirrored, poses, videoRef, visible])

  return <canvas ref={canvasRef} className="pose-overlay" aria-hidden="true" />
}

