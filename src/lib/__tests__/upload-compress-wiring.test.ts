/**
 * [blocker] การอัปโหลดทุกจุดต้องผ่านตัวกลางบีบรูป (2026-10-01)
 *
 * user สั่งเป็นกฎถาวร: "ถ้ามีการแก้เรื่องไฟล์อัพโหลดต้องมาใช้อันนี้ตัวกลาง"
 * spec: docs/superpowers/specs/2026-10-01-image-compress-upload-design.md
 *
 * 🛑 แดง = มีคนอ้อมตัวกลาง (ยิง ticket เอง / ตัดการบีบออกจาก uploadToStorage) หรือถอด opt-out
 * ของไฟล์ที่ต้องคงต้นฉบับทุกไบต์ (หลักฐาน · LINE rich menu) — ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_ROOT = join(process.cwd(), 'src')
const read = (rel: string) => readFileSync(join(SRC_ROOT, rel), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      walk(full, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('uploadToStorage เรียกตัวบีบก่อนขอ ticket', () => {
  it('prepareUploadFile ถูกเรียกก่อน fetch ticket และไฟล์ที่ส่งคือผลของมัน', () => {
    const src = read('lib/upload-client.ts')
    const prepareAt = src.indexOf('await prepareUploadFile(')
    const ticketAt = src.indexOf("fetch('/api/uploads/ticket'")
    expect(prepareAt).toBeGreaterThan(-1)
    expect(ticketAt).toBeGreaterThan(prepareAt)
    // ตัวแปรที่ถูก PUT ต้องเป็นผลของการบีบ ไม่ใช่ input ดิบ
    expect(src).toMatch(/const file = await prepareUploadFile\(input,/)
    expect(src).toMatch(/putWithProgress\(ticket, file, opts\)/)
  })
})

describe('ไม่มีใครยิง ticket/commit เองนอก upload-client', () => {
  it('fetch /api/uploads/ticket|commit มีที่ upload-client.ts ที่เดียว', () => {
    const offenders: string[] = []
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/')
      if (rel === 'lib/upload-client.ts' || rel.includes('__tests__')) continue
      const src = readFileSync(file, 'utf8')
      // จับ "การเรียก" เท่านั้น ไม่จับคอมเมนต์ที่พูดถึงชื่อ route (บทเรียน HR9)
      if (/fetch\(\s*['"`]\/api\/uploads\/(ticket|commit)['"`]/.test(src)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})

describe('ไฟล์ที่ต้องคงต้นฉบับทุกไบต์ ส่ง compress: off', () => {
  it('หลักฐานของผู้ตรวจ', () => {
    const src = read('app/(paces)/inspector/rounds/[id]/_components/EvidenceUploadButton.tsx')
    expect(src).toMatch(/uploadToStorage\(file, \{ purpose: PURPOSE_OF\[kind\], compress: 'off' \}\)/)
  })

  it('LINE rich menu ทั้ง 2 ทาง (AUTO render + ร้านอัปโหลดเอง) — ต้องได้ 2500×1686 พอดี', () => {
    const src = read(
      'app/(paces)/seller/(fullscreen)/settings/channels/line/[channelId]/rich-menu/RichMenuEditor.tsx',
    )
    const calls = src.match(/uploadToStorage\([^)]*\)/g) ?? []
    expect(calls.length).toBe(2)
    for (const c of calls) expect(c).toContain("compress: 'off'")
  })

  it('หลักฐานแจ้งมิจฉาชีพ = DOCUMENT (ไม่สร้าง variant ที่หลุดด่าน PDPA) + off', () => {
    const src = read('views/front-pages/scam-check/ReportForm.tsx')
    expect(src).toContain("uploadFileId(file, 'DOCUMENT', { compress: 'off' })")
    expect(src).not.toMatch(/uploadFileId\(file, 'IMAGE'/)
  })
})
