// parse/stringify CSV แบบ minimal RFC4180-lite (รองรับ quoted field ที่มี comma/newline/escaped-quote)
// ไม่เพิ่ม npm dependency — ใช้ทั้ง client (parseCsv สำหรับ import) และ server (stringifyCsv สำหรับ export)
// pure module (ไม่มี import ภายนอก) — client-safe ตาม memory feedback_verify_import_safety

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue } // escaped quote
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue } // normalize CRLF
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += ch; i++
  }
  // แถวสุดท้ายไม่มี trailing newline
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  // cap 501 แถว (500 data + 1 header) — ป้องกัน parse ไฟล์ใหญ่เกินจำเป็นฝั่ง client
  return rows.slice(0, 501)
}

export function stringifyCsv(rows: string[][]): string {
  const escapeField = (f: string): string => {
    if (/[",\n\r]/.test(f)) return `"${f.replace(/"/g, '""')}"`
    return f
  }
  const body = rows.map((r) => r.map(escapeField).join(',')).join('\r\n')
  // UTF-8 BOM นำหน้า — กัน Excel เปิดภาษาไทยเพี้ยน
  return '﻿' + body
}
