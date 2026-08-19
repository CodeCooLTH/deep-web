import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "หน่วยของตัวนับ" ต้องเท่ากับ "หน่วยของแถวในลิสต์" เสมอ (feature 00029 ส่วนขยาย 2026-08-15)
 *
 * 🛑 ทำไมต้องมีด่านนี้ ทั้งที่ `comment-post-counts.test.ts` พิสูจน์ความตรงกันไปแล้ว
 * เทสตัวนั้นพิสูจน์ว่า badge กับตัวนับของลิสต์ยิง SQL เดียวกัน — แต่**ไม่ได้พิสูจน์ว่าเป็น SQL
 * ของหน่วยที่ถูก** ถ้าวันหนึ่งมีคนสลับทั้งคู่กลับไปเป็นตัวนับระดับโพสต์ เทสตัวนั้นจะยังเขียว
 * (ทั้งสองยังยิงเหมือนกันอยู่ดี) แต่จอจะกลับไปเป็น badge "7" เหนือรายการ 12 แถว
 *
 * คอลัมน์ซ้ายของ /inbox/comments เป็น **1 แถว = 1 คอมเมนต์** ตั้งแต่ 2026-08-15 (ผู้ใช้เคาะ)
 * ⇒ ทั้ง badge และตัวนับบนแท็บต้องผ่าน `countCommentStatesByShop` ไม่ใช่
 * `countCommentPostStatesByShop` ซึ่งยังมีอยู่เพื่อใช้กับที่อื่นที่นับเป็นโพสต์จริง ๆ
 *
 * สแกนซอร์สเพราะทั้งสองฟังก์ชันคืน `CommentPostCounts` ชนิดเดียวกัน — `tsc` จึงมองไม่เห็น
 * การสลับตัว (ชนิดถูกทั้งคู่ สิ่งที่ผิดคือ *ความหมาย*) ตัดคอมเมนต์ก่อนสแกนเสมอ เพราะไฟล์ที่ทำถูก
 * คือไฟล์ที่เขียนอธิบายกฎนี้ไว้ด้วย (รอยเดิม: grep gate ของ HR9 2026-08-02→03)
 */

const SERVICE = join(__dirname, '../page-comment.service.ts')

/** ลบคอมเมนต์แต่คงจำนวนบรรทัดไว้ เพื่อให้ข้อความอธิบายกฎไม่ถูกนับเป็นการเรียกจริง */
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank)
}

/**
 * เนื้อของฟังก์ชันตามชื่อ — ตัดตั้งแต่บรรทัดประกาศจนถึงประกาศ top-level ตัวถัดไป
 *
 * 🛑 ห้ามตัดที่ `\n}` ตัวแรก: ฟังก์ชันในไฟล์นี้รับ object type เป็นพารามิเตอร์ วงเล็บปิดของมัน
 * (`}): Promise<...> {`) อยู่คอลัมน์ 0 เหมือนกัน ⇒ จะได้เนื้อแค่ signature แล้วเทสแดงทั้งที่
 * โค้ดถูก (เจอจริงตอนเขียนด่านนี้ — ด่านที่ผูกกับ *รูปแบบการเขียน* พังง่ายกว่าที่คิด)
 */
function bodyOf(src: string, decl: string): string {
  const start = src.indexOf(decl)
  expect(start, `หาไม่เจอ: ${decl}`).toBeGreaterThanOrEqual(0)
  const next = src.indexOf('\nexport ', start + decl.length)
  return src.slice(start, next > start ? next : src.length)
}

describe('หน่วยของตัวนับคอมเมนต์ต้องตรงกับหน่วยของแถว', () => {
  const src = stripComments(readFileSync(SERVICE, 'utf8'))

  it('[blocker] badge บนแท็บ (countUnansweredForShops) ต้องนับ "คอมเมนต์" ไม่ใช่ "โพสต์"', () => {
    const body = bodyOf(src, 'export async function countUnansweredForShops(')
    expect(body).toContain('countCommentStatesByShop(')
    expect(body).not.toContain('countCommentPostStatesByShop(')
  })

  it('[blocker] ตัวนับที่ listComments คืนให้แท็บ ต้องมาจากฟังก์ชันตัวเดียวกับ badge', () => {
    const body = bodyOf(src, 'export async function listComments(')
    expect(body).toContain('countCommentStatesByShop(')
    expect(body).not.toContain('countCommentPostStatesByShop(')
  })

  it('[blocker] listComments ต้องไม่พาคอมเมนต์ของเพจเองเข้ามาเป็นแถว', () => {
    // เพจไม่ต้องตอบตัวเอง — กติกาเดียวกับที่ตัวนับใช้
    //
    // 🛑 ตั้งแต่ 2026-08-19 การเลือกแถวย้ายไปอยู่ใน $queryRaw (กรองก่อนตัดหน้า) เงื่อนไขจึงเขียน
    // เป็น SQL ไม่ใช่ object ของ Prisma อีกต่อไป — ด่านต้องตามไปตรวจที่รูปใหม่ ไม่ใช่แดงค้างเพราะ
    // รูปเดิมหายไป (กฎที่ปกป้องไม่ได้เปลี่ยน: แถวของเพจเองและแถวที่ถูกลบต้องไม่เข้ามา)
    const body = bodyOf(src, 'export async function listComments(')
    expect(body).toContain('c."isFromPage" = false')
    expect(body).toContain('c."isDeleted" = false')
  })

  it('[blocker] listComments ต้องกรอง state ก่อน LIMIT — ไม่ใช่ตัดหน้าแล้วค่อยกรอง', () => {
    // บั๊กที่ user เจอบน prod 2026-08-19: แท็บ "หมดอายุ" ขึ้นเลข 41 แต่รายการว่างเปล่า เพราะ
    // ของที่เข้าเกณฑ์ตัวแรกอยู่ลำดับที่ 70 จาก 253 — หน้าแรก 25 แถวไม่มีสักใบ
    const body = bodyOf(src, 'export async function listComments(')
    const stateAt = body.indexOf('${stateSql}')
    const limitAt = body.indexOf('LIMIT ${take}')
    expect(stateAt, 'ต้องมีการกรอง state ใน SQL').toBeGreaterThan(0)
    expect(stateAt).toBeLessThan(limitAt)
  })

  it('[blocker] ทางที่ถูกยังอยู่จริง — กันด่านข้างบนกลายเป็นด่านเปล่าเมื่อมีคนเปลี่ยนชื่อฟังก์ชัน', () => {
    expect(src).toContain('export async function countCommentStatesByShop(')
    expect(src).toContain('export async function listComments(')
    // ตัวนับระดับโพสต์ยังต้องมีอยู่ (ยังมีผู้เรียกอื่น) — ถ้าหายไปแปลว่ามีคนลบผิดตัว
    expect(src).toContain('export async function countCommentPostStatesByShop(')
  })
})
