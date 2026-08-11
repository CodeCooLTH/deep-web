/**
 * [blocker] กฎของคำตอบสถานะพัสดุอัตโนมัติบนเมนูลัด (feature 00045 FR-RM-09 / D-RM-3)
 *
 * เทสอ่านซอร์สเพราะทั้งหมดเป็นเรื่อง **ตำแหน่ง/ค่าที่ส่ง** ซึ่ง tsc/build ผ่านหมดไม่ว่าจะเขียนยังไง
 *
 * 🛑 แดง = ระบบใช้เงินร้านเองโดยไม่มีใครสั่ง / ป้ายในเธรดโกหกผู้ขาย
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPLY = join(process.cwd(), 'src/services/line-rich-menu-reply.service.ts')
const WEBHOOK = join(process.cwd(), 'src/app/api/channels/line/webhook/route.ts')
const TAG = join(
  process.cwd(),
  'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/AutoReplyTag.tsx',
)

describe('BR-LINE-18 — ระบบห้ามใช้เงินร้านเอง', () => {
  /**
   * `sendOutboundMessage` ตั้งต้น `sendMethod = 'PUSH'` แล้วค่อยอัปเกรดเป็น REPLY ⇒ ผู้ส่งอัตโนมัติ
   * ที่ไม่ประกาศ `replyOnly` จะ push เองเมื่อหน้าต่างฟรีปิด = ใช้เงินร้านโดยไม่มีใครสั่ง
   */
  it('[blocker] ต้องส่ง replyOnly: true — ไม่งั้นตกไป push เองเมื่อหน้าต่างฟรีปิด', () => {
    expect(readFileSync(REPLY, 'utf8')).toMatch(/replyOnly:\s*true/)
  })

  it('[blocker] ต้องไม่มีเส้นทางไหนในไฟล์นี้ที่ส่งโดยไม่ประกาศ replyOnly', () => {
    const src = readFileSync(REPLY, 'utf8')
    const sends = src.match(/sendOutboundMessage\(/g) ?? []
    const replyOnly = src.match(/replyOnly:\s*true/g) ?? []
    expect(sends.length).toBeGreaterThan(0)
    expect(replyOnly.length).toBe(sends.length)
  })
})

describe('ป้ายในเธรดต้องไม่โกหกผู้ขาย', () => {
  /**
   * ถ้าไม่บันทึก `matchedVia` ป้ายจะตกเป็น "DeepBot" (ค่าตั้งต้นของ AutoReplyTag) พร้อมป๊อปอัป
   * ที่แสดงแถวกลุ่มคำ/คำที่ตรงเป็น "ไม่เจาะจง" — โกหกสองชั้น: ไม่ใช่บอทคีย์เวิร์ด และไม่มีเงื่อนไข
   * ให้ดูตั้งแต่ต้น
   */
  it('[blocker] ต้องบันทึก matchedVia = RICH_MENU_ORDER_STATUS ตอนตอบสำเร็จ', () => {
    expect(readFileSync(REPLY, 'utf8')).toContain("matchedVia: 'RICH_MENU_ORDER_STATUS'")
  })

  it('[blocker] AutoReplyTag ต้องมีสาขาที่สาม (DeepMenu) ไม่ใช่ตกไป DeepBot', () => {
    const src = readFileSync(TAG, 'utf8')
    expect(src).toContain('RICH_MENU_ORDER_STATUS')
    expect(src).toContain('DeepMenu')
  })

  /**
   * 🛑 `buttonLabel` ต้องมาจากคำจริงที่ร้านตั้งไว้ (ฝังใน postback.data) — ร้านแก้คำบนปุ่มเองได้
   * (FR-RM-02) ถ้า hardcode ป๊อปอัปจะโกหกทันทีที่ร้านเปลี่ยนคำ
   */
  it('[blocker] webhook ต้องอ่าน buttonLabel จาก postback data ไม่ใช่ hardcode', () => {
    expect(readFileSync(WEBHOOK, 'utf8')).toMatch(/buttonLabel:\s*qs\.get\('label'\)/)
  })
})

describe('การต่อ webhook', () => {
  it('[blocker] ต้องเรียก replyOrderStatus หลัง ingest — บับเบิลต้องอยู่ในเธรดก่อนคำตอบ', () => {
    const src = readFileSync(WEBHOOK, 'utf8')
    const ingest = src.indexOf('await ingestLineTextMessage(')
    const reply = src.indexOf('await replyOrderStatus(')
    expect(ingest).toBeGreaterThan(-1)
    expect(reply).toBeGreaterThan(ingest)
  })

  it('[blocker] ยิงเฉพาะปุ่มของเมนูลัด (src=rm) ไม่ใช่ postback ทุกตัว', () => {
    expect(readFileSync(WEBHOOK, 'utf8')).toMatch(/qs\.get\('src'\)\s*===\s*'rm'/)
  })
})
