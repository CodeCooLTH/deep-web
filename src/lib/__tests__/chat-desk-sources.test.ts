/**
 * chat-desk-sources.test.ts — ด่านสแกนซอร์สของ 00077 (AC-CD-12/15/29/38/39/40)
 * ทำไมสแกนซอร์ส: กฎเหล่านี้ "ไม่มีค่าให้เทียบ" ที่ runtime (อ่านอย่างเดียว · ไม่คำนวณสูตรเอง · ผู้อ่านไม่ลงชื่อ)
 * ถ้าไม่มีด่านนี้ คนเติม POST / markRead / `.track(` ทีหลังจะผ่านทุกเทสที่เหลือเงียบ ๆ
 * (docs/conventions/rule-must-be-enforced-not-described.md)
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** ตัดคอมเมนต์ก่อนสแกน — คอมเมนต์อธิบาย "ห้ามทำ X" ต้องไม่ทำให้ด่านแดงเอง */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const CHAT_DESK_API = join(ROOT, 'src/app/api/chat-desk')
const routeFiles = walk(CHAT_DESK_API).filter((f) => /\/route\.tsx?$/.test(f))
const SERVICE = 'src/services/chat-desk.service.ts'
const PRESENCE_CTRL = 'src/lib/chat-desk/presence-controller.ts'

describe('อ่านอย่างเดียว (AC-CD-39/40)', () => {
  it('พบ route ใต้ api/chat-desk อย่างน้อย 2 ไฟล์ (กันสแกนว่างแล้วเขียว)', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(2)
  })

  it.each(routeFiles.map((f) => [relative(ROOT, f), f]))('%s export เฉพาะ GET (+ dynamic)', (_n, f) => {
    const src = code(readFileSync(f as string, 'utf8'))
    const names = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/g)].map((m) => m[1])
    expect(names).toContain('GET')
    expect(names.filter((n) => n !== 'GET' && n !== 'dynamic')).toEqual([])
    expect(src).not.toMatch(/export\s*\{[^}]*\b(POST|PUT|PATCH|DELETE)\b/)
  })

  const readOnlyFiles = [
    SERVICE,
    ...routeFiles.map((f) => relative(ROOT, f)),
    'src/app/api/chat/presence-keys/route.ts',
    ...walk(join(ROOT, 'src/lib/chat-desk')).filter((f) => !f.includes('__tests__')).map((f) => relative(ROOT, f)),
  ]
  it.each(readOnlyFiles)('%s ไม่มี markRead / sendSenderAction / เขียน shopLastReadAt', (f) => {
    const src = code(read(f))
    expect(src).not.toMatch(/markRead|sendSenderAction|sender_action/)
    expect(src).not.toMatch(/shopLastReadAt\s*:/)
    expect(src).not.toMatch(/prisma\.\w+\.(create|update|updateMany|upsert|delete|deleteMany|createMany)\(/)
    expect(src).not.toMatch(/\$executeRaw/)
  })
})

describe('ผู้อ่าน presence ไม่ลงชื่อ (AC-CD-29)', () => {
  it('ส่วน reader ของ presence-controller ไม่มี .track(', () => {
    const src = code(read(PRESENCE_CTRL))
    const at = src.indexOf('export function createPresenceReader')
    expect(at).toBeGreaterThan(0)
    expect(src.slice(0, at)).toMatch(/\.track\(/) // ผู้ลงชื่ออยู่ก่อนหน้า — กันสแกนว่างเปล่า
    expect(src.slice(at)).not.toMatch(/\.track\(/)
  })

  it('useChatDeskPresence ไม่มี .track(', () => {
    expect(code(read('src/hooks/useChatDeskPresence.ts'))).not.toMatch(/\.track\(/)
  })
})

describe('service ไม่เขียนสูตรเอง (AC-CD-12/15)', () => {
  const src = code(read(SERVICE))
  it('ไม่มี computeResponsePairs( / summarizeShop( / AVG( และใช้ getShopResponseSummary', () => {
    expect(src).not.toMatch(/computeResponsePairs\(|summarizeShop\(|AVG\(/i)
    expect(src).toMatch(/getShopResponseSummary\(/)
  })

  it('เกณฑ์เกินเวลามาจาก resolveSlaConfig — ไม่มีเลข 300 ฮาร์ดโค้ด', () => {
    expect(src).toMatch(/resolveSlaConfig\(/)
    expect(src).not.toMatch(/\b300\b/)
  })

  it('กรองบรรทัดระบบทุกสาขา SQL (ห้องรอ ×2 + หน้าโต๊ะ) — M-1', () => {
    expect((src.match(/"type" NOT IN \(\$\{internal\}\)/g) ?? []).length).toBe(3)
    expect(src).not.toMatch(/\bm\.\*/) // ห้าม SELECT m.* (rawMessage หลุด)
  })
})

describe('ไม่มีสัญญาณสดฝั่งแอดมิน (AC-CD-38)', () => {
  const files = [
    SERVICE,
    ...walk(join(ROOT, 'src/lib/chat-desk')).filter((f) => !f.includes('__tests__')).map((f) => relative(ROOT, f)),
    'src/hooks/useChatDeskPresence.ts',
  ]
  it.each(files)('%s ไม่มี typing/viewing', (f) => {
    expect(code(read(f))).not.toMatch(/\b(typing|viewing)\b/i)
  })
})
