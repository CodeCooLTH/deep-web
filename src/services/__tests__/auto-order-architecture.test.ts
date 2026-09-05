import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 00061 — ด่านเชิงสถาปัตยกรรม (TFR-020 · TFR-021 · TFR-023 · AC-42/58/59)
 *
 * ทุกข้อในไฟล์นี้กัน **คลาสที่ `tsc`/build/eslint มองไม่เห็น** เพราะโค้ดที่ละเมิดถูกทุกบรรทัด
 * สิ่งที่ผิดคือ *ใครเรียกใคร* และ *ค่าคงที่ถูกเขียนจากที่ไหน*
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 🛑 ต้องตัด **ทั้ง** คอมเมนต์บรรทัดเดียวและคอมเมนต์บล็อก
 *
 * ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้บนหัวไฟล์ (`sendMessage` · `lastMessageAt` ·
 * `detectAutoOrderTrigger` ล้วนถูกอ้างถึงในคอมเมนต์เพื่ออธิบายว่า *ทำไมถึงไม่มี*) —
 * ตัดแค่ `//` ด่านจะแดงค้างจากคำเตือนของตัวเอง ซึ่งเป็นรอยเดิมที่ HR9 grep gate เคยเจอมาแล้ว
 * เมื่อ 2026-08-02 (ถูกบันทึกเป็น "หนี้" อยู่ 1 วันทั้งที่ไม่มีการละเมิดเลย)
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

const ALL_FILES = walk('src')

describe('วงจรป้อนกลับ: ตัวดักจับมีจุดเข้าปิด (TFR-021)', () => {
  /**
   * 🛑 ทำไมต้องปิดเซตผู้เรียก: ตัวดักจับเขียน `ChatMessage` (การ์ดผลลัพธ์) และการ์ดนั้นมี
   * `senderRole='SHOP'` เหมือนข้อความที่ร้านพิมพ์เอง — ถ้ามีใครเรียกตัวดักจับจากจุดที่สาม
   * ที่อยู่บนเส้นทางเขียนข้อความ ระบบจะดักจับผลลัพธ์ของตัวเองเป็นวงไม่รู้จบ
   *
   * ชั้นแรกคือ "ไม่มีสายให้ตัด" (ตัวเขียนการ์ดไม่ import ตัวดักจับเลย) — เทสนี้คือชั้นสอง
   */
  const ALLOWED_CALLERS = new Set([
    'src/services/chat.service.ts',
    'src/app/api/channels/facebook/webhook/route.ts',
    // ตัวมันเอง + cron ที่เก็บกวาด (watchdog เรียก writeProcessingFailedDraft ไม่ใช่ตัวดักจับ)
    'src/services/auto-order-detect.service.ts',
  ])

  it('[blocker] มีเฉพาะไฟล์ในเซตที่ import detectAutoOrderTrigger ได้', () => {
    const callers = ALL_FILES.filter((f) => {
      if (/\.(test|spec)\.tsx?$/.test(f)) return false
      const code = stripComments(readFileSync(f, 'utf8'))
      return /import\s*\{[^}]*\bdetectAutoOrderTrigger\b/.test(code)
    })
    const unexpected = callers.filter((f) => !ALLOWED_CALLERS.has(f))
    expect(unexpected, `ไฟล์นอกเซตที่เรียกตัวดักจับ:\n${unexpected.join('\n')}`).toEqual([])
  })

  it('[blocker] ตัวเขียนการ์ดต้องไม่ import ตัวดักจับ (ไม่มีสายให้ตัด)', () => {
    const code = stripComments(
      readFileSync('src/services/auto-order-internal-message.service.ts', 'utf8'),
    )
    expect(code).not.toMatch(/detectAutoOrderTrigger/)
  })
})

describe('ชั้นเขียน: การ์ดภายในมีเส้นทางของตัวเอง (TFR-020 · AC-58/59)', () => {
  const SRC = readFileSync('src/services/auto-order-internal-message.service.ts', 'utf8')
  const CODE = stripComments(SRC)

  it('[blocker] ไม่ import sendMessage / sendOutboundMessage', () => {
    // ผลพลอยได้ที่ได้ฟรีจากข้อนี้: `pauseForHumanTakeover` (อยู่ *ข้างใน* สองฟังก์ชันนั้น)
    // ไม่มีทางถูกเรียก ⇒ บอทอัตโนมัติของห้องไม่ถูกสั่งหยุดเพราะการ์ดของเรา
    expect(CODE).not.toMatch(/import\s*\{[^}]*\b(sendMessage|sendOutboundMessage)\b/)
    expect(CODE).not.toMatch(/\bsendMessage\s*\(/)
    expect(CODE).not.toMatch(/\bsendOutboundMessage\s*\(/)
  })

  it('[blocker] ไม่แตะ Conversation เลย (AC-61 — ไม่ดันห้องขึ้นบนสุดของ inbox)', () => {
    expect(CODE).not.toMatch(/conversation\.update/)
    expect(CODE).not.toMatch(/lastMessageAt/)
    expect(CODE).not.toMatch(/lastSenderRole/)
  })

  it('[blocker] ค่าคงที่ type มาจากไฟล์เดียว ไม่พิมพ์สตริงซ้ำ', () => {
    expect(CODE).not.toMatch(/['"]AUTO_ORDER_RESULT['"]/)
    expect(CODE).toContain('AUTO_ORDER_RESULT_TYPE')
  })
})

describe('PROCESSING_FAILED เดี่ยวเสมอ — บังคับด้วยโครงสร้าง ไม่ใช่ if (AC-42)', () => {
  it('[blocker] deriveDraftReasons ไม่มีทางผลิต PROCESSING_FAILED เอง', () => {
    const code = stripComments(readFileSync('src/lib/auto-order-reasons.ts', 'utf8'))
    // ปรากฏได้เฉพาะใน type union / ลำดับแสดงผล — ห้ามอยู่ใน branch ที่ push
    expect(code).not.toMatch(/push\(\s*['"]PROCESSING_FAILED['"]/)
    expect(code).not.toMatch(/reasons\.push\([^)]*PROCESSING_FAILED/)
  })

  it('[blocker] writeProcessingFailedDraft ไม่มีช่องรับ reasons จากใครเลย', () => {
    const code = stripComments(readFileSync('src/services/auto-order-detect.service.ts', 'utf8'))
    const at = code.indexOf('export async function writeProcessingFailedDraft(')
    expect(at).toBeGreaterThan(-1)
    const signature = code.slice(at, code.indexOf(')', at) + 1)
    expect(signature).not.toContain('reasons')
    // ค่าที่เขียนต้องเป็นอาร์เรย์ค่าคงที่ตัวเดียว ไม่ใช่ตัวแปรที่มาจากที่อื่น
    expect(code).toContain("draftReasons: ['PROCESSING_FAILED']")
  })
})

describe('ตัวนับร่างมี SSOT เดียว (TFR-023 · AC-67)', () => {
  const ALLOWED_DRAFTED_QUERY = new Set([
    'src/services/auto-order-detect.service.ts',
    'src/lib/order-visibility.ts',
    // reaper กวาดร่างหมดอายุข้ามทุกร้าน — เป็น `updateMany` ที่เปลี่ยนสถานะ ไม่ใช่ตัวนับ
    // ที่จะไปโผล่บนหน้าจอ ⇒ ไม่อยู่ในคลาสที่กฎ "ตัวเลขต้องมาจาก symbol เดียว" กันอยู่
    'src/app/api/cron/auto-order-sweeper/route.ts',
  ])

  it('[blocker] ห้ามประกอบ query `status: DRAFTED` เองนอกไฟล์ที่กำหนด', () => {
    // คลาสที่กัน: "ตัวเลขเดียวกันโผล่ >1 ที่แล้วไม่ตรงกัน" — เกิดจริงกับ 00029 มาแล้ว
    // (จอเดียวโชว์ "ยังไม่ตอบ" 7 กับ 8)
    const offenders: string[] = []
    for (const f of ALL_FILES) {
      if (/\.(test|spec)\.tsx?$/.test(f)) continue
      if (ALLOWED_DRAFTED_QUERY.has(f)) continue
      const code = stripComments(readFileSync(f, 'utf8'))
      if (/status:\s*['"]DRAFTED['"]/.test(code)) offenders.push(f)
    }
    expect(offenders, `ไฟล์ที่ประกอบ query ร่างเอง:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('เส้นทางอัตโนมัติห้าม Quick-Create (TFR-008 · AC-22/23)', () => {
  const CODE = stripComments(readFileSync('src/services/order.service.ts', 'utf8'))

  it('[blocker] promoteDraftCore มีด่าน allowQuickCreate ที่ throw จริง ไม่ใช่แค่รับ flag', () => {
    expect(CODE).toMatch(
      /if\s*\(\s*!opts\.allowQuickCreate\s*&&\s*data\.items\.some\(\(i\)\s*=>\s*!i\.productId\)\s*\)\s*\{[\s\S]{0,120}?throw new ProductNotInShopError\(\)/,
    )
  })

  it('[blocker] ตัวห่อสองตัวส่งค่า allowQuickCreate ต่างกันจริง', () => {
    const human = CODE.slice(CODE.indexOf('export async function promoteDraftToOrder('))
    const auto = CODE.slice(CODE.indexOf('export async function promoteAutoOrderDraft('))
    expect(human.slice(0, 600)).toContain('allowQuickCreate: true')
    expect(auto.slice(0, 600)).toContain('allowQuickCreate: false')
  })
})
