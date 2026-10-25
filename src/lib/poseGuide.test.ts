import { describe, expect, it } from 'vitest'
import { getPoseGuideFeedback } from './poseGuide'

describe('getPoseGuideFeedback', () => {
  it('reports missing participants', () => {
    expect(getPoseGuideFeedback('ready', 2, 4)).toEqual({
      text: 'あと2人、カメラに入ってください',
      tone: 'warning',
    })
  })

  it('reports when the expected number of people is visible', () => {
    expect(getPoseGuideFeedback('ready', 4, 4)).toEqual({
      text: '人数OK！白い線にポーズを合わせよう',
      tone: 'success',
    })
  })

  it('keeps capture available when the guide fails', () => {
    expect(getPoseGuideFeedback('error', 0, 4)).toEqual({
      text: '白い線に合わせて撮影しよう（人数の確認は使えません）',
      tone: 'neutral',
    })
  })
})
