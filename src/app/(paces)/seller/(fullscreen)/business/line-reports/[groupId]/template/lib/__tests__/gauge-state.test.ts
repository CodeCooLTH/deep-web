import { describe, expect, it } from 'vitest'
import { GAUGE_COPY, gaugeState } from '../gauge-state'

const L = 30_000
describe('gaugeState', () => {
  it('ปกติ ≤80%: เทากลาง ไม่มีข้อความ', () => {
    const g = gaugeState(24_000, L)
    expect(g).toMatchObject({ level: 'ok', percent: 80, fillClass: 'bg-default-400', message: null, blocksSave: false })
  })
  it('>80%: warning + ข้อความ (มีกราฟ = ลำดับตัดยาวขึ้น)', () => {
    expect(gaugeState(24_001, L)).toMatchObject({ level: 'warn', fillClass: 'bg-warning', message: GAUGE_COPY.warn, blocksSave: false })
    expect(gaugeState(27_000, L, true).message).toBe(GAUGE_COPY.warnWithChart)
  })
  it('=100% ยังบันทึกได้ · >100% danger และบันทึกไม่ได้', () => {
    expect(gaugeState(30_000, L)).toMatchObject({ level: 'warn', blocksSave: false, fill: 100 })
    const o = gaugeState(30_001, L)
    expect(o).toMatchObject({ level: 'over', fillClass: 'bg-danger', message: GAUGE_COPY.over, blocksSave: true, fill: 100 })
  })
  it('เปอร์เซ็นต์จริงเกิน 100 ได้ แต่ไส้ไม่ล้น · 0 ไบต์ = 0%', () => {
    expect(gaugeState(60_000, L)).toMatchObject({ percent: 200, fill: 100 })
    expect(gaugeState(0, L)).toMatchObject({ percent: 0, fill: 0, level: 'ok' })
  })
  it('limit ผิดปกติ (0) ไม่หารศูนย์', () => {
    expect(Number.isFinite(gaugeState(10, 0).percent)).toBe(true)
  })
})
