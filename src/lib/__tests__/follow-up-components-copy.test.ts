// 00066 [blocker] ด่านสแกนซอร์สของ component ติดตามลูกค้า:
//  (1) ไม่มีสตริงไทยดิบ — ข้อความทั้งหมดต้องผ่าน t.followUps (สลับภาษา TH/EN ได้)
//  (2) ไม่มีคำว่า "กิจกรรม" ใน UI (AC-ACT-46)
// ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ในคอมเมนต์ด้วย (แดงตลอดกาลถ้าไม่ตัด)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripComments } from './helpers/buyer-order-sources'

const ROOT = join(__dirname, '../../..')
const FILES = [
  'src/app/(paces)/seller/_follow-up/FollowUpCard.tsx',
  'src/app/(paces)/seller/_follow-up/FollowUpForm.tsx',
  'src/app/(paces)/seller/_follow-up/follow-up-client.ts',
  'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/FollowUpPanel.tsx',
]

export { stripComments }

describe('follow-up components: copy', () => {
  for (const f of FILES) {
    const code = stripComments(readFileSync(join(ROOT, f), 'utf8'))
    it(`[blocker] ${f.split('/').pop()} ไม่มีสตริงไทยดิบ`, () => {
      const hits = code.split('\n').filter((l) => /[฀-๿]/.test(l))
      expect(hits).toEqual([])
    })
    it(`[blocker] ${f.split('/').pop()} ไม่มีคำว่า "กิจกรรม"`, () => {
      expect(code).not.toContain('กิจกรรม')
    })
  }

  it('[blocker] ข้อความของฟีเจอร์ (th.followUps) ไม่มีคำว่า "กิจกรรม"', () => {
    const th = readFileSync(join(ROOT, 'src/i18n/dictionaries/th.ts'), 'utf8')
    const start = th.indexOf('followUps: {')
    const block = stripComments(th.slice(start, th.indexOf('\n  },', start)))
    expect(block.length).toBeGreaterThan(500) // ไม่ใช่ slice ว่าง
    expect(block).not.toContain('กิจกรรม')
  })
})

describe('follow-up components: a11y', () => {
  const read = (f: string) => stripComments(readFileSync(join(ROOT, f), 'utf8'))

  it('[blocker] Icon ที่มี aria-label ต้องมี role="img" (aria-label บน svg/span เปล่าไม่มี role รองรับชื่อ)', () => {
    for (const f of FILES) {
      const tags = read(f).match(/<Icon\b[^>]*>/g) ?? []
      for (const tag of tags.filter((x) => x.includes('aria-label'))) expect(tag, f).toContain('role="img"')
    }
  })

  it('[blocker] หัวแท็บติดตามเป็นข้อความที่อ่านได้ ไม่ใช่ปุ่มพับ (2026-10-05 ย้ายเป็นแท็บ — ห้ามกลับไปซ่อนรายการหลังปุ่มพับ)', () => {
    const code = read(FILES[3]!)
    expect(code).not.toContain('aria-expanded')
    expect(code).toMatch(/<p\b[^>]*>\s*\{ready \? fmt\(t\.panelTitle/)
  })

  it('[blocker] ปุ่ม "ทำแล้ว" ปิดทันที: ไม่มีสถานะ reveal "done" (ห้ามถามผลก่อนปิด) และ complete ส่ง outcome: null', () => {
    const code = read(FILES[0]!)
    expect(code).not.toMatch(/setReveal\(\s*'done'\s*\)/)
    expect(code).not.toContain("reveal === 'done'")
    // 2 จุด: ปุ่ม ✓ ของ bubble + ปุ่ม "ทำแล้ว" ของการ์ด (mutation: เปลี่ยนปุ่มหลักไปเปิดแถวถามผล → เหลือ 1)
    expect(code.match(/onClick=\{\(\) => void complete\(\)\}/g) ?? []).toHaveLength(2)
    expect(code).toMatch(/\{\s*outcome:\s*null\s*\}/)
    // ผลตั้งทีหลังผ่าน endpoint แยกที่ไม่แตะผู้ปิด
    expect(code).toContain('/outcome`')
  })
})
