/**
 * [blocker] นโยบายอัปโหลด — เพดานขนาด/ชนิดไฟล์ต่อ purpose
 *
 * ที่มา (2026-08-10): ร้านแจ้งว่า "อัปโหลดคลิปเกิน 1 นาทีไม่ได้" ต้นเหตุจริงคือทุก upload
 * วิ่งผ่าน body ของ Vercel function ที่จำกัด 4.5MB ขณะที่โค้ดเราโฆษณา 5/10/25MB —
 * ไม่มีเทสไหน (และไม่มี gate ไหน) จับได้ เพราะทุกเลขในโค้ด "ถูก" ในตัวเอง มันแค่ไม่มีผลจริง
 *
 * 🛑 เทสนี้แดง = เพดานหรือ allow-list เคลื่อนโดยไม่มีใครตั้งใจ ห้าม merge:
 *   - ลด/เพิ่มเพดานของ purpose ต้องแก้เทสพร้อมกัน (เพดานคือสัญญากับผู้ใช้บนหน้าจอ)
 *   - เพดานใด ๆ ห้ามเกิน STORAGE_HARD_MAX เพราะ bucket ปฏิเสธเองด้วย 413 EntityTooLarge
 *     หลังผู้ใช้รออัปโหลดจนจบ (พิสูจน์กับ bucket จริง 2026-08-10)
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_RAW_IMAGE_INPUT,
  STORAGE_HARD_MAX,
  checkUploadPolicy,
  normalizeUploadExt,
  normalizeUploadMime,
  oversizeMessage,
  uploadMaxSize,
  type UploadPurpose,
} from '@/lib/upload-policy'

const MB = 1024 * 1024
const f = (name: string, size: number, mime: string) => ({ name, size, mime })

describe('uploadMaxSize', () => {
  it('CHAT = 25MB (เพดานของ Meta Send API และของ bucket)', () => {
    expect(uploadMaxSize('CHAT')).toBe(25 * MB)
  })

  it('IMAGE/DOCUMENT = 10MB (เท่าที่ฝั่ง client ประกาศกับผู้ใช้อยู่แล้ว)', () => {
    expect(uploadMaxSize('IMAGE')).toBe(10 * MB)
    expect(uploadMaxSize('DOCUMENT')).toBe(10 * MB)
  })

  it('ไม่มี purpose ไหนเกินเพดานของ bucket', () => {
    for (const p of ['CHAT', 'IMAGE', 'DOCUMENT'] as UploadPurpose[]) {
      expect(uploadMaxSize(p)).toBeLessThanOrEqual(STORAGE_HARD_MAX)
    }
  })
})

describe('checkUploadPolicy — ขนาด', () => {
  it('ผ่านที่เพดานพอดี และตกเมื่อเกิน 1 ไบต์', () => {
    expect(checkUploadPolicy('IMAGE', f('a.jpg', 10 * MB, 'image/jpeg')).ok).toBe(true)
    const over = checkUploadPolicy('IMAGE', f('a.jpg', 10 * MB + 1, 'image/jpeg'))
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.reason).toContain('ใหญ่เกิน')
  })

  it('ไฟล์ว่างเปล่าไม่ผ่าน (0 ไบต์ = ผู้ใช้เลือกไฟล์ที่เขียนไม่สำเร็จ)', () => {
    expect(checkUploadPolicy('CHAT', f('a.jpg', 0, 'image/jpeg')).ok).toBe(false)
  })

  it('คลิป 1 นาทีจาก iPhone (~60MB) ไม่ผ่านทุก purpose', () => {
    for (const p of ['CHAT', 'IMAGE', 'DOCUMENT'] as UploadPurpose[]) {
      expect(checkUploadPolicy(p, f('IMG_0001.mov', 60 * MB, 'video/quicktime')).ok).toBe(false)
    }
  })
})

describe('checkUploadPolicy — ชนิดไฟล์', () => {
  it('CHAT ใช้ deny-list: pdf/zip ผ่าน แต่ไฟล์รันได้ไม่ผ่าน', () => {
    expect(checkUploadPolicy('CHAT', f('a.pdf', 1 * MB, 'application/pdf')).ok).toBe(true)
    expect(checkUploadPolicy('CHAT', f('a.zip', 1 * MB, 'application/zip')).ok).toBe(true)
    expect(checkUploadPolicy('CHAT', f('a.exe', 1 * MB, 'application/octet-stream')).ok).toBe(false)
    // svg = stored XSS ถ้าเสิร์ฟ inline — อยู่ใน deny-list ตั้งแต่ 2026-08-02
    expect(checkUploadPolicy('CHAT', f('a.svg', 1024, 'image/svg+xml')).ok).toBe(false)
  })

  it('IMAGE รับ jpg/png/webp/gif (gif ต้องผ่าน — QuickMessageManager โฆษณาไว้)', () => {
    for (const [name, mime] of [
      ['a.jpg', 'image/jpeg'],
      ['a.jpeg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.webp', 'image/webp'],
      ['a.gif', 'image/gif'],
    ]) {
      expect(checkUploadPolicy('IMAGE', f(name, 1 * MB, mime)).ok).toBe(true)
    }
  })

  it('IMAGE ไม่รับ pdf แต่ DOCUMENT รับ (L3 ทะเบียนธุรกิจ/สลิป — PRD FR-2.5)', () => {
    expect(checkUploadPolicy('IMAGE', f('a.pdf', 1 * MB, 'application/pdf')).ok).toBe(false)
    expect(checkUploadPolicy('DOCUMENT', f('a.pdf', 1 * MB, 'application/pdf')).ok).toBe(true)
  })

  it('mime กับ ext ต้องสอดคล้องกัน — ปลอมอย่างใดอย่างหนึ่งไม่ผ่าน', () => {
    // /api/files derive Content-Type จาก ext ไม่ใช่ค่าที่ storage เก็บ → คู่ที่ไม่ตรงกันคือของปลอม
    expect(checkUploadPolicy('IMAGE', f('a.exe', 1 * MB, 'image/png')).ok).toBe(false)
    expect(checkUploadPolicy('IMAGE', f('a.png', 1 * MB, 'application/x-msdownload')).ok).toBe(false)
  })

  it('HEIC จาก iPhone ไม่ผ่าน purpose IMAGE (parity กับ allow-list เดิมของ storage)', () => {
    expect(checkUploadPolicy('IMAGE', f('IMG_1.heic', 1 * MB, 'image/heic')).ok).toBe(false)
  })
})

describe('oversizeMessage', () => {
  it('วิดีโอได้คำแนะนำวิธีย่อ ไฟล์อื่นไม่ได้ (คลิปคือชนิดที่ผู้ใช้ลดขนาดเองได้)', () => {
    const video = oversizeMessage({ kind: 'VIDEO', size: 60 * MB, maxSize: 25 * MB })
    expect(video).toContain('720p')
    expect(video).toContain('60MB')
    expect(video).toContain('25MB')

    const file = oversizeMessage({ kind: 'FILE', size: 60 * MB, maxSize: 25 * MB })
    expect(file).not.toContain('720p')
  })

  it('ข้อความบอกทั้งขนาดไฟล์จริงและเพดาน — ตัวเลขเดียวไม่พอให้ผู้ใช้ตัดสินใจ', () => {
    const msg = oversizeMessage({ kind: 'IMAGE', size: 12.5 * MB, maxSize: 10 * MB })
    expect(msg).toMatch(/13|12\.5/)
    expect(msg).toContain('10MB')
  })
})

// ── .jfif / .jpe (2026-10-01) ─────────────────────────────────────────────
// ผู้ขายลากรูป .jfif (JPEG ที่ Windows/Chrome ตั้งชื่อตอน "บันทึกรูปจากเว็บ") แล้วโดนปฏิเสธทุกใบ
// เพราะ mime ผ่าน (image/jpeg) แต่ ext ไม่อยู่ใน allow-list — มันคือ JPEG ทุกไบต์ จึงรับเป็น jpg
describe('normalizeUploadExt / normalizeUploadMime', () => {
  it('ชื่อเรียกอื่นของ JPEG → jpg', () => {
    for (const e of ['jfif', 'JFIF', 'jpe', 'pjpeg', 'pjp']) expect(normalizeUploadExt(e)).toBe('jpg')
  })
  it('ext อื่นไม่ถูกแตะ', () => {
    for (const e of ['jpg', 'jpeg', 'png', 'pdf', 'mp4', '']) expect(normalizeUploadExt(e)).toBe(e)
  })
  it('mime แปลกของ JPEG → image/jpeg', () => {
    expect(normalizeUploadMime('image/pjpeg', 'jpg')).toBe('image/jpeg')
    expect(normalizeUploadMime('image/jpg', 'jpg')).toBe('image/jpeg')
    expect(normalizeUploadMime('IMAGE/JPEG', 'jpg')).toBe('image/jpeg')
  })
  it('mime ว่าง + ext เป็น JPEG → image/jpeg · ext อื่นคงว่าง', () => {
    expect(normalizeUploadMime('', 'jfif')).toBe('image/jpeg')
    expect(normalizeUploadMime('', 'png')).toBe('')
  })
})

describe('checkUploadPolicy รับ .jfif', () => {
  it('IMAGE/DOCUMENT/CHAT รับ .jfif (image/jpeg)', () => {
    for (const p of ['IMAGE', 'DOCUMENT', 'CHAT'] as UploadPurpose[]) {
      expect(checkUploadPolicy(p, f('photo.jfif', 2 * MB, 'image/jpeg'))).toEqual({ ok: true })
    }
  })
  it('.jfif ที่ mime ว่าง (บาง OS ไม่รู้จัก) ก็ผ่าน', () => {
    expect(checkUploadPolicy('IMAGE', f('photo.jfif', 2 * MB, ''))).toEqual({ ok: true })
  })
  it('ปลอม ext เป็น jfif แต่ mime ไม่ใช่รูป → ไม่ผ่าน', () => {
    expect(checkUploadPolicy('IMAGE', f('x.jfif', 1000, 'application/pdf')).ok).toBe(false)
  })
})

describe('MAX_RAW_IMAGE_INPUT', () => {
  it('เพดานก่อนบีบ = 40MB (ใหญ่กว่าเพดาน server เพราะตัวบีบย่อให้ก่อนส่ง)', () => {
    expect(MAX_RAW_IMAGE_INPUT).toBe(40 * MB)
    expect(MAX_RAW_IMAGE_INPUT).toBeGreaterThan(uploadMaxSize('IMAGE'))
  })
})
