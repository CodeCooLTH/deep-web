# ส่วนขยาย 2026-08-12 — ความทนของการเชื่อมต่อ LINE (Connection Health)

> ที่มา: `/grill-me` รอบ "การเชื่อมต่อ LINE Messaging" 2026-08-12 — 22 คำถาม 4 รอบ user เคาะครบทุกข้อ
>
> กรอบที่ user เลือกเอง (Q1): ซัก **"ความทนของสายที่เชื่อมแล้ว"** เป็นหลัก แล้วต่อด้วย **"กลไกการเชื่อม"**
> — งานค้างของ 00025/00045 (S-10 batching · S-12 auto-reply · ปุ่มเช็คพัสดุที่ยังไม่ต่อ webhook) **อยู่นอกขอบเขตรอบนี้**

---

## 1. ปัญหา (วัดจากโค้ดและยิง API จริง ไม่ได้ประมาณ)

การเชื่อม LINE ใช้ **วิธี A** — ร้านวาง Channel secret + Channel access token เอง `connectLineChannel()` ยิง `/v2/bot/info` **ครั้งเดียวตอนกด** แล้วเก็บสองค่าเข้ารหัสไว้ หลังจากนั้น **ไม่มีอะไรตรวจซ้ำอีกเลย**

ผลคือมีอย่างน้อย 4 ทางที่สายขาดได้ และ 3 ใน 4 **ระบบไม่รู้และร้านไม่รู้**:

| อาการที่ร้านเห็น | ต้นเหตุ | ทิศที่ตาย | ระบบรู้ไหม | ร้านรู้ไหม |
|---|---|---|---|---|
| กดส่งแล้ว error | access token หมดอายุ / ถูก revoke | **ขาออก** | รู้ — `markChannelTokenInvalid()` แต่ **reactive** | เฉพาะคนที่เปิด `/settings/channels` |
| "วันนี้ลูกค้าเงียบจัง" | channel secret ไม่ตรง (ร้านหมุนในคอนโซลแต่ไม่มาวาง) | **ขาเข้า** | ❌ `console.warn` แล้วตอบ 200 | ❌ |
| "วันนี้ลูกค้าเงียบจัง" | webhook URL ไม่ได้ตั้ง / สวิตช์ Use webhook ปิด | **ขาเข้า** | ❌ ไม่เคยอ่านค่านี้ | ❌ การ์ดขึ้นเขียว "เชื่อมแล้ว" |
| "วันนี้ลูกค้าเงียบจัง" | `destination` หาช่องทาง ACTIVE ไม่เจอ | **ขาเข้า** | ❌ `console.warn` แล้วตอบ 200 | ❌ |

🛑 **สามแถวล่างมีรูปร่างเดียวกัน: "ไม่มี event เข้ามา" หน้าตาเหมือน "ไม่มีอะไรเกิดขึ้น" ทุกประการ** — ไม่มี error ไม่มีสถานะ ไม่มีตัวนับ และ Vercel plan นี้ query runtime log ย้อนหลังไม่ได้ ⇒ `console.warn` ที่อ่านย้อนหลังไม่ได้ มีค่าเท่ากับไม่มี (คลาสเดียวกับ `webhook-subscription-two-layers.md`)

### 1.1 ข้อเท็จจริงที่ยิงจริงกับ OA ทดสอบ (2026-08-12)

```
POST /v2/oauth/verify                  → {"client_id":"2011036363","expires_in":2339235,"scope":"P"}
GET  /v2/bot/channel/webhook/endpoint  → {"endpoint":"https://deepthailand.app/api/channels/line/webhook","active":false}
POST /v2/bot/channel/webhook/test      → {"success":true,"statusCode":200,"reason":"OK","detail":"200"}
```

- **แยก token 30 วัน ออกจาก long-lived ได้จริง** — `expires_in` = 2,339,235 วินาที ≈ 27.07 วัน
  ชนิด token ตามเอกสาร: **long-lived (ไม่หมดอายุ)** · **short-lived v2.1 (30 วัน, ≤30 ใบ/channel)** · **stateless (15 นาที)**
- **อ่านได้ว่าร้านตั้ง webhook ถูกไหมและเปิดสวิตช์หรือยัง** — `active:false` คือสวิตช์ "Use webhook" ปิด = ไม่มี event เข้าเลย
- 🛑 **`webhook/test` เป็นไฟเขียวหลอก** — มันรายงาน **HTTP status ที่ server เราตอบ** และ webhook ของเราตอบ `200` เสมอตามสเปกของตัวเอง (BR-LINE-05/06, TC-04 `[ห้ามข้าม]`) **รวมกรณีลายเซ็นไม่ผ่านและกรณีหา `destination` ไม่เจอ** ⇒ ร้านที่ secret ผิดจะกดปุ่มทดสอบแล้วเห็น `success:true` แล้วเลิกสงสัย

> **หมายเหตุเครื่องมือ:** เอกสาร LINE อ่านด้วย WebFetch ได้แล้วโดยเติม **`.html.md`** ท้าย URL — ข้อความใน 00045 ที่ว่า "หน้า reference เป็น SPA ที่ WebFetch อ่านไม่ได้" **ไม่จริงอีกต่อไป**

### 1.2 ถอดช่องทางแล้วเก็บของไม่ครบ

`disconnectChannel()` เป็น soft ล้วน — ตั้ง `status='DISCONNECTED'` แล้วจบ **ไม่แตะอะไรบน LINE เลย** ทั้งที่ `deactivate()` ใน `line-rich-menu.service.ts` มีอยู่แล้วและไม่มีใครเรียกจากเส้นทางถอด

⇒ ร้านที่ถอด Deep ออกจะ **เหลือ rich menu ของเราค้างใน OA ตัวเองถาวร** และตามที่ 00045 ยืนยันไว้เอง เมนูที่ตั้งผ่าน Messaging API **ชนะ** เมนูของ OA Manager เงียบ ๆ ⇒ **ร้านลบทิ้งเองจากคอนโซลไม่ได้**

### 1.3 สภาพจริงบน prod (query 2026-08-12)

| ข้อ | ผล |
|---|---|
| `ShopChannel` ทั้งหมด | LINE **1** · MESSENGER 3 · INSTAGRAM 1 (ACTIVE ทั้งหมด) |
| ร้านที่มี LINE เกิน 1 ใบ | **0 ร้าน** |
| LINE ใบเดียวนั้น | `@448wtblz` "BT สาขา สุขสวัสดิ์" เชื่อม 2026-08-09 |

⇒ กฎ "1 ร้าน 1 LINE" (D-CH-9) **ไม่มีเคสเดิมที่ต้อง grandfather เลยแม้แต่ร้านเดียว** — ข้อ grandfather ยังต้องเขียนไว้เพราะเป็นกติกา ไม่ใช่เพราะมีคนติด

---

## 2. มติที่ user เคาะ (2026-08-12)

| # | มติ | ที่มา |
|---|---|---|
| D-CH-1 | **ไม่สมัคร LINE Technology Partner** — Module Channel (OAuth กดปุ่มเดียว) ไม่อยู่ในแผนปีนี้ ⇒ **วิธี A คือหน้าตาถาวรของฟีเจอร์** ต้องลงแรงกับมันเต็มที่ | Q5 |
| D-CH-2 | ร้านวาง token แบบ 30 วันมา → **รับ แต่ขึ้นคำเตือนบนหน้าจอทันที** พร้อมวิธีเปลี่ยนเป็นแบบไม่หมดอายุ (ไม่ปฏิเสธ ไม่รับเงียบ) | Q8 |
| D-CH-3 | เก็บวันหมดอายุเป็น **คอลัมน์คู่** `lineTokenExpiresAt` + `lineTokenCheckedAt` — 🛑 **ใช้เตือนเท่านั้น ห้ามใช้บล็อกการส่ง** | Q9 |
| D-CH-4 | ตรวจซ้ำด้วย **cron ตัวใหม่รายวัน ตี 2 ไทย** (ไม่แขวนกับ cron เดิม) เตือนที่ **14 / 7 / 3 / 1 วัน** | Q15 |
| D-CH-5 | ตรวจ webhook ตอนเชื่อม → ใส่เป็น **`warnings` ไม่บล็อก** + **ปุ่ม "ทดสอบการเชื่อมต่อ" กดซ้ำได้ทุกเมื่อ** | Q10 |
| D-CH-6 | "ชี้มาที่เราจริง" ตัดสินโดยเทียบกับ **`request.nextUrl.origin`** (ตัวเดียวกับที่แสดงให้ร้านคัดลอก) แบบ normalize | Q16 |
| D-CH-7 | จับ "secret ไม่ตรง" ด้วยการ **บันทึกความล้มเหลวลงแถว** แล้วปุ่มทดสอบทำงาน **2 จังหวะ** — 🛑 **ไม่เปลี่ยนไปตอบ 401** (ขัดสเปกตัวเอง + LINE จะ retry ขยะ) | Q19 |
| D-CH-8 | สายหลุด → **push (ยิงครั้งเดียวตอนพลิกสถานะ) + แถบในเธรด** · push **ข้าม**สวิตช์ปิดแจ้งเตือนรายร้าน เพราะเป็นข่าวระบบไม่ใช่ข้อความลูกค้า | Q3, Q11 |
| D-CH-9 | **1 ร้าน = 1 LINE OA** ปิดที่ service · ของเดิมที่เกิน **grandfather** (ห้ามบังคับถอด) | Q4, Q13 |
| D-CH-10 | แถบในเธรด **บล็อกช่องพิมพ์** + ปุ่ม "อัปเดต token" อยู่ในบล็อกนั้นเลย | Q12 |
| D-CH-11 | คนที่ปิดแจ้งเตือน: **(ก่อน) แถบเตือนตัวเองในบริบทร้าน** → **(ตาม) ป้ายในรายชื่อสมาชิกให้เจ้าของเห็น** | Q14 |
| D-CH-12 | ถอดช่องทาง → เรียก `deactivate()` **อัตโนมัติ** — 🛑 **คืนเมนูไม่สำเร็จก็ต้องถอดต่อจนจบ** | Q18 |
| D-CH-13 | การ์ดแสดง **สถานะร้ายแรงสุดตัวเดียว** เรียง: secret ไม่ตรง > token ตาย > webhook ปิด/ไม่ตั้ง > token ใกล้หมด > ปกติ · **เขียว = ผ่านครบทุกด่านเท่านั้น** | Q20 |
| D-CH-14 | **ไม่แก้เรื่องสิทธิ์** — ADMIN ยังวาง/เปลี่ยน credential ได้เท่าเจ้าของ และ package lock ไม่กั้น (ดู §7 Known Gap) | Q17 |

---

## 3. Requirement

### FR-CH-01 — รู้อายุของ access token ตั้งแต่ตอนเชื่อม

`connectLineChannel()` และ `updateLineChannelCredentials()` ต้องยิง `POST /v2/oauth/verify` ต่อจาก `/v2/bot/info` แล้วเก็บผลลง `lineTokenExpiresAt` / `lineTokenCheckedAt`

- **AC-CH-01** `expires_in` มีค่า → `lineTokenExpiresAt = now + expires_in` และคืน warning `TOKEN_SHORT_LIVED` พร้อมวันที่
- **AC-CH-02** ไม่มี `expires_in` / verify ล้ม → `lineTokenExpiresAt = NULL` ⇒ **ถือว่าไม่หมดอายุ ไม่เตือน ไม่บล็อก**
- **AC-CH-03** 🛑 verify ล้มต้อง **ไม่ทำให้การเชื่อมล้ม** — `/v2/bot/info` ผ่านแล้วคือ token ใช้ได้ ส่วน verify เป็นข้อมูลเสริม
- **AC-CH-04** 🛑 `lineTokenExpiresAt` **ห้ามถูกอ่านในเส้นทางส่งข้อความทุกกรณี** — เป็นภาพนิ่ง ณ เวลาที่เขียน (ร้าน revoke เมื่อไหร่ก็ได้) ตัวตัดสินจริงยังเป็นผลตอบจาก LINE ตอนยิงเสมอ

### FR-CH-02 — cron ตรวจอายุ token รายวัน

`GET /api/cron/line-token-health` — วน `ShopChannel` ที่ `provider='LINE' AND status='ACTIVE'`

- **AC-CH-05** อัปเดต `lineTokenExpiresAt`/`lineTokenCheckedAt` ทุกแถวที่ verify สำเร็จ
- **AC-CH-06** verify ตอบว่า token ใช้ไม่ได้ → `markChannelTokenInvalid()` + push (FR-CH-06)
- **AC-CH-07** เหลือ ≤ **14 / 7 / 3 / 1** วัน → push **หนึ่งครั้งต่อการข้ามเกณฑ์** ไม่ใช่ทุกวัน
- **AC-CH-08** 🛑 แถวหนึ่งล้มต้องไม่หยุดแถวอื่น (try/catch รายแถว)

### FR-CH-03 — ตรวจสภาพ webhook

`checkLineWebhook(accessToken, expectedOrigin)` → `{ endpoint, active, matchesUs }`

- **AC-CH-09** `matchesUs` เทียบแบบ normalize (ตัด trailing slash, lower-case host) กับ `${expectedOrigin}/api/channels/line/webhook`
- **AC-CH-10** ตอนเชื่อม/แก้ credential คืน warning `WEBHOOK_NOT_SET` · `WEBHOOK_INACTIVE` · `WEBHOOK_POINTS_ELSEWHERE` ตามผล — **ไม่บล็อกการเชื่อม** (ลำดับใช้งานจริงคือร้านต้องเอา URL จากหน้าเราไปวางในคอนโซล จึงมีช่วงที่ยังไม่ตั้งเป็นเรื่องปกติ)
- **AC-CH-11** 🛑 warning กลุ่มนี้ **ค้างอยู่บนการ์ดจนกว่าจะตรวจผ่าน** ห้ามเป็น toast ที่หายไป

### FR-CH-04 — บันทึกความล้มเหลวขาเข้า

webhook route ต้องเขียน `lineLastInboundFailAt` + `lineInboundFailCount` + `lineLastInboundFailReason` **ก่อน** return ในสองเส้นทางที่เดิมเงียบ

- **AC-CH-12** ลายเซ็นไม่ผ่าน → reason `SIGNATURE_MISMATCH`
- **AC-CH-13** 🛑 หา channel จาก `destination` ไม่เจอ → reason `DESTINATION_NOT_FOUND` **ต้องนับด้วย** (กฎ OR ต้องกั้นทุก operand — จับแค่ลายเซ็นคือแก้ครึ่งเดียว) เก็บที่ระดับ global ไม่ผูกร้าน เพราะยังไม่รู้ว่าร้านไหน
- **AC-CH-14** 🛑 **ยังต้องตอบ HTTP 200 ทุกกรณี** และห้ามเขียน DB อื่น ห้ามยิง LINE (BR-LINE-05/06, TC-04 ไม่เปลี่ยน)
- **AC-CH-15** ingest สำเร็จ → เคลียร์ `lineInboundFailCount = 0`

### FR-CH-05 — ปุ่ม "ทดสอบการเชื่อมต่อ" (2 จังหวะ)

`POST /api/channels/line/[channelId]/health`

- **AC-CH-16** จังหวะ 1: อ่าน `webhook/endpoint` + `oauth/verify` แล้วยิง `webhook/test`
- **AC-CH-17** 🛑 จังหวะ 2: อ่าน `lineLastInboundFailAt` **ของเราเอง** ว่าขยับหลังเวลาที่ยิงหรือไม่ — ถ้าขยับพร้อม reason `SIGNATURE_MISMATCH` ให้รายงาน **"Channel secret ไม่ตรง"** ไม่ว่า LINE จะตอบ `success:true` ก็ตาม
- **AC-CH-18** 🛑 **ห้ามรายงานผลจาก `success` ของ LINE เพียงอย่างเดียว** — คำถามที่ปุ่มนี้ต้องตอบคือ *"event ที่ LINE ส่งมา เราประมวลผลได้ไหม"* ไม่ใช่ *"server ยังมีชีวิตไหม"*

### FR-CH-06 — บอกร้านตอนสายหลุด

- **AC-CH-19** สถานะพลิกเป็น `TOKEN_INVALID` → push **ครั้งเดียว** ไม่ใช่ทุกครั้งที่ส่งล้ม
- **AC-CH-20** 🛑 push กลุ่มนี้ **ข้าม `ShopNotificationPref`** และต้องกรองที่ชั้นที่แยก "ข่าวระบบ" ออกจาก "ข้อความลูกค้า" ได้ — **ห้ามแก้ `pushToUsers()`** ซึ่งฝั่งผู้ซื้อใช้ร่วม
- **AC-CH-21** แถบในเธรด **แทนที่ช่องพิมพ์** (ไม่ใช่ dim) พร้อมปุ่ม "อัปเดต token" ในบล็อกนั้น
- **AC-CH-22** 🛑 บล็อกได้เฉพาะเมื่อ `status='TOKEN_INVALID'` ซึ่งเป็นข้อเท็จจริงที่ LINE ปฏิเสธเราจริงมาแล้ว — **ห้ามบล็อกจากการอนุมาน** เช่น token ใกล้หมด หรือ webhook ผิด (บทเรียน `viaStandby` 2026-08-09: บล็อกผิด = พิมพ์ไม่ได้ทั้งที่กำลังคุยลูกค้า)

### FR-CH-07 — สถานะบนการ์ดช่องทาง

- **AC-CH-23** แสดง **ตัวร้ายแรงสุดตัวเดียว** ตามลำดับ: `SECRET_MISMATCH` > `TOKEN_INVALID` > `WEBHOOK_INACTIVE`/`WEBHOOK_NOT_SET`/`WEBHOOK_POINTS_ELSEWHERE` > `TOKEN_EXPIRING` > `HEALTHY`
- **AC-CH-24** 🛑 **สีเขียวใช้กับ `HEALTHY` เท่านั้น** = ACTIVE **และ** ผ่านทุกด่าน (เดิมการ์ดขึ้นเขียว "เชื่อมแล้ว" ได้ทั้งที่ webhook ไม่เคยถูกตั้ง — ละเมิด Verified-Means-Green มาตลอด)
- **AC-CH-25** ลำดับนี้อยู่ในฟังก์ชันบริสุทธิ์ `resolveLineChannelHealth()` ที่ `src/lib/line/` — 🛑 **ห้ามเขียนเป็นเทอร์นารีใน JSX** (`ui-boolean-needs-a-testable-home.md`)

### FR-CH-08 — 1 ร้าน 1 LINE OA

- **AC-CH-26** ร้านที่มี LINE ACTIVE อยู่แล้ว 1 ใบ แล้วเชื่อม OA **คนละ `externalId`** → `409 LINE_ALREADY_CONNECTED` พร้อมชื่อ OA เดิม
- **AC-CH-27** เชื่อม OA **ใบเดิมซ้ำ** = อัปเดต credential ตามเดิม (ไม่ใช่การเพิ่มใบใหม่)
- **AC-CH-28** 🛑 ร้านที่มีอยู่แล้ว >1 ใบ **ห้ามบังคับถอด** — ทำงานต่อได้ตามปกติ แค่เพิ่มใบใหม่ไม่ได้ (ตอนนี้ prod ไม่มีร้านแบบนี้เลย แต่กฎต้องเขียน)

### FR-CH-09 — ถอดช่องทางแล้วเก็บของกลับ

- **AC-CH-29** ถอด LINE → เรียก `deactivate()` คืนเมนูเดิม + ลบเมนูที่ขึ้นต้น `deep:{shopChannelId}:` **ก่อน** ตั้ง `DISCONNECTED`
- **AC-CH-30** 🛑 คืนเมนูล้ม (token ถูก revoke ไปแล้ว ฯลฯ) → **log แล้วถอดต่อจนจบ** ห้ามให้ร้านถอดไม่ได้ตลอดกาล

### FR-CH-10 — คนที่ปิดแจ้งเตือนต้องรู้ตัว

- **AC-CH-31** ผู้ใช้ที่มีแถว `ShopNotificationPref` ปิดของร้านที่กำลังใช้งาน → แถบเตือนในอินบ็อกซ์ "คุณปิดแจ้งเตือนของร้านนี้อยู่" + ทางไปเปิด
- **AC-CH-32** (ตามมาทีหลัง) รายชื่อสมาชิกในหน้าร้าน แสดงป้าย "ปิดแจ้งเตือน" ให้เจ้าของเห็น
- **AC-CH-33** 🛑 "ไม่มีแถว = เปิด" (opt-out) **ห้ามกลับทิศ** และ "มีแถวแต่ค่า `true`" ต้องอ่านว่า **เปิด** — ตรรกะที่เช็คแค่ "มีแถวไหม" จะตีเป็นปิดตลอดไป

---

## 4. ข้อกำหนดด้านข้อมูล

คอลัมน์ใหม่บน `ShopChannel` (**additive ล้วน ไม่มี backfill ไม่มี index ใหม่**) — LINE เท่านั้นที่ใช้ ที่เหลือเป็น `NULL` ตลอด

| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| `lineTokenExpiresAt` | `DateTime?` | วันหมดอายุของ access token · **`NULL` = ไม่หมดอายุ หรือ ยังไม่เคยอ่าน** |
| `lineTokenCheckedAt` | `DateTime?` | เวลาที่อ่านค่าข้างบนล่าสุด — 🛑 **ต้องอ่านคู่กับตัวบนเสมอ** (`NULL` ตัวเดียวแยก "ไม่หมดอายุ" ออกจาก "ยังไม่เคยอ่าน" ไม่ได้ — กติกาเดียวกับ `quotaValue`/`quotaFetchedAt`) |
| `lineLastInboundFailAt` | `DateTime?` | เวลาที่ event ขาเข้าถูกปฏิเสธล่าสุด |
| `lineInboundFailCount` | `Int @default(0)` | นับสะสม เคลียร์เป็น 0 เมื่อ ingest สำเร็จ |
| `lineLastInboundFailReason` | `String?` | `SIGNATURE_MISMATCH` \| `DESTINATION_NOT_FOUND` |

🛑 **คอลัมน์กลุ่มนี้อยู่แถวเดียวกับ `accessTokenEnc`/`channelSecretEnc`** — ทุก query ที่ส่งค่าออกไปหา client ต้อง `select` ระบุคอลัมน์เสมอ ห้ามคืนทั้งแถว

**เคส `DESTINATION_NOT_FOUND`** ไม่มีแถวให้เขียน (หาช่องทางไม่เจอคือนิยามของมัน) → เก็บเป็นตัวนับระดับ process แยกต่างหาก และปุ่มทดสอบอ่านจากตัวนั้น

---

## 5. API

| Endpoint | เปลี่ยนอะไร |
|---|---|
| `POST /api/channels/line/connect` | คืน `warnings` เพิ่ม: `TOKEN_SHORT_LIVED` · `WEBHOOK_NOT_SET` · `WEBHOOK_INACTIVE` · `WEBHOOK_POINTS_ELSEWHERE` · error ใหม่ `409 LINE_ALREADY_CONNECTED` |
| `PATCH /api/channels/line/[channelId]` | เหมือนกัน (เส้นทางกู้คืนจาก TOKEN_INVALID) |
| `POST /api/channels/line/[channelId]/health` | **ใหม่** — ปุ่มทดสอบ 2 จังหวะ คืน `{ webhook, token, inbound, verdict }` |
| `GET /api/cron/line-token-health` | **ใหม่** — cron รายวัน (auth แบบเดียวกับ cron อื่นในโปรเจกต์) |
| `DELETE /api/channels/[id]` | เพิ่มขั้นคืน rich menu ก่อนตั้ง `DISCONNECTED` (เฉพาะ `provider='LINE'`) |

🛑 ทุก error ใหม่ต้องมี route-catch ครอบ (`feedback_service_error_route_mapping`) — `LINE_ALREADY_CONNECTED` ต้องมีคำไทยที่บอกชื่อ OA เดิมด้วย

---

## 6. เทส

`[blocker]` — แดงเมื่อไหร่ห้าม merge ทุกข้อ **ต้องพิสูจน์ด้วย mutation** (คืนตรรกะผิดกลับไปแล้วต้องแดง)

| # | เทส | จับอะไร |
|---|---|---|
| TC-CH-01 | `resolveLineChannelHealth()` ลำดับสถานะครบทุกคู่ที่ผิดพร้อมกัน | AC-CH-23/24 |
| TC-CH-02 | `HEALTHY` เกิดได้เฉพาะเมื่อผ่านทุกด่าน — ตัดด่านไหนออกต้องไม่เขียว | AC-CH-24 |
| TC-CH-03 | `lineTokenExpiresAt` อดีต แต่ `status='ACTIVE'` → **ส่งได้ตามปกติ** | AC-CH-04 (ห้ามเอาไปบล็อก) |
| TC-CH-04 | verify ล้ม → เชื่อมยังสำเร็จ | AC-CH-03 |
| TC-CH-05 | ลายเซ็นไม่ผ่าน → ตอบ 200 · **ไม่มี write อื่น ไม่มี outbound** · แต่ `lineInboundFailCount` ต้องขยับ | AC-CH-12/14 |
| TC-CH-06 | `destination` ไม่เจอ → ตัวนับต้องขยับด้วย | AC-CH-13 |
| TC-CH-07 | ปุ่มทดสอบ: LINE ตอบ `success:true` + ตัวนับ inbound ขยับ → verdict = **"secret ไม่ตรง"** | AC-CH-17/18 |
| TC-CH-08 | opt-out: ไม่มีแถว = เปิด · มีแถวค่า `true` = เปิด · มีแถวค่า `false` = ปิด | AC-CH-33 |
| TC-CH-09 | push สายหลุด ไม่ถูก `ShopNotificationPref` กรองทิ้ง แต่ push ข้อความลูกค้ายังถูกกรอง | AC-CH-20 |
| TC-CH-10 | ถอดช่องทาง: `deactivate()` โยน error → ยังตั้ง `DISCONNECTED` สำเร็จ | AC-CH-30 |
| TC-CH-11 | เชื่อม OA ใบที่สอง → 409 · เชื่อมใบเดิมซ้ำ → 200 | AC-CH-26/27 |
| TC-CH-12 | cron: แถวหนึ่งล้ม แถวที่เหลือยังทำงาน · เตือนซ้ำเกณฑ์เดิมไม่ยิงซ้ำ | AC-CH-07/08 |

🛑 **ต้องมีเทสอย่างน้อย 1 ตัวที่ไม่ mock เพื่อนบ้าน** แล้วยืนยันว่าฟังก์ชันที่บันทึกความล้มเหลวถูก **เรียกจริงและเรียกก่อน** `return` — ด่านที่วางหลัง `return` ก็ผ่าน `tsc` เหมือนกันทุกประการ (บทเรียน 00038)

---

## 7. Known Gap (รับไว้โดยรู้ตัว)

**KG-CH-01 — สิทธิ์จัดการช่องทางไม่แยกระดับ และ package lock ไม่กั้น** (มติ D-CH-14, user เคาะ 2026-08-12)

`resolveActiveShopContext()` คืน `role` และ `locked` มาให้ แต่ route กลุ่มจัดการช่องทาง **ไม่อ่านสักตัว** ⇒
- staff ระดับ **ADMIN** วาง/เปลี่ยน **Channel secret + access token** ได้เท่าเจ้าของ (= กุญแจส่งข้อความในนามร้าน และใช้โควตาที่เป็นเงินร้าน)
- ร้านที่ถูก **package lock** (ควรเป็น read-only) ยังเชื่อม/เปลี่ยน/ถอดช่องทางได้

🛑 **ขอบเขตกว้างกว่า LINE** — ยืนยันจากโค้ด 2026-08-12: `POST /api/channels/line/connect` · `PATCH /api/channels/line/[channelId]` · `POST /api/channels/facebook/confirm` · `DELETE /api/channels/[id]` **ไม่มีอันไหนเช็ค `role`/`locked`**

วันที่จะปิด ต้องปิดทั้งกลุ่มพร้อมกัน ไม่ใช่เฉพาะ LINE (`feedback_missing_guard_is_a_class`)

**KG-CH-02 — token ของ OA ทดสอบ `@502sjent` หมดอายุ 2026-09-08** (`expires_in` 2,339,235 วิ วัดเมื่อ 2026-08-12) วันนั้นการทดสอบ LINE ทั้งหมดจะหยุดพร้อมกัน ต้องเปลี่ยนเป็น long-lived จากคอนโซล

---

## 8. นอกขอบเขตรอบนี้

| # | เรื่อง | เหตุผล |
|---|---|---|
| OOS-CH-1 | S-10 batching (≤5 object/คำขอ = นับ 1) | user เคาะกรอบไว้ที่ Q1 ว่ารอบนี้เอาความทนของสายก่อน |
| OOS-CH-2 | S-12 auto-reply บน LINE | พักไว้เพราะ LINE ไม่มี echo — ห้ามทำโดยไม่ถาม user |
| OOS-CH-3 | ต่อ `replyOrderStatus()` เข้า webhook + ชิป "DeepMenu" | 00045 จงใจค้างไว้ รอตัดสินที่เก็บ `buttonLabel`/`orderNo` |
| OOS-CH-4 | Module Channel / LINE Technology Partner | D-CH-1 |
| OOS-CH-5 | ปิดช่องโหว่สิทธิ์ KG-CH-01 | D-CH-14 |
| OOS-CH-6 | Mark-as-Read, Quick Reply, loading animation | ยังไม่มีใครขอ |
