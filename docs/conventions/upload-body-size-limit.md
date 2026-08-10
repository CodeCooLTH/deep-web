# อัปโหลดไฟล์: เพดานที่เขียนในโค้ด ≠ เพดานที่มีผลจริง

> สร้าง 2026-08-10 จากอาการที่ร้านแจ้ง: **"อัปโหลดคลิปเกิน 1 นาทีไม่ได้"**

## สิ่งที่เกิดขึ้น

ร้านส่งคลิปในกล่องแชทไม่ได้ และเดาว่าเป็นเพราะ "คลิปยาวเกิน 1 นาที" ความจริงคือ **ทุกไฟล์ที่ใหญ่กว่า
~4.5MB ส่งไม่ได้เลย** ตั้งแต่คลิป 10 วินาที เพราะทุกเส้นทางอัปโหลดของระบบวิ่งผ่าน body ของ
Vercel Function ซึ่งจำกัดที่ **4.5MB** และตอบ `413 FUNCTION_PAYLOAD_TOO_LARGE`
([เอกสาร Vercel](https://vercel.com/docs/functions/limitations) — ส่วน *Request body size*)

เพดานที่เขียนไว้ในโค้ดตอนนั้นมี 4 ชุด ไม่มีชุดไหนตรงกับ 4.5MB และไม่มีชุดไหนมีผลจริง:

| ที่ | เลข | ผลจริง |
|---|---|---|
| `storage/types.ts` `MAX_SIZE` (`validateUpload`) | 5MB | ไม่เคยถึง — ตายที่ 4.5MB ก่อน |
| `chat-attachment.ts` `ATTACHMENT_MAX_SIZE` | 25MB | ไม่เคยถึง |
| `ProductImagesCardV2` / `RoomImages` (บอกผู้ใช้) | 10MB | ไม่เคยถึง |
| สลิป/เอกสารยืนยัน (บอกผู้ใช้) | 5MB | ตกในช่วง 4.5–5MB |

## ทำไมไม่มีใครเห็นมาก่อน

1. **413 ของแพลตฟอร์มตอบก่อนถึงโค้ดเรา** → `res.json()` parse ไม่ได้ (body เป็น HTML/ข้อความ)
   client จึงตกไปข้อความ fallback `"อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"` = คำเชิญให้กดวนซ้ำ
   สิ่งที่ไม่มีทางสำเร็จ (คลาสเดียวกับ regex เครดิต iShip 2026-08-06)
2. **ไม่มี gate ไหนจับได้** — `tsc`/build/detector/`theme-guard`/grep ผ่านหมด เพราะทุกบรรทัดถูก
   ต้องตามชนิดและตามไวยากรณ์ สิ่งที่ผิดคือ *เลขไม่มีผล* ไม่ใช่ *เลขผิด*
3. **ไฟล์เล็กใช้ได้ตามปกติ** — รูป 1–2MB (กรณีส่วนใหญ่) ผ่านสบาย ทำให้ฟีเจอร์ "ดูเหมือนทำงาน"
   ตลอด แล้วเคสที่พังคือเคสที่ผู้ใช้เจอนาน ๆ ครั้งแต่เจอแล้วทำงานต่อไม่ได้
4. โปรเจกต์นี้ **เคยชนเพดานฝั่งขาออกมาแล้วและแก้ถูก** (`MAX_RANGE_CHUNK = 4MB` ใน
   `src/lib/http-range.ts` มีเพราะ response body ก็ 4.5MB) — ความรู้มีอยู่ในรีโปแล้ว
   แต่ไม่มีใครเอามาใช้กับ **ขาเข้า**

## กติกาตั้งแต่ 2026-08-10

🛑 **ห้ามส่งไฟล์ของผู้ใช้ผ่าน body ของ API route** ใช้ `@/lib/upload-client` เท่านั้น:

```ts
import { uploadToStorage, uploadFileId } from '@/lib/upload-client'

const fileId = await uploadFileId(file, 'IMAGE')                       // รูป/โลโก้/อวาตาร์
const meta = await uploadToStorage(file, { purpose: 'CHAT', conversationId }) // ไฟล์แนบแชท
```

3 ขั้นเบื้องหลัง: `POST /api/uploads/ticket` → `PUT` ตรงเข้า storage → `POST /api/uploads/commit`

### เพดานที่บังคับได้จริง 2 ชั้น (client ปลอมไม่ได้)

1. **`file_size_limit` ของ bucket `uploads` = 25MB** — Supabase ปฏิเสธเองด้วย
   `413 EntityTooLarge` **และไม่เขียนไฟล์ลง bucket เลย** (ยืนยันด้วย presigned PUT จริง
   30MB เมื่อ 2026-08-10: `HEAD` หลังจากนั้นได้ `NotFound`)
2. **`POST /api/uploads/commit` อ่านขนาดจริงด้วย HEAD** แล้วเทียบกับเพดานของ purpose ที่ฝังใน
   HMAC claim → เกิน = **ลบไฟล์ทิ้ง** + 413

ตัวเลข `size` ที่ client แจ้งตอนขอ ticket เป็นแค่ทางลัดให้ปฏิเสธได้เร็วก่อนผู้ใช้เสียเวลาอัปโหลด
จนจบ — **ไม่ใช่ด่าน** ห้ามเขียนโค้ดที่เชื่อค่านั้น

### SSOT

- `src/lib/upload-policy.ts` — purpose (`CHAT` 25MB / `IMAGE` 10MB / `DOCUMENT` 10MB) + allow-list
- `src/lib/chat-attachment.ts` — deny-list, กฎเฉพาะช่องทาง (Messenger/IG) และ **คำพูด**
  ของข้อความ "ไฟล์ใหญ่เกิน" (`oversizeMessage`) — เพิ่ม surface ใหม่ที่พูดถึงเรื่องนี้ต้องเรียกตัวนี้
  ห้ามพิมพ์ประโยคเอง (HR16)
- `src/lib/upload-ticket.ts` — HMAC claim ผูก `fileId` กับ `userId`/purpose/เพดาน

## กับดักที่เจอระหว่างทำ (อย่าทำซ้ำ)

- 🛑 **claim ต้องผูก `fileId` กับ `userId`** — commit **ลบไฟล์** ที่ตรวจไม่ผ่าน ถ้าไม่ผูก จะกลายเป็น
  ช่องให้ลบไฟล์ของร้านอื่นด้วย `fileId` ที่หลุดมาจากลิงก์/log ("uuid เดายาก" ไม่ใช่ authorization)
- 🛑 **rate-limit ของ `guardApi` = mutation 30/นาที สำหรับผู้ใช้ที่ล็อกอิน** — flow ใหม่ยิง
  **2 request ต่อไฟล์** และแนบรูปกริดได้ถึง 24 ใบ = 48 request → ต้องมี bucket แยกให้
  `/api/uploads/*` (ตั้งไว้ 300) ไม่งั้นร้านโดน 429 กลางการแนบชุดเดียว **โดยที่บางใบขึ้นบางใบไม่ขึ้น**
- 🛑 **ext ที่เอาไปประกอบ storage key ต้องผ่าน `safeStorageExt`** — `/api/files` derive
  `Content-Type` จาก ext ตัวนี้ และ commit ต้องอ่าน ext จาก **key ที่เราตั้งเอง** ไม่ใช่จาก `name`
  ที่ client ส่งมารอบที่สอง (ไม่งั้นเปลี่ยนชนิดไฟล์หลังผ่านกฎไปแล้วได้)
- **dev ต้องเดินเส้นทางเดียวกับ prod** — local driver จึงมี `PUT /api/uploads/local/[...]`
  (ตรวจ claim + fail-closed ถ้า `STORAGE_DRIVER=s3`) ไม่ใช่ปล่อยให้ dev ตกไปใช้ multipart เดิม
  ซึ่งจะทำให้ flow ใหม่ไม่เคยถูกทดสอบจนขึ้น prod (คลาสเดียวกับ `cross-context-features.md`)
- **CORS ของ Supabase ทั้ง endpoint `/storage/v1/s3/*` และ `/storage/v1/object/*` เปิด `*`
  และอนุญาต PUT อยู่แล้ว** — ตรวจด้วย OPTIONS preflight ก่อนเลือกวิธี ไม่ต้องเดา
- **`ContentType` ถูกผนวกในลายเซ็น presigned PUT** → client ต้องส่ง header `content-type`
  ค่าตรงกันเป๊ะ (ticket คืน `headers` ที่ต้องใช้มาให้ ห้ามให้ผู้เรียกเดาเอง)

## เพดานที่ยกไม่ได้

**Meta Send API รับไฟล์แนบ 25MB** — คลิปที่ยาวกว่านั้นส่งเข้า Messenger/Instagram ไม่ได้
ไม่ว่าจะแก้ฝั่งเราแค่ไหน ทางที่เหลือคือ (ก) ให้ผู้ใช้ย่อคลิป — `oversizeMessage` บอกวิธีไว้ในข้อความ
error แล้ว (ข) บีบอัดในเบราว์เซอร์ก่อนส่ง (ค) ส่งเป็นลิงก์แทนไฟล์แนบ ทั้ง (ข) และ (ค) ยังไม่ทำ

## เทสที่กันการถอยหลัง

- `src/lib/__tests__/upload-policy.test.ts` `[blocker]` — เพดาน/allow-list ต่อ purpose
- `src/lib/__tests__/upload-ticket.test.ts` `[blocker]` — ปลอม claim/แก้ `maxSize`/หมดอายุ
- `src/lib/__tests__/upload-no-multipart-callers.test.ts` `[blocker]` — **สแกนซอร์สทั้ง `src/`**
  ห้ามมีไฟล์ไหน `fetch('/api/upload')` อีก (ไม่ hardcode รายชื่อไฟล์ หน้าใหม่จึงถูกตรวจด้วย)
  regex จับ "การเรียก" เท่านั้น ไม่จับคอมเมนต์ที่อ้างชื่อ route — บทเรียน gate ของ HR9

ทั้ง 6 mutation ที่ลองคืนบั๊กกลับไปทำให้เทสแดงจริง (ลดเพดาน · ถอด gif · ย้ายคำแนะนำ 720p ·
ถอดการตรวจลายเซ็น · ปล่อย claim หมดอายุ · หน้ากลับไปยิง `/api/upload`)
