/**
 * [blocker] กันสถานะโควตา LINE หายไปจากปุ่มส่ง
 *
 * ที่มา 2026-08-10: user สั่งย้ายตัวเลขโควตาจากแคปชันใต้ช่องพิมพ์ **เข้าไปอยู่บนปุ่มส่ง** —
 * แคปชันเดิมถูกลบทิ้ง ปุ่มจึงกลายเป็น *ช่องทางเดียว* ที่บอกผู้ขายว่าข้อความใบนี้หักโควตาหรือส่งฟรี
 *
 * ทำไมต้องเป็นเทสที่อ่านซอร์ส: vitest ของโปรเจกต์นี้ตั้ง `environment: "node"` และรีโปไม่มี
 * jsdom/testing-library — เรนเดอร์ `ChatThread` เพื่อยืนยันด้วย DOM ไม่ได้. ตรรกะทั้งหมดถูกพิสูจน์
 * ที่ `quota-caption.test.ts` แล้ว (mutation ครบ) แต่ตรรกะที่ถูกต้องซึ่ง **ไม่มีใครเรียกใช้** ก็เงียบ
 * เท่ากับไม่มี — ถ้ามีคนลบ JSX ส่วนนี้ออก เทสตรรกะทุกข้อยังเขียวหมด (คลาสเดียวกับบทเรียน
 * docs/conventions/ui-boolean-needs-a-testable-home.md: gate ตรวจ "รูปแบบ" แต่ที่หายคือ "ความหมาย")
 *
 * 🛑 แดง = ปุ่มส่งเลิกแสดงสถานะโควตาแล้ว ห้าม merge จนกว่าจะหาที่ใหม่ให้มันบนหน้าจอ
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CHAT_THREAD = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx',
)

describe('ปุ่มส่งของเธรด LINE ต้องแสดงสถานะโควตา', () => {
  const src = readFileSync(CHAT_THREAD, 'utf8')

  it('[blocker] ChatThread ต้องเรนเดอร์ buttonSuffix ที่ deriveLineQuotaCaption คำนวณให้', () => {
    expect(src).toContain('lineQuotaCaption?.buttonSuffix')
  })

  it('[blocker] ต้องมีชื่อที่เข้าถึงได้เป็นประโยคเต็ม — "290/300" ลอย ๆ ไม่บอกว่าเป็นโควตา', () => {
    // ตัวเลขบนปุ่มอ่านออกด้วยตาเพราะมีบริบทรอบตัว แต่ screen reader อ่านทีละ element
    // (ดู docs/conventions/aria-name-requires-supporting-role.md — <button> รองรับ aria-label จริง)
    expect(src).toMatch(/aria-label=\{lineQuotaCaption \?/)
    expect(src).toContain('lineQuotaCaption.fullText')
  })

  it('[blocker] ต้องป้อน secondsLeft เข้าไปจริง — ไม่งั้น countdown ไม่มีวันเดินแม้ lib จะรองรับ', () => {
    // คลาสเดียวกับข้อบน: `freeSuffix` คำนวณถูกทุกเคสในเทสตรรกะ แต่ถ้า caller ไม่ส่งเวลามา
    // ปุ่มจะขึ้น "ฟรี" เฉย ๆ ตลอดกาล และไม่มีเทสตรรกะข้อไหนแดงเลย
    expect(src).toContain('secondsLeft:')
    expect(src).toMatch(/Math\.max\(1, Math\.ceil\(liveRemaining \/ 1000\)\)/)
  })

  it('tone ยังถูกแปลงเป็นคลาสของธีมที่จุดเดียว ไม่ใช่เทอร์นารีกระจายใน JSX', () => {
    expect(src).toContain('QUOTA_BUTTON_RING_CLASS[lineQuotaCaption.tone]')
  })

  it('แคปชันใต้ช่องพิมพ์ถูกถอดออกแล้วจริง — ไม่ปล่อยให้ตัวเลขเดียวกันโผล่สองที่ (HR16)', () => {
    expect(src).not.toContain('QUOTA_TONE_CLASS')
    expect(src).not.toContain('lineQuotaCaption.shortText')
  })
})
