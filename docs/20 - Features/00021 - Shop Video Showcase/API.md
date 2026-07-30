---
title: "API — Shop Video Showcase"
owner: shinobu22
status: implemented
module: M00021-ShopVideoShowcase
version: "1.0"
created: 2026-07-26
tags: [feature, api, rest, video]
related: ["[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M00021-ShopVideoShowcase · **เอกสาร:** API Reference · **สถานะ:** Implemented

# API: Shop Video Showcase

มี endpoint เดียว ทำงานกับร้านที่ active อยู่ใน session เท่านั้น — **ไม่รับ `shopId` จาก request** ขอบเขตร้านมาจาก `requireActiveShop(session)` เสมอ

## `GET /api/shops/current/videos`

คืนคลิปที่ปักหมุดไว้ พร้อมรายการคลิปทั้งหมดที่เลือกได้จากบัญชีที่เชื่อมไว้

**200**
```jsonc
{
  "selected": [
    { "id": "…", "provider": "FACEBOOK", "videoId": "800277546442607",
      "caption": "…", "thumbnailUrl": "https://…", "accountName": "ธนภัทร์ อะไหล่",
      "likeCount": 55, "commentCount": 2, "viewCount": 5316, "sortOrder": 0 }
  ],
  "available": [ /* PickableVideo — รูปเดียวกับด้านบน + permalink */ ],
  "partial": false,   // true = รายการที่เห็นอาจไม่ครบ เพราะถามแพลตฟอร์มไม่สำเร็จ
  "max": 6
}
```

`partial` เป็น **boolean** ไม่ใช่รายชื่อช่องทาง — บอกได้แค่ว่า "รายการนี้อาจไม่ครบ" ไม่ได้บอกว่าช่องไหนล้ม มีไว้ให้หน้าจอแยกได้ว่า "ดึงไม่ได้ตอนนี้" ต่างจาก "ร้านไม่มีคลิป"

| สถานะ | เมื่อไหร่ |
|---|---|
| 401 | ไม่มี session |
| 404 | session ไม่มีร้าน active |

## `PUT /api/shops/current/videos`

แทนที่รายการคลิปที่ปักหมุดทั้งชุด (ไม่ใช่เพิ่มทีละอัน)

**Request**
```jsonc
{ "items": [ { "provider": "FACEBOOK", "videoId": "800277546442607" } ] }
```

ส่งแค่ `provider` + `videoId` — caption, รูปปก, ยอด ระบบดึงจากรายการสดฝั่ง server เอง ไม่รับจาก client เพราะเป็นค่าที่ผู้ใช้แก้ได้ (BR-V3)

**ลำดับการตรวจ** — สำคัญ เรียงแบบนี้โดยตั้งใจ

1. มี session ไหม → 401
2. มีร้าน active ไหม → 404
3. รูปร่าง payload ถูกไหม (Valibot) → 400
4. เกิน 6 คลิปไหม → 400 `TOO_MANY`
5. ดึงรายการสดจากแพลตฟอร์ม แล้วเทียบว่าทุกคลิปที่ขออยู่ในรายการนั้น
   - อยู่ครบ → ผ่าน **ไม่ว่าช่องทางอื่นจะถามสำเร็จหรือไม่**
   - ไม่ครบ + ถามไม่สำเร็จ → 503 `VERIFY_UNAVAILABLE` (แยกไม่ออกว่าไม่ใช่ของร้าน หรือแค่ตรวจไม่ได้)
   - ไม่ครบ + ถามสำเร็จหมด → 403 `NOT_OWNED`
6. เขียนทับทั้งชุดใน transaction

**เหตุผลของลำดับในขั้น 5:** รายการที่ไม่ครบทำให้เกิดได้แค่ "ปฏิเสธคลิปที่ถูกต้อง" ไม่ทำให้ "รับคลิปที่ไม่ใช่ของร้าน" เพราะเช็คว่า id ที่ขอ *อยู่ใน* รายการ ไม่ได้เช็คว่าไม่อยู่ — ความปลอดภัยจึงไม่ลดลง และร้านที่เชื่อมทั้ง FB กับ IG ยังแก้คลิป FB ได้ตอน IG ล่ม

และ 503 ต้องมาก่อน 403 เสมอเมื่อยืนยันไม่ครบ ถ้าสลับกัน การดึงข้อมูลล้มเหลวจะถูกตีความเป็น "คลิปไม่ใช่ของร้านนี้" ซึ่งกล่าวหาร้านที่สุจริต

**200**
```jsonc
{ "ok": true, "count": 3 }
```

| สถานะ | รหัส | ความหมาย |
|---|---|---|
| 400 | — / `TOO_MANY` | payload ผิดรูป / เลือกเกิน 6 คลิป (ปฏิเสธชัด ๆ ไม่ตัดเงียบ) |
| 401 | — | ไม่มี session |
| 403 | `NOT_OWNED` | มีคลิปที่ไม่ได้อยู่ในบัญชีที่เชื่อมไว้ |
| 404 | — | ไม่มีร้าน active |
| 503 | `VERIFY_UNAVAILABLE` | ตรวจสอบกับแพลตฟอร์มไม่ได้ตอนนี้ — ยังไม่บันทึกอะไร |

## API ภายนอกที่เรียก

| ปลายทาง | ใช้ทำอะไร | scope ที่ต้องมี |
|---|---|---|
| `GET /{page-id}/video_reels` | รายการ reels ของเพจ + `views` + `likes.summary` + `thumbnails` | มีอยู่แล้วจากการเชื่อมช่องทางแชท |
| `GET /{ig-user-id}/media` | รายการโพสต์ IG (คัดเฉพาะ `VIDEO`/`REELS`) + `permalink` + `like_count` | `instagram_basic` (มีอยู่แล้ว) |
| `GET /{ig-media-id}/insights` | ยอดวิว IG | `instagram_manage_insights` — **ยังขอไม่ได้** ต้องเปิดใน App Dashboard + ผ่าน App Review ก่อน ใส่ใน scope เฉย ๆ ทำให้เชื่อมเพจไม่ได้ทั้งกระบวนการ |
