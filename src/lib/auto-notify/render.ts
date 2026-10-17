// feature 00078 — ตัวสร้างข้อความจากเทมเพลต (ตัวเดียวทั้งตัวส่งอัตโนมัติ/ปุ่มมือ/"ดูข้อความ" — HR16) · pure module
import { parseTemplate } from './variables'

export type RenderResult = { ok: true; text: string } | { ok: false; reason: 'EMPTY_MESSAGE' }

const isEmptyValue = (x: string | null | undefined): boolean => x == null || x.trim() === ''

/**
 * กติกา (PRD §3.4): ตัวแปรว่าง → หาย · บรรทัดที่มีตัวแปร ≥1 และ "ทุกตัว" ว่าง → ตัดทั้งบรรทัด
 * (บรรทัดข้อความล้วนอยู่) · บรรทัดว่างติดกันยุบเหลือหนึ่ง · trim หัวท้าย · ผลว่าง = EMPTY_MESSAGE
 * แทนค่าครั้งเดียว ไม่ recursive — ค่าที่มี `{..}` อยู่ในตัวไม่ถูกแทนซ้ำ
 */
export function renderTemplate(body: string, values: Record<string, string | null | undefined>): RenderResult {
  const kept: string[] = []
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const segs = parseTemplate(line)
    const vars = segs.filter((s) => s.type === 'var')
    if (vars.length > 0 && vars.every((s) => isEmptyValue(values[s.name]))) continue
    const text = segs.map((s) => (s.type === 'text' ? s.text : (values[s.name] ?? ''))).join('')
    const out = text.trim() === '' ? '' : text
    if (out === '' && kept[kept.length - 1] === '') continue
    kept.push(out)
  }
  const text = kept.join('\n').trim()
  return text === '' ? { ok: false, reason: 'EMPTY_MESSAGE' } : { ok: true, text }
}
