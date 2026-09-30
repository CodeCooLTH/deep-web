# ตัวกลางบีบรูปก่อนอัปโหลด + รองรับ .jfif — design (2026-10-01)

## ที่มา
ผู้ขายลากรูป `.jfif` เข้าหน้าแก้ไขสินค้า → toast "รองรับเฉพาะรูปภาพ .jpg .png .webp .gif" ทุกไฟล์
เพราะ `checkUploadPolicy` บังคับ mime **และ** ext — `.jfif` ส่ง mime `image/jpeg` ผ่าน แต่ ext ไม่อยู่ใน `IMAGE_EXT`
พร้อมกันนั้น user ต้องการให้ **รูปใหม่ทุกใบถูกบีบก่อนเก็บ** (อัปเร็วขึ้น พื้นที่เล็กลง)

## ข้อตกลงกับ user
- บีบ **เฉพาะไฟล์ใหม่** — ไฟล์เดิมในบัคเก็ตไม่แตะ (กฎถาวร: ห้ามลบ/เขียนทับต้นฉบับ)
- บีบ **ในเบราว์เซอร์ก่อนส่ง** (ไม่ใช่ server) — ได้ความเร็วอัปโหลดด้วย และไม่มีการเขียนทับใด ๆ
- 🛑 กฎถาวร: **ทุกการอัปโหลดไฟล์ต้องผ่านตัวกลาง `uploadToStorage` → `prepareUploadFile`** (มีเทส guard)

## ตัวกลาง `src/lib/image-compress.ts`
| profile | ด้านยาวสูงสุด | คุณภาพ | ข้ามถ้าไฟล์เล็กกว่า | ใช้กับ |
|---|---|---|---|---|
| `standard` | 2048px | 0.85 | 300KB | purpose IMAGE, CHAT |
| `document` | 3000px | 0.92 | 1.5MB (สลิปภาพหน้าจอผ่านไปตามเดิม) | purpose DOCUMENT |
| `off` | — | — | — | หลักฐาน (inspector, scam report), LINE rich menu |

ขั้นตอน: normalize ชื่อ (`.jfif/.jpe/.pjpeg/.pjp` → `.jpg`, mime ว่าง/`image/pjpeg` → `image/jpeg`) **ทุกกรณี**
→ ข้ามถ้า off / ไม่ใช่ jpeg-png-webp (gif/pdf/วิดีโอ/อื่น ๆ ไม่แตะ) / ไฟล์เล็ก
→ decode ด้วย `<img>` (หมุนตาม EXIF ถูกทุกเบราว์เซอร์) → ย่อ fit-inside ไม่ขยาย
→ มี alpha = PNG, ไม่มี = JPEG (**ไม่ใช้ WebP** — รูป IMAGE บางจุดถูกส่งต่อ IG/LINE ที่ไม่รับ webp)
→ ผลลัพธ์ไม่เล็กกว่าเดิม = ใช้ไฟล์เดิม · error ใด ๆ = ใช้ไฟล์เดิม (การอัปโหลดห้ามพังเพราะการบีบ)
→ คิวบีบพร้อมกันได้ 2 ไฟล์ (กัน WebView แอปผู้ขาย OOM ตอนลาก 10 รูป) · ล้าง canvas หลังใช้

## จุดต่อเข้า
- `uploadToStorage(file, { compress? })` — default ตาม purpose, เรียก `prepareUploadFile` ก่อนขอ ticket
- opt-out `compress: 'off'`: `EvidenceUploadButton`, `ReportForm`, `RichMenuEditor` (ต้องได้ 2500×1686 พอดี)

## server safety net
- `upload-policy.ts` — `normalizeUploadExt()` (jfif/jpe/pjpeg/pjp → jpg) ใช้ใน `checkUploadPolicy`
- `uploads/ticket` — คีย์ที่เก็บใช้ ext ที่ normalize แล้ว → เสิร์ฟเป็นรูป + ได้ variant
- `attachment-mime.ts` — `jfif` → `image/jpeg` + inline (ไฟล์แชท .jfif เก่ากลับมาเปิดเป็นรูปได้ ไม่แตะไฟล์)

## ช่องโหว่ที่เจอ: หลักฐานแจ้งมิจฉาชีพ
`ReportForm` อัปเป็น purpose IMAGE → commit สร้าง `.thumb.webp/.lg.webp` ที่ **ไม่ผ่าน scam-evidence gate** (PDPA)
แก้: เปลี่ยนเป็น `DOCUMENT` (รับ PDF ได้จริงตามที่หน้าจอโฆษณา) + หน้าแอดมินแสดง PDF เป็นกล่องไฟล์
variant ที่หลุดไปแล้ว: `scripts/count-scam-evidence-variants.ts` **นับอย่างเดียว ไม่ลบ** — ให้ user ตัดสินใจ

## เพดานฝั่ง client
`MAX_RAW_IMAGE_INPUT = 40MB` — เพดาน "ก่อนบีบ" ของรูป (หลังบีบ server ยังบังคับ 10/25MB ตามเดิม)
แทนที่เพดาน 5/10MB ที่ปฏิเสธรูปกล้องก่อนตัวบีบได้ทำงาน + เพิ่ม `.jfif` ใน accept

## นอกขอบเขต
ไฟล์เก่า · วิดีโอ/PDF · badge upload (multipart, 256KB) · `/api/app/upload` (ไม่มีผู้เรียก) · `ProductImageDropzone` (dead)

## ทดสอบ
vitest: normalize, เลือก profile, เงื่อนไขข้าม, คำนวณขนาด, fallback, policy รับ jfif, guard การต่อสายและ opt-out
manual: Windows Chrome (.jfif) · iPhone Safari (กล้อง/HEIC) · แอปผู้ขาย WebView · Android 48MP · PNG โปร่งใส · GIF · PDF · rich menu
