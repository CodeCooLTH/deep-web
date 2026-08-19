import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveCommentState, toResolvedReason } from '@/services/page-comment.service'

/**
 * ส่วนขยาย 00038 (2026-08-19) — "จัดการแล้ว" (resolved) ต้องเข้าไปอยู่ในนิยามสถานะ **ทั้ง 3 ที่**
 * ที่ตอบคำถามเดียวกันคนละภาษา: `deriveCommentState()` ใน TS + SQL CASE อีก 2 ก้อน
 *
 * 🛑 ทำไมต้องมีด่านสแกนซอร์ส: ทั้งสามก้อนเป็นโค้ดคนละภาษาที่ไม่มีอะไรผูกกันเลยในเชิงชนิด —
 * `tsc`/build/เทสหน่วยผ่านหมดถ้าใครแก้แค่ก้อนเดียว แล้วจอจะกลับไปเป็น "ตัวเลขบนแท็บไม่ตรงกับ
 * รายการใต้มัน" ซึ่งไฟล์นั้นเขียนเองว่าเป็น "บาปมหันต์" และเคยโชว์ "ยังไม่ตอบ 7 กับ 8" มาแล้ว
 * (BR-CR-R3)
 */

const SERVICE = join(__dirname, '../page-comment.service.ts')

/** ลบคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนอธิบายกฎนี้ไว้ด้วย (รอย HR9 2026-08-02) */
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank)
}

describe('[blocker] deriveCommentState — "จัดการแล้ว" ต้องหลุดจากคิว "ยังไม่ตอบ"', () => {
  it('ไม่มีคำตอบใด ๆ และยังไม่ resolved = ยังไม่ตอบ (พฤติกรรมเดิม ห้ามเปลี่ยน)', () => {
    expect(deriveCommentState([], null, false)).toBe('UNANSWERED')
    // ผู้เรียกเดิมที่ยังไม่ส่งพารามิเตอร์ที่ 3 ต้องได้ผลเหมือนเดิมเป๊ะ
    expect(deriveCommentState([])).toBe('UNANSWERED')
  })

  it('AC-CR-31 — resolved แล้วต้องเป็น HUMAN_ANSWERED (หลุดทั้งแท็บ "ยังไม่ตอบ" และ "หมดอายุ")', () => {
    expect(deriveCommentState([], null, true)).toBe('HUMAN_ANSWERED')
  })

  it('AC-CR-33 — คำตอบสาธารณะชนะ resolved เสมอ และยังแยกบอท/คนได้เหมือนเดิม', () => {
    // บอทตอบใต้คอมเมนต์ + ถูกกดข้ามด้วย → ต้องยังเป็น BOT_ANSWERED ไม่ใช่ HUMAN_ANSWERED
    // (ถ้า resolved ถูกเช็คก่อน สถานะจะเปลี่ยนเจ้าของโดยไม่มีใครสั่ง — BR-CR-R2)
    expect(deriveCommentState([{ isFromPage: true, isAutoReply: true }], null, true)).toBe('BOT_ANSWERED')
    expect(deriveCommentState([{ isFromPage: true, isAutoReply: false }], null, true)).toBe('HUMAN_ANSWERED')
  })

  it('private reply สำเร็จชนะ resolved เช่นกัน — บอททักไปแล้วต้องยังอ่านว่า BOT_ANSWERED', () => {
    expect(deriveCommentState([], 'AUTO', true)).toBe('BOT_ANSWERED')
    expect(deriveCommentState([], 'MANUAL', true)).toBe('HUMAN_ANSWERED')
  })
})

describe('[blocker] toResolvedReason — fail-closed', () => {
  it('รับเฉพาะ 2 ค่าที่ CHECK ในฐานอนุญาต', () => {
    expect(toResolvedReason('MANUAL')).toBe('MANUAL')
    expect(toResolvedReason('ALREADY_REPLIED_EXTERNALLY')).toBe('ALREADY_REPLIED_EXTERNALLY')
  })

  it('ค่าที่ไม่รู้จัก/ว่าง ต้องได้ null ไม่ใช่ตกไปเป็นค่าใดค่าหนึ่ง', () => {
    expect(toResolvedReason(null)).toBeNull()
    expect(toResolvedReason('')).toBeNull()
    expect(toResolvedReason('manual')).toBeNull()
    expect(toResolvedReason('SOMETHING_NEW')).toBeNull()
  })
})

describe('[blocker] BR-CR-R3 — SQL CASE ต้องรู้จัก resolvedAt เหมือน deriveCommentState', () => {
  const src = stripComments(readFileSync(SERVICE, 'utf8'))

  it('นิยาม CASE ต้องมีที่ประกาศเดียว — ห้ามก็อปกลับไปเขียนซ้ำในแต่ละ query', () => {
    // เดิมข้อความ CASE ถูกคัดลอกไว้ 2 ที่แล้วกันหลุดด้วย "คอมเมนต์เตือน" ซึ่งเป็นกติกาที่เขียนไว้
    // ไม่ใช่กติกาที่บังคับได้ (rule-must-be-enforced-not-described.md) — ตอนนี้เป็น fragment เดียว
    const branches = src.match(/c\."resolvedAt" IS NOT NULL THEN 'HUMAN_ANSWERED'/g) ?? []
    expect(branches.length, 'CASE ต้องประกาศที่เดียวคือ COMMENT_STATE_CASE').toBe(1)
    expect(src).toMatch(/const COMMENT_STATE_CASE = Prisma\.sql`/)
  })

  it('สาขา resolvedAt ต้องอยู่ "อันสุดท้ายก่อน ELSE" ให้ตรงกับลำดับใน TS (BR-CR-R2)', () => {
    // ถ้าใครย้ายขึ้นไปไว้ก่อนสาขาคำตอบสาธารณะ ตัวเลขจะยังบวกได้เท่าเดิมทุกประการ
    // แต่คอมเมนต์ที่บอทตอบแล้วและถูกกดข้ามจะย้ายจาก BOT_ANSWERED ไป HUMAN_ANSWERED เงียบ ๆ
    expect(src).toMatch(/c\."resolvedAt" IS NOT NULL THEN 'HUMAN_ANSWERED'\s+ELSE 'UNANSWERED'/)
  })

  it('[blocker] ทุกฟังก์ชันที่ตัดสินสถานะต้อง interpolate fragment ตัวเดียวกัน', () => {
    // เช็คทีละฟังก์ชันตามชื่อ ไม่ใช่ "นับจำนวนครั้ง" — การนับจะแดงทุกครั้งที่มีคนเพิ่ม query ใหม่
    // ที่ใช้ fragment ถูกต้องอยู่แล้ว (ด่านที่ลงโทษการทำถูก) และไม่มีทางรู้เลยว่าใครลืมใช้
    const mustUseFragment = [
      'export async function countCommentPostStatesByShop(',
      'export async function countCommentStatesByShop(',
      'export async function listComments(',
      'export async function resolveAllExpiredComments(',
    ]
    for (const decl of mustUseFragment) {
      const start = src.indexOf(decl)
      expect(start, `หาไม่เจอ: ${decl}`).toBeGreaterThanOrEqual(0)
      const next = src.indexOf('\nexport ', start + decl.length)
      const body = src.slice(start, next > start ? next : src.length)
      expect(body, `${decl} ต้องใช้ COMMENT_STATE_CASE ไม่ใช่เขียน CASE เอง`).toContain('${COMMENT_STATE_CASE}')
    }
  })

  it('[blocker] EXPIRED ต้องกรองที่ SQL ด้วยเส้นแบ่งเวลาจาก SSOT ตัวเดียวกับ TS', () => {
    // เช็คว่า query รายการมีทั้ง 2 เงื่อนไขของ EXPIRED (ยังไม่ตอบ ∧ พ้น 7 วัน) — เช็คแค่เวลา
    // อย่างเดียวจะลากคอมเมนต์เก่าที่ตอบไปแล้วทั้งกองเข้ามาด้วย ซึ่งไม่ใช่งานค้างของใครเลย
    expect(src).toMatch(/params\.state === 'EXPIRED' \? 'UNANSWERED' : params\.state/)
    expect(src).toMatch(/c\."createdTime" < \$\{privateReplyWindowCutoff\(\)\}/)
  })

  it('[blocker] listComments ต้อง LIMIT/OFFSET หลังกรอง ไม่ใช่กรองหลังตัดหน้า', () => {
    // ด่านนี้คือหัวใจของบั๊กที่ user เจอ: ถ้าใครย้ายการกรองกลับไปอยู่หลัง findMany อีกครั้ง
    // แท็บที่เกณฑ์ผูกกับ "ของเก่า" จะกลับไปว่างเปล่าใต้ badge ที่มีเลขทันที
    const listBody = src.slice(src.indexOf('export async function listComments('))
    const limitAt = listBody.indexOf('LIMIT ${take} OFFSET ${skip}')
    const findManyAt = listBody.indexOf('prisma.pageComment.findMany(')
    expect(limitAt, 'listComments ต้องตัดหน้าใน SQL').toBeGreaterThan(0)
    expect(limitAt, 'การตัดหน้าต้องเกิดก่อนดึงแถวเต็ม').toBeLessThan(findManyAt)
  })

  it('ทั้ง 2 query ต้องดึงคอลัมน์ resolvedAt มาให้ deriveCommentState ใช้จริง', () => {
    // ส่งค่าเข้าไป ≠ ค่าถูกใช้ — เช็คว่ามีการส่ง `c.resolvedAt !== null` เข้า deriveCommentState
    // ไม่ใช่แค่ว่า select มา (value-fate-decided-at-write-site ทิศกลับ)
    const calls = src.match(/resolvedAt !== null/g) ?? []
    expect(calls.length, 'listComments และ listCommentPosts ต้องส่ง resolved เข้า deriveCommentState').toBe(2)
  })
})

/**
 * "ทำเครื่องหมายทั้งหมด" ของแท็บหมดอายุ — ด่านที่สำคัญที่สุดคือ **ขอบเขต** ไม่ใช่ตัวเลข
 */
describe('[blocker] resolveAllExpiredComments — ด่านต้องอยู่ในรูปร่างของ API', () => {
  const svc = stripComments(readFileSync(SERVICE, 'utf8'))
  const routePath = join(__dirname, '../../app/api/chat/comments/resolve-expired/route.ts')
  const route = stripComments(readFileSync(routePath, 'utf8'))

  it('ห้ามรับ state จากผู้เรียก — ไม่งั้นวันหนึ่งจะมีคนส่ง UNANSWERED มาล้างคิวงานทั้งกอง', () => {
    const start = svc.indexOf('export async function resolveAllExpiredComments(')
    expect(start).toBeGreaterThanOrEqual(0)
    const sig = svc.slice(start, svc.indexOf('}', start))
    expect(sig).not.toContain('state')
    // route ก็ต้องไม่มีทางส่งอะไรที่เปลี่ยนเกณฑ์ได้
    expect(route).not.toMatch(/state\s*[:,]/)
  })

  it('เกณฑ์ต้องเป็น "ยังไม่ตอบ ∧ พ้น 7 วัน" ครบทั้งคู่ ไม่ใช่เช็คเวลาอย่างเดียว', () => {
    const start = svc.indexOf('export async function resolveAllExpiredComments(')
    const body = svc.slice(start)
    expect(body).toContain('${COMMENT_STATE_CASE}')
    expect(body).toContain("= 'UNANSWERED'")
    expect(body).toContain('c."createdTime" < ${privateReplyWindowCutoff()}')
  })

  it('ห้ามเขียนทับแถวที่ resolved อยู่แล้ว (BR-CR-R8) — ต้องกันทั้งตอน SELECT และตอน UPDATE', () => {
    const start = svc.indexOf('export async function resolveAllExpiredComments(')
    const body = svc.slice(start)
    // ระหว่าง SELECT กับ UPDATE เพื่อนร่วมทีมอาจกดปิดใบเดียวกันไปแล้ว การกันชั้นเดียวไม่พอ
    expect(body).toContain('c."resolvedAt" IS NULL')
    expect(body).toContain('resolvedAt: null')
  })

  it('ต้อง scope ด้วย shopIds + ตัวกรองเพจ/ช่องทางเดียวกับที่จอใช้', () => {
    const start = svc.indexOf('export async function resolveAllExpiredComments(')
    const body = svc.slice(start)
    expect(body).toContain('assertShopsAccessible')
    expect(body).toContain('resolveCommentProvider(params.provider)')
    expect(body).toContain('sc.id = ${params.shopChannelId}')
  })
})
