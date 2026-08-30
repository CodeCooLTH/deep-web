/**
 * [blocker] ด่านบังคับ "ผู้เขียน InspectionResult คนเดียว" (feature 00060 · T6)
 *
 * กฎ "ทุกเส้นทางการเขียนต้องผ่าน recordCheckOutcome()" เขียนไว้ใน SDS/คอมเมนต์แล้ว
 * แต่ **กฎที่เขียนไว้ยังไม่ใช่กฎที่บังคับได้** (docs/conventions/rule-must-be-enforced-not-described.md)
 * — 00037 เขียน AC ไว้ครบ 3 ที่แล้วออเดอร์ยังลงร้านผิดเงียบ ๆ บน prod เพราะไม่มีใครสร้างด่าน
 *
 * ไฟล์นี้คือด่านนั้น: สแกนซอร์สจริง ไม่ hardcode รายชื่อไฟล์ที่อนุญาต (นอกจากตัว service เอง)
 *
 * 🛑 ต้องตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 *    (เจอมาแล้ว 3 ครั้งในรีโปนี้: grep gate ของ HR9 แดงค้างจากคอมเมนต์ตัวเอง ·
 *     ตัวสแกน component-declared-in-render · และ prod-db-guard ที่บล็อกคอมเมนต์
 *     ที่เขียนว่า "ห้ามทำ" ระหว่างทำฟีเจอร์นี้เอง)
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { assertScopeMatches, InspectionScopeMismatchError } from '../inspection-result.service'

const SRC = join(process.cwd(), 'src')
const WRITER = 'src/services/inspection-result.service.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** ตัด block comment และ line comment ออก เพื่อไม่ให้ด่านไปจับคำเตือนของตัวเอง */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const WRITE_OPS = /prisma\s*\.\s*inspectionResult\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)|\binspectionResult\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/

describe('[blocker] InspectionResult มีผู้เขียนคนเดียว', () => {
  const files = walk(SRC)

  it('ไม่มีไฟล์อื่นนอก inspection-result.service.ts ที่เขียน InspectionResult', () => {
    const offenders: string[] = []
    for (const f of files) {
      const rel = relative(process.cwd(), f)
      if (rel === WRITER) continue
      if (WRITE_OPS.test(stripComments(readFileSync(f, 'utf8')))) offenders.push(rel)
    }
    expect(offenders, `ต้องเรียก recordCheckOutcome() แทน — พบใน:\n${offenders.join('\n')}`).toEqual([])
  })

  it('ตัว service เองยังต้องมีการเขียนอยู่จริง (กันด่านที่ผ่านเพราะไม่มีโค้ดเหลือแล้ว)', () => {
    // ถ้าไม่มีเช็คข้อนี้ ด่านข้างบนจะเขียวตลอดกาลแม้มีคนลบตัวเขียนทิ้งทั้งไฟล์
    const src = stripComments(readFileSync(join(process.cwd(), WRITER), 'utf8'))
    expect(WRITE_OPS.test(src)).toBe(true)
  })

  it('🛑 ตัวสแกนต้องไม่ถูกหลอกด้วยคอมเมนต์ (ด่านที่จับคำเตือนของตัวเองคือด่านที่แดงตลอดกาล)', () => {
    // ประกอบสตริงทีละท่อน ไม่เขียนรูปเต็ม — ไม่งั้นตัวสแกนจะจับ fixture ของตัวเอง
    // (เกิดขึ้นจริงตอนเขียนไฟล์นี้: ด่านแดงเพราะ 'ตัวควบคุมเชิงบวก' ของมันเอง)
    const OP = 'prisma.inspection' + 'Result.create({ data })'
    const withComment = `// ห้าม ${OP} ที่อื่น\nconst x = 1\n`
    expect(WRITE_OPS.test(stripComments(withComment))).toBe(false)
    const real = `await ${OP}\n`
    expect(WRITE_OPS.test(stripComments(real))).toBe(true)
  })

  it('🛑 recordCheckOutcome ต้องเรียก assertScopeMatches จริง ไม่ใช่แค่ประกาศฟังก์ชันทิ้งไว้', () => {
    // เทสข้างล่างเรียก assertScopeMatches ตรง ๆ จึงยังเขียวแม้มีคนถอดการเรียกออกจาก service
    // ⇒ ต้องมีด่านที่ตรวจ "การเรียก" ไม่ใช่แค่ "การมีอยู่" (rule-must-be-enforced-not-described.md:
    //   prop ที่ส่งมาแล้วไม่ถูกใช้ / คอมเมนต์ / cast ไม่นับเป็นการบังคับ)
    const src = stripComments(readFileSync(join(process.cwd(), WRITER), 'utf8'))
    const body = src.slice(src.indexOf('export async function recordCheckOutcome'))
    expect(body).toContain('assertScopeMatches(input.checkKey, input.roomId)')
  })
})

describe('[blocker] assertScopeMatches — scope ของ checkKey ต้องตรงกับการมี/ไม่มี roomId', () => {
  it('ข้อที่ผูกร้านต้องไม่มี roomId · ข้อที่ผูกห้องต้องมี', () => {
    expect(() => assertScopeMatches('scam_db', null)).not.toThrow()
    expect(() => assertScopeMatches('photos_match', 'room-a')).not.toThrow()
  })

  it('🛑 mutation: ถอดด่านนี้ออก → เคสนี้ต้องแดง (ผลข้ามขอบเขตเงียบ ๆ)', () => {
    // ส่ง roomId มากับข้อที่ผูกร้าน = ผลระดับร้านกลายเป็นผลของห้องเดียว
    expect(() => assertScopeMatches('scam_db', 'room-a')).toThrow(InspectionScopeMismatchError)
    // ไม่ส่ง roomId มากับข้อที่ผูกห้อง = ผลของห้องหนึ่งกลายเป็นผลระดับร้านที่สืบทอดข้ามทุกหลัง
    expect(() => assertScopeMatches('photos_match', null)).toThrow(InspectionScopeMismatchError)
    // duplicate_listing อยู่ขั้น 1 แต่ scope ROOM — จุดเดียวที่ข้ามมิติ ต้องไม่หลุด
    expect(() => assertScopeMatches('duplicate_listing', null)).toThrow(InspectionScopeMismatchError)
  })
})

describe('[blocker] เส้นทางสาธารณะต้องไม่ select คอลัมน์ลับ', () => {
  const PUBLIC_SVC = 'src/services/inspection-public.service.ts'
  const src = stripComments(readFileSync(join(process.cwd(), PUBLIC_SVC), 'utf8'))

  it('🛑 mutation: เพิ่ม suspectedFraudNote เข้า select → เคสนี้ต้องแดง', () => {
    // ข้อสงสัยที่ยังไม่ถูกตัดสิน — การเปิดเผยคือการกล่าวหา และถ้าร้านเห็นก่อน
    // หลักฐานถูกทำลายได้ · ตรวจที่ซอร์สเพราะบั๊กนี้ไม่มี error ให้เทส runtime จับ
    expect(src).not.toContain('suspectedFraudNote')
  })

  it('🛑 บันทึกภายในของผู้ตรวจต้องไม่ถูก select', () => {
    expect(src).not.toContain('invalidatedReason')
    expect(src).not.toContain('note: true')
  })

  it("🛑 mutation: ถอด where visibility='PUBLIC' → เคสนี้ต้องแดง (กรองต้องอยู่ใน query ไม่ใช่ JS)", () => {
    expect(src).toContain("visibility: 'PUBLIC'")
  })

  it('🛑 mutation: ถอดการกรองรอบที่ยังไม่เสร็จออกจาก WHERE → เคสนี้ต้องแดง', () => {
    expect(src).toContain('completedAt: { not: null }')
  })

  it('การเรียง "แถวล่าสุด" ต้องมี tie-break id ให้ตรงกับฝั่ง TS', () => {
    expect(src).toContain("{ checkedAt: 'desc' }, { id: 'desc' }")
  })

  it('ห้ามวน query ต่อที่พักรายหลัง (N+1)', () => {
    // จำนวนคำสั่ง findMany ต้องคงที่ ไม่ขึ้นกับจำนวนห้อง
    expect((src.match(/findMany\(/g) ?? []).length).toBe(3)
  })
})
