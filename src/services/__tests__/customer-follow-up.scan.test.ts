// [blocker] เทสสแกนซอร์สของ service ติดตามลูกค้า (00066) — กติกาที่ "เขียนไว้" ต้อง "บังคับได้"
//  · ทุก prisma.customerFollowUp.* มี shopId (Deep ไม่มี RLS)
//  · ไม่ import ตัวส่งข้อความขาออก (BR-ACT-14)
//  · ไม่มี SQL ตัดสิน overdue (มติ S-3)
// ตัดคอมเมนต์ก่อนสแกนเสมอ (ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎไว้ในคอมเมนต์ด้วย)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'src/services')
const FILES = ['customer-follow-up.service.ts', 'follow-up-scope.ts']
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/[ \t]\/\/.*$/gm, '')
const src = (f: string) => strip(readFileSync(join(dir, f), 'utf8'))

/** เนื้อวงเล็บของการเรียก `<prefix>(…)` ทุกครั้ง (balanced) */
function callArgs(code: string, prefix: RegExp): string[] {
  const out: string[] = []
  const re = new RegExp(prefix.source + '\\(', 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++
      else if (code[i] === ')') depth--
      i++
    }
    out.push(code.slice(start, i - 1))
  }
  return out
}

describe('[blocker] customer-follow-up service — สแกนซอร์ส', () => {
  const svc = src('customer-follow-up.service.ts')

  it('ทุก prisma.customerFollowUp.<fn>(…) มี shopId ในอาร์กิวเมนต์ (BR-ACT-01/AC-ACT-03)', () => {
    const calls = callArgs(svc, /prisma\.customerFollowUp\.\w+/)
    expect(calls.length).toBeGreaterThanOrEqual(12) // กันสแกนว่างเปล่า (regex หลุดแล้วผ่านเงียบ)
    for (const c of calls) expect(c, c.slice(0, 80)).toMatch(/\bshopId\b/)
  })

  it('SQL ดิบที่แตะ "CustomerFollowUp" ผูก shopId ด้วย', () => {
    const scope = src('follow-up-scope.ts')
    expect(scope).toMatch(/"CustomerFollowUp"/)
    expect(scope).toMatch(/f\."shopId"/)
  })

  it('ไม่ import/เรียกตัวส่งข้อความขาออก (BR-ACT-14)', () => {
    for (const f of FILES) {
      const code = src(f)
      expect(code, f).not.toMatch(/from\s+['"][^'"]*(chat\.service|channel-chat\.service|lib\/sms|\/line\/|sms-code)/)
      expect(code, f).not.toMatch(/\b(sendMessage|sendOutboundMessage|sendSms)\b/)
    }
  })

  it('ไม่มี SQL/นิยาม overdue ที่สอง (มติ S-3): ไม่มี interval / AT TIME ZONE / now() / เทียบ dueAt กับ now', () => {
    for (const f of FILES) {
      const code = src(f)
      expect(code, f).not.toMatch(/interval\s*'/i)
      expect(code, f).not.toMatch(/AT\s+TIME\s+ZONE/i)
      expect(code, f).not.toMatch(/\bnow\(\)|CURRENT_TIMESTAMP/i)
      expect(code, f).not.toMatch(/dueAt[^\n]*\bnow\b/)
    }
  })

  it('ไม่ gate activeLocked (มติ S-1)', () => {
    for (const f of FILES) expect(src(f)).not.toMatch(/activeLocked/)
  })
})
