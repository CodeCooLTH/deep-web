// feature 00078 — โมเดลชิ้นส่วนของตัวแก้ข้อความ (ชิปตัวแปรในเนื้อความ) ↔ ข้อความ `{ชื่อ}` · pure, round-trip ได้
// DOM (contenteditable) ↔ โมเดล เป็นงานของคอมโพเนนต์: <br> = '\n', ชิป = {type:'var'}
import { parseTemplate } from './variables'

export type EditorPart = { type: 'text'; text: string } | { type: 'var'; name: string }

/** รวมข้อความที่ติดกัน + ทิ้งข้อความว่าง — รูปมาตรฐานเดียวที่ textToParts คืน */
export function normalizeParts(parts: readonly EditorPart[]): EditorPart[] {
  const out: EditorPart[] = []
  for (const p of parts) {
    if (p.type === 'text') {
      if (p.text === '') continue
      const last = out[out.length - 1]
      if (last?.type === 'text') last.text += p.text
      else out.push({ type: 'text', text: p.text })
    } else out.push({ type: 'var', name: p.name })
  }
  return out
}

export const textToParts = (body: string): EditorPart[] => normalizeParts(parseTemplate(body))

export const partsToText = (parts: readonly EditorPart[]): string =>
  parts.map((p) => (p.type === 'text' ? p.text : `{${p.name}}`)).join('')
