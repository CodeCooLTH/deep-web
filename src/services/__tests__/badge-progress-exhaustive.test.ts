import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ทุกชนิดเกณฑ์ใน `CriteriaJson` ต้องมีสาขาใน **ทั้งสองสวิตช์** ของ badge.service
 *   - `runBadgeEvaluation` → ตัดสินว่า "ได้เหรียญหรือยัง"
 *   - `getBadgeProgress`   → ตัดสินว่า "เหลืออีกเท่าไร" (แถบความคืบหน้า)
 *
 * 🛑 เหรียญสายประมูล 6 ชนิดหายไปจากสวิตช์ที่สองทั้งชุดตั้งแต่วันที่ระบบประมูลขึ้น — เหรียญถูก
 * มอบถูกต้อง แต่แถบความคืบหน้าเป็น 0 ตลอดกาล และ log ของ prod ขึ้น warning ทุกครั้งที่เปิด
 * `/dashboard` (user ส่งภาพมา 2026-08-20) `default` ที่ `console.warn` แล้วปล่อยผ่านคือสิ่งที่
 * ทำให้มันรอดมาได้นาน เพราะ TypeScript เห็นว่าสวิตช์ "ครบ" แล้ว
 *
 * ด่านจริงคือ `const unhandled: never = criteria` ในสาขา default ซึ่ง `tsc` จับได้เอง —
 * เทสนี้เป็นด่านที่สอง กันคนถอด `never` ทิ้งเพราะรำคาญ (แล้วจะกลับไปเงียบเหมือนเดิม)
 */
const SERVICE = join(__dirname, '../badge.service.ts')
const TYPES = join(__dirname, '../../types/badge.ts')

function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank)
}

describe('[blocker] badge criteria — ทุกชนิดต้องมีทั้ง "ตัดสิน" และ "ความคืบหน้า"', () => {
  const service = stripComments(readFileSync(SERVICE, 'utf8'))
  const types = stripComments(readFileSync(TYPES, 'utf8'))

  const allTypes = [...new Set(Array.from(types.matchAll(/type:\s*'([A-Z_]+)'/g), (m) => m[1]))]

  it('อ่านชนิดเกณฑ์จาก types/badge.ts ได้จริง (กันเทสกลายเป็นด่านเปล่า)', () => {
    expect(allTypes.length).toBeGreaterThanOrEqual(18)
    expect(allTypes).toContain('AUCTION_HIGH_BID_COUNT')
  })

  it('ทุกชนิดต้องปรากฏเป็น case อย่างน้อย 2 ครั้ง (สวิตช์ตัดสิน + สวิตช์ความคืบหน้า)', () => {
    const missing = allTypes.filter((t) => {
      const hits = service.match(new RegExp(`case '${t}':`, 'g')) ?? []
      return hits.length < 2
    })
    expect(missing, `ชนิดที่มีสาขาไม่ครบทั้งสองสวิตช์: ${missing.join(', ')}`).toEqual([])
  })

  it('สาขา default ของ getBadgeProgress ต้องคง exhaustiveness check ที่ tsc จับได้', () => {
    expect(service).toContain('const unhandled: never = criteria')
  })
})
