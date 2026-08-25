/**
 * ประโยค "ยังบอกอัตราไม่ได้" ต้องมาจากที่เดียว (HR16)
 *
 * เดิมเขียนกระจาย 2 ที่คนละคำ — `CustomerTrustBar` ว่า "ยังบอกอัตราไม่ได้" ส่วนหน้าโปรไฟล์
 * ว่า "ยังบอกไม่ได้" ทั้งที่เกณฑ์เดียวกันเป๊ะ (`shipped < MIN_SHIPPED_FOR_RATE`)
 * ไม่มี gate ไหนของโปรเจกต์จับได้เลยเพราะทั้งคู่เป็นสตริงที่ "ถูก" ในตัวเอง
 *
 * mutation ที่พิสูจน์แล้วว่าแดง (2026-08-25):
 *   1. เปลี่ยน `rateUnavailableText()` กลับเป็นสตริงดิบใน `CustomerTrustBar` → แดง
 *   2. ถอด `${MIN_SHIPPED_FOR_RATE}` ออกจากประโยค (ทำให้เลขไม่ตามค่าคงที่) → แดง
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIN_SHIPPED_FOR_RATE, rateUnavailableText } from '@/lib/buyer-reputation'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SURFACES = [
  'src/components/safepay/CustomerTrustBar.tsx',
  'src/app/(paces)/seller/(dashboard)/customers/[id]/components/CustomerProfileHeader.tsx',
]

describe('ประโยค "ยังบอกอัตราไม่ได้"', () => {
  it('[blocker] ทุก surface ต้องเรียก rateUnavailableText() ห้ามพิมพ์คำเอง', () => {
    for (const p of SURFACES) {
      const src = stripComments(read(p))
      expect(src, `${p}: ต้อง *เรียก* ไม่ใช่แค่ import`).toContain('rateUnavailableText()')
      expect(src, `${p}: ห้ามพิมพ์สตริงเอง`).not.toMatch(/['"`]ยังบอก[^'"`]*ไม่ได้['"`]/)
    }
  })

  it('[blocker] ประโยคต้องบอกเกณฑ์ที่ทำให้มันหายไป และเลขต้องมาจากค่าคงที่จริง', () => {
    const text = rateUnavailableText()
    // ถ้าไม่บอกจำนวน ผู้ขายไม่มีทางรู้ว่าต้องทำอะไรถึงจะเห็นอัตรา
    expect(text).toContain(String(MIN_SHIPPED_FOR_RATE))
    // และเลขต้อง derive จริง ไม่ใช่ hardcode ที่บังเอิญตรงวันนี้
    const src = stripComments(read('src/lib/buyer-reputation.ts'))
    expect(src).toMatch(/rateUnavailableText[\s\S]{0,200}\$\{MIN_SHIPPED_FOR_RATE\}/)
  })
})
