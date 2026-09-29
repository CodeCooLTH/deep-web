// 00066 [blocker] ด่านสแกนซอร์สของ component ติดตามลูกค้า:
//  (1) ไม่มีสตริงไทยดิบ — ข้อความทั้งหมดต้องผ่าน t.followUps (สลับภาษา TH/EN ได้)
//  (2) ไม่มีคำว่า "กิจกรรม" ใน UI (AC-ACT-46)
// ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ในคอมเมนต์ด้วย (แดงตลอดกาลถ้าไม่ตัด)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../../..')
const FILES = [
  'src/app/(paces)/seller/_follow-up/FollowUpCard.tsx',
  'src/app/(paces)/seller/_follow-up/FollowUpForm.tsx',
  'src/app/(paces)/seller/_follow-up/follow-up-client.ts',
  'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/FollowUpPanel.tsx',
]

export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n')
}

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

  it('[blocker] ปุ่มพับของแผงไม่มี aria-label ทับข้อความที่เห็น ("ติดตามลูกค้า (n)" + ป้ายเลยกำหนด ต้องถูกอ่านจากข้อความ)', () => {
    const code = read(FILES[3]!)
    const btn = code.match(/<button\b[^>]*aria-expanded=\{expanded\}[^>]*>/)
    expect(btn).not.toBeNull()
    expect(btn![0]).not.toContain('aria-label')
  })
})
