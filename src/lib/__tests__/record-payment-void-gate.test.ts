import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 00071 T10 — ปุ่มยกเลิกรายการรับเงิน (O6) ต้องไม่ถูกเสนอให้ผู้ที่ไม่มีสิทธิ์
 * RecordPaymentSheet.canVoid เป็น prop บังคับ (tsc กันที่ type) — เทสนี้กันซ้ำที่ซอร์ส:
 *  1) ทุก <RecordPaymentSheet …> ส่ง canVoid= (ไม่ปล่อย undefined ผ่าน spread/cast)
 *  2) ค่าฝั่งแชทมาจาก server: page.tsx คำนวณ canAccessShopWith(ร้านของเธรด, ผู้ใช้, 'O6') ลง customerPanelData.canVoidPayment
 * ตัวสแกนรับซอร์สเพื่อให้ mutation ฉีดของปลอมได้
 */
const ROOT = process.cwd()
const walk = (d: string, out: string[] = []) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(p) && !/\.test\.tsx$/.test(p)) out.push(p)
  }
  return out
}

/** แท็ก <RecordPaymentSheet ... /> ที่ไม่มี canVoid= — นับวงเล็บปีกกาซ้อนเพื่อไม่หลง `>` ใน arrow function */
export function sheetsMissingCanVoid(src: string): number {
  let missing = 0
  const rx = /<RecordPaymentSheet\b/g
  for (let m = rx.exec(src); m; m = rx.exec(src)) {
    let depth = 0, i = rx.lastIndex
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0 && src[i - 1] !== '=') break
    }
    if (!/\bcanVoid=/.test(src.slice(rx.lastIndex, i))) missing++
  }
  return missing
}

describe('RecordPaymentSheet — canVoid (O6)', () => {
  const files = walk(join(ROOT, 'src/app')).map((a) => [relative(ROOT, a), readFileSync(a, 'utf8')] as const)
  const users = files.filter(([, s]) => /<RecordPaymentSheet\b/.test(s))

  it('สแกนเจอผู้เรียกจริง (OrderDetailClient · CustomerPanel · OrderProgressBar · ChatThread)', () => {
    expect(users.map(([p]) => p.split('/').pop()).sort()).toEqual(['ChatThread.tsx', 'CustomerPanel.tsx', 'OrderDetailClient.tsx', 'OrderProgressBar.tsx'])
  })

  it('ทุกผู้เรียกส่ง canVoid=', () => {
    expect(users.filter(([, s]) => sheetsMissingCanVoid(s) > 0).map(([p]) => p)).toEqual([])
  })

  it('ฝั่งแชท: page คำนวณด้วย O6 ของร้านเธรด แล้วลง customerPanelData', () => {
    const page = readFileSync(join(ROOT, 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx'), 'utf8')
    expect(page).toMatch(/canVoidPayment\s*=\s*await canAccessShopWith\(\s*threadShopId\s*,[^)]*['"]O6['"]\s*\)/)
    expect(page).toMatch(/customerPanelData: CustomerPanelData = \{[\s\S]*?\n\s+canVoidPayment,/)
  })

  it('mutation: ตัวสแกนจับผู้เรียกที่ลืม canVoid ได้ (และไม่หลงกับ arrow function ใน prop)', () => {
    const ok = `<RecordPaymentSheet open onClose={() => x()} canVoid={v} onChanged={() => r()} />`
    const bad = `<RecordPaymentSheet open onClose={() => x()} onChanged={() => r()} />`
    expect(sheetsMissingCanVoid(ok)).toBe(0)
    expect(sheetsMissingCanVoid(bad)).toBe(1)
    expect(sheetsMissingCanVoid(ok + bad)).toBe(1)
  })
})
