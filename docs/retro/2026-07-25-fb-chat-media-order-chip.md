# Retro — FB Chat (00018): media รองรับครบ + ไอคอนออเดอร์ในแถวแชท

> ช่วงงาน: 2026-07-25
> Surface: seller `(paces)/(chat)/**` (inbox + customer panel), `src/services/channel-chat.service.ts`, `src/lib/facebook/graph.ts`, Supabase Storage (`uploads` bucket)
> ผลลัพธ์: **deployed prod** ทั้งหมด (push เข้า `main` → auto-deploy) — commit หลัก `8d5f1927` `042d23d0` `a6bb6154` `95523623` + storage config change (ไม่ใช่ commit)

---

## สิ่งที่ทำ (สรุป)

1. **Media/attachment ที่ขึ้น placeholder เล่นไม่ได้** (เสียง/วิดีโอ/gif) — ไล่จนเจอ **root cause = Supabase `uploads` bucket จำกัด `allowed_mime_types`** (jpeg/png/webp/pdf + 5MB) → S3 write reject ทุกชนิดอื่นด้วย `415 InvalidMimeType`. แก้ที่ storage config (`allowed_mime_types = NULL` + 25MB) — **ไม่ใช่โค้ด**
2. **Backfill** กู้เสียง/วิดีโอเก่า 8 ไฟล์ (ที่เหลือ Graph คืน `NO ATTACHMENT` = asset หมดอายุ กู้ไม่ได้)
3. **sticker/GIF/reel fallback** (`042d23d0`) — `fetchAttachmentUrl` อ่าน `attachments{file_url,image_data,video_data}` (เดิมอ่านแค่ `file_url` ซึ่งสติกเกอร์/GIF ไม่มี)
4. **ไอคอนออเดอร์ในแถว inbox** — เริ่มจากชิป "#เลข · สถานะ" (`a6bb6154`) → user pivot เป็น **ไอคอนตะกร้า + จำนวน** (`95523623`) กดเปิด right panel รายการคำสั่งซื้อ (desktop persistent + mobile sheet ผ่าน `?panel=orders`)
5. **SSOT palette** — จากที่ `safepay-ux` flag ว่ามี status-palette 3 ชุด → รวมเป็น `ORDER_STATUS_META` ใน `lib/order-display.ts` (StatusHero de-dupe import)

---

## บทเรียนใหญ่ที่สุด — media write ล้มเงียบ ๆ = เช็ค write path จริงก่อน อย่าเดาว่าเป็นโค้ด

อาการ: เสียง/รูปขึ้น `[... — เปิดดูใน Messenger]` เล่นไม่ได้. แก้ไป **2 รอบที่ฝั่งโค้ด mirror** (`8d5f1927` + `042d23d0` — Graph fallback ดึง url สด) แล้ว user ยังบอก **"เหมือนเดิม"** ทั้งที่ deploy live แล้ว.

รากปัญหาจริง: **ไม่เกี่ยวกับโค้ด mirror เลย** — mirror fetch ไฟล์มาได้ปกติ แต่ตอน `saveFile → PutObject` ลง Supabase S3 โดน reject ด้วย **HTTP 415 `InvalidMimeType`** เพราะ bucket `uploads` ตั้ง `allowed_mime_types = [image/jpeg, image/png, image/webp, application/pdf]` — `audio/ogg`/`video/mp4`/`image/gif` ไม่อยู่ในลิสต์ → throw เงียบ ๆ → `mirroredFileId = null` → ขึ้น placeholder.

จุดที่ปิดจบใน 1 shot:
```js
await c.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: 'audio/ogg' }))
// → InvalidMimeType | mime type audio/ogg is not supported (415)
```

→ **เมื่อ media/upload write ล้มเงียบ ๆ ให้ทดสอบ write path จริง (PutObject ด้วย content-type จริง) ตั้งแต่แรก** — 1 คำสั่งบอก root cause ได้เลย. อย่าไล่แก้โค้ด mirror/fetch ก่อนพิสูจน์ว่า write สำเร็จ. บันทึกไว้ที่ memory `project_supabase_uploads_bucket_mime_limit`.

หมายเหตุความปลอดภัย: เปิด `allowed_mime_types = NULL` ปลอดภัยเพราะ serve ผ่าน `/api/files/[fileId]` ที่ derive Content-Type จาก **นามสกุลไฟล์** (ไม่ใช่ค่าที่ S3 เก็บ) + `nosniff` + บังคับ `attachment` สำหรับชนิดที่เปิด inline ไม่ได้; user upload ยังผ่าน `validateUpload` (app-layer) — เฉพาะ mirror ที่ `skipValidation`.

## บทเรียน — backfill script นับ success ผิดตำแหน่ง = log หลอกว่า "สำเร็จ"

รอบแรก backfill รายงาน **"สำเร็จ 8, ล้มเหลว 63"** (63 = จำนวน placeholder ทั้งหมด → double-count) เพราะเขียน `ok++` **ก่อน** `PutObject`:
```js
ok++                    // นับก่อน write
if (APPLY) {
  await s3.send(...)    // ← throw ตรงนี้ (415) → ตกไป catch { fail++ }
  await prisma.update(...)  // ← ไม่เคยรัน → DB ยัง placeholder
}
```
`ok` ถูกนับทั้งที่ write ล้มเหลว + ตัวเดียวกันไปโดน `catch{fail++}` ด้วย. ที่จับได้เพราะ **query DB จริงหลัง apply** เห็นข้อความยังเป็น `type=TEXT` placeholder อยู่ ทั้งที่ script บอกสำเร็จ.

→ **นับ success หลัง mutating op สำเร็จเท่านั้น** (ไม่ใช่ก่อน). และ **ตรวจ DB จริงหลัง apply** — อย่าเชื่อ summary log ที่ script พิมพ์เอง (เป็นตัวที่พาไปเจอ root cause จริง).

## บทเรียน — Messenger sticker/GIF อยู่ที่ `image_data` ไม่ใช่ `file_url`

Graph node ของข้อความ: `file_url` = ไฟล์อัปโหลด (image/video/audio/file); **สติกเกอร์/GIF ไม่มี `file_url` แต่มี `image_data.url`**; reel/วิดีโอบางเคสอยู่ที่ `video_data.url`. `fetchAttachmentUrl` เดิมอ่านแค่ `file_url` → ตกหล่นสติกเกอร์/GIF เมื่อ webhook ไม่ส่ง `payload.url`.

→ fallback ต้องไล่ `file_url → image_data.url → video_data.url → *.preview_url`. (ของเก่าที่ fail กู้ไม่ได้เพราะ Graph คืน `NO ATTACHMENT` = asset หมดอายุฝั่ง Meta — คนละเรื่องกับ shape)

## บทเรียน — adornment ในลิสต์ compact เริ่มจากง่ายสุด ก่อนลงราย detail

ชิปเลขออเดอร์ทำ design แรกเป็น "#เลข · สถานะ" เต็มรูป (ux spec + click ไป order detail + SSOT palette) แล้ว **user pivot ทันที** เป็น "ไอคอนตะกร้า + จำนวน กดเปิด panel" — ง่ายกว่ามาก. Backend ที่ทำ latest-order DISTINCT ON ก็ถูกตัดทิ้งเหลือ groupBy count.

→ สำหรับ adornment ในแถว list ที่พื้นที่จำกัด **เริ่มจากตัวเบาสุด (icon + count) ก่อน** แล้วค่อยเพิ่มถ้า user ขอ; ถามระดับรายละเอียดก่อน build ลด rework ได้. กำไรที่ติดมา: การผ่าน `safepay-ux` ทำให้เจอ debt **status-palette 3 ชุด** (`getStatusPill` hex / `STATUS_META` token / `OrderCard STATUS_CONFIG`) → consolidate เป็น `ORDER_STATUS_META` SSOT

## บทเรียน — deep-link panel ต้อง sync ด้วย useEffect ไม่ใช่ useState initializer อย่างเดียว

`?panel=orders` เปิดแท็บออเดอร์ใน `CustomerPanelBody`. App Router **reuse component ตอนสลับเธรด** (route param `[conversationId]` เปลี่ยนแต่ไม่ remount) → `useState(initFromParam)` ทำงานครั้งเดียว ไม่พอ. ต้อง `useEffect([wantOrders], () => setTab(...))` sync ตาม param ทุกครั้งที่เปลี่ยน (การกดแท็บเองไม่แตะ param จึงไม่โดน effect ทับ). มือถือ (<1024px) แยกเด้ง `CustomerPanelSheet` ผ่าน `matchMedia` ใน ChatThread (เดสก์ท็อปมี panel persistent อยู่แล้ว)

---

## Carry (ยังค้าง)

- [ ] **Visual QA จริงบน prod** (Chrome DevTools) — ไอคอนตะกร้า + panel เด้ง (mobile sheet + desktop persistent) ยังไม่ได้กดเทสเอง
- [ ] **`orderCount` รวม CANCELLED** — รอ user ตัดสินว่าจะกรองเฉพาะที่ไม่ยกเลิกไหม (แก้บรรทัดเดียวใน `enrichWithOrderCount`)
- [ ] **Backlog:** แสดง "ใครส่ง" (ชื่อ staff) บนบับเบิลฝั่งร้าน — ทำได้เฉพาะข้อความที่ส่งจาก Deep (มี `actorUserId`); echo จากแอป Messenger ของร้าน Meta ไม่บอกว่าใครกด
- [ ] media content-type แปลก ๆ ที่ยังไม่เจอ — bucket allow-all แล้วน่าจะครอบ แต่เฝ้าดู log `[fb-ingest] media mirror failed`
