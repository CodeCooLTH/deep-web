# การ subscribe webhook ของ Meta มี 2 ชั้น — ขาดชั้นไหนก็เงียบเหมือนกัน

> เขียน 2026-08-08 หลังพบว่า **2 ฟีเจอร์ตายเงียบมาหลายวัน** เพราะเช็คแต่โค้ดฝั่งเรา
> เกี่ยวข้อง: `docs/conventions/external-payload-schema.md` · `feedback_required_field_drops_whole_event`

## กติกา

Event จาก Meta จะถึง webhook ของเราก็ต่อเมื่อ field นั้นถูก subscribe **ครบทั้งสองชั้น**:

| ชั้น | ตั้งที่ไหน | ใครแก้ | เห็นได้จาก |
|------|-----------|--------|-----------|
| **1. ระดับแอป** | App Dashboard → Webhooks → object `page` → subscribed fields | คนที่ถือ admin ของ Meta App | **ไม่มีในรีโปเลย** — ต้องอ่านจากฝั่ง Meta |
| **2. ระดับเพจ** | `POST /{page-id}/subscribed_apps?subscribed_fields=…` | โค้ดเรา (`MESSENGER_SUBSCRIBED_FIELDS`) | `src/lib/facebook/constants.ts` |

🛑 **ชั้นที่ 1 เป็นประตูใหญ่** — ไม่ผ่านตรงนั้น event ไม่ออกจาก Meta เลย ต่อให้ชั้นที่ 2 ถูกต้องสมบูรณ์

🛑 **ชั้นที่ 2 ถูกล็อกตั้งแต่ตอนเชื่อมเพจครั้งแรก** — เพิ่ม field ในโค้ดแล้วเพจเก่าจะไม่ได้รับ event ใหม่ตลอดไป จนกว่าจะ re-sync (ปุ่ม "ซิงก์การแจ้งเตือน" ที่ `/settings/channels` → `POST /api/channels`) หรือเชื่อมเพจใหม่

## ทำไมถึงอันตรายกว่าบั๊กทั่วไป

**"ไม่มี event เข้ามา" หน้าตาเหมือน "ไม่มีอะไรเกิดขึ้น"** ทุกประการ — ไม่มี error, ไม่มี log, `tsc`/build/เทสเขียวหมด, โค้ดฝั่งรับที่เขียนไว้ก็ถูกต้องทุกบรรทัด มันแค่ไม่เคยถูกเรียก

เคสจริง (พบพร้อมกัน 2026-08-08 ตอนอ่านฝั่ง Meta ครั้งแรก):

| field | ชั้น 1 | ชั้น 2 | ผลที่เกิดจริง |
|-------|--------|--------|---------------|
| `message_deliveries` | **ไม่มี** | มี (เพิ่ม 2026-08-05) | สถานะ "ได้รับแล้ว" ที่ทำมาเพื่อแก้ปัญหา user report โดยเฉพาะ **ไม่เคยทำงานเลยสักครั้ง** ตั้งแต่วันแรก |
| `message_edits` | มี | **ไม่มี** | `ingestMessageEdit` เขียนรอตั้งแต่ 2026-08-03 ไม่เคยถูกเรียก — ตรงกับที่ CLAUDE.md บันทึกเองว่า "โค้ดขึ้นแล้วแต่ยังไม่เคยทดสอบ" แต่ไม่มีใครรู้ว่าสาเหตุคือ subscription |
| `messaging_handovers` | **ไม่มี** | **ไม่มี** | เธรดที่ Meta Business Agent (AI ของ Meta) ถือสิทธิ์คุมอยู่ **ไม่เข้ากล่องเลย** จนกว่าคนจริงจะกด take over |

สังเกตว่า 2 เคสแรก **ขาดคนละชั้นกัน** — ถ้าตรวจแค่ชั้นเดียวจะเจอแค่ครึ่งเดียวเสมอ

## 🛑 เพิ่ม field ถูกชั้นแล้ว แต่**ผิดตัว** — เคส `standby` (2026-08-08 รอบสอง)

เย็นวันเดียวกัน user รายงานว่าเธรดที่ AI ตอบ **ยังไม่เข้าอยู่ดี** ทั้งที่ `messaging_handovers` ครบทั้งสองชั้นแล้ว

ตรวจซ้ำได้ว่าทั้งสองชั้นครบจริง (อ่านสดจาก Graph ไม่ได้เดา) — แปลว่า **สมมติฐานเดิมผิดเอง ไม่ใช่ทำไม่ครบ**:

| field | หน้าที่จริง |
|-------|------------|
| `messaging_handovers` | บอกว่า **สิทธิ์คุมห้องเปลี่ยนมือ** (pass/take/request) — ไม่ได้ขนข้อความมาด้วยเลย |
| **`standby`** | **ขนข้อความของห้องที่เราไม่ใช่เจ้าของเธรด** (`messages` / `message_reads` / `message_deliveries` / `messaging_postbacks`) |

ทั้งคู่ต้องมีคู่กัน — มีแต่ `messaging_handovers` = รู้ว่า "ตอนนี้ไม่ใช่ตาคุณ" แต่ไม่มีวันเห็นว่าเขาคุยอะไรกัน

**หลักฐานที่ชี้ขาด** (เธรด `b6064da8` บน prod) — เส้นแบ่งอยู่ที่ "ใครถือห้อง" ไม่ใช่ "payload หน้าตายังไง":
```
11:36:47  graph-backfill  ลูกค้า: ราคาโช้คหลังเวฟเท่าไหร่      ← ปัดเป็นวินาที = มาจาก Graph
11:36:48  graph-backfill  Your AI agent will respond.
11:39:06  graph-backfill  You took over this chat from your AI agent.
11:39:11.478  webhook     ← กลับมาทันที เพจเดิม เธรดเดิม ลายเซ็นเดิม schema เดิม
```
ป้าย `"Your AI agent will respond."` 20 ครั้งล่าสุดบน prod มาทาง `graph-backfill` **ทั้ง 20 ครั้ง** ไม่มี webhook สักครั้ง

### กับดักของรอบนี้

- 🛑 **`list_topics` ของ Meta DevTools MCP ไม่ลิสต์ `standby` ใน topic `page`** (ลิสต์ให้เฉพาะ `instagram` กับ `whatsapp_business_account`) สั่งเพิ่มผ่าน `devtools_webhook_manage` จะโดนตีกลับว่า `Fields not available for topic "page": standby` **ทั้งที่เอกสาร Messenger บอกชัดว่า subscribe ได้** → ต้องยิง `POST /{app-id}/subscriptions` ผ่าน Graph ตรง ๆ ด้วย app token (`{app_id}|{app_secret}`). **ตารางของเครื่องมือไม่ใช่ความจริง — เชื่อเอกสาร + Graph**
- 🛑 **`POST /{app-id}/subscriptions` เป็น replace ไม่ใช่ append** ต้องส่ง field เดิมครบทุกตัวไปด้วยทุกครั้ง (อ่านด้วย `GET /{app-id}/subscriptions` ก่อนเสมอ) ตกไปตัวเดียว = เลิกรับ field นั้นทั้งระบบเงียบ ๆ
- ก่อนยิง ให้พิสูจน์ว่า `verify_token` ที่ถืออยู่ตรงกับ prod ด้วยการยิง handshake ใส่ตัวเอง — ถ้าไม่ตรง Meta จะตีคำขอตกทั้งก้อน:
  ```
  curl "https://seller.deepthailand.app/api/channels/facebook/webhook?hub.mode=subscribe&hub.verify_token=$VT&hub.challenge=PING123"
  # ต้องได้ PING123 กลับมา
  ```
- **Messenger เลิกใช้ Handover Protocol แล้ว ย้ายไป Conversation Routing** — จึงไม่ต้องแปลกใจที่ `GET /{page-id}/secondary_receivers` ตอบ `(#100) nonexisting field` และ `thread_owner` คืนมาโดยไม่มี `app_id`. **อย่าใช้ผลของ 2 endpoint นี้สรุปว่า "ไม่มีใครถือห้อง"**
- เอกสารที่ค้นเจอง่ายคือ **Meta Business Agent ฝั่ง WhatsApp** ซึ่งเขียนโครงถูก (`messages` + `standby` + `messaging_handovers`) แต่ไม่ครอบ Messenger — ตัวที่ต้องอ่านคือ `messenger-platform/webhooks/webhook-events/standby`

## เช็คลิสต์เมื่อเพิ่ม/แก้ field

1. เพิ่มใน `MESSENGER_SUBSCRIBED_FIELDS` (`src/lib/facebook/constants.ts`) — ชั้นที่ 2
2. **อ่านชั้นที่ 1 จากฝั่ง Meta จริง ๆ** อย่าเดา — Meta DevTools MCP:
   ```
   devtools_app_list                                    # หา app_id (แชท = "Deep Chat & LIVE")
   devtools_webhook_list  action=list_subscriptions     # ดู field ที่ subscribe จริง
   devtools_webhook_manage action=update_fields add_fields=[…]
   ```
3. ให้เพจเดิม re-sync ชั้นที่ 2 — ปุ่ม "ซิงก์การแจ้งเตือน" ที่ `/settings/channels` (ครอบทุกร้านที่ผู้ใช้เข้าถึงได้ตั้งแต่ 2026-08-08) หรือ reconnect เพจ (ทับแถวเดิม ไม่ทำให้เธรดเก่า orphan — `upsertChannel` reuse แถวของร้านเดิม)
4. **พิสูจน์ด้วย event จริง** ไม่ใช่แค่เห็นว่า config ถูก — ฟีเจอร์ที่ไม่มี event เข้ามาจะดูเหมือนทำงานปกติทุกอย่าง

## กับดักที่เจอมาแล้ว

- 🛑 **แอปแชทไม่ใช่แอปเดียวกับแอป login** — `FACEBOOK_ID` ใน env คือแอปสำหรับ Facebook Login (`Deep Thailand`) ส่วนการเชื่อมเพจ/webhook เป็นอีกแอป (`Deep Chat & LIVE`) เช็คผิดแอปแล้วจะเห็น `fields: []` แล้วสรุปผิดทั้งกระดาน
- 🛑 **MCP ย่อค่าที่ยาว** — `callback_url` ที่ลงท้ายด้วย `/...` เป็นสัญญาณว่า response ถูกย่อ อย่าเชื่อ `fields: []` ที่มาคู่กัน ให้ไปอ่านแอปที่ถูกตัวก่อน
- 🛑 **`vercel env pull` redact ค่าที่เป็น sensitive** เป็นสตริง `[SENSITIVE]` — `CHANNEL_TOKEN_KEY` จึงถอดรหัส page token นอก runtime ของ prod ไม่ได้ **การ re-sync ต้องยิงจากในแอปที่ prod เท่านั้น** เขียนสคริปต์รันจากเครื่อง dev ไม่ได้ (จะได้ `CHANNEL_TOKEN_KEY_INVALID` ทุกเพจ)
- ตัวเลขรวมหลอกได้: "มีข้อความสไตล์ AI เข้ามาวันละ 70-99 ข้อความ" ดูเหมือนระบบรับได้ปกติ แต่จริง ๆ คือของที่ **ไหลตามเข้ามาทีหลัง** เมื่อสิทธิ์คุมห้องกลับมาแล้ว — ต้องเทียบ **รายเธรด/รายคน** กับสิ่งที่เห็นใน Business Suite ถึงจะเห็นว่าห้องไหนหายจริง
