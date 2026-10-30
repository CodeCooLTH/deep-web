/**
 * 00086 (review 2026-10-30 MINOR-1) — payload แชทของผู้ซื้อต้องไม่มีขั้นภายในร้าน (เวลาเริ่ม/ทำเสร็จงาน)
 *
 * route `GET /api/chat/conversations/[id]/messages` ใช้ร่วมทั้งร้านและผู้ซื้อ (แอป Deep) ผ่าน getThreadMessagesPage
 * การ์ดออเดอร์ฝั่งร้านต้องได้ serviceStartedAt/serviceFinishedAt (ป้าย "กำลังให้บริการ") แต่ผู้ซื้อห้ามได้แม้ไม่แสดง
 * mutation ที่ต้องแดง: เอาเงื่อนไข viewerIsBuyer ออก · getMessages เลิกคืน viewerIsBuyer ทางใดทางหนึ่ง
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('แชทผู้ซื้อ — ไม่มีขั้นภายในร้านใน payload', () => {
  it('[blocker] การ์ดออเดอร์ใส่ serviceStartedAt/serviceFinishedAt เฉพาะเมื่อผู้ดูไม่ใช่ผู้ซื้อ', () => {
    const src = stripComments(read('src/services/chat-thread-messages.service.ts'))
    const guarded = /\.\.\.\(result\.viewerIsBuyer\s*\?\s*\{\}\s*:\s*\{\s*serviceStartedAt:[^}]*serviceFinishedAt:[^}]*\}\)/
    expect(src).toMatch(guarded)
    // นอกบล็อกที่กั้นไว้ ห้ามมีการใส่สองคีย์นี้ลงการ์ดอีก
    const rest = src.replace(guarded, '')
    expect(rest).not.toMatch(/serviceStartedAt:\s*o\./)
    expect(rest).not.toMatch(/serviceFinishedAt:\s*o\./)
  })

  it('[blocker] getMessages คืน viewerIsBuyer ทั้งทาง delta และทางหน้าปกติ (ตัดสินจากแถวที่ยืนยันสิทธิ์แล้ว)', () => {
    const src = stripComments(read('src/services/chat.service.ts'))
    expect(src).toMatch(/const viewerIsBuyer = conversation\.buyerUserId === actorUserId/)
    expect(src).toMatch(/nextCursor: null, viewerIsBuyer \}/)
    expect(src).toMatch(/nextCursor: hasMore[\s\S]{0,200}viewerIsBuyer,\s*\}/)
  })
})
