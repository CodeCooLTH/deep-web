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
  "available": {
    "items": [ /* PickableVideo — รูปเดียวกับด้านบน + permalink */ ],
    "failed": ["INSTAGRAM"]   // ช่องทางที่ดึงไม่สำเร็จรอบนี้
  },
  "max": 6
}
```

`available.failed` มีไว้ให้หน้าจอบอกผู้ใช้ได้ว่า "ช่องทางนี้ดึงไม่ได้ตอนนี้" แทนที่จะแสดงเหมือนไม่มีคลิป

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
4. ดึงรายการสดจากแพลตฟอร์ม — **ล้มเหลว → 503 `VERIFY_UNAVAILABLE`** (หยุดตรงนี้ ไม่เดาต่อ)
5. ทุกคลิปอยู่ในรายการสดไหม → ไม่ครบ = 403 `NOT_OWNED`
6. เกิน 6 คลิป → 400
7. เขียนทับทั้งชุดใน transaction

ขั้น 4 ต้องมาก่อนขั้น 5 เสมอ ถ้าสลับกัน การดึงข้อมูลล้มเหลวจะถูกตีความเป็น "คลิปไม่ใช่ของร้านนี้" ซึ่งกล่าวหาร้านที่สุจริต

**200**
```jsonc
{ "ok": true, "count": 3 }
```

| สถานะ | รหัส | ความหมาย |
|---|---|---|
| 400 | — | payload ผิดรูป หรือเกินจำนวนสูงสุด |
| 401 | — | ไม่มี session |
| 403 | `NOT_OWNED` | มีคลิปที่ไม่ได้อยู่ในบัญชีที่เชื่อมไว้ |
| 404 | — | ไม่มีร้าน active |
| 503 | `VERIFY_UNAVAILABLE` | ตรวจสอบกับแพลตฟอร์มไม่ได้ตอนนี้ — ยังไม่บันทึกอะไร |

## API ภายนอกที่เรียก

| ปลายทาง | ใช้ทำอะไร | scope ที่ต้องมี |
|---|---|---|
| `GET /{page-id}/video_reels` | รายการ reels ของเพจ + `views` + `likes.summary` + `thumbnails` | มีอยู่แล้วจากการเชื่อมช่องทางแชท |
| `GET /{ig-user-id}/media` | รายการโพสต์ IG (คัดเฉพาะ `VIDEO`/`REELS`) + `permalink` + `like_count` | `instagram_basic` (มีอยู่แล้ว) |
| `GET /{ig-media-id}/insights` | ยอดวิว IG | `instagram_manage_insights` — **เพิ่มเข้าไปแล้วแต่ร้านที่เชื่อมก่อนหน้าต้องเชื่อมใหม่** |
