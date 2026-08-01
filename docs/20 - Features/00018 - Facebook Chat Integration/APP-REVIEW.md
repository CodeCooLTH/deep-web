# App Review — Deep Chat & LIVE (แอป `1570859340799126`)

เอกสารรวมคำตอบและเช็คลิสต์สำหรับยื่น **Advanced Access** ต่อ Meta ของ feature 00018
(เดิมกระจายอยู่ในแชท — ย้ายมาไว้ที่นี่ให้ยื่นซ้ำ/แก้ไขได้โดยไม่ต้องเขียนใหม่)

> **หลักการเขียนคำอธิบายที่ผ่านง่าย** (ใช้กับทุกข้อ)
> 1. อ้าง *allowed usage* ด้วยถ้อยคำของ Meta เอง
> 2. บอกให้ชัดว่า **ถ้าไม่มี permission นี้ ฟีเจอร์ไหนพัง**
> 3. ประกาศตรง ๆ ว่าไม่ใช้เพื่อ analytics / โฆษณา / ขายต่อ
> 4. 🛑 **ห้ามเคลมสิ่งที่โค้ดยังทำไม่ได้** — reviewer กดดูจริงตาม screencast

---

## 1. Endpoint ที่โค้ดเรียกจริง (ฐานของทุกคำอธิบาย)

ตรวจจาก `src/lib/facebook/graph.ts` เมื่อ 2026-08-01 — ถ้าแก้โค้ดแล้วต้องอัปเดตตารางนี้ก่อนยื่น

| Endpoint | ใช้ทำอะไร | permission ที่เกี่ยวข้อง |
|---|---|---|
| `GET /me/accounts?fields=id,name,access_token,tasks,instagram_business_account` | รายชื่อเพจที่ผู้ใช้ดูแล + ตรวจว่ามี IG ผูกอยู่ไหม | `pages_show_list`, `business_management` |
| `POST /{page-id}/subscribed_apps` | สมัครรับ webhook ตอนเชื่อมเพจ | `pages_manage_metadata` |
| `DELETE /{page-id}/subscribed_apps` | ถอน webhook ตอนร้านกดยกเลิกการเชื่อมต่อ | `pages_manage_metadata` |
| `POST /me/messages` | ส่งข้อความ/รูปตอบลูกค้า | `pages_messaging`, `instagram_manage_messages` |
| `GET /me/conversations?user_id=…&fields=messages{…}` | ดึงประวัติเธรดที่ webhook ตกหล่น + ชื่อคู่สนทนา | `pages_messaging`, `instagram_manage_messages` |
| `GET /{psid}?fields=name,username,profile_pic` | ชื่อ/รูปลูกค้าเพื่อแสดงในกล่องข้อความ | `pages_messaging`, `instagram_basic` |
| `GET /{page-id}?fields=instagram_business_account` | หา IG account ที่ผูกกับเพจ | `instagram_basic` |
| `GET /{page-id}_{post-id}?fields=message,full_picture,permalink_url` | เนื้อหาโพสต์/โฆษณาที่ลูกค้าทักมาจาก เพื่อแสดงแบนเนอร์ "ทักมาจากโฆษณานี้" | `pages_read_engagement` |
| webhook fields | `messages, message_echoes, message_reads, message_reactions, messaging_postbacks, messaging_referrals` | `pages_messaging`, `pages_manage_metadata` |

---

## 2. คำอธิบายรายตัว (คัดลอกลงช่อง "Describe how your app uses this permission")

### 2.1 `pages_show_list` ✅ เขียนแล้ว

> Deep is a messaging inbox for Thai online sellers. When a seller connects their business to Deep, we call `GET /me/accounts` to display the list of Pages they manage so they can pick which Page to connect. We only read the Page id, name, and profile picture to render that picker — nothing is posted or changed. Without this permission the seller has no way to choose a Page, so the entire connection flow cannot start. We never use this data for analytics, advertising, or resale.

### 2.2 `pages_manage_metadata` ✅ เขียนแล้ว

> Deep uses this permission solely to manage webhook subscriptions for the Page the seller explicitly connects. On connect we call `POST /{page-id}/subscribed_apps` to subscribe to messaging events (`messages`, `message_echoes`, `message_reads`, `message_reactions`, `messaging_postbacks`, `messaging_referrals`) so incoming customer messages reach the seller's inbox in real time. When the seller disconnects the Page we call `DELETE /{page-id}/subscribed_apps` to stop receiving their data. We do not modify any other Page setting. Without it we cannot receive messages at all and cannot honour a disconnect request.

### 2.3 `pages_messaging`

> Deep is a customer-service inbox that Thai sellers use to answer their own customers. This permission is the core of the product: we receive customer messages through the Messenger webhook and send the seller's replies with `POST /me/messages`. We also call `GET /me/conversations` to backfill messages that a missed webhook would otherwise lose, and to read the participant's name so the seller knows who they are talking to. Every message is sent by a human seller (or an auto-reply the seller configured for their own Page) inside the standard 24-hour messaging window; we do not send unsolicited or bulk messages, and we do not use message content for advertising, analytics, or resale. Without this permission Deep cannot receive or answer any message, which is the app's only purpose.

### 2.4 `pages_read_engagement`

> When a customer starts a chat from a Page post or an ad, Meta delivers only the post/ad identifier in the messaging webhook. Deep calls `GET /{page-id}_{post-id}?fields=message,full_picture,permalink_url` on the seller's own Page to show a small banner above the conversation with the post's text, image, and a link, so the seller instantly knows which product the customer is asking about. We read only content published by the Page the seller connected, we never read other Pages, and we never post, comment, or react on their behalf. Without this permission the seller sees an unlabelled conversation and has to guess what the customer clicked. This data is not used for analytics, advertising, or resale.

### 2.5 `business_management`

> Most of our sellers administer their Page through a Meta Business Portfolio rather than a personal profile. For those sellers, the Page does not appear in `GET /me/accounts` unless this permission is granted, so the connection flow shows an empty list and they cannot use Deep at all. We use it read-only, purely to enumerate the Pages the person is allowed to manage during the connect step; Deep never creates, edits, or deletes any business asset, ad account, or user role, and never reads advertising or billing data. Without it, Business-managed sellers — the majority of our target users — are unable to connect.

### 2.6 `instagram_basic`

> Deep presents Messenger and Instagram Direct in one inbox. We call `GET /{page-id}?fields=instagram_business_account` to discover the Instagram professional account linked to the Page the seller connected, and `GET /{ig-user-id}?fields=name,username,profile_pic` to display the customer's username and profile photo next to their messages so the seller can tell conversations apart. We read only the account linked to the connected Page; we do not read media, insights, followers, or hashtags, and we never publish. Without this permission we cannot identify which Instagram account belongs to the seller, so Instagram conversations cannot be shown at all.

### 2.7 `instagram_manage_messages`

> This permission lets Deep deliver the same inbox experience for Instagram Direct that `pages_messaging` provides for Messenger: we receive the customer's Instagram messages through the webhook and send the seller's reply with `POST /me/messages`. Replies are written by the seller (or by an auto-reply the seller configured for their own account) and are sent inside Meta's standard messaging window. We do not send bulk or unsolicited messages, and message content is never used for advertising, analytics, or resale. Without this permission Instagram conversations are read-only dead ends and the seller must switch back to the Instagram app to answer.

---

## 3. เช็คลิสต์ App Dashboard (งานนอกโค้ด — ต้องทำใน UI ของ Meta)

- [ ] **Webhook callback URL** — 🛑 ของเดิมชี้ ngrok ที่ตายแล้ว ต้องเป็น
      `https://seller.deepthailand.app/api/channels/facebook/webhook`
      (verify token = ตัวเดียวกับ `FB_WEBHOOK_VERIFY_TOKEN` ใน Vercel Production)
      **นี่เป็นความเสี่ยงข้อมูลลูกค้า ไม่ใช่แค่เรื่องผ่าน/ไม่ผ่านรีวิว** — ทำก่อนข้ออื่น
- [ ] Privacy Policy URL → `https://deepthailand.app/privacy` *(ยืนยันแล้วว่า 200)*
- [ ] Terms of Service URL → `https://deepthailand.app/terms` *(200)*
- [ ] User Data Deletion → `https://deepthailand.app/data-deletion` *(200)*
- [ ] ชื่อแอปที่ผู้ใช้เห็นตอนกดเชื่อม ต้องตรงกับแบรนด์ "Deep"
- [ ] **Business Verification** — ต้องผ่านก่อน ถึงจะขอ Advanced Access ได้
- [ ] Screencast ต่อ permission + test credential ที่ reviewer ใช้ได้จริง

### สิ่งที่ต้องเห็นใน screencast
1. ผู้ขาย login เข้า Deep → หน้าตั้งค่าช่องทาง → กด "เชื่อมต่อ Facebook"
2. หน้าเลือกเพจของ Meta → **หน้าติ๊กเลือกเพจของเรา** → ยืนยัน
3. ลูกค้าส่งข้อความจาก Messenger/Instagram → เข้ามาในกล่องข้อความทันที
4. **ผู้ขายพิมพ์ตอบด้วยมือ** ให้เห็นการพิมพ์จริง → ลูกค้าได้รับ
5. กด "ยกเลิกการเชื่อมต่อ" → กลับไปส่งข้อความอีกครั้ง → ไม่เข้าแล้ว (พิสูจน์ว่า `DELETE subscribed_apps` ทำงานจริง)

---

## 4. ของที่ยังขอไม่ได้ / อย่าเพิ่งใส่

- `instagram_manage_insights` — ใส่ใน scope แล้ว Meta ตีกลับที่หน้า login ว่า
  "Invalid Scopes" ทำให้ **เชื่อมเพจไม่ได้ทั้งกระบวนการ** ต้องเปิดใน App Dashboard
  + ผ่าน App Review ก่อนเท่านั้น (ดู comment ใน `src/lib/facebook/constants.ts`)
- `human_agent` — คนละเรื่องกับชุดนี้ ใช้ตอบลูกค้าเกิน 24 ชม. (ถึง 7 วัน)
  โค้ดรออยู่แล้วหลัง env `META_HUMAN_AGENT_ENABLED` ขอเพิ่มได้เมื่อ Business
  Verification ผ่าน — ดูรายละเอียดใน SRS/หัวข้อหน้าต่างตอบกลับ
