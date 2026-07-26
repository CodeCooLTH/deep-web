---
title: "RESUME — TikTok Chat Integration (feat 00020)"
owner: shinobu22
status: paused 2026-07-25 — รอปลด blocker ฝั่ง TikTok (scope approval)
branch: feature/tiktok-chat
created: 2026-07-25
tags: [resume, handoff, tiktok, chat, 00020]
related:
  - "[[2026-07-25-tiktok-chat-integration-plan]]"
  - "[[../../20 - Features/00020 - TikTok Chat Integration/PRD]]"
  - "[[../../20 - Features/00020 - TikTok Chat Integration/SDS]]"
---

# RESUME: TikTok Chat Integration (feat 00020)

> **หยุดพักเมื่อ:** 2026-07-25 (จบ session)
> **สาเหตุที่พัก:** งานที่ทำได้โดยไม่มี credential/approval ทำครบแล้ว — ที่เหลือติด blocker ฝั่ง TikTok
> **อ่านไฟล์นี้ก่อนเริ่มงานต่อ** แล้วค่อยไปดู [[2026-07-25-tiktok-chat-integration-plan|แผนเต็ม]]

---

## 1. สถานะปัจจุบัน — 5 commit บน `feature/tiktok-chat` (ยังไม่ push ยังไม่ merge)

| commit | ได้อะไร |
|---|---|
| `3f92dc5d` | PRD + BRD + แผน 7 phase (FR-TTC-01..15, BR-TTC-01..38, OQ-TTC-01..14) |
| `e0377127` | **Phase 2 เสร็จ** — `src/lib/channel-providers/` (types/meta/index) + 18 เทส |
| `ae6b2f49` | schema + migration token lifecycle + DATABASE.md/API.md |
| `2c10a446` | `src/lib/tiktok/shop-open-api.ts` (signing + fetch) + 12 เทส + SDS.md |
| `dad0e932` | doc-sync ตามเอกสารทางการ — แก้ authorize URL ที่ผิด + semantics ของ CS API |

**Verification ล่าสุด:** `tsc` 0 · เทสที่เกี่ยวข้อง 42/42 · production build ผ่าน · working tree สะอาด

**Migration:** `20260725140000_channel_token_lifecycle` **apply บน Supabase แล้ว** (ยืนยันจาก DB จริง:
`refreshTokenEnc` text / `tokenExpiresAt` timestamp / `externalMeta` jsonb + index
`ShopChannel_status_tokenExpiresAt_idx`; แถวเดิม 13 แถวเป็น NULL → ช่องทาง Meta ไม่กระทบ)

---

## 2. 🛑 Blocker ที่ต้องปลดก่อนไปต่อ (อยู่ที่ user ทั้งหมด)

| # | เรื่อง | ทำไมสำคัญ |
|---|---|---|
| B-1 | **Manage API — ขอ scope `seller.customer_service` ได้จริงไหม** (Partner Console → App & Service → Manage → Manage API) | **ตัวชี้ขาดว่า feature นี้ไปต่อได้หรือไม่** — CS เป็น custom scope ต้องยื่นขอ |
| B-2 | `TIKTOK_SHOP_SERVICE_ID` จากหน้า App details | ต้องมีเพื่อสร้าง authorize URL (คนละค่ากับ `app_key`) |
| B-3 | URL ของ **"View the Quick Start guide"** ของ **TTS Open Toolkit CLI** (แบนเนอร์บนหน้า App & Service) | TikTok ทำ CLI สำหรับ AI coding assistant มาให้เฉพาะ — ให้ guidance ที่ up-to-date + validate API call ควรใช้แทนการขูดเอกสารเอง หา URL จากภายนอกไม่เจอ |
| B-4 | **review PRD + BRD** | Hard Rule 11 — ยังเป็น draft ห้าม implement feature ต่อก่อนผ่าน gate นี้ |
| B-5 | ตัดสินใจ **merge เข้า main หรือคงไว้บน branch** | 5 commit ค้าง; ไม่มี migration ใหม่ (apply แล้ว) ความเสี่ยง DB = ศูนย์ |

### สภาพ app จริงใน Partner Center (ตรวจ 2026-07-25)

- account role: **App Developer (ISV)**
- app: **"Deep Chat & LIVE"** ID `7666247860866467602`
- **type: Public** · **category: Customer Support** · **status: Draft**
- env ที่มีแล้ว: `TIKTOK_SHOP_APP_KEY` (13 ตัว) + `TIKTOK_SHOP_APP_SECRET` (40 ตัว) — อยู่ใน `.env.local` ของ worktree นี้, main-3 และ repo หลัก

**ประเด็นที่ยังไม่สรุป:** เอกสาร overview ระบุว่า CS scope ต้องมี **1,000+ authorized sellers** หรือ
**1 ล้าน API call/วัน** โดยมี**ข้อยกเว้น**สำหรับ app category `Seller in-house developer / TikTok Shop Seller`
(ร้านที่มีทีมพัฒนาเอง) — แต่ capability matrix ในเอกสารไม่มี category ชื่อ "Customer Support" ที่ app จริง
ใช้อยู่ และหน้านั้นเขียนกำกับเองว่า *"refer to the actual Partner Center application page"*
→ **เอกสารกับของจริงไม่ตรงกัน ต้องดูหน้า Manage API เท่านั้น (B-1)**

⚠️ **App Category เปลี่ยนไม่ได้ตลอดกาล** — *"cannot be changed through any channel"* ถ้าผิดต้องสร้าง app ใหม่
(และ app_key/secret จะเปลี่ยน)

---

## 3. ทำต่อได้ทันทีโดยไม่ต้องรอ blocker

ลำดับที่ถูก: **C → A → B**

| | งาน | หมายเหตุ |
|---|---|---|
| **C** | refactor `isTokenDeadError(): boolean` → `classifyError(): 'REFRESH' \| 'DEAD' \| 'TRANSIENT' \| 'FAILED'` | **ต้องทำก่อน adapter** ไม่งั้นเสี่ยงปิดช่องทางร้านผิด (ดู SDS TD-009) — Meta adapter ต้องพฤติกรรมเดิมเป๊ะ |
| **A** | `src/lib/tiktok/auth-api.ts` — authorize URL builder + `token/get` + `token/refresh` | endpoint ยืนยันครบ เขียน+unit test ได้โดยไม่ต้องมี credential |
| **B** | `src/lib/channel-providers/tiktok-shop.ts` adapter | TD-001/002/003 รู้ครบแล้ว เทสด้วย mocked fetch ได้ |

**งานที่ไม่เกี่ยวกับ TikTok แต่คุ้มกว่าและควรทำก่อน:**

> **ปุ่ม "เชื่อมใหม่" ในหน้า `/settings/channels` เมื่อ `status = TOKEN_INVALID`**
> — เป็น gap ของ feature 00018 ที่พบจาก QA จริง 2026-07-25: แบนเนอร์ในแชทชี้ไปหน้านั้นแต่หน้านั้น
> ไม่มีทางกู้คืน **ร้านอะไหล่ (tanapat001) ยังตอบ Messenger ไม่ได้อยู่ตอนนี้ 183 เธรดจริง**
> และเป็น blocker ของ TikTok อยู่ดี (lifecycle เดียวกัน SDS §4.3) · เป็นงาน frontend → ต้องผ่าน
> `safepay-ux` ก่อน (Hard Rule 8)

---

## 4. บทเรียน/กับดักที่ค้นมาแล้ว — **ห้าม re-derive**

### 4.1 วิธีอ่านเอกสาร TikTok Shop

`partner.tiktokshop.com/docv2/**` เป็น **JS-rendered** — WebFetch/curl ได้แต่ title ว่าง
**ต้องอ่านผ่าน browser** (Chrome DevTools MCP) ซึ่ง**ไม่ต้อง login** ก็อ่านได้
(แต่ console `partner.tiktokshop.com/service/**` ต้อง login และเซสชันอยู่ใน Chrome profile ของ user
ไม่ใช่ instance ที่ Claude คุม)

**บทเรียน:** รอบแรกไปสกัดจาก SDK ชุมชน `EcomPHP/tiktokshop-php` เพราะเข้าใจผิดว่าเอกสารอ่านไม่ได้
→ ได้ข้อมูล**ไม่ครบและมีจุดผิด** เสียเวลาและเกือบ implement ผิด 3 จุด **เจอหน้า JS-rendered ให้เปิด
browser ก่อน อย่าไปหา proxy source**

หน้าที่อ่านแล้ว: `send-message-202309` · `sign-your-api-request` · `678e3a4278f4c20311b8b57e`
(common parameters) · `common-errors` · `tts-webhooks-overview` · `678e3a3292b0f40314a92d75`
(Get Access Token) · `customer-service-api-overview` · `hulvi36o` (App Category Guide) ·
`64f19916cb677b0286e76d9d` (access scopes)

### 4.2 ข้อเท็จจริงที่ยืนยันจากเอกสารทางการแล้ว

| เรื่อง | ค่าจริง |
|---|---|
| **authorize URL (seller, ROW/ไทย)** | `https://services.tiktokshop.com/open/authorize?service_id={service_id}&state=` — **ใช้ `service_id` ไม่ใช่ `app_key`** (US: `services.us.tiktokshop.com`) |
| token endpoints | `https://auth.tiktok-shops.com/api/v2/token/{get,refresh}` (ทุกตลาด) |
| `auth_code` | อายุ **30 นาที ใช้ครั้งเดียว** |
| `access_token` | อายุ **7 วัน**; `access_token_expire_in` เป็น **unix timestamp สัมบูรณ์ ไม่ใช่ระยะเวลา** — ห้าม hardcode |
| `refresh_token_expire_in` | = ระยะเวลาที่ร้านให้สิทธิ์ (หมดแล้วต้อง authorize ใหม่ ไม่ใช่ refresh) |
| สูตร `sign` | `HMAC-SHA256( app_secret + path + concat(sorted {k}{v}) + body + app_secret , app_secret )` — **implement แล้วและตรงกับ code sample ทางการ** (12 เทสล็อกไว้) |
| `timestamp` | 10 หลัก วินาที · ช่วงที่รับ `[now-5นาที, now+30วินาที]` · นอกช่วง = `36009004` |
| ส่งข้อความ | `POST /customer_service/202309/conversations/{id}/messages` · scope **`seller.customer_service`** |
| **`content`** | **JSON serialized string ไม่ใช่ object** — `"content": "{\"content\": \"test\"}"` |
| `type` enum | TEXT · IMAGE · VIDEO · PRODUCT_CARD · ORDER_CARD · RETURN_REFUND_CARD · COUPON_CARD · LOGISTICS_CARD |
| TEXT | สูงสุด **2000** ตัวอักษร (ไม่ใช่ 6000 — 6000 เป็นของ Business Messaging ทาง B) |
| IMAGE | `{url, width, height}` · `url` ต้องได้จาก `images/upload` ก่อน · **ต้องรู้ขนาดรูป** |
| quota | **10,000 request/วัน** (`45101004`) |
| envelope | `{code, message, request_id, data}` · `code: 0` = สำเร็จ |
| เธรดปิดเอง | ลูกค้าไม่ตอบ **6 ชม.** · ร้านไม่ตอบ **7 วัน** |
| ทักลูกค้าก่อน | ได้เมื่อเข้าเงื่อนไขข้อใดข้อหนึ่ง: เคยคุยใน **30 วัน** / สั่งของใน **60 วัน** / มีประวัติคืนเงิน |
| sender roles | `BUYER` `CUSTOMER_SERVICE` `SHOP` `SYSTEM` `ROBOT` (5 แบบ → map ลง 2 ค่าของเรา) |
| ตัวระบุลูกค้า | ใช้ **`buyer_user_id`** (join กับ Order API ได้) **ห้ามใช้ `im_user_id`** (query ออเดอร์ไม่ได้) |
| webhook signature | header **`Authorization`** = HMAC-SHA256(`app_key + rawBody`, app_secret) hex — **ยังมาจาก SDK ยังไม่ยืนยันกับเอกสารทางการ** |
| webhook lifecycle | `SELLER_DEAUTHORIZATION` (ร้านถอนสิทธิ์) · `UPCOMING_AUTHORIZATION_EXPIRATION` (เตือนล่วงหน้า 30 วัน แล้วทุกวัน 00:00) — **Meta ไม่มี event แบบนี้** |
| scope กลุ่ม public | order / product / fulfillment / logistics / finance / promotion / return&refund — **ได้ทันทีไม่ต้องขอ** |

### 4.3 กับดักที่อันตรายที่สุด (SDS TD-009)

`36009004` ถูกใช้ซ้ำหลายกรณีมาก และเอกสารสั่งเองว่า *"Do not use the numeric code alone for
programmatic branching"* — ถ้าเหมารวมเป็น "token ตาย":

- `Invalid timestamp ...` → **นาฬิกา instance เพี้ยน จะปิดช่องทางร้านทิ้ง**
- `Invalid app_key` / `Missing credentials, signature` → **บั๊กเราเอง จะปิดช่องทางร้านทิ้ง**

การแยกที่ถูก: `105002` = หมดอายุ → **refresh** · `36009004` + keyword `x-tts-access-token ... invalid`
= ตายจริง → เชื่อมใหม่ · `105005` = scope ไม่ได้รับอนุมัติ · `106001` = ลายเซ็นเราผิด ·
`36009002`/429 = rate limit · **`36009033` = IP allow list → ห้ามเปิดฟีเจอร์นี้เพราะ Vercel egress IP ไม่คงที่**

**กฎ:** เมื่อไม่ชัด **เลือกไม่ mark ช่องทางตาย** (mark ผิด = ร้านตอบไม่ได้ทั้งร้าน; ไม่ mark เมื่อควร
= ข้อความถัดไป fail แล้วรู้อีกที เสียหายน้อยกว่ามาก)

### 4.4 สอง API แชทที่ชื่อคล้ายกันจนหยิบผิด

`customer_service/202309` (**buyer ↔ seller = ของเรา**, field `type`) vs `affiliate_seller/202412+`
(creator ↔ seller, field `msg_type`, scope `seller.affiliate_messages.write`)
→ **ห้าม subscribe `NEW_MESSAGE_LISTENER`** เพราะเป็น event ของโดเมน affiliate จะได้เธรดที่ตอบไม่ได้

---

## 5. Environment ของ worktree นี้ (ตั้งไว้แล้ว)

- `npm ci` แล้ว — **ห้าม symlink `node_modules` ข้าม worktree** เพราะ Turbopack ปฏิเสธ
  (`Symlink node_modules is invalid, it points out of the filesystem root`) ทำให้ `next dev` และ
  `next build` พังทั้งคู่ (symlink ใช้ได้แค่ `tsc`/`vitest`)
- `.env.local` copy จาก main-3 + เติม `TIKTOK_SHOP_APP_KEY`/`SECRET`
- `next-env.d.ts` สร้างแล้ว (gitignored) — ไม่มีจะทำให้ tsc ขึ้น error asset import 78 ข้อ
- dev server: `npm run dev -- -p 4000` → `seller.deepth.local:4000`
- **ห้าม `prisma format`** ในโปรเจกต์นี้ — reflow ทั้งไฟล์ (วัดจริง 95+/73− ทั้งที่แก้ 3 คอลัมน์)
- `tsc` = `node node_modules/typescript/lib/tsc.js --noEmit`

---

## 6. หนี้ที่ค้างอยู่ (ไม่ใช่ของ feature นี้แต่เจอในระหว่างทาง)

| # | เรื่อง | ผลกระทบ |
|---|---|---|
| D-1 | **ร้านอะไหล่ (tanapat001) ช่องทาง Messenger = `TOKEN_INVALID`** จากการที่ user เชื่อมเพจเดียวกันเข้าอีกร้าน | **ร้านตอบ Messenger ไม่ได้ 183 เธรด** (Instagram ยังปกติ) |
| D-2 | หน้า `/settings/channels` **ไม่มีปุ่มเชื่อมใหม่** เมื่อ `TOKEN_INVALID` | ร้านกู้เองไม่ได้ — ต้องแก้ก่อนเปิด TikTok ให้ร้านใช้จริง |
| D-3 | **`main` มีเทสล้มค้าง 99 ข้อ** ตั้งแต่ก่อนเริ่มงานนี้ (`badge.test.ts` 46, `chat-service-filters`, `activity.service`, `getSellerPageTitle`, `expo-push`, `api/chat/conversations/route`) | เกณฑ์ "เทสเขียวครบ" ใช้ไม่ได้ → ใช้ "ไม่มี failure ใหม่เทียบ baseline ที่วัดด้วย `git stash`" แทน |
| D-4 | มีสตรีมอื่น migrate ฐานเดียวกันวันเดียวกัน (`chat_reaction_referral`, `chat_reply_unsend`, `order_no`, `shop_cover_image`) | ก่อน `migrate deploy` ต้องเช็ค `migrate status` ทุกครั้ง |

---

## 7. Checklist เริ่ม session ถัดไป

1. `git log --oneline -6` ยืนยันว่าอยู่ที่ `dad0e932` บน `feature/tiktok-chat`
2. อ่าน §2 blocker — ถ้า **B-1 ยังไม่มีคำตอบ ห้ามเขียน route** (ไม่รู้ว่าจะได้ scope ไหม)
3. ถ้าจะทำ TikTok ต่อ → **C → A → B** (§3)
4. ถ้าจะทำงานที่ได้ประโยชน์ทันที → **ปุ่มเชื่อมใหม่** (§3, ผ่าน `safepay-ux` ก่อน)
5. ก่อน QA ใด ๆ: ขอ user สตาร์ท dev server เอง (`feedback_qa_domains`)
6. ก่อน `migrate deploy` ใด ๆ: `migrate status` + ขอ user ยืนยัน (§6 D-4)
