/**
 * commands.ts — แปลงข้อความในกลุ่มเป็นคำสั่ง (TFR-LGS-20) · pure
 * เทียบ "ทั้งข้อความ" หลัง NFKC + trim + ยุบช่องว่าง — "สรุปวันนี้ครับ" ไม่ใช่คำสั่ง (AC-22-6)
 * ค่าคงที่ผ่าน normalize เดียวกับ input (NFKC แตกสระ ำ ⇒ ถ้าไม่ normalize ทั้งสองฝั่งจะไม่เคยตรง)
 */

import { BIND_CODE_PATTERN, normalizeBindCode } from './bind-code'

export type GroupCommand = { type: 'BIND'; code: string } | { type: 'TODAY' } | { type: 'YESTERDAY' } | { type: 'MONTH' }

const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

const TODAY = normalize('สรุปวันนี้')
const YESTERDAY = normalize('สรุปเมื่อวาน')
const MONTH = normalize('สรุปเดือนนี้')
// ขีดได้ไม่เกิน 1 ตัว กลางโค้ด · ช่องว่างในโค้ดไม่รับ · ตรวจความถูกต้องจริงหลัง normalize
const BIND_RE = new RegExp(`^${normalize('ผูก')}\\s*([0-9A-Za-z]{4}-?[0-9A-Za-z]{4})$`)

export function parseGroupCommand(text: string): GroupCommand | null {
  const t = normalize(text)
  if (t === TODAY) return { type: 'TODAY' }
  if (t === YESTERDAY) return { type: 'YESTERDAY' }
  if (t === MONTH) return { type: 'MONTH' }
  const m = BIND_RE.exec(t)
  if (!m) return null
  const code = normalizeBindCode(m[1])
  return BIND_CODE_PATTERN.test(code) ? { type: 'BIND', code } : null
}
