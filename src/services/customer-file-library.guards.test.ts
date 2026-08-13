/**
 * feature 00048 — เทสกันถอยหลังที่ **สแกนซอร์สจริง** ไม่ใช่ mock
 *
 * ทำไมต้องเป็นเทสอ่านซอร์ส: กฎเหล่านี้ไม่มี gate ไหนของโปรเจกต์จับได้เลย (tsc/build/detector/
 * theme-guard ผ่านหมดเพราะโค้ดที่ละเมิดยัง "ถูก" ตามชนิดทุกตัวอักษร) และเป็นกฎที่คนถัดไปมี
 * โอกาสทำผิดสูงเพราะแพตเทิร์นที่ผิดคือแพตเทิร์นที่เขียนง่ายกว่า
 *
 * รีโปนี้ตั้ง `environment: "node"` และไม่มี jsdom/testing-library — เทสสแกนซอร์สจึงเป็นวิธี
 * เดียวที่ยืนยันกฎระดับโครงสร้างได้ (precedent: upload-no-multipart-callers.test.ts,
 * session-exists-is-not-identity guard)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SERVICE = readFileSync(join(ROOT, 'src/services/customer-file-library.service.ts'), 'utf8')
const ROUTE = readFileSync(
  join(ROOT, 'src/app/api/chat/conversations/[id]/library/route.ts'),
  'utf8',
)

/**
 * 🛑 ตัดคอมเมนต์ทิ้งก่อนสแกนหา "แพตเทิร์นต้องห้าม" เสมอ
 *
 * ไฟล์ที่ทำถูกกฎมักเขียนคอมเมนต์อ้างชื่อกฎไว้บนหัว ("ห้ามใช้ (session.user as { id: string })")
 * เทสที่ match ดิบ ๆ จะแดงตลอดกาลโดยที่ไม่มีการละเมิดเลยสักบรรทัด — รีโปนี้เคยเข้าใจผิดจริงมาแล้ว
 * กับ grep gate ของ HR9 (2026-08-02 → 08-03) แล้วบันทึกเป็น "หนี้" ทั้งที่ไม่มีอะไรผิด
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

describe('service guards', () => {
  it('[blocker] TC-22: saveToLibrary ต้องไม่ทำ find-then-create', () => {
    // ตัดเอาเฉพาะตัวฟังก์ชัน แล้วดูว่ามีการอ่านก่อนเขียนไหม
    const start = SERVICE.indexOf('export async function saveToLibrary')
    const end = SERVICE.indexOf('export async function removeFromLibrary')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = SERVICE.slice(start, end)
    const createAt = body.indexOf('prisma.customerFile.create(')
    expect(createAt).toBeGreaterThan(-1)
    // ห้ามมี findFirst/findUnique บน customerFile "ก่อน" create — การอ่านหลัง create คือขา
    // fallback ตอนชน P2002 ซึ่งถูกต้องและจำเป็น
    const beforeCreate = stripComments(body.slice(0, createAt))
    expect(beforeCreate).not.toContain('prisma.customerFile.findFirst')
    expect(beforeCreate).not.toContain('prisma.customerFile.findUnique')
  })

  it('[blocker] TC-21: ต้องคงตัวดัก P2002 ไว้ (ความถูกต้องอยู่ที่ @@unique ไม่ใช่ pre-check)', () => {
    expect(SERVICE).toContain("e.code === 'P2002'")
    expect(SERVICE).toContain('PrismaClientKnownRequestError')
  })

  it('[blocker] TC-20: sentAt ต้องมาจาก ChatMessage.createdAt ไม่ใช่เวลาปัจจุบัน', () => {
    expect(SERVICE).toContain('sentAt: msg.createdAt')
    // เขียน new Date() ลง sentAt เมื่อไหร่ = คลังเรียงตามลำดับที่กดเก็บโดยไม่มีอะไรฟ้อง
    expect(stripComments(SERVICE)).not.toMatch(/sentAt:\s*new Date\(\)/)
  })

  it('[blocker] TC-24: หา message ด้วย id + conversationId พร้อมกัน (scope ใน WHERE)', () => {
    expect(SERVICE).toMatch(/where:\s*\{\s*id:\s*args\.messageId,\s*conversationId:\s*args\.conversationId\s*\}/)
  })

  it('[blocker] TC-23: ทุก query ของ customerFile ต้องผ่าน ownerWhere ที่มี shopId', () => {
    // ownerWhere เป็นที่เดียวที่ประกอบเงื่อนไขเจ้าของ — ถ้ามีใครเขียน where เองตรง ๆ
    // โอกาสลืม shopId สูงมาก จึงบังคับว่าทุก call ต้องอ้าง ownerWhere หรือ base ที่มาจากมัน
    expect(SERVICE).toContain('function ownerWhere(shopId: string')
    expect(SERVICE).toContain('shopId,')
    const calls = SERVICE.match(/prisma\.customerFile\.\w+\(\{[\s\S]*?\n  \}\)/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      const usesOwnerWhere = call.includes('ownerWhere(') || call.includes('where,') || call.includes('where: base')
      expect(usesOwnerWhere, `query นี้ไม่ได้ผูกกับ ownerWhere:\n${call}`).toBe(true)
    }
  })

  it('[blocker] rawMessage ต้องถูกขอมาใน select — ไม่งั้นสติกเกอร์หลุดเข้าคลังเงียบ ๆ', () => {
    // rawMessage ถูก omit เป็นค่าตั้งต้นของ Prisma client (ดูคอมเมนต์ใน schema.prisma)
    // ไม่ขอมา = undefined = isStickerRawMessage คืน false ทุกใบ
    expect(SERVICE).toContain('rawMessage: true')
    expect(SERVICE).toContain('isStickerRawMessage(msg.rawMessage)')
  })
})

describe('route guards', () => {
  it('[blocker] TC-32: route ต้องเรียก resolveConversationShopId จริง ไม่ใช่แค่ import', () => {
    // เทียบกับ "ชื่อฟังก์ชัน + วงเล็บ" ไม่ใช่ชื่อเปล่า — บรรทัด import ก็ match ชื่อเปล่าได้
    expect(ROUTE).toContain('resolveConversationShopId(')
  })

  it('[blocker] TC-31: ต้องใช้ sessionUserId() ห้าม cast session.user เป็น { id }', () => {
    expect(ROUTE).toContain('sessionUserId(session)')
    // ตัดคอมเมนต์ก่อน — หัวไฟล์นี้อธิบายกฎด้วยการ "ยกตัวอย่างสิ่งที่ห้าม" ซึ่งไม่ใช่การละเมิด
    expect(stripComments(ROUTE)).not.toMatch(/session\.user as \{\s*id:/)
  })

  it('ทุก method ต้องผ่าน resolveCtx ก่อนแตะข้อมูล', () => {
    for (const method of ['export async function GET', 'export async function POST', 'export async function DELETE', 'export async function PATCH']) {
      const at = ROUTE.indexOf(method)
      expect(at, `ไม่พบ ${method}`).toBeGreaterThan(-1)
      const body = ROUTE.slice(at, at + 1200)
      expect(body, `${method} ไม่ได้เรียก resolveCtx`).toContain('await resolveCtx(')
    }
  })

  it('response ต้องเป็น private, no-store ทุกทาง (API auth ห้ามถูก cache)', () => {
    expect(ROUTE).toContain('private, no-store')
    expect(ROUTE).toContain('export const dynamic = "force-dynamic"')
  })
})

describe('[blocker] TC-30: ลูกค้าต้องไม่มีทางอ่านคลังไฟล์', () => {
  const CUSTOMER_FACING = ['src/app/(marketing)', 'src/app/api/app', 'src/app/api/o']

  it('ไม่มีไฟล์ฝั่งลูกค้าไฟล์ไหนแตะ customerFile / customer-file-library.service', () => {
    const offenders: string[] = []
    for (const dir of CUSTOMER_FACING) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        if (src.includes('prisma.customerFile') || src.includes('customer-file-library.service')) {
          offenders.push(file.replace(`${ROOT}/`, ''))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
