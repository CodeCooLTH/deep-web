import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { sessionUserId } from '@/lib/session-user'

/**
 * [blocker] "มี session" ≠ "รู้ว่าเป็นใคร"
 *
 * บั๊กจริงบน prod 2026-08-11 (digest 3758181775): หน้า `/o/[token]` เช็ค `if (!session)` แล้ว
 * `session.user as { id: string }` ต่อทันที ⇒ `prisma.user.findUnique({ where: { id: undefined } })`
 * ⇒ throw ⇒ ทั้งหน้าเป็น 500 ทั้งที่จอ guest ของออเดอร์ใบเดียวกันเปิดได้ปกติ
 */
describe('[blocker] sessionUserId', () => {
  it('session ปกติ → คืน id', () => {
    expect(sessionUserId({ user: { id: 'u1' } })).toBe('u1')
  })

  it('session ครึ่งใบ (มี user แต่ไม่มี id) → null ไม่ใช่ undefined ที่ไหลต่อไปได้', () => {
    expect(sessionUserId({ user: { name: 'ก' } })).toBeNull()
    expect(sessionUserId({ user: {} })).toBeNull()
    expect(sessionUserId({})).toBeNull()
  })

  it('ไม่มี session เลย → null', () => {
    expect(sessionUserId(null)).toBeNull()
    expect(sessionUserId(undefined)).toBeNull()
  })

  it('ค่าที่ไม่ใช่สตริง/สตริงว่าง → null (fail-closed ห้ามปล่อยเข้า where ของ Prisma)', () => {
    expect(sessionUserId({ user: { id: '' } })).toBeNull()
    expect(sessionUserId({ user: { id: 123 } })).toBeNull()
    expect(sessionUserId({ user: { id: null } })).toBeNull()
  })
})

/**
 * ด่านกันแพตเทิร์นเดิมกลับมา — สแกนซอร์สจริง ไม่ใช่รายชื่อไฟล์ที่ hardcode ไว้
 * (ไฟล์ใหม่ที่เขียนทีหลังจะถูกจับด้วย ต่างจากการไล่ list ที่ต้องมีคนมาอัปเดต)
 *
 * 🛑 สิ่งที่ห้ามคือ **cast ที่ประกาศว่า id เป็น string แน่ ๆ แล้วหยิบมาใช้เลย** — TypeScript
 * เชื่อ cast ทุกตัวอักษร จึงไม่มี gate ไหนเห็น runtime ที่ได้ undefined
 */
describe('[blocker] ห้าม cast session.user เป็น { id: string } แล้ว deref ตรง ๆ', () => {
  it('ไม่มีที่ไหนใน src/app เหลือแพตเทิร์นนี้', () => {
    let hits = ''
    try {
      hits = execFileSync(
        'grep',
        ['-rn', '--include=*.ts', '--include=*.tsx', 'as { id: string }).id', 'src/app'],
        { encoding: 'utf8' },
      )
    } catch {
      hits = '' // grep exit 1 = ไม่เจอ = ผ่าน
    }
    expect(hits.trim()).toBe('')
  })
})
