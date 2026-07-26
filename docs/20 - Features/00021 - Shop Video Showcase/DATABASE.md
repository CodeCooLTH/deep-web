---
title: "DATABASE — Shop Video Showcase"
owner: shinobu22
status: implemented
module: M00021-ShopVideoShowcase
version: "1.0"
created: 2026-07-26
tags: [feature, database, prisma, migration]
related: ["[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M00021-ShopVideoShowcase · **เอกสาร:** Database Design · **สถานะ:** Implemented (apply แล้วทั้ง dev/prod)

# DATABASE: Shop Video Showcase

## 1. ตารางใหม่ — `ShopVideo`

| คอลัมน์ | ชนิด | null | ความหมาย |
|---|---|---|---|
| `id` | TEXT (uuid) | ไม่ | คีย์หลัก |
| `shopId` | TEXT | ไม่ | FK → `Shop.id`, ON DELETE CASCADE |
| `provider` | TEXT | ไม่ | `FACEBOOK` / `INSTAGRAM` / `TIKTOK` / `YOUTUBE` — เป็น String ตาม convention เดิมของ repo ที่มิเรอร์ `ShopChannel.provider` |
| `videoId` | TEXT | ไม่ | id หรือ shortcode ของคลิปบนแพลตฟอร์ม |
| `caption` | TEXT | ได้ | ข้อความประกอบคลิป |
| `thumbnailUrl` | TEXT | ได้ | รูปปกจาก CDN ของแพลตฟอร์ม |
| `accountName` | TEXT | ได้ | ชื่อบัญชีต้นทาง |
| `likeCount` / `commentCount` / `viewCount` | INTEGER | ได้ | snapshot ยอด ณ เวลาที่ร้านกดบันทึก |
| `sortOrder` | INTEGER | ไม่ (0) | ลำดับที่ร้านจัด |
| `createdAt` | TIMESTAMP(3) | ไม่ | เวลาสร้าง |

### ดัชนีและข้อจำกัด

- `UNIQUE (shopId, provider, videoId)` — กันคลิปเดิมซ้ำในร้านเดียวกัน
- `INDEX (shopId, sortOrder)` — รูปแบบการอ่านมีแบบเดียวคือ "ดึงคลิปของร้านนี้ตามลำดับ"

## 2. เหตุผลของรูปแบบข้อมูล

**ไม่เก็บ URL ดิบ** เก็บแค่ `provider` + `videoId` แล้วประกอบ URL ฝังขึ้นใหม่ทุกครั้งที่แสดงผล ถ้าเก็บ URL ที่รับมาตรง ๆ ค่าใน DB จะกลายเป็นค่าที่ผู้ใช้กำหนดได้เอง แล้วนำไปสร้าง iframe ซึ่งเปิดช่องให้ชี้ไปที่ไหนก็ได้

**ยอดเป็น snapshot ไม่ใช่ค่าสด** การยิง API ของแพลตฟอร์มทุกครั้งที่มีคนเปิดหน้าร้านจะช้าและชนลิมิต ค่าอัปเดตเมื่อร้านกดบันทึกใหม่ ผลข้างเคียงที่ยอมรับคือตัวเลขล้าสมัยได้

**ทุกคอลัมน์สถิติเป็น nullable** เพราะแต่ละแพลตฟอร์มให้ข้อมูลไม่เท่ากัน และ null ต่างจาก 0 อย่างมีความหมาย (ดู BR-V4)

**CASCADE ตอนลบร้าน** คลิปที่ผูกกับร้านที่ไม่มีแล้วไม่มีความหมาย

## 3. Migration

| ไฟล์ | ทำอะไร |
|---|---|
| `20260726120000_shop_video` | สร้างตาราง + ดัชนี + FK |
| `20260726150000_shop_video_stats` | เพิ่ม `accountName`, `likeCount`, `commentCount`, `viewCount` |

เขียนด้วยมือทั้งสองไฟล์ตาม `docs/conventions/prisma-shared-db-drift.md` — DB dev กับ prod เป็นตัวเดียวกันและมี unmanaged SQL ที่ introspection มองไม่เห็น การใช้ `migrate dev` หรือ `db pull` จะสร้าง migration ที่ DROP ของที่ยังใช้อยู่

การเพิ่มคอลัมน์ทั้งหมดเป็น nullable จึงไม่ต้อง backfill และไม่ล็อกตารางนาน

## 4. ผลกระทบต่อตารางเดิม

`Shop` เพิ่ม relation `videos ShopVideo[]` เท่านั้น ไม่มีการแก้คอลัมน์เดิม

หมายเหตุ: `20260725130000_shop_cover_image` (เพิ่ม `Shop.coverImage`) อยู่ในชุดงานเดียวกันแต่เป็นคนละเรื่อง — เป็นภาพหน้าปกร้าน ไม่ใช่ส่วนของฟีเจอร์คลิป
