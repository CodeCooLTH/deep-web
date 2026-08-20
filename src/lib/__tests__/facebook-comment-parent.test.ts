/**
 * [blocker] เกณฑ์ "คอมเมนต์นี้เป็น reply ไหม" — ค่าทุกตัวในเทสนี้ยกมาจาก payload/ฐาน prod จริง
 *
 * ห้ามแต่ง id เอาเอง: เทสที่แต่งค่าตามข้อสันนิษฐานของโค้ด ยืนยันได้แค่ว่า "โค้ดทำตามที่คนเขียนคิด"
 * ไม่ใช่ว่า "คนเขียนคิดถูก" — ซึ่งเป็นเหตุผลที่เกณฑ์เดิมมีเทสเขียวอยู่ตลอดขณะที่มันผิดบน prod
 * (docs/conventions/external-payload-schema.md)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCommentParentId } from '../facebook-comment-parent'

/** ตัดคอมเมนต์ทิ้ง — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนี้ไว้ด้วย (บทเรียน grep gate HR9) */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

describe('[blocker] resolveCommentParentId', () => {
  it('โพสต์อัลบั้ม: parent_id เป็น id ของอัลบั้ม ⇒ ต้องเป็นคอมเมนต์ระดับบน (null)', () => {
    /**
     * payload จริงบน prod ของคอมเมนต์ "สนใจ" จากลูกค้า (โพสต์อัลบั้มโช๊คหลังสปริง 335 มม.
     * เพจธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง) — ภาพจาก Facebook ยืนยันว่าเป็นคอมเมนต์ระดับบน
     * ไม่ได้ซ้อนใต้ใคร แต่เกณฑ์เดิม (`parent_id !== post_id`) ตอบว่าเป็น reply ⇒ คอมเมนต์หายจากจอ
     */
    expect(
      resolveCommentParentId({
        parentId: '25074413458893825_122292167546160689',
        commentId: '122292167426160689_1752610055772931',
      }),
    ).toBeNull()
  })

  it('โพสต์รูปเดียว: parent_id = post_id ⇒ ระดับบน (null)', () => {
    // payload จริงของคอมเมนต์สติกเกอร์ (Sitipong) — parent_id เท่ากับ post_id เป๊ะ
    expect(
      resolveCommentParentId({
        parentId: '207934275730961_122290800428160689',
        commentId: '122290800428160689_1059987033071437',
      }),
    ).toBeNull()
  })

  it('reply จริง: objectId ตัวหน้าตรงกัน ⇒ คืน parent_id ตามเดิม', () => {
    // รูปแบบของ 496 แถวบน prod ที่หาแถวแม่เจอจริง — reply อยู่บน object เดียวกับตัวมันเอง
    expect(
      resolveCommentParentId({
        parentId: '122280467450160689_1369300195167758',
        commentId: '122280467450160689_9876543210123456',
      }),
    ).toBe('122280467450160689_1369300195167758')
  })

  it('reply ที่เราไม่เคยเก็บแม่ ยังต้องนับเป็น reply — คนละปัญหากับการจำแนก', () => {
    // 6 แถวบน prod ที่ prefix ตรงแต่หาแม่ไม่เจอ (backfill ดึงหน้าเดียว 30 อันแล้วทิ้ง cursor)
    // ตัวจำแนกต้องตอบตามความจริงของ payload ไม่ใช่ตามว่าฐานเรามีข้อมูลครบไหม
    expect(
      resolveCommentParentId({
        parentId: '122280467450160689_1369300195167758',
        commentId: '122280467450160689_1111111111111111',
      }),
    ).toBe('122280467450160689_1369300195167758')
  })

  it('ไม่มี parent_id ⇒ null', () => {
    expect(resolveCommentParentId({ parentId: null, commentId: '123_456' })).toBeNull()
    expect(resolveCommentParentId({ parentId: undefined, commentId: '123_456' })).toBeNull()
  })

  it('fail-closed: อ่าน objectId ไม่ออก ⇒ ถือเป็นระดับบน (โผล่เกินดีกว่าหายไปเลย)', () => {
    expect(resolveCommentParentId({ parentId: 'ไม่มีขีดล่าง', commentId: '123_456' })).toBeNull()
    expect(resolveCommentParentId({ parentId: '123_456', commentId: 'ไม่มีขีดล่าง' })).toBeNull()
    expect(resolveCommentParentId({ parentId: '123_456', commentId: null })).toBeNull()
    // ขีดล่างนำหน้า = ไม่มี objectId
    expect(resolveCommentParentId({ parentId: '_456', commentId: '123_456' })).toBeNull()
  })
})

/**
 * [blocker] เกณฑ์ต้องถูก "ใช้" ไม่ใช่แค่ "มีอยู่"
 *
 * บทเรียน rule-must-be-enforced-not-described.md: 00037 เขียนกฎไว้ครบ 3 ที่แต่ไม่มีด่านบังคับ
 * ⇒ ออเดอร์ลงร้านผิดเงียบ ๆ บน prod. ฟังก์ชันบริสุทธิ์ที่ไม่มีใครเรียกก็เหมือนกัน — เทสเขียว
 * ตลอดขณะที่ ingest ยังเขียนค่าผิดลงฐานต่อไป
 */
describe('[blocker] page-comment.service ต้องเรียกเกณฑ์กลาง ไม่เขียนเงื่อนไขเอง', () => {
  const src = stripComments(
    readFileSync(join(process.cwd(), 'src/services/page-comment.service.ts'), 'utf8'),
  )

  it('ต้องเรียก resolveCommentParentId ทั้ง 2 ทางเข้า (webhook + Graph backfill)', () => {
    const calls = src.match(/resolveCommentParentId\(/g) ?? []
    expect(
      calls.length,
      'ทางเข้ามี 2 ทาง: ingestFeedComment (webhook) และ backfillPostComments (Graph) — ต้องใช้เกณฑ์เดียวกันทั้งคู่',
    ).toBeGreaterThanOrEqual(2)
  })

  it('ต้องไม่มีเงื่อนไขเดิมที่เทียบกับ post id หลงเหลือ', () => {
    // แดง = มีคนเขียนกติกาซ้ำในไฟล์ ⇒ ที่หนึ่งจะล้าสมัยเสมอ และคอมเมนต์อัลบั้มจะหายจากจออีกรอบ
    expect(src).not.toMatch(/parent_id\s*!==\s*val\.post_id/)
    expect(src).not.toMatch(/parentId\s*!==\s*post\.externalPostId/)
  })
})
