/**
 * [blocker] แก้แชทเว็บ ต้องแก้แชท Native ตาม (HARD RULE 18 · feature 00088 · docs/conventions/native-chat-sync.md)
 *
 * แดง = มีของที่แชท Native ในแอปผู้ขายพึ่งอยู่ถูกแก้ (หรือมีไฟล์ใหม่ในโฟลเดอร์แชท) โดยยังไม่ได้ยืนยันว่าแอปตามแล้ว
 * ทางผ่านเดียว: แก้ deep-seller-app ตามรายการ (หรือยืนยันว่าไม่กระทบ) → `npx tsx scripts/native-chat-sync-pin.ts`
 * → เขียน `Native: …` ใน PR · 🛑 ห้ามแก้เทสนี้/ลบรายการเพื่อให้ผ่าน
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { entryKey, extractRegion, SYNC_ENTRIES } from '../native-chat-sync/manifest'
import { PINS_FILE, scan, watchedDirOf, type Pins } from '../native-chat-sync/scan'

const root = process.cwd()
const pins = JSON.parse(readFileSync(PINS_FILE, 'utf8')) as Pins
const now = scan(root)

const HOW = '\n\nทำต่อ: (1) แก้ deep-seller-app ตามไฟล์ที่ระบุ หรือยืนยันว่าไม่กระทบแชท Native (2) npx tsx scripts/native-chat-sync-pin.ts (3) เขียนใน PR ว่า "Native: <PR แอป | ไม่กระทบเพราะ ...>"'

describe('[blocker] แชทเว็บ ↔ แชท Native ต้องไปด้วยกัน', () => {
  it('ทุกไฟล์/ส่วนที่แชท Native พึ่ง ยังหาเจอ (ย้าย/เปลี่ยนชื่อ = ต้องมีคนดูแอป)', () => {
    const missing = SYNC_ENTRIES.filter((e) => now.entries[entryKey(e)] === null).map((e) => `${entryKey(e)} → แอป: ${e.app.join(', ')}`)
    expect(missing, `หาไม่เจอ:\n${missing.join('\n')}${HOW}`).toEqual([])
  })

  it('ของที่แชท Native คัดลอก/เรียกใช้ ไม่ถูกแก้โดยไม่ตามแก้แอป', () => {
    const changed = SYNC_ENTRIES.filter((e) => now.entries[entryKey(e)] !== null && pins.entries[entryKey(e)] !== now.entries[entryKey(e)]).map(
      (e) => `• ${entryKey(e)}\n    ทำไม: ${e.why}\n    แก้ในแอป: ${e.app.join(', ')}`,
    )
    expect(changed, `แชทเว็บถูกแก้ — แชท Native (deep-seller-app) ต้องตาม:\n${changed.join('\n')}${HOW}`).toEqual([])
  })

  it('ไฟล์ในโฟลเดอร์แชทที่เฝ้า: แก้/เพิ่ม/ลบ ต้องยืนยันฝั่ง Native', () => {
    const diff: string[] = []
    for (const [f, h] of Object.entries(now.files)) {
      if (pins.files[f] === h) continue
      const w = watchedDirOf(f)
      diff.push(`• ${f} ${pins.files[f] ? '(แก้)' : '(ไฟล์ใหม่)'}\n    ดูในแอป: ${w?.app.join(', ') ?? '-'} — ${w?.why ?? ''}`)
    }
    for (const f of Object.keys(pins.files)) if (!(f in now.files)) diff.push(`• ${f} (ถูกลบ/ย้าย)`)
    expect(diff, `หน้าจอ/API แชทเว็บเปลี่ยน — แชท Native ต้องตาม:\n${diff.join('\n')}${HOW}`).toEqual([])
  })

  it('ตัวตัดส่วน: ตัดถึงพี่น้องตัวถัดไป · วงเล็บปิดไม่ตัด · หาไม่เจอ = null', () => {
    const src = 'export const A = v.object({\n  a: 1,\n})\nexport const B = 2\n'
    expect(extractRegion(src, 'export const A')).toBe('export const A = v.object({\n  a: 1,\n})')
    expect(extractRegion(src, 'export const C')).toBeNull()
    const th = '  inbox: {\n    x: 1,\n  },\n  other: {\n'
    expect(extractRegion(th, '  inbox: {')).toBe('  inbox: {\n    x: 1,\n  },')
  })
})
