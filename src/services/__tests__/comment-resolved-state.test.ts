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

  it('CASE ทั้ง 2 ก้อนต้องมีสาขา resolvedAt', () => {
    const branches = src.match(/c\."resolvedAt" IS NOT NULL THEN 'HUMAN_ANSWERED'/g) ?? []
    expect(
      branches.length,
      'countCommentPostStatesByShop และ countCommentStatesByShop ต้องมีสาขา resolvedAt ครบทั้งคู่',
    ).toBe(2)
  })

  it('สาขา resolvedAt ต้องอยู่ "อันสุดท้ายก่อน ELSE" ให้ตรงกับลำดับใน TS (BR-CR-R2)', () => {
    // ถ้าใครย้ายขึ้นไปไว้ก่อนสาขาคำตอบสาธารณะ ตัวเลขจะยังบวกได้เท่าเดิมทุกประการ
    // แต่คอมเมนต์ที่บอทตอบแล้วและถูกกดข้ามจะย้ายจาก BOT_ANSWERED ไป HUMAN_ANSWERED เงียบ ๆ
    const pattern = /c\."resolvedAt" IS NOT NULL THEN 'HUMAN_ANSWERED'\s+ELSE 'UNANSWERED'/g
    expect((src.match(pattern) ?? []).length).toBe(2)
  })

  it('ทั้ง 2 query ต้องดึงคอลัมน์ resolvedAt มาให้ deriveCommentState ใช้จริง', () => {
    // ส่งค่าเข้าไป ≠ ค่าถูกใช้ — เช็คว่ามีการส่ง `c.resolvedAt !== null` เข้า deriveCommentState
    // ไม่ใช่แค่ว่า select มา (value-fate-decided-at-write-site ทิศกลับ)
    const calls = src.match(/resolvedAt !== null/g) ?? []
    expect(calls.length, 'listComments และ listCommentPosts ต้องส่ง resolved เข้า deriveCommentState').toBe(2)
  })
})
