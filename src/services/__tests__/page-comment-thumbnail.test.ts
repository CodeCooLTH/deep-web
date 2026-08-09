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
import { resolvePostThumbnail } from '../page-comment.service'

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
