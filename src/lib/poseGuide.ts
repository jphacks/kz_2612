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
    return { text: '白い線に合わせて並ぼう（人数の確認を準備中…）', tone: 'neutral' }
  }

  if (status === 'error') {
    // 今の人の骨格は出せないが、お手本（白い線）は出ているので、そのまま撮影できる
    return { text: '白い線に合わせて撮影しよう（人数の確認は使えません）', tone: 'neutral' }
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
    text: '人数OK！白い線にポーズを合わせよう',
    tone: 'success',
  }
}

