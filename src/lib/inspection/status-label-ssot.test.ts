// [blocker] คำแปลสถานะผลตรวจมี SSOT เดียว (feature 00060 · HR16)
//
// 🛑 ก่อนหน้านี้ 5 ไฟล์ประกาศคำแปลของตัวเองซ้ำ แล้ว **คำเริ่มไม่ตรงกันจริง ๆ**:
//    "ไม่เกี่ยวข้อง" ในสามจอ vs "ไม่เกี่ยวข้องกับที่พักประเภทนี้" ในอีกสองจอ — ค่าเดียวกัน
//    คนละคำในจอที่ผู้ใช้เดินสลับไปมา และไม่มี tsc/eslint/detector ตัวไหนเห็น เพราะทุกสตริง
//    "ถูก" ในตัวเอง สิ่งที่ผิดคือมันควรเป็นคำเดียวกัน

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { API_DISPLAY_STATUS_LABEL_TH, DISPLAY_STATUS_LABEL_TH } from './result-status'

const SSOT = 'src/lib/inspection/result-status.ts'
const SCAN_DIRS = [
  'src/app/(paces)/inspector',
  'src/app/(paces)/seller/(dashboard)/inspection',
  'src/app/(paces)/admin/(dashboard)/inspection',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('[blocker] คำแปลสถานะผลตรวจมาจาก SSOT เดียว', () => {
  it('สองชุดคีย์ต้องแปลเป็นคำเดียวกัน (ต่างกันแค่ชื่อคีย์ RECHECK/RECHECK_DUE)', () => {
    expect(API_DISPLAY_STATUS_LABEL_TH.RECHECK_DUE).toBe(DISPLAY_STATUS_LABEL_TH.RECHECK)
    expect(API_DISPLAY_STATUS_LABEL_TH.PASS).toBe(DISPLAY_STATUS_LABEL_TH.PASS)
    expect(API_DISPLAY_STATUS_LABEL_TH.NOT_APPLICABLE).toBe(DISPLAY_STATUS_LABEL_TH.NOT_APPLICABLE)
  })

  it('🛑 mutation: พิมพ์คำแปลสถานะเองที่ component → เคสนี้ต้องแดง', () => {
    const words = Object.values(DISPLAY_STATUS_LABEL_TH)
    const offenders: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(process.cwd(), dir))) {
        const rel = relative(process.cwd(), file)
        if (rel === SSOT) continue
        const src = stripComments(readFileSync(file, 'utf8'))
        for (const w of words) {
          // 🛑 ต้องจับเฉพาะ **สตริงที่เป็นค่าทั้งก้อน** (`label: 'ผ่าน'`) ไม่ใช่คำที่ถูกอ้างอยู่กลาง
          //    ประโยค (`'ต้องแนบหลักฐานก่อนบันทึกผล "ผ่าน" ของบางข้อ'`) — ด่านรุ่นแรกจับแบบหลัง
          //    ด้วย แล้วแดงใส่ข้อความ error ที่เขียนถูกทุกอย่าง ซึ่งเป็นกับดักเดิมของรีโปนี้
          //    (ด่านที่จับคำเตือนของตัวเอง = ด่านที่แดงตลอดกาลจนคนเลิกเชื่อ)
          //    ⇒ บังคับว่าต้องอยู่ในตำแหน่ง "ค่า" คือตามหลัง : = ( , [ เท่านั้น
          if (new RegExp(`[:=(,\\[]\\s*['\`"]${w}['\`"]`).test(src)) offenders.push(`${rel}: "${w}"`)
        }
      }
    }
    expect(offenders, `ต้อง import จาก ${SSOT} แทน — พบที่:\n${offenders.join('\n')}`).toEqual([])
  })

  it('ตัวสแกนต้องจับได้จริง และต้องไม่จับคำที่ถูกอ้างกลางประโยค', () => {
    const w = DISPLAY_STATUS_LABEL_TH.PASS
    const re = new RegExp(`[:=(,\\[]\\s*['\`"]${w}['\`"]`)
    // ต้องจับ: ประกาศคำแปลเอง
    expect(re.test(`label: '${w}'`)).toBe(true)
    // ต้องไม่จับ: อ้างคำนั้นในข้อความที่เขียนถูกอยู่แล้ว
    expect(re.test(`setFormError('ต้องแนบหลักฐานก่อนบันทึกผล "${w}" ของบางข้อ')`)).toBe(false)
  })
})
