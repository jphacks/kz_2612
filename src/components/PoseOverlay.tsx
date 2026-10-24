import { useEffect, useRef, type RefObject } from 'react'
import type { PoseLandmark } from '../types/poseGuide'

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
const PERSON_COLORS = ['#a5f4d2', '#ffd68a', '#b9c7ff', '#ffb6cf']
const MIN_VISIBILITY = 0.5

type PoseOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  landmarks: PoseLandmark[][]
  mirrored: boolean
  visible: boolean
}

function isVisible(landmark: PoseLandmark | undefined) {
  return Boolean(
    landmark &&
      landmark.visibility >= MIN_VISIBILITY &&
      landmark.x >= 0 &&
      landmark.x <= 1 &&
      landmark.y >= 0 &&
      landmark.y <= 1,
  )
}

export function PoseOverlay({
  videoRef,
  landmarks,
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

    const scale = Math.max(
      width / video.videoWidth,
      height / video.videoHeight,
    )
    const renderedWidth = video.videoWidth * scale
    const renderedHeight = video.videoHeight * scale
    const offsetX = (width - renderedWidth) / 2
    const offsetY = (height - renderedHeight) / 2

    const point = (landmark: PoseLandmark) => {
      const sourceX = offsetX + landmark.x * renderedWidth
      return {
        x: mirrored ? width - sourceX : sourceX,
        y: offsetY + landmark.y * renderedHeight,
      }
    }

    landmarks.forEach((pose, personIndex) => {
      const color = PERSON_COLORS[personIndex % PERSON_COLORS.length]
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = 4
      context.strokeStyle = color
      context.shadowColor = color
      context.shadowBlur = 8

      CONNECTIONS.forEach(([startIndex, endIndex]) => {
        const start = pose[startIndex]
        const end = pose[endIndex]
        if (!isVisible(start) || !isVisible(end)) return
        const startPoint = point(start)
        const endPoint = point(end)
        context.beginPath()
        context.moveTo(startPoint.x, startPoint.y)
        context.lineTo(endPoint.x, endPoint.y)
        context.stroke()
      })

      LANDMARK_INDICES.forEach((index) => {
        const landmark = pose[index]
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
  }, [landmarks, mirrored, videoRef, visible])

  return <canvas ref={canvasRef} className="pose-overlay" aria-hidden="true" />
}

