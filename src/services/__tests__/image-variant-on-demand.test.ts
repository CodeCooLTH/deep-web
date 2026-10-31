/**
 * [blocker] 00088 — รูปย่อสด `?variant=` ของ `/api/files` (แชท native ใช้แทนการโหลดรูปเต็ม)
 *
 * ความเสี่ยงเดียวที่ต้องกัน: ย่อแล้ว "เก็บ" ลง storage = เกิดคีย์ variant ที่ไม่มีด่านสิทธิ์
 * (ด่านทั้ง 5 ชั้นตรวจจากคีย์ต้นฉบับ) ⇒ สลิป/เอกสารส่วนตัวกลายเป็นสาธารณะถาวร (ดู image-variants.guards.test.ts)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = vi.hoisted(() => ({ getFile: vi.fn(), getFileMeta: vi.fn(), saveFileAtKey: vi.fn() }))
vi.mock('@/lib/storage', () => st)
const build = vi.hoisted(() => vi.fn())
vi.mock('@/lib/image-variants.server', () => ({ buildImageVariant: build }))

import { parseVariantParam } from '@/lib/image-variants'
import { readImageVariant } from '@/services/image-variant.service'

beforeEach(() => {
  st.getFile.mockReset()
  st.saveFileAtKey.mockReset()
  build.mockReset()
})

describe('parseVariantParam', () => {
  it('รับเฉพาะขนาดที่ประกาศไว้ กับนามสกุลที่ย่อได้', () => {
    expect(parseVariantParam('thumb', 'jpg')).toBe('thumb')
    expect(parseVariantParam('lg', 'webp')).toBe('lg')
    expect(parseVariantParam('huge', 'jpg')).toBeNull()
    expect(parseVariantParam('constructor', 'jpg')).toBeNull()
    expect(parseVariantParam(null, 'jpg')).toBeNull()
  })
  it('gif/pdf = ไม่ย่อ (ภาพเคลื่อนไหวหาย / ไม่ใช่รูป)', () => {
    expect(parseVariantParam('thumb', 'gif')).toBeNull()
    expect(parseVariantParam('thumb', 'pdf')).toBeNull()
  })
})

describe('[blocker] readImageVariant — ย่อสดแต่ไม่เก็บ', () => {
  it('มี variant ที่สร้างตอนอัปโหลดแล้ว → ใช้ไฟล์นั้น ไม่ย่อซ้ำ', async () => {
    st.getFile.mockImplementation(async (k: string) => (k === '2026/10/31/a.thumb.webp' ? { buffer: Buffer.from('v') } : null))
    expect(String(await readImageVariant('2026/10/31/a.jpg', 'thumb'))).toBe('v')
    expect(build).not.toHaveBeenCalled()
  })
  it('ไม่มี → ย่อจากต้นฉบับ และไม่เขียนอะไรลง storage', async () => {
    st.getFile.mockImplementation(async (k: string) => (k === 'slip/b.png' ? { buffer: Buffer.from('orig') } : null))
    build.mockResolvedValue(Buffer.from('small'))
    expect(String(await readImageVariant('slip/b.png', 'thumb'))).toBe('small')
    expect(st.saveFileAtKey).not.toHaveBeenCalled()
  })
  it('ย่อไม่ได้/ไม่มีต้นฉบับ/นามสกุลย่อไม่ได้ = null (ผู้เรียกเสิร์ฟต้นฉบับ)', async () => {
    st.getFile.mockResolvedValue(null)
    expect(await readImageVariant('x.jpg', 'thumb')).toBeNull()
    expect(await readImageVariant('x.gif', 'thumb')).toBeNull()
    st.getFile.mockImplementation(async (k: string) => (k === 'y.jpg' ? { buffer: Buffer.from('o') } : null))
    build.mockResolvedValue(null)
    expect(await readImageVariant('y.jpg', 'lg')).toBeNull()
  })
  it('ซอร์สของ readImageVariant ไม่มีคำสั่งเขียน/ลบ storage', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/image-variant.service.ts'), 'utf8')
    const body = src.slice(src.indexOf('export async function readImageVariant'))
    expect(body).not.toMatch(/saveFile|deleteFile|putObject/)
  })
})

describe('[blocker] /api/files เสิร์ฟรูปย่อหลังด่านสิทธิ์ทุกชั้นเท่านั้น', () => {
  it('จุดอ่าน ?variant= อยู่หลังด่านสุดท้าย (เอกสารแนบแชท) และหลังคำนวณ isSensitive', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/files/[...fileId]/route.ts'), 'utf8')
    const at = src.indexOf('parseVariantParam(request')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeGreaterThan(src.lastIndexOf('return forbiddenRoleResponse()'))
    expect(at).toBeGreaterThan(src.indexOf('const isSensitive ='))
    // ต้องใช้ Cache-Control ชุดเดียวกับต้นฉบับ (สลิป = private)
    expect(src.slice(at, at + 900)).toContain('...baseHeaders')
  })
})
