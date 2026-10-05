/**
 * commands.ts — แปลงข้อความในกลุ่มเป็นคำสั่ง (TFR-LGS-20) · pure
 * เทียบ "ทั้งข้อความ" หลัง NFKC + trim + ยุบช่องว่าง — "สรุปวันนี้ครับ" ไม่ใช่คำสั่ง (AC-22-6)
 * ค่าคงที่ผ่าน normalize เดียวกับ input (NFKC แตกสระ ำ ⇒ ถ้าไม่ normalize ทั้งสองฝั่งจะไม่เคยตรง)
 */

export type GroupCommand = { type: 'BIND'; code: string } | { type: 'TODAY' } | { type: 'MONTH' }

const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

const TODAY = normalize('สรุปวันนี้')
const MONTH = normalize('สรุปเดือนนี้')
const BIND_RE = new RegExp(`^${normalize('ผูก')}\\s*(\\d{6})$`)

export function parseGroupCommand(text: string): GroupCommand | null {
  const t = normalize(text)
  if (t === TODAY) return { type: 'TODAY' }
  if (t === MONTH) return { type: 'MONTH' }
  const m = BIND_RE.exec(t)
  return m ? { type: 'BIND', code: m[1] } : null
}
