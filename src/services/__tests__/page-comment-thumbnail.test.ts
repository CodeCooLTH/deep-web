// page-comment-thumbnail.test.ts — ล็อกกติกา "รูปปกโพสต์ต้องไม่หายไปเอง"
//
// ที่มา: user เจอบน prod 2026-08-09 — รูปปกในรายการซ้ายของ /inbox/comments ทยอยกลายเป็น
// กล่องขาวเปล่า โดยโพสต์อายุ 4 วันยังมีรูป ส่วนใบ 5 วันหายหมด เพราะ `FacebookPost.thumbnailUrl`
// เก็บ URL ของ fbcdn ดิบซึ่งหมดอายุ ~4 วัน
//
// ทำไมต้องมีเทส: ความล้มเหลวของกติกานี้ **เงียบสนิทตอนพัฒนา** — คนเขียนโค้ดเปิดหน้าจอตอนเดฟแล้ว
// เห็นรูปครบทุกใบ (URL เพิ่งดึงมา ยังไม่หมดอายุ) `tsc`/build/หน้าจอผ่านหมด แล้วมันค่อยพังเองเงียบ ๆ
// อีก 4 วันให้หลังบนเครื่องผู้ใช้ — คลาสเดียวกับที่ shop-video.service.test.ts ล็อกไว้แล้ว
// (บทเรียนซ้ำรอบที่ 3 ของโปรเจกต์: ShopVideo · การ์ด carousel ในแชท · และหน้านี้)
//
// [blocker] แดงเมื่อไหร่ห้าม merge

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePostThumbnail, resolveCommentAttachment } from '../page-comment.service'

const FBCDN = 'https://scontent.fbcdn.net/v/t39.jpg?oe=68AB1234'
const FILE_ID = '2026/08/09/abc.jpg'

describe('[blocker] resolvePostThumbnail — สำเนาที่เก็บเองต้องชนะ URL ของ Meta เสมอ', () => {
  it('มีสำเนา + มี URL ของ Meta → ใช้สำเนา (ไม่ใช่ URL ที่หมดอายุได้)', () => {
    expect(resolvePostThumbnail({ mirroredFileId: FILE_ID, thumbnailUrl: FBCDN })).toBe(
      `/api/files/${FILE_ID}`,
    )
  })

  it('ยังไม่มีสำเนา → ตกไปใช้ URL ของ Meta (โพสต์ใหม่ที่ mirror ไม่ทัน ต้องยังเห็นรูป)', () => {
    // กิ่งนี้ต้องคงอยู่: ถ้าตัดทิ้งเพราะ "เดี๋ยวก็ mirror ครบเอง" โพสต์ระหว่างทางจะไม่มีรูปเลย
    expect(resolvePostThumbnail({ mirroredFileId: null, thumbnailUrl: FBCDN })).toBe(FBCDN)
  })

  it('ไม่มีทั้งคู่ → null (UI ต้องได้กิ่ง "ไม่มีรูป" = กล่องเทา+ไอคอน ไม่ใช่กล่องขาวเปล่า)', () => {
    expect(resolvePostThumbnail({ mirroredFileId: null, thumbnailUrl: null })).toBeNull()
  })

  it('สำเนาว่างเปล่า (สตริงว่าง) ต้องไม่ชนะ — ไม่งั้นได้ src="/api/files/" ที่ 404 ทุกใบ', () => {
    expect(resolvePostThumbnail({ mirroredFileId: '', thumbnailUrl: FBCDN })).toBe(FBCDN)
  })
})

/**
 * [blocker] รอบที่ 4 ของบทเรียนเดียวกัน — คราวนี้เป็น **ไฟล์แนบในคอมเมนต์**
 *
 * user เจอเองบน prod 2026-08-20: คอมเมนต์ของลูกค้าขึ้นเป็นไอคอนรูปแตกกลางบับเบิล
 * `PageComment.attachmentUrl` เก็บ URL ของ fbcdn ดิบ เหมือนที่ `FacebookPost.thumbnailUrl`
 * เคยเป็นเมื่อ 2026-08-09 — แก้ไปแล้วหนึ่งตาราง แต่ตารางข้าง ๆ ในไฟล์เดียวกันไม่ได้แก้ตาม
 *
 * 🛑 ข้อเท็จจริงที่วัดได้ ณ วันแก้ (นับจากพารามิเตอร์ `oe=` ของทั้ง 222 แถว ไม่ใช่เดาจากอายุ):
 * **หมดอายุไปแล้ว 167 · ยังเปิดได้ 54** — และอายุคอมเมนต์ **ไม่สัมพันธ์** กับสถานะ URL เลย
 * (อายุ 536 วันยังได้ HTTP 200 แต่อายุ 5 วันได้ 403) เพราะนาฬิกาเริ่มเดินตอน *ออก URL* ไม่ใช่
 * ตอนลูกค้าคอมเมนต์ ⇒ **ห้ามเขียนโค้ด/เทสที่ตัดสินความสดของ URL จากอายุแถว**
 */
describe('[blocker] resolveCommentAttachment — สำเนาต้องชนะ URL ของ Meta เสมอ', () => {
  it('มีสำเนา + มี URL ของ Meta → ใช้สำเนา', () => {
    expect(resolveCommentAttachment({ mirroredFileId: FILE_ID, attachmentUrl: FBCDN })).toBe(
      `/api/files/${FILE_ID}`,
    )
  })

  it('ยังไม่มีสำเนา → ตกไปใช้ URL เดิม (ดีกว่าไม่มีอะไรเลย แม้อาจตายแล้ว)', () => {
    expect(resolveCommentAttachment({ mirroredFileId: null, attachmentUrl: FBCDN })).toBe(FBCDN)
  })

  it('ไม่มีทั้งคู่ → null', () => {
    expect(resolveCommentAttachment({ mirroredFileId: null, attachmentUrl: null })).toBeNull()
  })
})

describe('[blocker] ห้ามส่ง attachmentUrl ดิบออกจาก service', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/page-comment.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

  it('ตัว serialize ต้อง resolve ผ่าน resolveCommentAttachment ไม่ส่ง c.attachmentUrl ตรง ๆ', () => {
    // แดง = มีทางที่ URL หมดอายุหลุดออกไปถึงหน้าจออีกครั้ง
    expect(src).not.toMatch(/attachmentUrl: c\.attachmentUrl,\s*\n\s*createdTime: c\.createdTime,\s*\n\s*(editedAt|state)/)
    expect(src).toMatch(/attachmentUrl: resolveCommentAttachment\(c\)/)
  })

  /**
   * ตรวจ **ในบล็อกเดียวกัน** ไม่ใช่เทียบจำนวนรวมทั้งไฟล์ — ร่างแรกเทียบ count ของ
   * `mirroredFileId: true` กับ `attachmentUrl: true` ซึ่งไร้ความหมาย เพราะไฟล์นี้มี
   * `mirroredFileId: true` ของ **FacebookPost** อยู่ด้วยอีกจุด ⇒ ลบของฝั่งคอมเมนต์ทิ้งแล้วเทสยังเขียว
   * (พิสูจน์ด้วย mutation แล้วว่าไม่แดงจริง — เทสที่จับ regression ของตัวเองไม่ได้คือเทสที่ไร้ค่า)
   */
  it('select ที่ดึง attachmentUrl ต้องดึง mirroredFileId ในบล็อกเดียวกันเสมอ', () => {
    // ขาดฟิลด์นี้ = resolve เห็น undefined แล้วตกไปใช้ URL ที่ตายแล้วทุกครั้ง โดย tsc ไม่ฟ้อง
    const lines = src.split('\n')
    const hits = lines.flatMap((l, i) => (/attachmentUrl: true/.test(l) ? [i] : []))
    expect(hits.length, 'ไม่เจอ select ของคอมเมนต์เลย — เปลี่ยนโครง query แล้วต้องแก้เทสนี้ด้วย').toBeGreaterThan(0)
    for (const i of hits) {
      const near = lines.slice(Math.max(0, i - 8), i + 9).join('\n')
      expect(near, `select ที่บรรทัด ${i + 1} ดึง attachmentUrl แต่ไม่ดึง mirroredFileId`).toMatch(
        /mirroredFileId: true/,
      )
    }
  })

  it('ทั้ง 2 ทางเข้า (webhook + Graph backfill) ต้อง mirror', () => {
    const calls = src.match(/mirrorCommentAttachment\(/g) ?? []
    // 1 = นิยามฟังก์ชัน + อีก 2 = จุดเรียกจริง
    expect(calls.length, 'ทางใดทางหนึ่งไม่ mirror = สะสมแถวที่ URL ตายต่อไปเงียบ ๆ').toBeGreaterThanOrEqual(3)
  })
})
