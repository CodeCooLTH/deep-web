# M3 จองขนาดรูปในแชทล่วงหน้า (2026-09-30)

> ที่มา: audit 2026-09-29 §4 ④ · user อนุมัติ 2026-09-30 · แผนโดย safepay-planner (อ่านโค้ดจริง)

## ข้อเท็จจริง
- รูปแชทเก็บเป็น fileId ใน `ChatMessage.imageUrl` — ไม่มีคอลัมน์ขนาด · `MediaAsset` (00051) ไม่มี w/h · variant ของ 00054 ทำเฉพาะ `purpose=IMAGE` (รูปแชทเป็น `CHAT` จึงไม่มี)
- จุดที่ถือ buffer อยู่แล้ว (รู้ขนาดฟรีด้วย sharp): `writeDedupedFile` (Meta/IG mirror + LINE) · `reconcileUploadedFile` (DEEP/ผู้ขายอัปโหลด purpose CHAT)
- ไม่เชื่อขนาดจาก payload Meta/LINE (external-payload-schema.md) — วัดจากไฟล์ที่เราถือ
- ต้องจอง: รูปเดี่ยว `ChatImageMessage` (ไม่มี width/height เลย) · อัลบั้ม `PhotoAlbum` (เริ่ม SQUARE แล้ววัด onLoad → กริดกระโดดครั้งหนึ่ง)
- ไม่ต้องแตะ: carousel/การ์ดสินค้า (aspect คงที่แล้ว) · quote · วิดีโอ

## การตัดสิน
- SSOT = ตารางใหม่ `MediaImageSize(fileId PK, width, height, createdAt)` — ไม่ใส่คอลัมน์บน ChatMessage (writer ≥15 จุด) หรือ MediaAsset (claim ล้มเงียบได้ + ไฟล์ก่อน 00051 ไม่มีแถว)
- EXIF orientation ≥5 สลับ w/h · animated ใช้ `pageHeight ?? height` · ค่าผิดปกติ = null
- ไม่ clamp สัดส่วน (กล่องจองต้องเท่ากล่องจริง ไม่มี object-fit)
- รูปเก่าไม่มีขนาด = พฤติกรรมเดิม · backfill ด้วย range GET อ่าน header เป็นทางเลือก (T7)
- ไม่วัด DOM แล้วเปลี่ยนสิ่งที่วัด (measurement-must-not-decide-what-it-measures.md)

## Tasks
T1 schema+migration (CREATE TABLE) · T2 `src/lib/image-dimensions.ts` pure · T3 `readImageSize` + เขียนตารางที่ 2 จุด (best-effort) · T4 batch lookup ใน `getThreadMessagesPage` + `ChatMessageView.imageWidth/imageHeight` + `sameMessage` · T5 ChatImageMessage width/height attr + h-auto (ux gate) · T6 PhotoAlbum เริ่ม shape จากขนาดรูปนำ (ux gate) · T7 backfill (ทางเลือก)
หนี้ที่รู้: สติกเกอร์ Meta ที่ไม่มี isStickerHint ยังหดตอน onLoad (ไม่แก้รอบนี้) · `/api/app/upload` ไม่ได้ตรวจ = ไม่มีขนาด
