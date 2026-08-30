import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (rel: string) =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const SERVICE = 'src/services/channel-chat.service.ts'
const HOOK = 'src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts'
const THREAD = 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx'
const GRAPH = 'src/lib/facebook/graph.ts'

/**
 * 🛑 [blocker] "กำลังพิมพ์…" เป็น **ของประดับ** — ข้อผิดพลาดทุกชนิดต้องเงียบ และต้องไม่ยิงถี่
 *
 * `onChange` ของช่องพิมพ์ยิงทุกตัวอักษร ⇒ ถ้าไม่มี throttle พิมพ์ประโยคเดียวจะกลายเป็นคำขอ
 * หลายสิบใบ ทั้งที่ปลายทางคงสถานะไว้เอง ~20 วินาที — และโควตา API ของเพจใช้ร่วมกับการส่ง
 * ข้อความจริง (เธรดที่คุยรัว ๆ จะแย่งโควตากันเอง)
 */
describe('[blocker] typing indicator', () => {
  it('service กั้นเฉพาะ Meta — LINE/DEEP ต้องไม่ยิง (ไม่มี sender action)', () => {
    const s = read(SERVICE)
    const fn = s.slice(s.indexOf('export async function notifyTyping'))
    expect(fn).toMatch(/channel !== 'MESSENGER' && [\s\S]{0,40}channel !== 'INSTAGRAM'/)
  })

  it('service มี throttle ต่อเธรด และ **จองคิวก่อนยิง** ไม่ใช่หลัง', () => {
    const s = read(SERVICE)
    const fn = s.slice(s.indexOf('export async function notifyTyping'))
    const setAt = fn.indexOf('store.set(')
    const sendAt = fn.indexOf('sendSenderAction(')
    expect(setAt, 'ไม่มีการจองคิว').toBeGreaterThan(-1)
    expect(sendAt, 'ไม่มีการยิงจริง').toBeGreaterThan(-1)
    // จองหลังยิง = ระหว่างรอ network ผู้ขายพิมพ์ต่อ → คำขอซ้อนกันหลายใบต่อการพิมพ์ครั้งเดียว
    expect(setAt).toBeLessThan(sendAt)
  })

  it('[blocker] service ต้องไม่ throw เลย (ช่องพิมพ์ห้ามสะดุดเพราะของประดับ)', () => {
    const s = read(SERVICE)
    const fn = s.slice(s.indexOf('export async function notifyTyping'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('try {')
    expect(body).toContain('catch')
    expect(body).not.toMatch(/\bthrow\b/)
  })

  it('[blocker] graph client ต้องไม่ throw และห้ามส่ง message มาพร้อม sender_action', () => {
    const g = read(GRAPH)
    const fn = g.slice(g.indexOf('export async function sendSenderAction'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('catch')
    expect(body).not.toMatch(/\bthrow\b/)
    expect(body).toMatch(/sender_action: action/)
    // Meta ตี "message + sender_action" เป็นคำขอคนละชนิด
    expect(body).not.toMatch(/message:/)
  })

  it('[blocker] client มี throttle และล้มแบบเงียบ (ห้าม console แดงตอนพิมพ์)', () => {
    const h = read(HOOK)
    const fn = h.slice(h.indexOf('const notifyTyping = useCallback'))
    const body = fn.slice(0, fn.indexOf('}, [conversationId])'))
    // 🛑 ต้องมี **การเปรียบเทียบแล้ว return ออก** ไม่ใช่แค่ "มีชื่อ ref โผล่ในโค้ด" —
    // ตอนแรกเทสนี้เช็คแค่ว่าเจอ `typingAtRef.current` แล้ว mutation ที่ลบบรรทัดกันออกทั้งบรรทัด
    // **ยังเขียวอยู่** เพราะบรรทัด `typingAtRef.current = now` ที่เหลือก็ match (ชุด input อ่อน
    // ไม่ใช่ mutation ไม่เกี่ยว — docs/conventions/mutation-silence-means-weak-corpus.md)
    expect(body).toMatch(/if \(now - typingAtRef\.current < [0-9_]+\) return/)
    expect(body).toMatch(/typingAtRef\.current = now/)
    expect(body).toMatch(/\.catch\(\(\) => \{\}\)/)
  })

  it('เปลี่ยนเธรดต้องรีเซ็ต throttle ไม่งั้นเธรดถัดไปโดนกดไว้จากเธรดก่อน', () => {
    const h = read(HOOK)
    expect(h).toMatch(/typingAtRef\.current = 0/)
  })

  it('[blocker] ผูกกับการพิมพ์ของคนเท่านั้น — ห้ามยิงตอนโค้ดตั้งค่าข้อความให้', () => {
    const t = read(THREAD)
    // ต้องอยู่ใน onChange ของช่องพิมพ์ ไม่ใช่ที่ setText จุดอื่น (AI/ข้อความสำเร็จรูป/เลือกสินค้า)
    expect(t).toMatch(/onChange=\{\(e\) => \{[\s\S]{0,200}notifyTyping\(\)/)
    expect((t.match(/notifyTyping\(\)/g) ?? []).length, 'ควรถูกเรียกจุดเดียว').toBe(1)
  })
})
