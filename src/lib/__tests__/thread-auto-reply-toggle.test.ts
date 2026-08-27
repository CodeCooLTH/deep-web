/**
 * [blocker] แถบ ปิด/อัตโนมัติ ของ auto-reply รายห้อง ต้องพูดตรงกับด่านจริงฝั่ง server
 *
 * ทั้งสองฝั่งตัดสิน "ห้องนี้ให้บอทตอบไหม" จากคอลัมน์เดียวกัน (`Conversation.autoReplyEnabled`)
 * แต่เขียนคนละไฟล์คนละ runtime — และค่ามันเป็น `Boolean?` ที่มี 3 ค่า (null/true/false)
 * วันที่มีคนเปลี่ยนด่าน server จาก `=== false` เป็น `!== true` ห้องที่ "ยังไม่เคยตั้งค่า" (null)
 * จะเงียบทันทีทั้งระบบ ขณะที่แถบบนหน้าจอยังขึ้นว่า "อัตโนมัติ" — ไม่มี tsc/build/eslint ตัวไหน
 * เห็น เพราะทั้งสองบรรทัดถูกตามชนิดทุกตัวอักษร สิ่งที่ผิดคือ *ความหมายที่ไม่ตรงกัน*
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const TOGGLE = join(root, 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ThreadAutoReplyToggle.tsx')
const SERVICE = join(root, 'src/services/auto-reply.service.ts')

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำอธิบายกฎนี้ไว้ด้วย (กับดักเดิมของ grep gate) */
const code = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('[blocker] ThreadAutoReplyToggle ↔ auto-reply gate parity', () => {
  it('ด่าน server บล็อกเฉพาะค่าที่ตั้งเป็น false ชัดเจน (null = ยังไม่เคยตั้ง ต้องไม่ถูกบล็อก)', () => {
    expect(code(SERVICE)).toContain('conversation.autoReplyEnabled === false')
  })

  it('แถบบนหน้าจอนับ null/undefined เป็น "อัตโนมัติ" ด้วยเกณฑ์เดียวกัน', () => {
    expect(code(TOGGLE)).toMatch(/isAutoReplyOn\s*=\s*\(v[^)]*\)\s*=>\s*v\s*!==\s*false/)
  })

  it('เลือก "อัตโนมัติ" ต้องล้าง pause + handoff ไปพร้อมกัน ไม่งั้นแถบโกหก', () => {
    const src = code(TOGGLE)
    // payload ขาเปิดต้องมีครบ 3 คีย์ในก้อนเดียว — ห้องที่ถูกพัก/ส่งต่อคนจะยังเงียบถ้าขาดตัวใดตัวหนึ่ง
    const onPayload = src.match(/\{\s*autoReplyEnabled:\s*true[^}]*\}/)
    expect(onPayload, 'ไม่พบ payload ตอนเลือก "อัตโนมัติ"').not.toBeNull()
    expect(onPayload![0]).toContain('clearPause: true')
    expect(onPayload![0]).toContain('clearHandoff: true')
  })

  it('เลือก "ปิด" ต้องไม่พ่วง clearPause/clearHandoff (ปิดอยู่แล้ว ไม่ต้องปลุกอะไร)', () => {
    const src = code(TOGGLE)
    const offPayload = src.match(/\{\s*autoReplyEnabled:\s*false[^}]*\}/)
    expect(offPayload, 'ไม่พบ payload ตอนเลือก "ปิด"').not.toBeNull()
    expect(offPayload![0]).not.toContain('clear')
  })
})

/**
 * [blocker] ไอคอนของแถบตอบอัตโนมัติห้ามชนกับสัญลักษณ์ที่จองความหมายไว้แล้วในจอเดียวกัน
 *
 * เกิดจริง 2026-08-27: เลือก `bolt` ซึ่ง = "ข้อความสำเร็จรูป" อยู่แล้ว user ทักทันทีว่า
 * "งง เอา quick message มาทำไม" — tsc/eslint/theme-guard ผ่านหมด เพราะสตริงไอคอนถูกต้องทุกตัว
 * สิ่งที่ผิดคือ *ความหมายซ้อนทับ* ⇒ ต้องผูกไว้กับสัญลักษณ์ที่ BotPausedBanner ใช้ตอบคำถามเดียวกัน
 */
describe('[blocker] ไอคอนของแถบตอบอัตโนมัติ', () => {
  it('ใช้ robot / robot-off คู่เดียวกับ BotPausedBanner', () => {
    const src = code(TOGGLE)
    expect(src).toContain("icon: 'robot-off'")
    expect(src).toContain("icon: 'robot'")
    expect(code(join(root, 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/BotPausedBanner.tsx')))
      .toContain('robot-off')
  })

  it('ห้ามใช้ bolt (= ข้อความสำเร็จรูป) หรือ sparkles (= DeepAI ช่วยร่าง)', () => {
    const src = code(TOGGLE)
    expect(src).not.toMatch(/icon:\s*'bolt'/)
    expect(src).not.toMatch(/icon:\s*'sparkles'/)
  })
})
