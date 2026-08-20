import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMMENT_CAPABLE_PROVIDERS, resolveCommentProvider } from './comment-channel-filter'

const SERVICE = readFileSync(join(process.cwd(), 'src/services/page-comment.service.ts'), 'utf8')

describe('resolveCommentProvider', () => {
  it('[blocker] ALL แปลงเป็นช่องทางที่มีคอมเมนต์ได้ ไม่ใช่คำว่า ALL ที่ไม่ match อะไรเลย', () => {
    // เขียนกลับด้าน (`filter ?? 'ALL'`) แล้ว SQL จะได้ `sc.provider = 'ALL'` = ทั้งหน้าว่างเปล่า
    // โดยไม่มี error สักตัว — นี่คือเหตุผลที่ตัวแปลงนี้ต้องมีเทส
    expect(resolveCommentProvider('ALL')).toBe('MESSENGER')
    expect(resolveCommentProvider(undefined)).toBe('MESSENGER')
  })

  it('[blocker] ช่องทางที่ระบุมาต้องถูกส่งต่อตรงตัว ห้ามถูกกลืนเป็น MESSENGER', () => {
    // DEEP/INSTAGRAM ต้องได้ผลลัพธ์ว่าง (ความจริง) ไม่ใช่ผลของ MESSENGER (คำโกหกที่ดูปกติ)
    expect(resolveCommentProvider('DEEP')).toBe('DEEP')
    expect(resolveCommentProvider('INSTAGRAM')).toBe('INSTAGRAM')
    expect(resolveCommentProvider('MESSENGER')).toBe('MESSENGER')
  })
})

describe('COMMENT_CAPABLE_PROVIDERS', () => {
  /**
   * 🛑 เทสตัวนี้ **ตั้งใจให้แดงตอนเพิ่มช่องทาง** ไม่ใช่การล็อกค่าไว้ตลอดกาล
   *
   * `resolveCommentProvider` คืน "ค่าเดียว" และ SQL ใน page-comment.service.ts ใช้
   * `sc.provider = ${...}` ซึ่งถูกเฉพาะตอนมีผู้เข้าแข่งขันรายเดียว — เพิ่มรายที่สองโดยไม่แก้
   * สองจุดนั้น = ช่องทางใหม่จะหายไปจากรายการ/ตัวนับเงียบ ๆ ทั้งที่ปุ่มกรองโผล่มาให้กดแล้ว
   */
  it('[blocker] เพิ่มช่องทางที่มีคอมเมนต์ได้ ต้องแก้ resolveCommentProvider + SQL เป็น IN ด้วย', () => {
    expect(COMMENT_CAPABLE_PROVIDERS.length).toBe(1)
    // SQL ยังผูกกับ "ค่าเดียว" อยู่จริงไหม — ถ้าวันหนึ่งถูกแก้เป็น IN แล้ว เทสข้างบนควรถูกปลด
    expect(SERVICE).toContain('sc.provider = ')
  })
})
