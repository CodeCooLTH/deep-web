# ส่วนขยาย 2026-08-10 — ส่งคลิป/ไฟล์ใหญ่ในแชทได้จริง (direct upload)

## อาการที่ถูกแจ้ง

ร้านแจ้งว่า **"อัปโหลดคลิป เกิน 1 นาทีไม่ได้"** และเดาเองว่าเป็นเพราะไฟล์ใหญ่ (ถ่ายจาก iPhone)

## ต้นเหตุจริง

ไม่ใช่ความยาวคลิป และไม่ใช่เพดาน 25MB ของเรา — **ทุกไฟล์ที่ใหญ่กว่า ~4.5MB ส่งไม่ได้ทั้งระบบ**
เพราะ `POST /api/chat/upload` รับไฟล์ผ่าน body ของ Vercel Function ซึ่งจำกัดที่ **4.5MB**
และตอบ `413 FUNCTION_PAYLOAD_TOO_LARGE` **ก่อนถึงโค้ดเรา**

ผลข้างเคียงที่ทำให้สืบยาก: body ของ 413 นั้นไม่ใช่ JSON → `res.json()` ของ client พัง →
ตกไปข้อความ fallback `"อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"` ซึ่งไม่ได้บอกทั้งเหตุและทางออก
ร้านจึงลองส่งไฟล์เดิมซ้ำ

รายละเอียดคลาสของบั๊ก + กติกาใหม่: `docs/conventions/upload-body-size-limit.md`

## สิ่งที่เปลี่ยน (E1)

| ก่อน | หลัง |
|---|---|
| `POST /api/chat/upload` (multipart ผ่าน function, เพดานจริง 4.5MB) | `POST /api/uploads/ticket` → `PUT` ตรงเข้า storage → `POST /api/uploads/commit` |
| เพดานที่ประกาศ 25MB แต่ไม่มีผล | 25MB มีผลจริง (bucket + commit บังคับ 2 ชั้น) |
| ไฟล์ใหญ่เกิน → "ลองใหม่อีกครั้ง" | วิดีโอ → บอกวิธีย่อ (ตัดคลิป / อัด 720p) พร้อมขนาดจริงกับเพดาน |
| `size` ที่บันทึกลง `ChatMessage.attachmentSize` มาจาก `file.size` ของ client | มาจาก **HEAD บน storage** (server ยืนยันแล้ว) |

surface ของแชทที่ย้ายแล้ว: `useSellerChatThread` (full page + widget panel) ·
`CommentsClient.pickFile` (แนบรูปตอบคอมเมนต์ — ไม่ส่ง `conversationId` เพราะคอมเมนต์ไม่มีเธรด) ·
`QuickMessageManager` (รูปในข้อความด่วน) · `messages/[shopId]/ChatThread` (ฝั่งผู้ซื้อ)

กฎเดิมทั้งหมดยังมาจาก `chat-attachment.ts` ตัวเดียว (deny-list · เพดาน 25MB · Messenger รับรูป
jpg/png/gif/webp · IG รับรูป jpg/png ≤8MB, วิดีโอ mp4/mov/…, ไฟล์เฉพาะ PDF) — `commit`
เรียก `checkChannelSupport` ซ้ำด้วย **ขนาดจริง** ไม่ใช่ตัวเลขที่ client แจ้ง

## สิ่งที่ยังทำไม่ได้ (เพดานที่ไม่ใช่ของเรา)

**Meta Send API รับไฟล์แนบ 25MB** → คลิป iPhone 1 นาที (1080p HEVC ≈ 40–60MB · H.264 ≈ 90MB ·
4K ≈ 170–350MB) **ยังส่งเข้า Messenger/Instagram ไม่ได้** ไม่ว่าจะแก้ฝั่งเราแค่ไหน

ทางที่เหลือ (ยังไม่ทำ):
1. บีบอัดในเบราว์เซอร์ก่อนส่ง (WebCodecs — Safari iOS 17+ รองรับ; ต้อง POC เรื่อง memory บนมือถือ)
2. ส่งเป็น **ลิงก์ดูคลิป** แทนไฟล์แนบเมื่อเกิน 25MB (Messenger รับข้อความที่มีลิงก์ได้; ขาออกไม่ติด
   เพดานของเราเพราะ Meta มาดึงจาก presigned URL ของ Supabase เอง ไม่ผ่าน function) — ต้องมีหน้าเปิดดู
3. ระหว่างนี้ผู้ขายย่อคลิปเอง: ตัดใน Photos · ตั้งค่า > กล้อง > บันทึกวิดีโอ = 720p 30fps ·
   Shortcuts "Encode Media" (1 นาที → ~3–8MB)

## เทส

`src/lib/__tests__/upload-policy.test.ts` · `upload-ticket.test.ts` ·
`upload-no-multipart-callers.test.ts` — ทั้งหมด `[blocker]` และพิสูจน์ด้วย mutation 6 แบบ

## หนี้

- browser QA ทุก surface (user ตรวจเอง)
- `next build` ยังไม่ได้รัน (จะทับ `.next` ของ dev server ที่ user อาจเปิดอยู่)
- ไฟล์ที่อัปโหลดสำเร็จแต่ไม่ถูก commit (ผู้ใช้ปิดจอกลางทาง) ค้างใน bucket โดยไม่มีตัวเก็บกวาด
- `POST /api/app/upload` ของแอปมือถือยังตัน 4.5MB (เปลี่ยน contract = ต้องปล่อยแอปใหม่)
