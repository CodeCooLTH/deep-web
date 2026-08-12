import { describe, it, expect } from 'vitest'
import { resolveVerdict, type LineHealthVerdict } from '@/services/line-channel-health.service'

// (00025 ส่วนขยาย 2026-08-12 — AC-CH-18)
//
// 🛑 เทสชุดนี้เกิดขึ้นเพราะรอบแรกผมเขียน `resolveVerdict` ให้ **คืน 'PASS' ไม่ได้เลย**
// (บรรทัดสุดท้ายเป็น `x ? 'PASS_WITH_NOTE' : 'PASS_WITH_NOTE'`) ซึ่ง `tsc` ผ่านสบาย ๆ เพราะ
// ชนิดถูกต้องทุกประการ — สิ่งที่ผิดคือ *ความหมาย* ไม่ใช่ *รูปแบบ*
// ข้อ "ทุกค่าใน union ต้องไปถึงได้" ด้านล่างคือด่านที่จับคลาสนี้

const base = {
  webhookState: 'PASS' as const,
  tokenState: 'PASS' as const,
  inboundState: 'PASS' as const,
  inboundReason: null as string | null,
}

describe('resolveVerdict', () => {
  it('[blocker] ทุกค่าใน LineHealthVerdict ต้องมีทางไปถึงได้จริง — ห้ามมีสาขาตาย', () => {
    const reached = new Set<LineHealthVerdict>([
      resolveVerdict(base),
      resolveVerdict({ ...base, inboundState: 'INCONCLUSIVE' }),
      resolveVerdict({ ...base, inboundReason: 'SIGNATURE_MISMATCH' }),
      resolveVerdict({ ...base, tokenState: 'FAIL' }),
      resolveVerdict({ ...base, webhookState: 'FAIL' }),
    ])
    expect([...reached].sort()).toEqual(
      ['FAIL_SECRET', 'FAIL_TOKEN', 'FAIL_WEBHOOK', 'PASS', 'PASS_WITH_NOTE'].sort(),
    )
  })

  it('[blocker] ตั้งค่าถูกครบแต่ยืนยันฝั่งรับไม่ได้ → PASS_WITH_NOTE ไม่ใช่ PASS', () => {
    // 🛑 นี่คือหัวใจของปุ่มนี้: "ตั้งค่าถูก" ≠ "รับได้จริง" — webhook/test ของ LINE ตอบ
    // success:true ได้ทั้งที่เราตกทุก event เพราะเราตอบ 200 เสมอตามสเปกของเราเอง
    // mutation: เปลี่ยนเงื่อนไขเป็น `webhookState === 'PASS'` อย่างเดียว → ข้อนี้แดง
    expect(resolveVerdict({ ...base, inboundState: 'INCONCLUSIVE' })).toBe('PASS_WITH_NOTE')
  })

  it('[blocker] secret ไม่ตรง ชนะทุกอย่าง แม้ token ก็พังพร้อมกัน', () => {
    expect(resolveVerdict({ ...base, tokenState: 'FAIL', inboundReason: 'SIGNATURE_MISMATCH' })).toBe('FAIL_SECRET')
  })

  it('[blocker] destination ไม่เจอ = ปัญหาการตั้งค่าช่องทาง ไม่ใช่ secret', () => {
    // กล่าวหา secret ผิด = ร้านไปหมุน secret ใหม่ทั้งที่ไม่ได้พัง แล้วของเดิมที่เคยดีจะพังตาม
    expect(resolveVerdict({ ...base, inboundReason: 'DESTINATION_NOT_FOUND' })).toBe('FAIL_WEBHOOK')
  })

  it('ลำดับตรงกับ resolveLineChannelHealth: token ตาย ชนะ webhook ผิด', () => {
    // ปุ่มทดสอบกับป้ายบนการ์ดต้องไม่พูดคนละเรื่องกับข้อมูลชุดเดียวกัน (HR16)
    expect(resolveVerdict({ ...base, tokenState: 'FAIL', webhookState: 'FAIL' })).toBe('FAIL_TOKEN')
  })
})
