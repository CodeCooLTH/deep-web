# 00018 — Extensions (2026-08-07)

> | # | Extension | สรุป |
> |---|---|---|
> | E1 | แก้ backfill ขอฟิลด์ผิดชื่อ → การ์ด/รูปหายมาตลอด | `attachments{type}` ไม่มีอยู่จริง Graph ตัดข้อมูลทิ้งเงียบ ๆ → 542 แถวบน prod กลายเป็น placeholder |
> | E2 | เก็บเนื้อหาการ์ดจริง + mirror ไฟล์แนบที่มาทาง backfill | `generic_template.title/subtitle` ลง body · `image_data.url` เข้า storage เหมือนทาง webhook |
>
> **ไม่มี migration** — ใช้คอลัมน์เดิมทั้งหมด (`ChatMessage.type/body/imageUrl/attachmentName/attachmentSize`)
>
> ไฟล์ที่แตะ: `src/lib/facebook/graph.ts` · `src/services/channel-chat.service.ts`
> · `src/lib/meta-system-notice.ts` (+ เทสของทั้งสามตัว)

---

## E1 — `attachments{type}` คือฟิลด์ที่ไม่มีอยู่จริง

### E1.1 อาการที่ผู้ใช้เห็น

ในกล่องแชทของเรา ข้อความจากเครื่องมืออัตโนมัติของ Facebook ขึ้นเป็นบรรทัดเดียวกันหมด:

```
[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger]
```

ขณะที่ Business Suite ของเพจเดียวกัน เวลาเดียวกัน แสดง**การ์ดจริง** — การ์ดโฆษณาพร้อมรูป
("ราคานี้ฟรีปลายทาง / แจ้งรุ่นมอไซที่ใช้อยู่ได้เลย") และการ์ดปุ่มโทร ("โทรหา `<ชื่อร้าน>`")

ขนาดปัญหาบน prod ณ 2026-08-07: **542 แถว / 222 บทสนทนา** (ฝั่งร้าน 522 · ฝั่งลูกค้า 20)
เพิ่มวันละ ~50–87 แถวตั้งแต่ 30 ก.ค. ซึ่งเป็นวันที่เปิด backfill · มี 5 บทสนทนาที่ placeholder นี้
ขึ้นเป็น `lastMessagePreview` ในรายการแชท

### E1.2 Root cause

`fetchThreadMessages` ขอ `messages{…,attachments{type}}` — แต่ **message attachment ไม่มีฟิลด์
`type`** (มีเฉพาะใน webhook payload ซึ่งเป็นคนละโครงสร้าง) ตามเอกสาร Message node ของ Graph
ฟิลด์ที่มีจริงคือ `generic_template` · `image_data` · `video_data` · `file_url` · `name` ·
`mime_type` · `size`

พฤติกรรมของ Graph เมื่อขอซับฟิลด์ที่ไม่มี: **ไม่ตอบ error — ตัดคีย์ `attachments` ทิ้งทั้งก้อน
แล้วคืน HTTP 200** พิสูจน์กับเธรดจริงบน prod (mid เดียวกัน token เดียวกัน):

| fields ที่ขอ | ผลลัพธ์ |
|---|---|
| `attachments{type}` | `{"id":"m_SVa01…"}` — ไม่มีคีย์ `attachments` เลย |
| `attachments` (ไม่ระบุซับฟิลด์) | `{"generic_template":{"title":"โทรหา …","subtitle":"ส่งข้อความกระตุ้นให้โทรด้วยเสียงแล้ว"}}` |

ผลต่อเนื่อง: `attachmentTypes` เป็น `[]` เสมอ → `syncedFallbackText()` ตกไป placeholder ทุกใบ

**หลักฐานว่ามันพังตั้งแต่วันแรก:** ตาราง `SYNCED_ATTACHMENT_LABEL` ที่เพิ่มเมื่อ 2026-08-04 เพื่อ
แยกชนิดการ์ด **ไม่เคย match สักครั้ง** — query `rawMessage` ของแถว `source='graph-backfill'`
ทั้งหมดบน prod พบค่า attachment type เป็น `unknown` 45 ครั้ง และไม่มีค่าอื่นเลย

### E1.3 บทเรียน

- **ขอ `attachments` แบบไม่ระบุซับฟิลด์** — Graph ตัดฟิลด์ที่ไม่มีข้อมูลออกให้อยู่แล้ว การระบุเอง
  ไม่ประหยัดอะไร แต่เปิดโอกาสพลาดซ้ำคลาสเดิม (ตอนสืบสวนรอบนี้ probe แรกก็พลาดซ้ำ เพราะระบุ
  ซับฟิลด์ครบทุกตัว **ยกเว้น `generic_template`** แล้วได้ก้อนว่างเหมือนกัน จนเกือบสรุปผิดว่า
  "Meta ไม่เปิดเผยเนื้อหาการ์ด")
- **field expansion ที่ขอชื่อผิด = ข้อมูลหายเงียบ ไม่ใช่ error** — เป็นคลาสเดียวกับ
  `docs/conventions/external-payload-schema.md` (payload ภายนอกที่เราตีความผิดแล้วข้อมูลหายทั้งก้อน)
  ไม่มี `tsc` / build / grep / hook ตัวไหนมองเห็น เพราะทุกอย่างถูกตามไวยากรณ์
- **`rawMessage` คุ้มค่าที่เก็บ** — คอลัมน์นี้ (2026-08-03) คือสิ่งเดียวที่พิสูจน์ได้ว่า
  `attachmentTypes` ว่างมาตลอด ไม่ใช่เพิ่งว่างวันนี้

---

## E2 — เก็บเนื้อหาจริงแทนป้ายบอกใบ้

### E2.1 ลำดับการตัดสินของ `resolveBackfillContent`

1. **ไฟล์แนบที่ mirror ได้** (`image_data.url` / `video_data.url` / `file_url`) →
   `type = IMAGE|VIDEO|AUDIO|FILE`, `imageUrl = fileId`, เก็บ `attachmentName` / `attachmentSize`
   ที่ Graph ให้มา, `body` = caption (ถ้ามี)
2. **ข้อความที่คนพิมพ์** → `type = TEXT`
3. **เนื้อหาการ์ด** → `type = TEXT`, `body = "[การ์ดจาก Facebook] <title> — <subtitle>"`
4. **ไม่เหลืออะไรจริง ๆ** → placeholder เดิม (ยังต้องมี — ดู E2.3)

mirror ทำเป็นชุดละ 4 (`resolveBackfillBatch`) เพราะฟังก์ชันนี้อยู่ในเส้นทางของ request ตอนเปิดเธรด
ยิงพร้อมกัน 50 ตัวคือทางลัดสู่ timeout ส่วนไล่ทีละตัวก็ช้าเกิน

### E2.2 การ์ดต้องอยู่ "บรรทัดระบบ" ไม่ใช่บับเบิลสีร้าน

คำนำหน้า `CARD_PREFIX` = `[การ์ดจาก Facebook]` **บังคับมีเสมอ ห้ามคืนเนื้อหาเปล่า ๆ**

เหตุผล: การ์ดพวกนี้เครื่องมือของ Meta ส่งแทนเพจ ไม่ใช่คนพิมพ์ ถ้าปล่อยเป็นข้อความเปล่าจะขึ้นเป็น
บับเบิลสีร้านแล้วดูเหมือนแอดมินพิมพ์ว่า "โทรหา `<ชื่อร้านตัวเอง>`" เอง — **บั๊กเดิมที่ user report
ไว้เมื่อ 2026-07-31 และแก้ไปแล้วรอบหนึ่ง** การเอาเนื้อหาจริงมาใส่ต้องไม่ทำให้กฎข้อนั้นพังกลับ

`meta-system-notice.ts` จึงได้ pattern `^\[การ์ดจาก Facebook\] ` เพิ่ม (ผูกกับ `CARD_PREFIX`
แก้ที่หนึ่งต้องแก้อีกที่) และเนื้อหาการ์ดถูกบีบเป็น **บรรทัดเดียว** เพราะ `parseMetaSystemNotice`
ตีข้อความหลายบรรทัดเป็น "ไม่ใช่ข้อความระบบ" โดยตั้งใจ

### E2.3 สิ่งที่ยังดึงไม่ได้ (ตั้งใจ ไม่ใช่ค้าง)

- **การ์ดขอชำระเงิน / การ์ดออเดอร์บางชนิด** — Graph ไม่ให้ทั้ง `message` และ `attachments`
  ยังตกไป placeholder เดิมอยู่ (ยิงเทียบเธรดจริง 50 ข้อความ เหลือกรณีนี้ **1 ใบ**)
- **รูปบนการ์ดโฆษณา** (`generic_template.media_url`) — โฮสต์อยู่ที่ `www.facebook.com` ซึ่ง
  **ไม่ได้อยู่ใน allow-list ของ `mirrorRemoteImage`** (กัน SSRF, ดู S-1) การขยาย allow-list
  ต้องผ่าน security review แยก ไม่ใช่ผลพลอยได้ของการแก้บั๊กนี้ → ตอนนี้เก็บแต่ title/subtitle

### E2.4 ยังไม่ได้ทำ

- **backfill 542 แถวเดิม** — mid ยังอยู่และ Graph ยังตอบ ดึงย้อนหลังได้ แต่เป็นการเขียนทับ
  ข้อมูล prod ต้องขออนุมัติแยก
- **UI การ์ดจริง** (รูป + ปุ่ม) — ต้องผ่าน `safepay-ux` ก่อน ตอนนี้แสดงเป็นบรรทัดระบบข้อความล้วน
- 🛑 **เส้น webhook สดยังไม่มี `CARD_PREFIX` คุ้มกัน (ux gate ชี้ 2026-08-07)** —
  `composeStructuredText()` สาขา `generic`/`carousel` ดึง `elements[0].title` ใส่ `body`
  **ดิบ ๆ ไม่มีคำนำหน้า** และไม่ดึง `subtitle` เลย ประกอบกับ `senderRole` ที่มาจาก `isEcho`
  (การ์ดที่ Meta โพสต์ในนามเพจได้ `SHOP` เสมอ) → ถ้าการ์ดแบบเดียวกันนี้เข้ามาทาง **webhook สด**
  ไม่ใช่ backfill มันจะกลับไปเป็นบับเบิลสีร้าน = บั๊กเดิม 2026-07-31 ทันที
  ยังไม่มีเคสจริงบน prod ให้ยืนยัน (ต่างจาก backfill ที่มี 542 แถว) จึงเป็นความเสี่ยงที่ "รอเวลา"
  ไม่ใช่บั๊กที่กำลังเกิด — แต่เป็นคลาสเดียวกันเป๊ะ **อย่าปล่อยให้ลืมจนผู้ใช้เจอเอง**
  ทางแก้รอบหน้า: ให้ 2 สาขานั้นใช้ `CARD_PREFIX` ตัวเดียวกัน + ดึง subtitle ให้ตรงกับ `cardText()`

### E2.5 การพิสูจน์

- unit: `src/lib/facebook/__tests__/graph.test.ts` — 3 เทสใหม่ รวม regression ที่ล็อกว่า
  fields **ต้องไม่มี** `attachments{` (payload ในเทสคัดลอกจาก response จริงบน prod)
- unit: `src/lib/__tests__/meta-system-notice.test.ts` — การ์ดต้องเป็นบรรทัดระบบ และข้อความจริง
  ของร้านที่ขึ้นต้นด้วย `[` ต้องไม่ถูกจับผิด
- dry-run กับเธรดจริงบน prod ผ่าน `fetchThreadMessages` ตัวจริง (ไม่ได้เขียนเลียนแบบ):
  50 ข้อความ → การ์ด 2 ใบได้เนื้อหาครบ, ไฟล์แนบ 3 ใบได้ url/mime/size, เหลือ placeholder 1 ใบ
- ยังไม่ได้ทำ: browser QA (user ตรวจเอง)
