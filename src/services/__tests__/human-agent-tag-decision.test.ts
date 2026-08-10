/**
 * `shouldTagHumanAgent` — ตัดสินว่าจะติด message tag `HUMAN_AGENT` ไหม (feature 00043, TFR-HA-02,
 * SDS §8.2)
 *
 * แยกเป็น pure function แทนการฝังเทอร์นารีกลาง `sendOutboundMessage`/`sendOutboundImageGrid` ตาม
 * docs/conventions/ui-boolean-needs-a-testable-home.md — เกณฑ์คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไร
 * จับได้ไหม" เทส 2 เคสข้างล่าง (#2, #4) คือคำตอบของเกณฑ์นั้นตรง ๆ
 *
 * 🛑 ตอบแค่ "ติด tag ไหม" — ไม่ได้ตัดสินว่า "throw WINDOW_CLOSED ไหม" (คนละ concern คนละที่ตัดสิน)
 */

import { describe, it, expect } from 'vitest'
import { shouldTagHumanAgent } from '@/services/channel-chat.service'

describe('shouldTagHumanAgent', () => {
  it('#1 windowOpen=true → false (อยู่ในหน้าต่างปกติ ไม่ต้อง tag)', () => {
    expect(
      shouldTagHumanAgent({ windowOpen: true, sentByHuman: true, eligible: true, humanAgentWindowOpen: true }),
    ).toBe(false)
  })

  it('[blocker] #2 (S-6) windowOpen=false, sentByHuman=false, eligible=true, humanAgentWindowOpen=true → false (บอทห้ามได้ tag เด็ดขาด)', () => {
    expect(
      shouldTagHumanAgent({
        windowOpen: false,
        sentByHuman: false,
        eligible: true,
        humanAgentWindowOpen: true,
      }),
    ).toBe(false)
  })

  it('#3 windowOpen=false, sentByHuman=true, eligible=false, humanAgentWindowOpen=true → false (ไม่อยู่ใน allow-list/สวิตช์ปิด)', () => {
    expect(
      shouldTagHumanAgent({
        windowOpen: false,
        sentByHuman: true,
        eligible: false,
        humanAgentWindowOpen: true,
      }),
    ).toBe(false)
  })

  it('[blocker] #4 (S-7) windowOpen=false, sentByHuman=true, eligible=true, humanAgentWindowOpen=false → false (allow-list ไม่ข้ามกฎ 7 วัน)', () => {
    expect(
      shouldTagHumanAgent({
        windowOpen: false,
        sentByHuman: true,
        eligible: true,
        humanAgentWindowOpen: false,
      }),
    ).toBe(false)
  })

  it('#5 windowOpen=false, sentByHuman=true, eligible=true, humanAgentWindowOpen=true → true (เคสเดียวที่ต้องติด tag จริง)', () => {
    expect(
      shouldTagHumanAgent({
        windowOpen: false,
        sentByHuman: true,
        eligible: true,
        humanAgentWindowOpen: true,
      }),
    ).toBe(true)
  })
})
