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
 * (`transmitMetaMessage`, `sendOutboundImageGrid`, `inbox/[conversationId]/page.tsx`)
 *
 * 🛑 ทำไมจุดแรกเปลี่ยนชื่อจาก `sendOutboundMessage` เป็น `transmitMetaMessage` (CR 2026-08-23):
 * `channel-chat.service.ts` ถูกแยก "การยิงออกช่องทาง" ออกจาก "การเขียน DB" เพื่อให้เส้นทางคิว
 * (ข้อความถูกเขียนลง DB ก่อนตอบ client แล้วค่อยยิงออกเบื้องหลัง) ใช้ตัวยิงชุดเดียวกับผู้เรียกเดิม
 * แทนที่จะมีตรรกะการส่งสองชุดที่ค่อย ๆ ห่างกัน (HR16) — การตัดสินใจ "ติด HUMAN_AGENT tag ไหม"
 * เป็นส่วนหนึ่งของการยิง จึงย้ายตามไปอยู่ใน `transmitMetaMessage` ทั้งก้อน
 *
 * **ไม่มีใครผ่อนด่านนี้ลง**: จำนวน call site ทั้ง repo ยังเป็น 3 · ในไฟล์ service ยังเป็น 2 และ
 * เคสด้านล่างยังบังคับว่า 2 จุดนั้นต้องอยู่ **คนละฟังก์ชันกัน** (ห้ามผ่อนเหลือแค่ "นับได้ 2") —
 * ไม่งั้นเราจะจับไม่ได้เวลาทั้งสองจุดไปกองอยู่ในเส้นทางตัดสินใจเดียวกัน
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

/**
 * หาชื่อฟังก์ชันที่ห่อ call site อยู่ — ไล่ย้อนขึ้นบนหาบรรทัดประกาศฟังก์ชัน **ระดับบนสุด** ที่ใกล้สุด
 *
 * 🛑 `export` เป็น optional (CR 2026-08-23): เดิม regex บังคับว่าต้องขึ้นต้นด้วย `export` ตัวสแกนจึง
 * "เดินทะลุ" ฟังก์ชันที่ไม่ได้ export ขึ้นไปรายงานชื่อฟังก์ชันอื่นที่อยู่ก่อนหน้า = ตอบผิดโดยไม่มีอะไร
 * ฟ้อง. ด่านนี้สนใจว่า call site อยู่ใน "จุดตัดสินใจ" ไหน ซึ่งไม่เกี่ยวกับว่าฟังก์ชันนั้นถูก export
 * ออกไปให้คนนอกเรียกหรือเปล่า (`transmitMetaMessage` เป็น internal ของ service โดยตั้งใจ)
 *
 * ยึด `^` ไม่ใช่ `^\s*` เพื่อจับเฉพาะการประกาศระดับบนสุด — ฟังก์ชันที่ประกาศซ้อนข้างในต้องไม่ถูก
 * รายงานแทนฟังก์ชันที่ห่อมันอยู่จริง
 */
function enclosingFunctionName(source: string, atLine: number): string | null {
  const lines = source.split('\n')
  const fnRe = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/
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

  it('2 จุดอยู่ใน channel-chat.service.ts ภายใน transmitMetaMessage และ sendOutboundImageGrid', () => {
    const file = join(SRC_ROOT, 'services/channel-chat.service.ts')
    const source = readFileSync(file, 'utf8')
    const hits = findCallSites(source)
    expect(hits).toHaveLength(2)
    // 🛑 เทียบ "ชื่อฟังก์ชัน" ไม่ใช่แค่ "นับได้ 2" — ถ้าผ่อนเหลือการนับ เราจะจับไม่ได้เวลาทั้งสอง
    // จุดไปกองอยู่ในเส้นทางตัดสินใจเดียวกัน (ซึ่งแปลว่าอีกเส้นทางหนึ่งเลิกเช็คสิทธิ์ไปเงียบ ๆ)
    const fnNames = hits.map((h) => enclosingFunctionName(source, h.line)).sort()
    expect(fnNames).toEqual(['sendOutboundImageGrid', 'transmitMetaMessage'])
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
