import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { sellerContactDisplay, sellerContactOrNull } from '../seller-contact-display'

describe('sellerContactDisplay — ผู้ขายเห็นข้อมูลติดต่อลูกค้าตัวเองเต็ม (D-13)', () => {
  it('[blocker] คืนเบอร์เต็ม ไม่ปิดบังสักตัว', () => {
    expect(sellerContactDisplay('0812345678')).toBe('0812345678')
    expect(sellerContactDisplay('081-234-5678')).toBe('081-234-5678')
  })

  it('[blocker] ห้ามมีอักขระปิดบังโผล่ในผลลัพธ์', () => {
    expect(sellerContactDisplay('0812345678')).not.toContain('•')
    expect(sellerContactDisplay('0812345678')).not.toContain('x')
  })

  it('ไม่มีข้อมูล → ข้อความแทนที่ผู้เรียกกำหนด', () => {
    expect(sellerContactDisplay(null)).toBe('—')
    expect(sellerContactDisplay('   ')).toBe('—')
    expect(sellerContactDisplay(undefined, 'ไม่ระบุ')).toBe('ไม่ระบุ')
    expect(sellerContactOrNull('')).toBeNull()
    expect(sellerContactOrNull(' 0899999999 ')).toBe('0899999999')
  })
})

/**
 * ด่านกันการถอดมาสก์ลามข้ามฝั่ง (D-13 · AC §3.9)
 *
 * 🛑 เทสฝั่ง "ผู้ขายเห็นเต็ม" อย่างเดียวไม่พอ — ถ้ามีแต่ AC ว่าผู้ขายเห็นเบอร์เต็ม
 * วันหนึ่งจะมีคนถอดมาสก์ของจอผู้ซื้อ/แอดมินตามไปด้วยโดยไม่มีอะไรจับ
 * (`docs/conventions/rule-must-be-enforced-not-described.md`)
 *
 * สแกนซอร์สเพราะรีโปนี้ไม่มี jsdom — ตรวจ "ยังมีการเรียกตัวปิดบังอยู่ไหม" ไม่ใช่แค่ชื่อไฟล์
 */
const read = (p: string) => readFileSync(p, 'utf8')

describe('ขอบเขตของ D-13 — จอที่ไม่ใช่ของผู้ขายต้องยังปิดบังอยู่', () => {
  it('[blocker] จอผู้ซื้อสาธารณะ /o/[token] ยังใช้ order-pii-mask อยู่', () => {
    const src = read('src/app/(marketing)/o/[token]/guest-order-data.ts')
    expect(src).toMatch(/from ['"]@\/lib\/order-pii-mask['"]/)
    expect(src).not.toMatch(/seller-contact-display/)
  })

  it('[blocker] หน้ารายการออเดอร์ของแอดมินยังปิดบังเบอร์ผู้ซื้อ', () => {
    const src = read('src/app/(paces)/admin/(dashboard)/orders/page.tsx')
    expect(src).toMatch(/buyerContactMasked/)
    expect(src).not.toMatch(/seller-contact-display/)
  })

  it('[blocker] ไม่มีไฟล์นอกฝั่งผู้ขายเรียก sellerContactDisplay', () => {
    // -l = รายชื่อไฟล์ · || true = grep คืน exit 1 เมื่อไม่เจอ ซึ่งเป็นผลลัพธ์ที่ถูกต้องของเทสนี้
    const out = execSync(
      `grep -rl "seller-contact-display" src --include=*.ts --include=*.tsx || true`,
      { encoding: 'utf8' },
    )
    const offenders = out
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.startsWith('src/lib/'))
      .filter((f) => !f.startsWith('src/app/(paces)/seller/'))
    expect(offenders).toEqual([])
  })
})

describe('ฝั่งผู้ขายต้องไม่เหลือตัวปิดบังที่เขียนมือ', () => {
  /**
   * 🛑 `/customers` **ไม่อยู่ในลิสต์นี้โดยเจตนา** (มติ Q18, 2026-08-24)
   *
   * feature 00057 แก้ปัญหาเดียวกัน ("ค้นเบอร์ไม่เจอเพราะเทียบกับค่าที่ปิดบัง") ด้วยวิธีที่
   * ตรงต้นเหตุกว่า: **ย้ายการค้นหาไปทำที่ server กับค่าเต็ม** แล้วคงการปิดบังไว้บนจอ
   * พร้อมปุ่มเปิดเบอร์ทีละแถวผ่าน `GET /api/seller/customers/[key]/contact`
   * ⇒ ได้ทั้งค้นเจอและไม่ต้องส่งเบอร์ของลูกค้าทุกคนในหน้าเข้า flight payload
   * (ภาพหน้าจอที่ผู้ขายส่งต่อกันจะไม่มีเบอร์ติดไปทั้งแผง)
   *
   * หน้านี้จึงยังใช้ `maskContact` จาก `@/lib/customer-directory` ต่อไป — ถูกแล้ว ห้ามเติมกลับ
   * เข้าลิสต์นี้ และถ้าจะขยายแนวทางของ 00057 ไปหน้าอื่น ให้ลบหน้านั้นออกจากลิสต์พร้อมกัน
   */
  const SELLER_FILES = [
    'src/app/(paces)/seller/(dashboard)/orders/page.tsx',
    'src/app/(paces)/seller/(dashboard)/dashboard/page.tsx',
    'src/app/(paces)/seller/(dashboard)/reviews/page.tsx',
    'src/app/(paces)/seller/(dashboard)/bookings/[token]/page.tsx',
    'src/app/(paces)/seller/(dashboard)/orders/new/components/CustomerSelectBlock.tsx',
    'src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx',
  ]

  it.each(SELLER_FILES)('[blocker] %s ไม่มีฟังก์ชันปิดบังของตัวเองแล้ว', (file) => {
    const src = read(file)
    // จับ "การประกาศฟังก์ชัน" ไม่ใช่แค่คำ — คอมเมนต์ที่อธิบายมติ D-13 พูดถึงคำเหล่านี้อยู่
    // (กับดักเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคำเตือนตัวเองเมื่อ 2026-08-02)
    expect(src).not.toMatch(/(function|const)\s+mask(Contact|Phone)\b/)
    // repeat('•') คือลายเซ็นของตัวปิดบังทุกสูตรที่เคยมีในไฟล์เหล่านี้
    expect(src).not.toMatch(/['"]•['"]\s*\)?\.repeat|\.repeat\(/)
  })
})
