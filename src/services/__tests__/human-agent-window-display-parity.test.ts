/**
 * regression กัน "3 จุดหลุด sync" ของ `canUseHumanAgent` (feature 00043, TFR-HA-05, SDS §8.4)
 *
 * ทำไมต้องมีเทสนี้: `canUseHumanAgent` เป็น SSOT ของ "PSID/IGSID นี้ใช้สิทธิ์ Human Agent ได้ไหม"
 * แต่ต้องถูกเรียกจาก 3 จุดที่ตัดสินใจคนละบริบทกัน (ส่งข้อความเดี่ยว/ส่งรูปกริด/แสดงผลช่องพิมพ์)
 * — ถ้ามีจุดที่ 4 โผล่ขึ้นในอนาคตโดยไม่อัปเดตเทสนี้ = สัญญาณเตือนว่ามีจุดตัดสินใจใหม่ที่ต้อง
 * พิจารณาว่าควรเรียก SSOT เดียวกันหรือไม่ (ป้องกัน FR-HA-07 หลุดซ้ำในอนาคต — ทำตามรูปแบบเทสของ
 * 2026-08-09 comment-inbox fetch loop / upload-no-multipart-callers ที่สแกน source แทนการ
 * hardcode รายชื่อไฟล์)
 *
 * 🛑 ไม่ hardcode คำตอบเป็น "เจอกี่จุด" — สแกนจริงแล้วเทียบกับเลข 3 ที่ SDS §8.4 ล็อกไว้ตรง ๆ
 * (`sendOutboundMessage`, `sendOutboundImageGrid`, `inbox/[conversationId]/page.tsx`)
 *
 * หมายเหตุ dev คู่ขนาน: ถ้า S-5 (แก้ page.tsx) ยังไม่เสร็จตอนรันเทสนี้ จะเห็นแค่ 2 จุด — เทสนี้
 * ต้อง**แดง**ในสถานการณ์นั้น (ไม่ลดเลขคาดหวังลงเป็น 2) เพื่อเป็นสัญญาณว่างานยังไม่ครบ ไม่ใช่เพื่อ
 * "ให้เขียวไว้ก่อน"
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_ROOT = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue
      walk(full, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

/**
 * call site จริง = บรรทัดที่มี `canUseHumanAgent(` ตามด้วยอาร์กิวเมนต์ที่ไม่ว่างเปล่า, ไม่ใช่
 * ส่วนหนึ่งของคอมเมนต์, และไม่ใช่ตัวประกาศฟังก์ชันเอง — แยกจาก 2 กรณีที่หน้าตาคล้ายแต่ไม่ใช่ call:
 * (1) คอมเมนต์ที่พูดถึงชื่อฟังก์ชันเฉย ๆ เช่น "ต้องเช็ค canUseHumanAgent() ด้วย ..." (page.tsx
 *     มี 2 จุดแบบนี้, ChatThread.tsx มี 1 จุด) — บทเรียน HR9: gate ที่ match คำเปล่า ๆ (ไม่แยก
 *     คอมเมนต์) จะแดงตลอดกาลเพราะไฟล์ที่ทำถูกกฎมักอ้างชื่อฟังก์ชัน/กฎไว้ในคอมเมนต์กำกับ
 * (2) บรรทัด `export function canUseHumanAgent(externalUserId: ...): boolean {` เอง — regex ที่
 *     จับ "ชื่อฟังก์ชัน + วงเล็บที่มีเนื้อหา" มองไม่ออกว่านี่คือ signature ไม่ใช่ call เพราะ
 *     parameter list กับ argument list หน้าตาเหมือนกันทุกประการในระดับ regex
 */
function findCallSites(source: string): { line: number; text: string }[] {
  const lines = source.split('\n')
  const hits: { line: number; text: string }[] = []
  const callRe = /canUseHumanAgent\s*\(\s*[^)\s][^)]*\)/
  const declRe = /function\s+canUseHumanAgent\s*\(/
  lines.forEach((raw, idx) => {
    const trimmed = raw.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
    if (declRe.test(raw)) return
    // ตัดส่วนคอมเมนต์ท้ายบรรทัด (// ...) ออกก่อนจับ — กันเคส `foo() // ต้องเช็ค canUseHumanAgent()`
    const codePart = raw.split('//')[0]!
    if (callRe.test(codePart)) hits.push({ line: idx + 1, text: raw.trim() })
  })
  return hits
}

/** หาชื่อฟังก์ชันที่ห่อ call site อยู่ — ไล่ย้อนขึ้นบนหาบรรทัด `export (async )?function NAME(` ที่ใกล้สุด */
function enclosingFunctionName(source: string, atLine: number): string | null {
  const lines = source.split('\n')
  const fnRe = /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/
  for (let i = atLine - 1; i >= 0; i--) {
    const m = fnRe.exec(lines[i]!)
    if (m) return m[1]!
  }
  return null
}

describe('[regression] canUseHumanAgent — call site ต้องมี 3 จุดเป๊ะ ไม่มากไม่น้อย', () => {
  it('รวมทั้ง repo เจอ call site จริง (ไม่ใช่คอมเมนต์) เท่ากับ 3', () => {
    // สแกนทั้ง src/ ไม่จำกัดเฉพาะ 2 ไฟล์ที่รู้อยู่แล้ว — เผื่อมีจุดที่ 4 โผล่ขึ้นที่อื่นโดยไม่มีใครรู้ตัว
    const found: { file: string; line: number; text: string }[] = []
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/')
      const source = readFileSync(file, 'utf8')
      for (const hit of findCallSites(source)) found.push({ file: rel, ...hit })
    }
    expect(found, JSON.stringify(found, null, 2)).toHaveLength(3)
  })

  it('2 จุดอยู่ใน channel-chat.service.ts ภายใน sendOutboundMessage และ sendOutboundImageGrid', () => {
    const file = join(SRC_ROOT, 'services/channel-chat.service.ts')
    const source = readFileSync(file, 'utf8')
    const hits = findCallSites(source)
    expect(hits).toHaveLength(2)
    const fnNames = hits.map((h) => enclosingFunctionName(source, h.line)).sort()
    expect(fnNames).toEqual(['sendOutboundImageGrid', 'sendOutboundMessage'])
  })

  it('1 จุดอยู่ที่ inbox/[conversationId]/page.tsx (ฝั่งแสดงผลช่องพิมพ์)', () => {
    const file = join(
      SRC_ROOT,
      'app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx',
    )
    const source = readFileSync(file, 'utf8')
    expect(findCallSites(source)).toHaveLength(1)
  })

  it('ห้ามมีไฟล์ไหนใน src/ อ่าน process.env.META_HUMAN_AGENT_* ตรง ๆ นอก channel-chat.service.ts (กัน SSOT หลุด)', () => {
    const offenders: string[] = []
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/')
      if (rel === 'services/channel-chat.service.ts') continue
      const source = readFileSync(file, 'utf8')
      if (/process\.env\.META_HUMAN_AGENT_/.test(source)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
