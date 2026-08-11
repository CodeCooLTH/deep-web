/**
 * [blocker] ด่านของเมนูลัดใน LINE ต้องอยู่ "ถูกที่" ไม่ใช่แค่มีอยู่ (feature 00045)
 *
 * ทำไมต้องเป็นเทสอ่านซอร์ส: ทั้ง 3 ข้อด้านล่างเป็นเรื่อง **ลำดับ/ตำแหน่ง** ของโค้ด ซึ่ง `tsc`,
 * build, theme-guard และเทสหน่วยแบบ mock ผ่านหมดไม่ว่าจะวางไว้ตรงไหน — ด่านที่ถูกย้ายไปอยู่หลัง
 * การยิง LINE ยังคอมไพล์ได้และหน้าตาเหมือนเดิมทุกบรรทัด แต่ไม่กันอะไรเลย
 * (บทเรียนตรงจาก retro 2026-08-11 C-3 และจากด่าน cross-shop ที่หลุดใน 486ff764)
 *
 * 🛑 แดง = ทับเมนูเดิมของร้านได้โดยร้านไม่ได้ยินยอม / เผาเพดานสร้างเมนู 100 ครั้งต่อชั่วโมง /
 * รั่วว่าเพจ id นี้มีอยู่จริงในร้านอื่น
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SERVICE = join(process.cwd(), 'src/services/line-rich-menu.service.ts')
const PUT_ROUTE = join(process.cwd(), 'src/app/api/channels/line/rich-menu/route.ts')
const SHARED = join(process.cwd(), 'src/app/api/channels/line/rich-menu/_shared.ts')

describe('ด่านความยินยอม (BR-RM-01)', () => {
  /**
   * ความยินยอมเป็น **ด่านเดียวที่มีจริง** — LINE ไม่ให้ API ตรวจว่าเพจมีเมนูเดิมอยู่หรือเปล่า
   * ถ้าด่านนี้ถูกย้ายไปอยู่หลังการสร้างเมนู เมนูเดิมของร้านจะถูกทับไปแล้วก่อนที่ใครจะถูกถาม
   */
  /**
   * 🛑 ต้องยึดตำแหน่งของ **คำสั่งด่านจริง** (`if (!row.consentAt)`) ไม่ใช่สตริง `'CONSENT_REQUIRED'`
   * — สตริงนั้นปรากฏใน type union ตอนต้นไฟล์ด้วย `indexOf` จึงเจอตัวนั้นเสมอและอยู่ก่อนการยิง LINE
   * ตลอดกาล กลายเป็น tautology ที่เขียวแม้ด่านถูกย้ายไปอยู่หลังการสร้างเมนูแล้ว
   * (พิสูจน์ด้วย mutation แล้วว่ารูปเดิมรอด — คลาส P-7 เดียวกับที่เจอซ้ำในรอบนี้)
   */
  it('[blocker] `activate` ต้องตรวจ consentAt ก่อนยิง LINE ครั้งแรก', () => {
    const src = readFileSync(SERVICE, 'utf8')
    const guard = src.indexOf('if (!row.consentAt)')
    const firstLineCall = src.indexOf("lineApiRequest('/v2/bot/richmenu'")
    expect(guard, 'ต้องมีคำสั่งด่าน if (!row.consentAt)').toBeGreaterThan(-1)
    expect(firstLineCall, 'ต้องมีการสร้างเมนูบน LINE').toBeGreaterThan(-1)
    expect(guard, 'ด่านต้องมาก่อนการสร้างเมนู').toBeLessThan(firstLineCall)
  })

  it('[blocker] ด่านต้องอยู่ใน service ไม่ใช่แค่ที่ route — ยิง API ตรงต้องข้ามไม่ได้', () => {
    // route ของ activate ต้องไม่มีตรรกะ consent ของตัวเอง (ถ้ามี = มีสองนิยามที่จะเพี้ยนคนละทาง)
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/channels/line/rich-menu/activate/route.ts'),
      'utf8',
    )
    expect(route).not.toMatch(/consentAt\s*[!=]==?/)
    expect(readFileSync(SERVICE, 'utf8')).toMatch(/if\s*\(!row\.consentAt\)/)
  })
})

describe('เพดานอัตราการสร้างเมนู', () => {
  /**
   * LINE จำกัดการสร้างเมนูที่ 100 ครั้ง/ชั่วโมงต่อ OA และเมนูแก้ไขไม่ได้ (ทุกการแก้ = สร้างใบใหม่)
   * ถ้า PUT ยิง LINE ด้วย ร้านที่นั่งปรับคำไปมาสิบรอบจะเผาเพดานหมดโดยไม่ได้อะไรกลับมาเลย
   */
  it('[blocker] เส้นบันทึกร่าง (PUT) ต้องไม่เรียก LINE เลย', () => {
    const src = readFileSync(PUT_ROUTE, 'utf8')
    expect(src).not.toContain('lineApiRequest')
    expect(src).not.toContain('lineDataApiUpload')
    // และต้องเรียกแค่ saveDraft ซึ่งเป็นตัวที่ไม่ยิง LINE
    expect(src).toContain('saveDraft')
    expect(src).not.toContain('activate(')
  })

  it('[blocker] `saveDraft` ใน service ก็ต้องไม่ยิง LINE', () => {
    const src = readFileSync(SERVICE, 'utf8')
    const start = src.indexOf('export async function saveDraft')
    const end = src.indexOf('export async function recordConsent')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = src.slice(start, end)
    expect(body).not.toContain('lineApiRequest')
    expect(body).not.toContain('lineDataApiUpload')
  })
})

describe('ขอบเขตร้าน (SRS §7.14)', () => {
  it('[blocker] เพจนอกขอบเขตต้องได้ 404 ไม่ใช่ 403', () => {
    const src = readFileSync(SHARED, 'utf8')
    // 403 ยืนยันว่าทรัพยากรนั้นมีจริง = รั่วว่าเพจ id นี้มีอยู่ในร้านอื่น
    expect(src).toMatch(/CHANNEL_NOT_FOUND:\s*\{\s*status:\s*404/)
  })

  it('[blocker] service ต้อง scope shopChannelId ด้วย shopId ใน WHERE ไม่ใช่ดึงมาเทียบทีหลัง', () => {
    const src = readFileSync(SERVICE, 'utf8')
    expect(src).toMatch(/where:\s*\{\s*id:\s*shopChannelId,\s*shopId\s*\}/)
  })

  it('error ที่กดซ้ำไม่มีทางสำเร็จ ต้องไม่ถูกทำเครื่องหมายว่า retryable', () => {
    const src = readFileSync(SHARED, 'utf8')
    for (const code of ['CONSENT_REQUIRED', 'DRAFT_INCOMPLETE', 'IMAGE_REJECTED', 'TOKEN_INVALID']) {
      expect(src, code).toMatch(new RegExp(`${code}:\\s*\\{[^}]*retryable:\\s*false`))
    }
    // ตรงข้าม: เพดานอัตราคือเคสเดียวที่รอแล้วกดใหม่ได้ผลจริง
    expect(src).toMatch(/RATE_LIMITED:\s*\{[^}]*retryable:\s*true/)
  })
})
