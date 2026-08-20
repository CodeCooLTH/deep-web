import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMMENT_CAPABLE_PROVIDERS,
  SHOW_COMMENT_CHANNEL_FILTER,
  resolveCommentProvider
} from './comment-channel-filter'

const SRC = readFileSync(join(process.cwd(), 'src/lib/comment-channel-filter.ts'), 'utf8')
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

describe('SHOW_COMMENT_CHANNEL_FILTER', () => {
  /**
   * 🛑 ตัวดักหลักของไฟล์นี้ — ไม่ได้ตรวจว่า "ค่าตอนนี้คืออะไร" แต่ตรวจว่า **มันยัง derive อยู่**
   *
   * ความเสี่ยงจริงคือคนถัดไปเห็นว่ามันเป็น false เสมอ แล้วเขียนทับเป็นค่าคงที่เพื่อความง่าย
   * ⇒ วันที่ Instagram comments เปิดใช้ พิลล์ช่องทางจะไม่กลับมาเอง และไม่มีอะไรฟ้อง
   */
  it('[blocker] ต้อง derive จาก COMMENT_CAPABLE_PROVIDERS ห้าม hardcode true/false', () => {
    const decl = SRC.match(/SHOW_COMMENT_CHANNEL_FILTER\s*:\s*boolean\s*=\s*(.+)/)?.[1] ?? ''
    expect(decl).toContain('COMMENT_CAPABLE_PROVIDERS')
    expect(decl).not.toMatch(/^\s*(true|false)\b/)
  })

  it('[blocker] ซ่อนพิลล์เมื่อมีช่องทางที่ให้ผลต่างกันจริงไม่ถึง 2 ตัว', () => {
    expect(SHOW_COMMENT_CHANNEL_FILTER).toBe(COMMENT_CAPABLE_PROVIDERS.length > 1)
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
