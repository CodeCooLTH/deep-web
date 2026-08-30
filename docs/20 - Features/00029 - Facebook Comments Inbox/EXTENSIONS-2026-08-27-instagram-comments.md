# ส่วนขยาย 2026-08-27 — คอมเมนต์ Instagram เข้ากล่องเดียวกับ Facebook

> สถานะ: **ยังไม่เริ่มเขียนโค้ด — ติดที่ permission** (ดู §5)
> เอกสารนี้เขียนก่อนลงมือตาม HR11 เพื่อให้เริ่มได้ทันทีที่ปลดล็อก โดยไม่ต้องสำรวจใหม่

---

## 1. รีโปเขียนแผนที่ไว้ให้แล้ว

`src/lib/comment-channel-filter.ts` ระบุไว้ตั้งแต่ตอนสร้างว่า **วันที่ IG comments เปิดใช้
ต้องแก้ 3 ที่พร้อมกัน** และมีเทส `comment-channel-filter.test.ts` รอแดงเตือน:

1. `COMMENT_CAPABLE_PROVIDERS` — วันนี้ `['MESSENGER']` ตัวเดียว ⇒ `resolveCommentProvider()`
   คืน "ค่าเดียว" ได้ · หลายรายเมื่อไหร่ต้องเปลี่ยนเป็นรายการแล้วให้ SQL ใช้ `IN`
2. `sc.provider = ${...}` ใน `page-comment.service.ts` (**4 จุด**) → `sc.provider IN (...)`
3. พิลล์ช่องทางบนหัวคอลัมน์ `/inbox/comments` — วันนี้ปุ่ม `INSTAGRAM` รับประกันว่าได้ผลว่างเสมอ
   และ `ALL ≡ MESSENGER` · พอมีช่องทางที่สองจริง ปุ่มพวกนั้นถึงจะเริ่มมีความหมาย

🛑 ข้อ 2 คือจุดที่พลาดง่ายสุด — เป็น raw SQL 4 ที่ ไม่มี `tsc` คุม แก้ไม่ครบ = บางตัวนับเห็น IG
บางตัวไม่เห็น แล้วจอเดียวโชว์เลขไม่ตรงกัน (เคสเดิมของรีโปนี้: "ยังไม่ตอบ" 7 กับ 8 พร้อมกัน)

---

## 2. Payload ของ IG ต่างจาก Facebook — คัดจากเอกสาร Meta ไม่ใช่เดา

```jsonc
{ "object": "instagram",
  "entry": [{ "id": "<IG_ACCOUNT_ID>", "time": 0,
    "changes": [{ "field": "comments", "value": {
      "id": "<COMMENT_ID>",
      "from": { "id": "<IGSID>", "username": "<USERNAME>" },
      "text": "<TEXT>",
      "media": { "id": "<MEDIA_ID>", "media_product_type": "FEED|REELS|STORY|AD" },
      "parent_id": "<PARENT_COMMENT_ID>"   // มีเฉพาะตอนเป็นการตอบคอมเมนต์อื่น
    }}]}]}
```

| ของ Facebook (`feed`) | ของ Instagram (`comments`) |
|---|---|
| `value.comment_id` | `value.id` |
| `value.post_id` | **`value.media.id`** |
| `value.message` | **`value.text`** |
| `value.from.name` | **`value.from.username`** |
| `value.created_time` (unix) | **ไม่มี** → ต้องใช้ `entry.time` หรือ `now()` |
| `value.verb` (`add`/`edited`/`remove`) | **ไม่มีในเอกสาร** ⇒ ยังไม่รู้ว่าลบ/แก้คอมเมนต์แล้วส่งอะไรมา |
| `value.photo` / `value.video` | **ไม่มี** |
| `entry.id` = page id | `entry.id` = **IG account id** |

🛑 **`verb` ที่หายไปคือความเสี่ยงจริง** — โค้ดฝั่ง Facebook ใช้ `verb === 'remove'` ทำเครื่องหมาย
คอมเมนต์ที่ถูกลบ และ `verb === 'edited'` ประทับเวลาแก้ไข ถ้าฝั่ง IG ไม่มี ต้องตัดสินว่า
**จะไม่รองรับสองอย่างนี้ (แล้วเขียนบนจอให้ตรง)** หรือหาสัญญาณอื่น — **ห้ามเงียบ ๆ ปล่อยให้
คอมเมนต์ที่ลูกค้าลบไปแล้วค้างอยู่ในกล่องตลอดกาลโดยไม่มีใครรู้ว่าทำไม**

---

## 3. สิ่งที่ต้องแก้ในโค้ด

| ชิ้น | รายละเอียด |
|---|---|
| `webhook-types.ts` | `extractFeedChanges()` รับเฉพาะ `field === 'feed'` ⇒ เพิ่มตัวแยกของ `object === 'instagram'` + `field === 'comments'` **แยกฟังก์ชัน ไม่ยัดรวม** (payload คนละรูป ยัดรวมแล้วจะเกิด optional เต็มไปหมดจนไม่มีอะไรบังคับความถูกต้อง) |
| ตัวแปลงรูป (ใหม่, บริสุทธิ์) | IG value → รูปที่ `ingestFeedComment` ใช้ · **ต้องเป็นฟังก์ชันบริสุทธิ์ที่เทสจับได้** เพราะการแมปผิดคู่ (`text`↔`message`, `media.id`↔`post_id`) จะเงียบสนิท — ชนิดถูกหมด |
| `ingestFeedComment` | ตอนนี้ **hardcode `getChannelByExternalId('MESSENGER', ...)`** (บรรทัด 147) ⇒ รับ `provider` เป็นพารามิเตอร์ |
| `isFromPage` | ฝั่ง FB เทียบ `from.id === pageExternalId` · ฝั่ง IG ต้องเทียบกับ **IG account id** |
| `ensurePost()` | 🛑 **จุดที่ต้องใช้ Graph จริง** — สร้างแถวโพสต์ต้องอ่าน meta ของ IG media (รูปปก/permalink/ชนิดสื่อ) ซึ่ง `fetchPostMeta()` เขียนไว้สำหรับ Graph ของเพจ FB ⇒ ต้องมีตัวเทียบเท่าฝั่ง IG |
| `comment-channel-filter.ts` + SQL 4 จุด | ตาม §1 |

**ไม่ต้องมี migration** — `FacebookPost`/`PageComment` ผูกกับ `ShopChannel` อยู่แล้ว ชื่อโมเดล
อ้างถึง Facebook แต่โครงเป็นกลางพอ (คีย์คือ `shopChannelId` + `externalPostId`)
🛑 **อย่าเปลี่ยนชื่อโมเดลในรอบเดียวกัน** — rename ตารางที่มีข้อมูล prod อยู่แล้วเป็นความเสี่ยง
ที่ไม่ได้แลกอะไรกลับมาในรอบนี้ ตั้งชื่อให้ถูกทีหลังได้เสมอ

---

## 4. ✅ สิ่งที่พร้อมอยู่แล้ว ไม่ต้องทำอะไร

**webhook subscribe `comments` บนหัวข้อ `instagram` เปิดอยู่แล้วที่ระดับแอป** (ตรวจ 2026-08-27
ด้วย Meta DevTools MCP — `fields` ของหัวข้อ `instagram` มี `comments` และ `enabled: true`)
⇒ ฝั่งการรับสัญญาณไม่ต้องแตะ **โค้ดเราเป็นฝ่ายทิ้ง event เอง** (`extractFeedChanges` รับเฉพาะ `feed`)

นี่คือคำตอบของคำถาม user เมื่อ 2026-08-26 ว่า *"ทำไมไม่เข้า ต้องเข้าสิ"* — Meta ส่งมาแล้ว
(หรือพร้อมส่งทันทีที่สิทธิ์ครบ) แต่เราไม่รับ

---

## 5. 🛑 ตัวที่บล็อกอยู่จริง — `instagram_manage_comments`

ตรวจ 2026-08-27 หลายรอบ: **ยังไม่มีชื่อนี้ในรายการสิทธิ์ของแอป `1570859340799126` เลยสักบรรทัด**
และการยิง OAuth ด้วย scope นี้ตอบ `Invalid Scopes` ⇒ ยังไม่ถูกผูกเข้ากับแอป

**ต้องกดที่ App Dashboard:** use case *"Manage messaging & content on Instagram"* → ส่วน
**Permissions** → ปุ่ม **Add** ที่บรรทัด `instagram_manage_comments`
(คนละปุ่มกับ `+ Add to App Review` ซึ่งเป็นการขอ Advanced Access — ยังไม่ต้องกดตอนนี้)

**ไม่ต้องยื่น App Review เพื่อทดสอบ** — Meta เขียนไว้เอง: *"My app is only for a business I own
or manage → Standard Access → App Review Not required"* ⇒ ทดสอบกับบัญชี IG ของร้านตัวเองได้ทันที
ยื่นรีวิวค่อยทำตอนจะเปิดให้ร้านอื่นใช้

⚠️ **ยังไม่ได้พิสูจน์** ว่า Meta ส่ง webhook `comments` ของ IG ให้หรือไม่ **ถ้าไม่มีสิทธิ์นี้** —
เป็นไปได้ทั้งสองทาง ⇒ ขั้นแรกหลังปลดล็อกคือ **ให้ร้านคอมเมนต์ใต้โพสต์ IG จริง แล้วดู log สด**
(`npx vercel logs <deployment-url> --json` สตรีมได้จริงบนแพลนนี้) ก่อนเขียนโค้ดบรรทัดแรก

---

## 6. ลำดับที่จะทำเมื่อปลดล็อกแล้ว

1. ยืนยันว่า webhook เข้าจริง (ดู log สดขณะร้านคอมเมนต์) — **ถ้าไม่เข้า หยุด แล้วหาสาเหตุก่อน**
2. เก็บ payload จริง 1 ใบ แล้วเทียบกับ §2 — **ยึดของจริง ไม่ยึดเอกสาร** ถ้าขัดกัน
   (เอกสาร Meta ขัดกันเองมาแล้วหลายรอบ — `project_ig_stickers_giphy`)
3. ตัวแปลงรูป + เทส `[blocker]` (เคสจาก payload จริง ไม่ใช่ค่าที่แต่งเอง)
4. `ingestFeedComment` รับ provider + `ensurePost` ฝั่ง IG
5. ปลดพิลล์ช่องทาง (3 จุดตาม §1) — **ทำเป็นขั้นสุดท้าย** จอจะได้ไม่โชว์แท็บว่างระหว่างทาง
6. ตัดสินเรื่อง `verb` ที่หายไป (§2) แล้วเขียนบนจอให้ตรงกับสิ่งที่ระบบทำได้จริง
