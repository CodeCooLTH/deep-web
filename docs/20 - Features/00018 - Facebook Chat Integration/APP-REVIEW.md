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
| `GET /{page-id}/video_reels?fields=…,views,likes.summary(true),comments.summary(true)` | คลิปของเพจให้ร้านเลือกไปโชว์บนหน้าร้าน (feat 00021) | `pages_read_engagement` |
| `GET /{ig-user-id}/media?fields=…,caption,media_url,like_count,comments_count` | คลิป IG ของร้านเอง ให้เลือกไปโชว์บนหน้าร้าน (feat 00021) | `instagram_basic` |
| `GET /{ig-user-id}?fields=username` | ชื่อบัญชี IG ที่เป็นเจ้าของคลิป | `instagram_basic` |
| ~~`GET /{media-id}/insights?metric=views\|plays`~~ | **ถอดออกแล้ว 2026-08-01** — ต้องใช้ `instagram_manage_insights` ที่ขอไม่ได้ ล้มเหลว 100% และขัดกับคำอธิบายที่ยื่น | — |
| webhook fields | `messages, message_echoes, message_reads, message_reactions, messaging_postbacks, messaging_referrals` | `pages_messaging`, `pages_manage_metadata` |

---

## 2. คำอธิบายรายตัว (คัดลอกลงช่อง "Describe how your app uses this permission")

### 2.1 `pages_show_list` ✅ เขียนแล้ว

> Deep is a messaging inbox for Thai online sellers. When a seller connects their business to Deep, we call `GET /me/accounts` to display the list of Pages they manage so they can pick which Page to connect. We only read the Page id, name, and profile picture to render that picker — nothing is posted or changed. Without this permission the seller has no way to choose a Page, so the entire connection flow cannot start. We never use this data for analytics, advertising, or resale.

### 2.2 `pages_manage_metadata` ✅ เขียนแล้ว

ฟอร์มของ Meta ถาม 3 ประเด็นในช่องเดียว (ใช้ยังไง / ผู้ใช้ได้อะไร / ทำไมจำเป็น) — ฉบับนี้แยก
ย่อหน้าตอบทีละข้อ ตรวจกับโค้ดแล้ว 2026-08-01 (`graph.ts` + `MESSENGER_SUBSCRIBED_FIELDS`)

> Deep is a customer-service inbox that Thai online sellers use to answer messages from their own Facebook Page and linked Instagram account in one place.
>
> How we use the permission: it is used solely to manage this app's webhook subscription on the Page that the seller explicitly chooses during the connect flow. On connect we call `POST /{page-id}/subscribed_apps` with subscribed_fields = `messages`, `messaging_postbacks`, `message_reactions`, `message_echoes`, `message_reads`, `messaging_referrals`, so the Page's conversations are delivered to the seller's Deep inbox in real time. When the seller clicks "Disconnect" in Deep, we call `DELETE /{page-id}/subscribed_apps` so Meta immediately stops sending us that Page's data. We do not change the Page name, settings, tabs, or any other Page metadata, and we do not request analytics or insights with this permission.
>
> Value for the person using the app: the seller gets every customer message in one inbox they can answer from a computer or phone, together with their Instagram Direct messages, without switching between apps or leaving customers waiting. The same permission is what makes "Disconnect" honest — one click and the data flow actually stops on Meta's side, not just in our database.
>
> Why it is necessary: without the subscribe call no webhook events are delivered, so the inbox stays permanently empty and the product has no function at all; without the unsubscribe call we could not honour a seller's request to stop receiving their Page data. We never use data received through this permission for advertising, cross-app profiling, or resale.

### 2.3 `pages_messaging` ✅ เขียนแล้ว

ตรวจกับโค้ดจริง 2026-08-01: `sendOutboundMessage` (`channel-chat.service.ts:948`) มีผู้เรียก
**2 จุดเท่านั้น** — ผู้ขายกดส่งจากกล่องข้อความ (`api/chat/conversations/[id]/messages`) กับ
auto-reply ที่ทริกเกอร์จากข้อความขาเข้า (`auto-reply-send.service`) ไม่มี broadcast/หว่าน
(cron `auto-reply-sweeper` แค่ retry งานค้าง ไม่เริ่มบทสนทนาใหม่) — คำเคลม "no bulk/unsolicited"
จึงพูดได้เต็มปาก

> Deep is a customer-service inbox for Thai online sellers. The seller connects the Facebook Page they own, and from then on every conversation a customer starts with that Page appears in one place where the seller and their staff can read and answer it.
>
> How we use the permission. Receiving: our webhook subscribes to the connected Page's messaging events (`messages`, `message_echoes`, `message_reads`, `message_reactions`, `messaging_postbacks`, `messaging_referrals`) and stores each thread so it shows up in the seller's inbox in real time. Sending: when the seller types a reply and presses Send, we call `POST /me/messages` with `messaging_type: RESPONSE`, inside Meta's standard 24-hour window. Repairing gaps: we call `GET /me/conversations` to backfill messages that a dropped webhook would otherwise lose, and to read the participant's name so the seller knows who they are talking to. This is customer support in the sense of the allowed usage: every thread is user-initiated — the customer messages the Page first and the seller answers. We never message a person who has not messaged the Page.
>
> Value for the person using the app. Thai sellers typically run one Page plus Instagram and answer from a phone all day. Deep gives them a single inbox they can open on a computer, lets several staff share the work, and shows that customer's past orders and shipping status beside the conversation, so the seller answers "where is my parcel" without switching apps or asking the customer to repeat themselves.
>
> Why it is necessary. Without this permission Deep can neither receive nor send a single message, which is the app's entire purpose.
>
> Automation, disclosed. A seller may configure an auto-reply for their own Page (for example a greeting or an out-of-hours notice). It is triggered only by an incoming customer message, it is labelled in the inbox so the seller can see it was automatic, and the seller can switch it off or take over the thread at any moment. We do not send bulk, promotional, or unsolicited messages, and message content is never used for advertising, analytics, or resale.

### 2.4 `pages_read_engagement` ✅ เติมให้ครบ 2026-08-01

ฉบับเดิมพูดถึงแต่แบนเนอร์ "ทักมาจากโพสต์นี้" แต่โค้ดยังดึง `/{page-id}/video_reels` ด้วย
(feat 00021) — อยู่ในขอบเขต permission อยู่แล้ว แต่ไม่เขียนไว้ = ดูเหมือนปกปิดเมื่อ reviewer
เห็น call นั้น

> Deep reads content published by the Page the seller connected, for two features.
>
> First, conversation context. When a customer starts a chat from a Page post or an ad, Meta delivers only the post/ad identifier in the messaging webhook. Deep calls `GET /{page-id}_{post-id}?fields=message,full_picture,permalink_url` and shows a small banner above the conversation with the post's text, image, and a link, so the seller instantly knows which product the customer is asking about instead of guessing.
>
> Second, the seller's own videos on their shop profile. Deep calls `GET /{page-id}/video_reels?fields=id,description,permalink_url,picture,thumbnails,views,likes.summary(true),comments.summary(true)` so the seller can pick which of their own reels to feature on their public Deep shop page. The counts come back with the reel and are shown to the seller only, as a hint of which clip performs best while they choose.
>
> We read only content published by the Page the seller connected. We never read other Pages, and we never post, comment, or react on the seller's behalf. This data is not used for advertising, cross-app profiling, or resale.

### 2.5 `business_management` ✅ เขียนใหม่ 2026-08-01

ตรวจกับโค้ดทั้งรีโปแล้ว: คำสั่งเขียนที่ยิงไป Graph API มีแค่ 3 จุด — `POST`/`DELETE
/{page-id}/subscribed_apps` กับ `POST /me/messages` ไม่มีอะไรแตะ business asset เลย
ย่อหน้าที่ 3 จึงเคลมได้เต็มปาก. หมายเหตุ: Meta นิยาม permission นี้กว้างกว่าที่เราใช้มาก
("manage business assets such as an ad account") การประกาศว่าใช้แคบกว่าเป็นผลดีกับ reviewer

> Deep is a customer-service inbox for Thai online sellers. Before a seller can use it at all, they have to choose which of their Facebook Pages to connect, and we build that list with a single read-only call: `GET /me/accounts?fields=id,name,access_token,tasks,instagram_business_account`.
>
> Why this permission is necessary. Most of our sellers do not administer their Page from a personal profile — the Page belongs to a Meta Business Portfolio. For those sellers, the Page is simply absent from `GET /me/accounts` unless `business_management` is granted, so our page picker renders an empty list and the seller concludes the product is broken. Business-managed sellers are the majority of our target users, and without this permission they cannot complete the very first step.
>
> How we use it, precisely. Read-only enumeration during the connect step, and nothing else. We read each Page's id, name, tasks, and whether an Instagram professional account is attached, then show that list so the seller ticks the Page they want. We use `tasks` only to hide Pages where the person lacks `MESSAGING` and `MODERATE` rights, because connecting such a Page would produce a Page that cannot send or receive messages. Deep never creates, edits, or deletes a business, an ad account, a Page, a catalog, a dataset, or a user role; we never read advertising spend, billing, or business insights. The only write operations the app performs anywhere against the Graph API are subscribing and unsubscribing our own messaging webhook on the Page the seller connected, and sending the seller's replies to their own customers.
>
> Value for the person using the app. The seller sees exactly the Pages they are allowed to manage, picks one, and is answering customers a few seconds later — no ID hunting, no copying tokens, no support ticket.
>
> We do not use any of this data for analytics, advertising, cross-app profiling, or resale.

**ฉบับย่อ** (ใช้เมื่อฟอร์มตีกลับว่ายาวเกิน — เคยเจอ "Something Went Wrong" ตอน Save)

> Deep is a customer-service inbox for Thai online sellers. To use it, a seller first picks which Facebook Page to connect, and we build that list with one read-only call: `GET /me/accounts?fields=id,name,access_token,tasks,instagram_business_account`.
>
> Why it is necessary: most of our sellers administer their Page through a Meta Business Portfolio. For them the Page does not appear in `GET /me/accounts` unless `business_management` is granted, so the picker is empty and they cannot connect at all.
>
> How we use it: read-only enumeration during the connect step only. We read each Page's id, name, tasks and linked Instagram account, and use `tasks` to hide Pages where the person lacks `MESSAGING` and `MODERATE` rights. Deep never creates, edits or deletes any business, ad account, Page, catalog or user role, and never reads ad spend or billing. The only writes this app makes to the Graph API are subscribing and unsubscribing our messaging webhook on the connected Page, and sending the seller's replies to their own customers.
>
> Value: the seller sees exactly the Pages they may manage, picks one, and is answering customers seconds later. None of this data is used for analytics, advertising, or resale.

### 2.6 `instagram_basic` ✅ เขียนใหม่ 2026-08-01

🛑 ฉบับเดิมประกาศว่า *"we do not read media, insights, followers, or hashtags"* ซึ่ง **ผิด** —
`shop-video.service.ts` (feat 00021 Shop Video Showcase) เรียก `/{ig-user-id}/media` จริง
(reviewer เห็นประวัติการเรียก API ของแอปได้ = ตีกลับได้ทั้งชุด). แก้แล้ว 2 ทาง: ถอดการเรียก
`/{media-id}/insights` ออกจากโค้ด (ล้มเหลว 100% อยู่แล้วเพราะไม่มี scope) + เขียนคำอธิบายให้
ครอบคลุมการอ่านสื่อของร้านเองตามจริง

> Deep does two things with the Instagram professional account linked to the Page a seller connects. First, it presents Instagram Direct next to Messenger in one inbox. Second, it lets the seller feature their own Instagram videos on their public Deep shop profile.
>
> The calls we make, all scoped to that one linked account: `GET /{page-id}?fields=instagram_business_account` to discover which Instagram account belongs to the connected Page; `GET /{ig-user-id}?fields=username` and `GET /{ig-scoped-user-id}?fields=name,username,profile_pic` to show who the seller is talking to and which account a video came from; and `GET /{ig-user-id}/media?fields=id,media_type,media_product_type,caption,thumbnail_url,media_url,permalink,like_count,comments_count` to render a picker in which the seller chooses which of their **own** reels to display on their Deep shop profile, and to render that video afterwards.
>
> Value for the person using the app: the seller answers Instagram customers without leaving Deep, and the shop profile they send to customers shows their real product videos instead of an empty page — they do not have to re-upload anything.
>
> Limits we hold ourselves to: we read only the account linked to the Page the seller connected, never another account; we do not read followers, hashtags, comment content, or insights; we never publish, edit, or delete anything on Instagram; and none of this data is used for advertising, cross-app profiling, or resale. Without this permission we cannot tell which Instagram account belongs to the seller, so Instagram conversations cannot be displayed at all.

### 2.7 `instagram_manage_messages`

> This permission lets Deep deliver the same inbox experience for Instagram Direct that `pages_messaging` provides for Messenger: we receive the customer's Instagram messages through the webhook and send the seller's reply with `POST /me/messages`. Replies are written by the seller (or by an auto-reply the seller configured for their own account) and are sent inside Meta's standard messaging window. We do not send bulk or unsolicited messages, and message content is never used for advertising, analytics, or resale. Without this permission Instagram conversations are read-only dead ends and the seller must switch back to the Instagram app to answer.

---

## 3. เช็คลิสต์ App Dashboard (งานนอกโค้ด — ต้องทำใน UI ของ Meta)

- [x] **Webhook callback URL** — ✅ ชี้ prod จริงแล้ว (เคยเป็น ngrok ที่ตายแล้ว แต่แก้ไปแล้ว)
      ยืนยัน 2026-08-01: query ฐาน prod พบ `ChatMessage` ของ `Conversation.channel='MESSENGER'`
      210 ข้อความ ล่าสุดห่างจากเวลา query 28 วินาที = webhook เข้าจริงต่อเนื่อง
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

> ฝั่ง Instagram อัด screencast ได้เหมือนกัน — ยืนยัน 2026-08-01: ฐาน prod มีห้อง IG 1 ห้อง
> 6 ข้อความ (Messenger 45 ห้อง 270 ข้อความ) = webhook ฝั่ง IG เข้าจริง ใช้ประกอบ
> `instagram_basic` / `instagram_manage_messages` ได้

---

## 3.1 บัญชีทดสอบสำหรับ reviewer + ขั้นตอนทดสอบ (ช่อง "Test and reproduce")

ฟอร์มของ `pages_messaging` บังคับให้ส่ง test account เพราะ Deep เป็น "Page management
surface" — และย้ำว่า reviewer ต้องใช้ **บัญชี Facebook จริงที่ได้ Tester role ใน App Roles**
ห้ามใช้ test user ที่สร้างใน App Roles (test user รับ bot message ไม่ได้)

**บัญชีผู้ขายทดสอบบน prod** (สร้าง 2026-08-01 ด้วย
`scratchpad/create-review-account.ts` — idempotent รันซ้ำได้)

| ค่า | |
|---|---|
| URL | `https://seller.deepthailand.app/auth/sign-in` |
| username | `metareview` |
| password | **ไม่เก็บในรีโป** — ดูในบันทึกที่ส่งให้ user ตอนสร้าง หรือรันสคริปต์ซ้ำเพื่อตั้งใหม่ |
| shop | `Deep Review Test Shop` (slug `meta-review-test`, kind PERSONAL) |

ยืนยันแล้วบน prod: `POST /api/auth/callback/seller-credentials` คืน session ที่มี
`needsOnboarding: false`, `needsPhoneVerify: false`, `activeShopRole: OWNER` และ
`/dashboard`, `/settings/channels`, `/inbox` คืน 200 ไม่โดน force-redirect
(ถ้าขาดเบอร์โทรหรือ slug อย่างใดอย่างหนึ่ง `proxy.ts` จะเด้ง reviewer เข้า `/register`
หรือ `/onboarding` ซึ่งบังคับ OTP มือถือ = reviewer ไปต่อไม่ได้ตั้งแต่ขั้นที่ 2)

ข้อความที่วางในช่อง step-by-step (UI เป็นไทย จึงวงเล็บอังกฤษกำกับทุกปุ่ม):

> The seller-facing UI is in Thai; English translations are in brackets.
>
> Step 1. Deep is a Page management surface, so please use the temporary seller account we created for you: `https://seller.deepthailand.app/auth/sign-in` — username `metareview`, password `<PASSWORD>`.
> Step 2. In the left menu open "บัญชีที่เชื่อมต่อ" [Connected accounts], then click the blue button "เชื่อม Facebook Page" [Connect Facebook Page].
> Step 3. Complete Meta's login dialog with your own reviewer account (granted the Tester role in App Roles) and allow access to a Page you administer.
> Step 4. You are returned to Deep on the page picker "เลือกเพจที่จะเชื่อม" [Choose pages to connect]. Tick your Page and click "เชื่อมเพจที่เลือก" [Connect selected pages]. The Page now appears with the badge "เชื่อมแล้ว" [Connected].
> Step 5. From a different Facebook account, open `m.me/<your-page>` and send any message to that Page.
> Step 6. Back in Deep, click "ข้อความ" [Messages] in the left menu. The new conversation appears at the top of the list within a few seconds, with the customer's name and their message.
> Step 7. Open the conversation, type any text in the box "พิมพ์ข้อความ..." [Type a message] and click "ส่ง" [Send]. The reply is delivered to the customer in Messenger — you can confirm it in the Messenger window from Step 5.
> Step 8. To verify we stop receiving data on request: go back to "บัญชีที่เชื่อมต่อ" and click "ถอด" [Disconnect] on **both** the Messenger and the Instagram row of that Page. Deep then calls `DELETE /{page-id}/subscribed_apps`; new messages to the Page no longer reach the inbox.

---

## 3.2 Data handling (แบบสอบถามการจัดการข้อมูล)

คำตอบทั้งชุด ตรวจจากโค้ดจริง 2026-08-01 — token เข้ารหัส AES-256-GCM (`lib/token-crypto.ts`),
compute อยู่ที่ Vercel region `sin1` (`vercel.json`), DB อยู่ AWS `ap-southeast-1`

| ข้อ | คำตอบ |
|---|---|
| `processor-0` (มี data processor ไหม) | **Yes** — 3 ราย ด้านล่าง |
| `processor-2a` (หมวดบริการ ทั้ง 3 ราย) | **IT solutions and services, including cloud storage and processing** — 🛑 ห้ามติ๊ก Analytics/Advertising เด็ดขาด ขัดกับคำอธิบายทุก permission ที่ประกาศว่าไม่ใช้เพื่อ analytics/โฆษณา |
| `responsible-1` (ผู้ควบคุมข้อมูล) | `Sekson Oonnom (individual)` — ยังไม่ได้จดนิติบุคคล ต้องสะกดตรงกับเอกสารยืนยันตัวตนและกับที่ประกาศบนหน้า terms/privacy/data-deletion |
| `responsible-2` (ประเทศ) | **Thailand** |
| `requests-3` (เคยส่งข้อมูลให้หน่วยงานความมั่นคงไหม) | **No** |
| `requests-4` (นโยบายรับมือคำขอจากรัฐ) | ตอบตามจริง — ยังไม่มีเอกสารเป็นลายลักษณ์อักษร = **None of the above** (ไม่ทำให้ตก) |

รายละเอียด processor ที่ต้องกรอกทีละราย

| ชื่อ | ประเทศ | ทำอะไรกับ Platform Data |
|---|---|---|
| `Vercel Inc.` | Singapore, United States | โฮสต์แอป — โค้ดที่รับ webhook และเรียก Graph API รันที่นี่ (region `sin1`) |
| `Supabase Inc.` | Singapore, United States | ฐานข้อมูล PostgreSQL ที่เก็บบทสนทนา/ผู้ติดต่อ/token ที่เข้ารหัสแล้ว |
| `Google LLC (Gemini API)` | United States | ตอนผู้ขายกดปุ่มร่างคำตอบ AI ส่งข้อความล่าสุดของห้องนั้นห้องเดียวไปให้ Gemini |

> เหตุผลที่ใส่ United States ให้ Vercel/Supabase ด้วย: คำถามระบุให้รวม "locations from which
> the processor will access the data remotely" ทั้งสองเป็นบริษัทอเมริกัน. ส่วน Google ใส่แค่
> สหรัฐฯ เพราะเรายิงไป endpoint กลาง `generativelanguage.googleapis.com` ไม่ได้เลือกภูมิภาคเอง
> จึงไม่ควรเคลมว่าประมวลผลที่สิงคโปร์

**ไม่ใส่ผู้ให้บริการ SMS/ขนส่งโดยตั้งใจ** — สองรายนั้นแตะเฉพาะข้อมูลออเดอร์ของร้าน ไม่ได้แตะ
ข้อมูลที่มาจาก Meta ใส่เข้าไปจะเปิดประเด็นให้ reviewer ถามต่อโดยไม่จำเป็น

---

## 3.3 Reviewer instructions (ช่อง `instructions-web-2` และเพื่อน ๆ)

`fblogin-web-1` (มี Facebook Login ไหม) → **Yes** — ยืนยันจากโค้ด: buyer ที่
`(marketing)/auth/sign-in` และ seller ที่ `seller/auth/sign-in`

🛑 Site URL ในฟอร์มตั้งไว้เป็น `https://deepthailand.app/` แต่ทุกอย่างที่ reviewer ต้องทดสอบ
อยู่ที่ `seller.deepthailand.app` — ถ้าแก้ได้ควรเปลี่ยนเป็น
`https://seller.deepthailand.app/auth/sign-in`

> Deep (deepthailand.app) is a customer-service and order-management tool for Thai online sellers. It has two surfaces:
>   • deepthailand.app — public site and buyer area.
>   • seller.deepthailand.app — the seller workspace, where the Messenger and Instagram inbox lives. Every permission in this submission is used here.
>
> Confirmation on Facebook Login: yes, Facebook Login is integrated and in active use, in two distinct places.
> 1. Signing in. On both deepthailand.app and seller.deepthailand.app a person can sign in with "Continue with Facebook" (email, public_profile). We read only the Facebook id, name, email, and profile picture, and use them to create or match the person's Deep account.
> 2. Connecting a Page. Inside the seller workspace, the "Connect Facebook Page" button starts a Facebook Login flow requesting the Page and Instagram permissions in this submission, so the seller can connect a Page they own and answer their customers inside Deep.
>
> How to test (the seller interface is in Thai; the English translation of each button is in brackets):
>
> Step 1. In your browser, sign in to facebook.com with the Facebook test account provided below.
> Step 2. Open `https://seller.deepthailand.app/auth/sign-in` and sign in with the Deep test account provided below. On this same page you can also verify Facebook Login itself using the "เข้าสู่ระบบด้วย Facebook" [Sign in with Facebook] button.
> Step 3. In the left menu open "บัญชีที่เชื่อมต่อ" [Connected accounts], then click "เชื่อม Facebook Page" [Connect Facebook Page]. Complete Meta's dialog and allow access to a Page you administer.
> Step 4. You return to the page picker "เลือกเพจที่จะเชื่อม" [Choose pages to connect]. Tick the Page and click "เชื่อมเพจที่เลือก" [Connect selected pages]. The Page appears with the badge "เชื่อมแล้ว" [Connected].
> Step 5. From a different Facebook account, send a message to that Page. In Deep, click "ข้อความ" [Messages] in the left menu — the conversation appears at the top within a few seconds. Open it, type a reply in "พิมพ์ข้อความ..." [Type a message] and click "ส่ง" [Send]; the reply is delivered in Messenger.
> Step 6. To confirm we stop receiving data when asked, return to "บัญชีที่เชื่อมต่อ" and click "ถอด" [Disconnect] on both the Messenger row and the Instagram row of that Page. Deep then calls `DELETE /{page-id}/subscribed_apps` and new messages no longer reach the inbox. This Page belongs to a live business, so please click "เชื่อม Facebook Page" once more afterwards to reconnect it.

**`accesscode-web-2`** (ไม่บังคับ) — ยืนยันจากโค้ดแล้วว่าไม่มี paywall กั้นฟีเจอร์แชทเลย

> Not applicable. Deep is a web application; there is nothing to download from an app store and no payment is required to reach any part of this integration. The test account we provided has full access to the Messenger and Instagram inbox and to the Page-connection flow with no subscription, trial, or in-app purchase involved.

**`geo-web-5`** (ไม่บังคับ)

> No geo-blocking or geo-fencing. The service is reachable from any country. It is built for the Thai market, so the seller interface is in Thai and prices are in Thai baht, but nothing restricts access by location and no feature behaves differently outside Thailand.

**`documents-web-1`** — ช่องนี้รับ `.mov`/`.mp4` ไฟล์ละ ≤2 GB และหลายไฟล์ (กว้างกว่าช่อง
screencast รายข้อที่อัปไม่ผ่าน) ใช้เป็นทางสำรองแนบคลิปได้ พร้อมเติมบรรทัดนี้ท้าย instructions

> Two screen recordings are attached under supporting documentation:
>   `deep-review-10-28-48.mp4` — connecting a Page, a customer message arriving in the inbox, the seller replying by hand, disconnecting the Page, and reconnecting it.
>   `deep-review-12-12-55.mp4` — the ad-referral banner shown at the top of a conversation that started from a Page ad, and the seller's own reels displayed on their public Deep shop profile.

---

## 4. ของที่ยังขอไม่ได้ / อย่าเพิ่งใส่

- `instagram_manage_insights` — ใส่ใน scope แล้ว Meta ตีกลับที่หน้า login ว่า
  "Invalid Scopes" ทำให้ **เชื่อมเพจไม่ได้ทั้งกระบวนการ** ต้องเปิดใน App Dashboard
  + ผ่าน App Review ก่อนเท่านั้น (ดู comment ใน `src/lib/facebook/constants.ts`)
- `human_agent` — คนละเรื่องกับชุดนี้ ใช้ตอบลูกค้าเกิน 24 ชม. (ถึง 7 วัน)
  โค้ดรออยู่แล้วหลัง env `META_HUMAN_AGENT_ENABLED` ขอเพิ่มได้เมื่อ Business
  Verification ผ่าน — ดูรายละเอียดใน SRS/หัวข้อหน้าต่างตอบกลับ
- `pages_utility_messaging` — **ถอดออกจากใบยื่นแล้ว 2026-08-01 (ตัดสินใจโดย user)**
  Meta นิยามว่าใช้ "จัดการ utility messaging template ของเพจ + ส่ง utility message"
  (แจ้งสถานะออเดอร์/บัญชี, เตือนนัดหมาย — สร้างเทมเพลตผ่าน `POST /{page-id}/message_templates`
  category `UTILITY`, ห้ามมีเนื้อหาการตลาด) **ระบบเรายังไม่มีทั้งเทมเพลตและเส้นทางส่ง**:
  ตรวจ 2026-08-01 แล้ว ผู้เรียก Send API มีที่เดียวคือ `channel-chat.service.ts` และส่งได้แค่
  `messaging_type: 'RESPONSE'` (ในหน้าต่าง 24 ชม.) กับ `MESSAGE_TAG` + `HUMAN_AGENT`
  เท่านั้น — service ออเดอร์/iShip ไม่เคยเรียกฟังก์ชันส่งข้อความเลย และฟอร์มของ Meta ก็ขึ้น
  `0 of 1 API call(s) required` เพราะไม่มีโค้ดเรียกจริง
  **ถ้าจะเอาในอนาคต** (แจ้งเลขพัสดุเข้า Messenger แทน SMS ที่หักกระเป๋าร้าน ฿1/ครั้ง —
  ข้อมูลพร้อมแล้วทั้ง `OrderShipment` และเส้นเชื่อมห้องแชท↔ลูกค้า↔ออเดอร์ของ
  `order-stage.service`) ลำดับที่ถูกคือ **เช็คราคาส่งก่อน → feature doc → implement →
  ยิง test call → ค่อยยื่นรอบถัดไป** ห้ามยื่นก่อนมีของ (หลักการข้อ 4 หัวเอกสาร)
