import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveReactionToggle } from '@/lib/chat-reaction-toggle'

const HEART = String.fromCodePoint(0x2764)
const LIKE = String.fromCodePoint(0x1f44d)

describe('resolveReactionToggle', () => {
  it('ยังไม่มีรีแอ็กชัน → ได้ตัวที่กด', () => {
    expect(resolveReactionToggle(null, HEART)).toBe(HEART)
    expect(resolveReactionToggle(undefined, HEART)).toBe(HEART)
  })

  it('กดตัวเดิมซ้ำ → ถอนออก (null)', () => {
    expect(resolveReactionToggle(HEART, HEART)).toBeNull()
  })

  it('กดตัวใหม่ทับของเดิม → เปลี่ยนเป็นตัวใหม่ ไม่ใช่ถอนออก', () => {
    expect(resolveReactionToggle(HEART, LIKE)).toBe(LIKE)
  })
})

/**
 * [blocker] ค่าที่จะยิงขึ้น Meta ต้องคำนวณเสร็จ "ก่อน" เรียก setMessages
 *
 * บั๊กจริงบน prod (user report 2026-08-04 แล้วซ้ำ 2026-08-11): ของเดิมเขียน
 *
 *     let next = null
 *     setMessages(prev => prev.map(m => { next = …; return … }))
 *     fetch(…, { body: JSON.stringify({ emoji: next }) })
 *
 * React ไม่เรียก updater แบบซิงโครนัส → บรรทัด fetch ทำงานตอน `next` ยังเป็น null ทุกครั้ง
 * = ส่ง `unreact` ไปหา Meta ทุกการกด. ทั้ง `tsc`/build/detector/grep เขียวหมดเพราะชนิดถูกทุกตัว
 * (`string | null` ทั้งคู่) และไม่มี error เกิดขึ้นเลย — รอบก่อนจึงไล่แก้ผิดตัว (ไปแก้ที่
 * ingestReactionEvent ซึ่งเป็นผู้เขียนคนที่สอง ไม่ใช่ต้นเหตุ) แล้วอาการกลับมาอีก
 *
 * ทำไมเป็นเทสที่อ่านซอร์ส: vitest ของโปรเจกต์ตั้ง `environment: "node"` และไม่มี jsdom/
 * testing-library — พิสูจน์ลำดับการรันของ React จริงที่นี่ไม่ได้ สิ่งที่ตรวจได้และตรงกับต้นเหตุคือ
 * **ลำดับของบรรทัดในซอร์ส** (แบบเดียวกับ useListBusy-deps.test.ts)
 */
const HOOK = join(
  process.cwd(),
  'src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts',
)

/** ตัวฟังก์ชัน reactToMessage ล้วน ๆ — ตัดตั้งแต่ประกาศจนถึง dep array ปิดท้าย useCallback */
function reactToMessageSource(): string {
  const src = readFileSync(HOOK, 'utf8')
  const start = src.indexOf('const reactToMessage = useCallback(')
  expect(start, 'หา reactToMessage ในฮุคไม่เจอ — เทสนี้จะเขียวโดยไม่ตรวจอะไร').toBeGreaterThan(-1)
  const end = src.indexOf('[conversationId],', start)
  expect(end, 'หาจุดจบของ useCallback ไม่เจอ').toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('[blocker] reactToMessage — คำนวณค่าก่อนสั่ง setState', () => {
  it('ใช้ resolveReactionToggle เป็นตัวตัดสิน ไม่เขียนเงื่อนไขซ้ำเอง', () => {
    expect(reactToMessageSource()).toContain('resolveReactionToggle(')
  })

  it('เรียก resolveReactionToggle ก่อน setMessages เสมอ', () => {
    const body = reactToMessageSource()
    expect(body.indexOf('resolveReactionToggle(')).toBeLessThan(body.indexOf('setMessages('))
  })

  it('ไม่มี let ในฟังก์ชันนี้ — ค่าที่ส่งขึ้น API ต้องเป็น const ที่คำนวณเสร็จแล้ว', () => {
    // `let` คือร่องรอยเดียวของแพตเทิร์น "ประกาศไว้ข้างนอก แล้วรอ updater มาเติมค่าให้"
    expect(reactToMessageSource()).not.toMatch(/\blet\s/)
  })
})
