import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] feature 00054 — ด่านความปลอดภัยของรูปย่อ (TC-C1, TC-C2, TC-C3)
 *
 * ความเสี่ยงหลักข้อเดียวของฟีเจอร์นี้:
 * ด่านสิทธิ์ทั้ง 5 ชั้นใน `/api/files/[...fileId]` (KYC · สลิปเติมเงิน · สลิปออเดอร์ · หลักฐาน
 * มิจฉาชีพ · เอกสารแนบแชท) ตรวจจาก **คีย์ต้นฉบับ** เท่านั้น ⇒ คีย์ของ variant ไม่ตรงกับค่าใด
 * ในฐานข้อมูล จึงเดินผ่านทุกด่านและถูกเสิร์ฟเป็นไฟล์สาธารณะ
 * **สร้าง variant ให้เอกสาร KYC หนึ่งครั้ง = เปิดเอกสารนั้นให้ใครก็ได้ที่เดาคีย์ถูก ถาวร**
 *
 * ไม่มี gate อื่นในโปรเจกต์จับได้เลย — `tsc`/build/eslint ผ่านหมดเพราะการเรียกฟังก์ชันด้วย
 * เงื่อนไขที่กว้างไปคือโค้ดที่ถูกต้องทุกตัวอักษร
 *
 * ตัดคอมเมนต์ก่อนสแกน: ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย
 * (บทเรียน grep gate ของ HR9 ที่แดงค้างจากคำเตือนของตัวเอง 2026-08-02→03)
 */

function code(rel: string): string {
  const src = readFileSync(join(process.cwd(), rel), 'utf8')
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const COMMIT = 'src/app/api/uploads/commit/route.ts'
const BACKFILL = 'scripts/backfill-image-variants.ts'
const SERVICE = 'src/services/image-variant.service.ts'

describe('[blocker] สร้าง variant เฉพาะรูปสาธารณะ', () => {
  it('จุดเรียกใน commit ต้องกั้นด้วย purpose === "IMAGE" (allow-list) ไม่ใช่ deny-list', () => {
    const src = code(COMMIT)
    expect(src).toContain('generateImageVariants')
    // ต้องมีการเทียบเท่ากับ "IMAGE" ตรงตัวในบรรทัดที่กั้นการเรียก
    expect(src).toMatch(/claim\.purpose === "IMAGE"[\s\S]{0,200}generateImageVariants/)
    // ห้ามกั้นด้วยการ "ยกเว้นบางอัน" — เพิ่ม purpose ใหม่วันหลังแล้วลืม = เอกสารหลุดทันที
    expect(src).not.toMatch(/purpose !== ["'](DOCUMENT|CHAT)["'][\s\S]{0,200}generateImageVariants/)
  })

  it('เรียกครั้งเดียวเท่านั้นในทั้งไฟล์ (กันมีใครแอบเรียกเพิ่มในสาขาอื่น)', () => {
    const calls = code(COMMIT).match(/generateImageVariants\(/g) ?? []
    expect(calls).toHaveLength(1)
  })

  it('backfill ต้องไม่แตะคอลัมน์ของไฟล์ที่มีด่านสิทธิ์', () => {
    const src = code(BACKFILL)
    for (const forbidden of [
      'documents',
      'slipFileId',
      'evidence',
      'chatMessage',
      'verificationRecord',
      'topUpRequest',
      'scamReport',
    ]) {
      expect(src.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
  })

  it('backfill อ่านเฉพาะคอลัมน์รูปสาธารณะที่ประกาศไว้', () => {
    const src = code(BACKFILL)
    expect(src).toContain('prisma.product.findMany')
    expect(src).toContain('prisma.room.findMany')
    expect(src).toContain('prisma.shop.findMany')
    expect(src).toContain('prisma.user.findMany')
  })
})

describe('[blocker] ห้ามลบหรือเขียนทับไฟล์ต้นฉบับ', () => {
  /**
   * กฎถาวรของ user (2026-08-21): ห้ามลบอะไรโดยไม่บอกก่อน **รวมสคริปต์ที่มีการลบซ่อนอยู่**
   * feature นี้ประกาศเองในเอกสารว่า "ไฟล์ต้นฉบับไม่ถูกแตะแม้แต่ไบต์เดียว" — ประโยคนั้นต้องมี
   * ด่านบังคับ ไม่ใช่แค่คำสัญญาในคอมเมนต์
   * (docs/conventions/rule-must-be-enforced-not-described.md)
   */
  const DELETE_PATTERNS = [
    'deleteFile',
    'DeleteObject',
    'unlink(',
    'rmSync',
    'rm -rf',
    '.delete(',
    'deleteMany',
  ]

  it('สคริปต์ backfill ไม่มีคำสั่งลบใด ๆ', () => {
    const src = code(BACKFILL)
    for (const pattern of DELETE_PATTERNS) {
      expect(src).not.toContain(pattern)
    }
  })

  it('service ที่สร้าง variant ไม่มีคำสั่งลบใด ๆ', () => {
    const src = code(SERVICE)
    for (const pattern of DELETE_PATTERNS) {
      expect(src).not.toContain(pattern)
    }
  })

  it('service เขียนเฉพาะคีย์ของ variant — ห้ามเขียนที่คีย์ต้นฉบับ', () => {
    const src = code(SERVICE)
    // saveFileAtKey ต้องรับค่าที่ผ่าน variantKey() เสมอ ไม่ใช่ fileKey ดิบ
    expect(src).toMatch(/saveFileAtKey\(\s*variantKey\(/)
    expect(src).not.toMatch(/saveFileAtKey\(\s*fileKey/)
  })

  it('backfill ตั้งต้นเป็น dry-run — ต้องส่ง --apply ถึงจะเขียนจริง', () => {
    const src = code(BACKFILL)
    expect(src).toContain("process.argv.includes('--apply')")
    // เส้นทางเขียนจริงต้องอยู่หลังการเช็ค APPLY
    expect(src).toMatch(/if \(!APPLY\)[\s\S]*return[\s\S]*generateImageVariants/)
  })
})

describe('[blocker] ไฟล์ที่เบราว์เซอร์ใช้ต้องไม่ลาก sharp เข้ามา', () => {
  /**
   * `file-url.ts` ถูก import จาก client component (การ์ดสินค้า/ห้องพัก) และมันเรียก
   * `variantKey()` — ถ้าไฟล์ที่ประกาศ `variantKey` ดันมี `import sharp` อยู่ด้วย bundle ฝั่ง
   * เบราว์เซอร์จะพังทั้งก้อน (sharp เป็น native module) นี่คือเหตุผลที่ตัวสร้างรูปถูกแยกไป
   * `image-variants.server.ts`
   */
  it('image-variants.ts (ฝั่งเบราว์เซอร์) ต้องไม่ import sharp', () => {
    expect(code('src/lib/image-variants.ts')).not.toContain("from 'sharp'")
  })

  it('file-url.ts ต้องไม่ import ตัวสร้างรูปฝั่ง server', () => {
    expect(code('src/lib/file-url.ts')).not.toContain('image-variants.server')
  })
})
