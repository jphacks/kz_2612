import type { PoseGuideStatus } from '../types/poseGuide'

export type PoseGuideFeedback = {
  text: string
  tone: 'neutral' | 'success' | 'warning'
}

export function getPoseGuideFeedback(
  status: PoseGuideStatus,
  detectedCount: number,
  expectedCount: number,
): PoseGuideFeedback {
  if (status === 'disabled') {
    return { text: 'ガイドはオフです。撮影はそのまま行えます', tone: 'neutral' }
  }

  if (status === 'loading') {
    return { text: '骨格ガイドを準備中… 撮影はできます', tone: 'neutral' }
  }

  if (status === 'error') {
    return { text: '骨格ガイドを利用できません。撮影は可能です', tone: 'warning' }
  }

  if (detectedCount === 0) {
    return { text: '全身が入るように少し離れてください', tone: 'warning' }
  }

  if (detectedCount < expectedCount) {
    const missingCount = expectedCount - detectedCount
    return {
      text: 'あと' + missingCount + '人、カメラに入ってください',
      tone: 'warning',
    }
  }

  if (detectedCount > expectedCount) {
    const extraCount = detectedCount - expectedCount
    return {
      text: extraCount + '人多いようです。鍵写真と同じ人数にしよう',
      tone: 'warning',
    }
  }

  return {
    text: '人数OK！鍵写真のポーズに合わせよう',
    tone: 'success',
  }
}

