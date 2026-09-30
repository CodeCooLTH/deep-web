/**
 * [blocker] ตัวกลางบีบรูปก่อนอัปโหลด (2026-10-01) — spec: docs/superpowers/specs/2026-10-01-image-compress-upload-design.md
 *
 * 🛑 สัญญาที่ห้ามหลุด:
 *   - การอัปโหลดห้ามพังเพราะการบีบ — ทุก error ต้องได้ไฟล์เดิม (ที่ normalize ชื่อแล้ว) กลับมา
 *   - ไฟล์ที่บีบแล้วไม่เล็กกว่าเดิม ให้ใช้ไฟล์เดิม
 *   - gif/pdf/วิดีโอ/ไฟล์อื่นไม่ถูกแตะเด็ดขาด (gif = ภาพเคลื่อนไหวหาย)
 *   - .jfif ต้องกลายเป็น .jpg ทุกกรณี แม้ profile = off
 *
 * ส่วนที่ต้องใช้ canvas จริง (decode/encode) ทดสอบบนเบราว์เซอร์จริงตาม manual matrix ใน spec —
 * ที่นี่ฉีด encoder ปลอมเข้าไปทดสอบตรรกะรอบนอกทั้งหมด
 */

import { describe, it, expect } from 'vitest'
import {
  COMPRESS_PROFILES,
  defaultCompressProfile,
  fitInside,
  normalizeUploadFile,
  pickSizeError,
  pickSizeLimit,
  prepareUploadFile,
  prepareUploadFileWith,
  replaceExt,
  shouldAttemptCompression,
  type Encoder,
} from '@/lib/image-compress'

const KB = 1024
const MB = 1024 * KB
const fileOf = (name: string, size: number, type: string) =>
  new File([new Uint8Array(size)], name, { type, lastModified: 1 })

describe('defaultCompressProfile', () => {
  it('IMAGE/CHAT = standard · DOCUMENT = document', () => {
    expect(defaultCompressProfile('IMAGE')).toBe('standard')
    expect(defaultCompressProfile('CHAT')).toBe('standard')
    expect(defaultCompressProfile('DOCUMENT')).toBe('document')
  })
})

describe('COMPRESS_PROFILES', () => {
  it('ตัวเลขตาม spec', () => {
    expect(COMPRESS_PROFILES.standard).toEqual({ maxEdge: 2048, quality: 0.85, minBytes: 300 * KB })
    expect(COMPRESS_PROFILES.document).toEqual({ maxEdge: 3000, quality: 0.92, minBytes: 1.5 * MB })
  })
})

describe('replaceExt', () => {
  it('แทนเฉพาะนามสกุลสุดท้าย', () => {
    expect(replaceExt('a.b.png', 'jpg')).toBe('a.b.jpg')
    expect(replaceExt('รูป.JFIF', 'jpg')).toBe('รูป.jpg')
  })
  it('ไม่มีนามสกุล → เติมให้', () => {
    expect(replaceExt('photo', 'jpg')).toBe('photo.jpg')
  })
})

describe('normalizeUploadFile', () => {
  it('.jfif → .jpg + image/jpeg (เนื้อไฟล์เดิม)', () => {
    const out = normalizeUploadFile(fileOf('cat.jfif', 10, 'image/jpeg'))
    expect(out.name).toBe('cat.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(out.size).toBe(10)
  })
  it('.jfif ที่ mime ว่าง → image/jpeg', () => {
    expect(normalizeUploadFile(fileOf('cat.jfif', 10, '')).type).toBe('image/jpeg')
  })
  it('ไฟล์ปกติคืน object เดิม (ไม่สร้างใหม่เปล่า ๆ)', () => {
    const f = fileOf('cat.png', 10, 'image/png')
    expect(normalizeUploadFile(f)).toBe(f)
  })
})

describe('shouldAttemptCompression', () => {
  it('off ไม่บีบ', () => {
    expect(shouldAttemptCompression(fileOf('a.jpg', 5 * MB, 'image/jpeg'), 'off')).toBe(false)
  })
  it('gif/pdf/วิดีโอ/ไฟล์อื่น ไม่บีบ', () => {
    for (const [n, t] of [
      ['a.gif', 'image/gif'],
      ['a.pdf', 'application/pdf'],
      ['a.mp4', 'video/mp4'],
      ['a.heic', 'image/heic'],
      ['a.zip', 'application/zip'],
    ]) {
      expect(shouldAttemptCompression(fileOf(n, 5 * MB, t), 'standard'), n).toBe(false)
    }
  })
  it('jpeg/png/webp ที่ใหญ่พอ → บีบ', () => {
    for (const [n, t] of [
      ['a.jpg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.webp', 'image/webp'],
    ]) {
      expect(shouldAttemptCompression(fileOf(n, 400 * KB, t), 'standard'), n).toBe(true)
    }
  })
  it('standard ข้ามไฟล์ < 300KB', () => {
    expect(shouldAttemptCompression(fileOf('a.jpg', 299 * KB, 'image/jpeg'), 'standard')).toBe(false)
  })
  it('document ข้ามไฟล์ < 1.5MB (ภาพหน้าจอสลิปผ่านไปตามเดิม)', () => {
    expect(shouldAttemptCompression(fileOf('slip.png', 1 * MB, 'image/png'), 'document')).toBe(false)
    expect(shouldAttemptCompression(fileOf('id.jpg', 4 * MB, 'image/jpeg'), 'document')).toBe(true)
  })
})

describe('fitInside', () => {
  it('ย่อด้านยาวให้เท่าเพดาน รักษาสัดส่วน', () => {
    expect(fitInside(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitInside(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 })
  })
  it('รูปเล็กกว่าเพดานไม่ขยาย', () => {
    expect(fitInside(1000, 800, 2048)).toEqual({ width: 1000, height: 800 })
  })
  it('รูปยาวมากไม่เหลือ 0px', () => {
    expect(fitInside(100000, 10, 2048).height).toBeGreaterThanOrEqual(1)
  })
})

describe('prepareUploadFileWith', () => {
  const big = () => fileOf('photo.jpg', 2 * MB, 'image/jpeg')

  it('ผลที่บีบเล็กกว่า → ใช้ผลที่บีบ', async () => {
    const small = fileOf('photo.jpg', 300 * KB, 'image/jpeg')
    const out = await prepareUploadFileWith(big(), 'standard', async () => small)
    expect(out).toBe(small)
  })

  it('ผลที่บีบไม่เล็กกว่า → ใช้ไฟล์เดิม', async () => {
    const src = big()
    const out = await prepareUploadFileWith(src, 'standard', async () => fileOf('photo.jpg', 3 * MB, 'image/jpeg'))
    expect(out).toBe(src)
  })

  it('encoder โยน error → ไฟล์เดิม ไม่ throw', async () => {
    const src = big()
    const out = await prepareUploadFileWith(src, 'standard', async () => {
      throw new Error('OOM')
    })
    expect(out).toBe(src)
  })

  it('encoder คืน null → ไฟล์เดิม', async () => {
    const src = big()
    expect(await prepareUploadFileWith(src, 'standard', async () => null)).toBe(src)
  })

  it('.jfif ที่บีบไม่สำเร็จ ยังได้ชื่อ .jpg', async () => {
    const out = await prepareUploadFileWith(fileOf('a.jfif', 2 * MB, 'image/jpeg'), 'standard', async () => null)
    expect(out.name).toBe('a.jpg')
  })

  it('off ไม่เรียก encoder เลย แต่ยังแก้ .jfif', async () => {
    let called = false
    const out = await prepareUploadFileWith(fileOf('a.jfif', 2 * MB, 'image/jpeg'), 'off', async () => {
      called = true
      return null
    })
    expect(called).toBe(false)
    expect(out.name).toBe('a.jpg')
  })

  it('encoder ได้ spec ของ profile', async () => {
    let got: unknown
    await prepareUploadFileWith(fileOf('id.jpg', 4 * MB, 'image/jpeg'), 'document', async (_f, spec) => {
      got = spec
      return null
    })
    expect(got).toEqual(COMPRESS_PROFILES.document)
  })

  it('บีบพร้อมกันได้ไม่เกิน 2 ไฟล์ (กัน WebView แอปผู้ขาย OOM ตอนลาก 10 รูป)', async () => {
    let running = 0
    let peak = 0
    const encoder: Encoder = async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return null
    }
    await Promise.all(Array.from({ length: 8 }, () => prepareUploadFileWith(big(), 'standard', encoder)))
    expect(peak).toBe(2)
  })
})

describe('prepareUploadFile (ไม่มี DOM — เช่น SSR/เทส)', () => {
  it('ไม่ throw และคืนไฟล์เดิม', async () => {
    const src = fileOf('photo.jpg', 2 * MB, 'image/jpeg')
    expect(await prepareUploadFile(src, 'standard')).toBe(src)
  })
})

describe('pickSizeLimit / pickSizeError — เพดานของไฟล์ที่ผู้ใช้เลือก (ก่อนบีบ)', () => {
  it('รูปที่ตัวบีบย่อได้ = 40MB ทุก purpose', () => {
    for (const p of ['IMAGE', 'DOCUMENT', 'CHAT'] as const) {
      expect(pickSizeLimit(fileOf('a.jpg', 1, 'image/jpeg'), p)).toBe(40 * MB)
    }
    expect(pickSizeLimit(fileOf('a.jfif', 1, ''), 'IMAGE')).toBe(40 * MB)
  })
  it('ไฟล์ที่ไม่ถูกบีบ (pdf/gif) = เพดานของ purpose', () => {
    expect(pickSizeLimit(fileOf('a.pdf', 1, 'application/pdf'), 'DOCUMENT')).toBe(10 * MB)
    expect(pickSizeLimit(fileOf('a.gif', 1, 'image/gif'), 'IMAGE')).toBe(10 * MB)
  })
  it('compress off = เพดานของ purpose แม้เป็นรูป', () => {
    expect(pickSizeLimit(fileOf('a.jpg', 1, 'image/jpeg'), 'IMAGE', 'off')).toBe(10 * MB)
  })
  it('ข้อความบอกเพดานจริง · ไม่เกิน = null', () => {
    expect(pickSizeError(fileOf('a.jpg', 12 * MB, 'image/jpeg'), 'IMAGE')).toBeNull()
    expect(pickSizeError(fileOf('a.pdf', 12 * MB, 'application/pdf'), 'DOCUMENT')).toBe(
      'ไฟล์ใหญ่เกินไป (สูงสุด 10 MB)',
    )
    expect(pickSizeError(fileOf('a.jpg', 41 * MB, 'image/jpeg'), 'IMAGE', 'off', 'รูป')).toBe(
      'รูปใหญ่เกินไป (สูงสุด 10 MB)',
    )
  })
})
