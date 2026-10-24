import type {
  PoseLandmark,
  StabilizedLandmark,
  StabilizedPose,
} from '../types/poseGuide'

const POSITION_ALPHA = 0.35
const LOW_CONFIDENCE_POSITION_ALPHA = 0.15
const VISIBILITY_ALPHA = 0.45
const SHOW_THRESHOLD = 0.45
const HIDE_THRESHOLD = 0.25
const SHOW_CONFIRM_FRAMES = 2
const HIDE_CONFIRM_FRAMES = 3
const COUNT_RISE_CONFIRM_FRAMES = 2
const COUNT_DROP_CONFIRM_FRAMES = 4
const HOLD_DURATION_MS = 500
const MAX_MATCH_DISTANCE = 0.35
const BODY_CENTER_INDICES = [11, 12, 23, 24, 25, 26]

type Point = {
  x: number
  y: number
}

type VisibilityState = {
  displayed: boolean
  seenFrames: number
  missingFrames: number
}

type PoseTrack = {
  id: number
  center: Point
  landmarks: StabilizedLandmark[]
  visibilityStates: VisibilityState[]
  lastSeenAt: number
}

export type StabilizedPoseResult = {
  poses: StabilizedPose[]
  detectedCount: number
}

function landmarkScore(landmark: PoseLandmark | undefined) {
  if (!landmark) return 0
  return Math.min(landmark.visibility, landmark.presence ?? 1)
}

function hasUsablePosition(landmark: PoseLandmark | undefined) {
  return Boolean(
    landmark &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      landmark.x >= 0 &&
      landmark.x <= 1 &&
      landmark.y >= 0 &&
      landmark.y <= 1,
  )
}

function averagePoints(points: PoseLandmark[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function centerOfPose(pose: PoseLandmark[]): Point {
  for (const [leftIndex, rightIndex] of [[23, 24], [11, 12]]) {
    const left = pose[leftIndex]
    const right = pose[rightIndex]
    if (
      hasUsablePosition(left) &&
      hasUsablePosition(right) &&
      landmarkScore(left) >= HIDE_THRESHOLD &&
      landmarkScore(right) >= HIDE_THRESHOLD
    ) {
      return averagePoints([left, right])
    }
  }

  const visibleBodyPoints = BODY_CENTER_INDICES
    .map((index) => pose[index])
    .filter(
      (landmark): landmark is PoseLandmark =>
        hasUsablePosition(landmark) &&
        landmarkScore(landmark) >= HIDE_THRESHOLD,
    )

  if (visibleBodyPoints.length > 0) return averagePoints(visibleBodyPoints)

  const fallback = pose.find(hasUsablePosition)
  return fallback ? { x: fallback.x, y: fallback.y } : { x: 0.5, y: 0.5 }
}

function distance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function initialVisibilityState(landmark: PoseLandmark): VisibilityState {
  const visible = landmarkScore(landmark) >= SHOW_THRESHOLD
  return {
    displayed: false,
    seenFrames: visible ? 1 : 0,
    missingFrames: visible ? 0 : 1,
  }
}

function updateVisibilityState(
  previous: VisibilityState,
  landmark: PoseLandmark,
): VisibilityState {
  const score = landmarkScore(landmark)

  if (score >= SHOW_THRESHOLD) {
    const seenFrames = previous.seenFrames + 1
    return {
      displayed:
        previous.displayed || seenFrames >= SHOW_CONFIRM_FRAMES,
      seenFrames,
      missingFrames: 0,
    }
  }

  if (score < HIDE_THRESHOLD) {
    const missingFrames = previous.missingFrames + 1
    return {
      displayed:
        previous.displayed && missingFrames < HIDE_CONFIRM_FRAMES,
      seenFrames: 0,
      missingFrames,
    }
  }

  return previous
}

function stabilizeLandmark(
  previous: StabilizedLandmark,
  current: PoseLandmark,
  visibilityState: VisibilityState,
): StabilizedLandmark {
  const score = landmarkScore(current)
  let positionAlpha = 0
  if (hasUsablePosition(current) && score >= SHOW_THRESHOLD) {
    positionAlpha = POSITION_ALPHA
  } else if (hasUsablePosition(current) && score >= HIDE_THRESHOLD) {
    positionAlpha = LOW_CONFIDENCE_POSITION_ALPHA
  }

  return {
    x:
      positionAlpha === 0
        ? previous.x
        : previous.x * (1 - positionAlpha) + current.x * positionAlpha,
    y:
      positionAlpha === 0
        ? previous.y
        : previous.y * (1 - positionAlpha) + current.y * positionAlpha,
    z:
      positionAlpha === 0
        ? previous.z
        : previous.z * (1 - positionAlpha) + current.z * positionAlpha,
    visibility:
      previous.visibility * (1 - VISIBILITY_ALPHA) +
      current.visibility * VISIBILITY_ALPHA,
    presence:
      previous.presence === undefined && current.presence === undefined
        ? undefined
        : (previous.presence ?? 1) * (1 - VISIBILITY_ALPHA) +
          (current.presence ?? 1) * VISIBILITY_ALPHA,
    displayed: visibilityState.displayed,
  }
}

function createTrack(
  id: number,
  pose: PoseLandmark[],
  timestampMs: number,
): PoseTrack {
  const visibilityStates = pose.map(initialVisibilityState)
  return {
    id,
    center: centerOfPose(pose),
    landmarks: pose.map((landmark, index) => ({
      ...landmark,
      displayed: visibilityStates[index].displayed,
    })),
    visibilityStates,
    lastSeenAt: timestampMs,
  }
}

export class PoseGuideStabilizer {
  private tracks: PoseTrack[] = []
  private nextTrackId = 1
  private detectedCount = 0
  private countCandidate = 0
  private countCandidateFrames = 0

  update(rawPoses: PoseLandmark[][], timestampMs: number): StabilizedPoseResult {
    this.updateDetectedCount(rawPoses.length)

    const detectionCenters = rawPoses.map(centerOfPose)
    const pairCandidates = this.tracks.flatMap((track, trackIndex) =>
      detectionCenters.map((center, detectionIndex) => ({
        trackIndex,
        detectionIndex,
        distance: distance(track.center, center),
      })),
    )
    pairCandidates.sort((first, second) => first.distance - second.distance)

    const matchedTracks = new Set<number>()
    const matchedDetections = new Set<number>()

    pairCandidates.forEach((candidate) => {
      if (
        candidate.distance > MAX_MATCH_DISTANCE ||
        matchedTracks.has(candidate.trackIndex) ||
        matchedDetections.has(candidate.detectionIndex)
      ) return

      const track = this.tracks[candidate.trackIndex]
      const detection = rawPoses[candidate.detectionIndex]
      const visibilityStates = detection.map((landmark, index) =>
        updateVisibilityState(
          track.visibilityStates[index] ??
            initialVisibilityState(landmark),
          landmark,
        ),
      )
      const landmarks = detection.map((landmark, index) =>
        stabilizeLandmark(
          track.landmarks[index] ?? {
            ...landmark,
            displayed: false,
          },
          landmark,
          visibilityStates[index],
        ),
      )

      track.landmarks = landmarks
      track.visibilityStates = visibilityStates
      track.center = centerOfPose(landmarks)
      track.lastSeenAt = timestampMs
      matchedTracks.add(candidate.trackIndex)
      matchedDetections.add(candidate.detectionIndex)
    })

    rawPoses.forEach((pose, detectionIndex) => {
      if (matchedDetections.has(detectionIndex)) return
      this.tracks.push(createTrack(this.nextTrackId, pose, timestampMs))
      this.nextTrackId += 1
    })

    this.tracks = this.tracks.filter(
      (track) => timestampMs - track.lastSeenAt <= HOLD_DURATION_MS,
    )

    return {
      poses: this.tracks
        .map((track) => ({
          id: track.id,
          landmarks: track.landmarks,
          opacity: Math.max(
            0,
            1 - (timestampMs - track.lastSeenAt) / HOLD_DURATION_MS,
          ),
        }))
        .sort((first, second) => first.id - second.id),
      detectedCount: this.detectedCount,
    }
  }

  private updateDetectedCount(rawCount: number) {
    if (rawCount === this.detectedCount) {
      this.countCandidate = rawCount
      this.countCandidateFrames = 0
      return
    }

    if (rawCount === this.countCandidate) {
      this.countCandidateFrames += 1
    } else {
      this.countCandidate = rawCount
      this.countCandidateFrames = 1
    }

    const requiredFrames =
      rawCount > this.detectedCount
        ? COUNT_RISE_CONFIRM_FRAMES
        : COUNT_DROP_CONFIRM_FRAMES

    if (this.countCandidateFrames >= requiredFrames) {
      this.detectedCount = rawCount
      this.countCandidateFrames = 0
    }
  }
}

