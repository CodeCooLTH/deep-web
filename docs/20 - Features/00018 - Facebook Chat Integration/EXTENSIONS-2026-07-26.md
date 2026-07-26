# 00018 — Extensions (2026-07-26)

> | # | Extension | สรุป |
> |---|---|---|
> | E5 | แบนเนอร์ "ตอบกลับจากโฆษณา" | ยกระดับ [[EXTENSIONS-2026-07-25]] E8 — รูป+ชื่อโฆษณาใต้ชื่อแชท, ค่าล่าสุดแทนแรกเข้า, เก็บประวัติ |
> | E6 | ลดความถี่แบนเนอร์ 24 ชม. | แสดงเฉพาะเมื่อเหลือ ≤ 4 ชม. (เดิมค้างตลอดเวลา) |
>
> commit: `9557464b` (E5+E6) — merged main + migration `20260726160000` applied

---

## E5 — แบนเนอร์ "ตอบกลับจากโฆษณา" (Ad Referral Banner)

### E5.1 Requirement

**Goal:** ผู้ขายรู้ตั้งแต่เปิดเธรดว่าลูกค้าทักมาจากโฆษณาชิ้นไหน (เห็นทั้งรูปและชื่อ) เพื่อตอบให้ตรงกับ
โปรที่ลูกค้าเห็น โดยไม่ต้องสลับไป Messenger/Ads Manager

**ที่มา:** user request 2026-07-26 พร้อมหน้าจอ Messenger จริง (แบนเนอร์ "This is a reply to an ad")
— ของเดิม (E8) มีแค่ badge ตัวเล็กที่ตัดชื่อโฆษณายาว ๆ จนอ่านไม่ออก

| FR | ข้อกำหนด | Acceptance |
|---|---|---|
| FR-ADREF-01 | parse `ads_context_data` ครบทุกช่อง (`ad_title`/`photo_url`/`video_url`/`post_id`/`product_id`/`flow_id`) | ยิง webhook CTM ครบ field → เก็บได้ครบ ไม่ถูก Valibot ตัด |
| FR-ADREF-02 | referral = **ค่าล่าสุด** — อัปเดตทุกครั้งที่ลูกค้ากดโฆษณาเข้ามา ไม่ใช่แค่ตอนสร้างเธรด (**แทน FR-REF-02 เดิม**) | ลูกค้าเดิมกดโฆษณา B หลังเคยมาจาก A → แบนเนอร์แสดง B |
| FR-ADREF-03 | ทุกครั้งที่รับ referral บันทึกเป็นแถวประวัติเพิ่ม ไม่ทับของเดิม | รับ referral 2 ครั้ง → `ConversationAdReferral` มี 2 แถว |
| FR-ADREF-04 | mirror `photo_url` เข้า storage ของเราตอนรับ webhook | แถวที่บันทึกมี `photoFileId`; แบนเนอร์เสิร์ฟผ่าน `/api/files/{id}` |
| FR-ADREF-05 | แบนเนอร์ใต้ชื่อแชท: รูปโฆษณา + "ตอบกลับจากโฆษณา" + ชื่อโฆษณา (ตัดบรรทัดเดียว) + ปุ่มปิด | เปิดเธรดที่มาจากโฆษณา → เห็นครบ 4 ส่วน |
| FR-ADREF-06 | กดปิดแล้วไม่เด้งกลับเมื่อเปิดเธรดเดิมซ้ำ | กด X → refresh → ยังไม่แสดง |
| FR-ADREF-07 | โฆษณา **ตัวใหม่** เข้ามาหลังกดปิด → แบนเนอร์กลับมาแสดง | ปิดแล้วรับ referral ad_id ใหม่ → เปิดเธรด เห็นอีกครั้ง |
| FR-ADREF-08 | ไม่ได้มาจากโฆษณา / `source != ADS` / ไม่มีทั้งชื่อและรหัสโฆษณา → ไม่แสดงแบนเนอร์เลย (ไม่ใช่ empty state) | เธรดปกติ → หัวแชทเหมือนเดิมทุกประการ |

**Out of scope:**
- ชื่อ campaign / ad set / ยอดใช้จ่าย — ต้อง Marketing API + permission `ads_read` + ให้ร้านเชื่อม
  ad account (เก็บ `adId` ไว้แล้ว ต่อยอดได้)
- รายงาน "โฆษณาตัวไหนสร้างแชท/ปิดการขายได้เท่าไร" — ข้อมูลดิบพร้อมแล้วที่ `ConversationAdReferral`
- ลิงก์ "View details" ไป Ads Manager (มีในหน้าจอ Messenger ที่อ้างอิง — ตัดออกเพราะเราไม่มีหน้า
  รายละเอียดโฆษณา; ทำเป็นลิงก์ออกไป `business.facebook.com/adsmanager` ด้วย `adId` ได้ในอนาคต)
- ตัวกรอง inbox "เฉพาะแชทจากโฆษณา" และป้ายในรายการ inbox
- label ของ Messenger (ชิป `FB ad_id.1202…` `+3` ในหน้าจออ้างอิง) — คนละเรื่อง เป็นป้ายที่ร้านแปะเธรดเอง

### E5.2 Business Rules

- **BR-ADREF-01** ข้อมูล referral มาจาก **webhook เท่านั้น** — Graph API `Conversation` node มีแค่
  `id`/`is_owner`/`messages`/`participants`/`updated_time` ไม่มีทางอ่านย้อนหลัง → ถ้าค่าล่าสุดทับของเดิม
  ทิ้งไปเรื่อย ๆ ประวัติหายถาวร จึงต้องมีตารางประวัติควบคู่กับค่า denormalized
- **BR-ADREF-02** แสดงแบนเนอร์เฉพาะ `source = "ADS"` — `SHORTLINK` (ลิงก์ m.me) ยังบันทึกเพราะเป็น
  ข้อมูลที่มาที่มีค่า แต่ไม่ใช่โฆษณา จึงไม่ขึ้นป้าย "ตอบกลับจากโฆษณา"
- **BR-ADREF-03** referral ที่ไม่มีทั้ง `ad_id` และ `ad_title` → บันทึกได้แต่ไม่แสดง (กันแบนเนอร์เปล่า)
- **BR-ADREF-04** ไม่มีการ backfill แชทเก่า — Meta ไม่เปิดให้ดึงย้อนหลัง เธรดที่มีข้อมูลจาก E8 อยู่แล้ว
  จะแสดงแบนเนอร์ได้ (มีชื่อโฆษณา) แต่**ไม่มีรูป** จนกว่าลูกค้าจะกดโฆษณาเข้ามาใหม่
- **BR-ADREF-05** สถานะ "ปิดแบนเนอร์แล้ว" เก็บที่ localStorage ต่อ `conversationId` — เป็นความชอบ
  ระดับอุปกรณ์เหมือน mute รายเธรด ไม่ใช่ข้อมูลร้าน (พนักงานคนอื่นยังเห็นอยู่ ตรงกับพฤติกรรม Messenger)
  เก็บเป็น **"รหัสโฆษณาที่ปิดไป"** ไม่ใช่ boolean เพื่อให้ FR-ADREF-07 ทำงานโดยไม่ต้องเคลียร์ค่า
- **BR-ADREF-06** mirror รูปล้มเหลว (โฮสต์นอก allow-list / timeout / ไฟล์เกิน 25MB) → บันทึกต่อโดย
  `photoFileId = null` แบนเนอร์แสดงแบบไม่มีรูป — **ห้ามทำให้ ingest ข้อความล้ม**
- **BR-ADREF-07** referral ไม่สร้างเธรดเอง — `ingestAdReferral` เรียกหลัง ingest ข้อความเสมอ; หาเธรด
  ไม่เจอ = เงียบ ไม่ throw (เหมือน `ingestReadEvent`)

### E5.3 Data Model

migration `20260726160000_chat_ad_referral_banner` (additive ล้วน — applied Supabase dev/prod):

```prisma
model Conversation {
  // เดิม (E8) — เปลี่ยนความหมายจาก "แรกเข้า" เป็น "ล่าสุด"
  referralSource       String?
  referralAdTitle      String?
  // ใหม่ (E5)
  referralAdId         String?
  referralPhotoFileId  String?
  adReferrals          ConversationAdReferral[]
}

model ConversationAdReferral {
  id             String   @id @default(uuid())
  conversationId String
  source         String?   // "ADS" | "SHORTLINK"
  adId           String?
  adTitle        String?
  photoFileId    String?   // mirror เข้า storage แล้ว
  photoUrl       String?   // URL ต้นทาง Meta (หมดอายุได้) — เก็บไว้ debug/mirror ซ้ำ
  videoUrl       String?
  postId         String?
  productId      String?
  flowId         String?
  refPayload     String?   // referral.ref
  receivedAt     DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, receivedAt])
}
```

**ทำไมทั้ง denormalized และตารางประวัติ:** แบนเนอร์อ่านค่าล่าสุดตอนเปิดเธรด (ไม่ต้อง join) และ
เธรดเก่าที่มีข้อมูลจาก E8 อยู่แล้วยังแสดงได้ทันที; ตารางประวัติเป็นข้อมูลดิบที่กู้คืนไม่ได้ถ้าไม่เก็บ

### E5.4 Code

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/facebook/webhook-types.ts` | `ReferralSchema.ads_context_data` ครบทุกช่อง + export type `Referral` |
| `src/services/channel-chat.service.ts` | ตัดการเขียน referral ออกจาก create-path ของ `ingestInboundMessage`; เพิ่ม `ingestAdReferral` (mirror รูป → `$transaction` [insert ประวัติ, update ค่าล่าสุด]) |
| `src/app/api/channels/facebook/webhook/route.ts` | เรียก `ingestAdReferral` **หลัง** `ingestInboundMessage` ใน try/catch แยก (referral พังต้องไม่ทำให้ Meta retry ทั้ง batch) |
| `.../inbox/[conversationId]/page.tsx` | select `referralSource/AdTitle/AdId/PhotoFileId` → prop `adReferral` (กรอง `source==='ADS'` + ต้องมีชื่อหรือรหัส) |
| `.../components/ChatThread.tsx` | ลบ badge เดิม; เพิ่มแบนเนอร์ + state ปิดแบนเนอร์ (localStorage) |

**UI:** `bg-default-100` โทนกลาง (เป็นข้อมูลบริบท ไม่ใช่คำเตือน — ต้องแยกจากแบนเนอร์ 24 ชม. ที่เป็น
warning/danger), รูป `size-10 rounded-md object-cover`, fallback ไอคอน `speakerphone` เมื่อไม่มีรูป,
ปุ่มปิด `btn btn-icon` + ไอคอน `x`.
Base: `theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx` (DismissingAlert)

⚠️ **ไม่ได้ผ่าน `safepay-ux` (Hard Rule 8)** — subagent ในเซสชันนั้นใช้ไม่ได้ (idle ไม่ส่งงานกลับทั้ง
`safepay-product` และ `safepay-ux`) Controller source จาก Paces เองแทน. ถือเป็นหนี้: ควรให้ ux ตรวจ
ย้อนหลัง + รัน `/impeccable critique` เมื่อ subagent กลับมาใช้ได้

### E5.5 Permission

**ไม่ต้องขอ permission ใหม่** — `messaging_referrals` เป็น *webhook field* ไม่ใช่ Login permission
(ใช้ `pages_messaging` ที่มีอยู่). เอกสาร Meta ระบุเงื่อนไขเดียวคือเพจต้อง subscribe ทั้ง `messages`
และ `messaging_referrals` ซึ่ง `MESSENGER_SUBSCRIBED_FIELDS` มีครบแล้วตั้งแต่ E8

### E5.6 Known Gap

- **เพจที่เชื่อมก่อนเพิ่ม `messaging_referrals` ต้อง re-sync** (`POST /api/channels` →
  `resubscribeShopChannels`) — Meta ล็อกชุด subscribe field ไว้ตอนเชื่อมครั้งแรก (ยกมาจาก E8.3)
- **แชทเก่าไม่มีรูปโฆษณา** — ไม่มี API ให้ backfill (BR-ADREF-04)
- **Instagram ยังไม่ได้ทดสอบจริง** — เอกสาร Meta รวม Messenger/IG ไว้หน้าเดียวกัน แต่โปรเจกต์นี้
  เจอหลายเคสที่ IG ต่างจาก Messenger (ดู `getContactProfile`) ต้องยืนยันกับบัญชีจริง
- **ยังไม่มี unit test / Playwright** สำหรับ `ingestAdReferral` และแบนเนอร์
- **ยังไม่ visual QA** — user เทสบน prod เอง

### E5.7 อ้างอิง Meta

- [messaging_referrals webhook event](https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messaging_referrals)
- [messages webhook event](https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages/) — payload ที่ `referral` ซ้อนใน `message` + เงื่อนไข subscribe 2 field
- [Graph API Conversation node](https://developers.facebook.com/docs/graph-api/reference/conversation/) — ยืนยันว่าไม่มี field referral ให้อ่านย้อนหลัง (ที่มาของ BR-ADREF-01)

---

## E6 — ลดความถี่แบนเนอร์หน้าต่าง 24 ชม.

### E6.1 Requirement

**Goal:** ลดสิ่งรบกวนสายตาบนหัวแชท — เตือนเฉพาะตอนที่ผู้ขายต้องรีบจริง
(user request 2026-07-26: "ลด degree ความเข้มข้นของการแจ้งเตือน 24 ชั่วโมง ให้เหลือแค่ถ้าเวลาต่ำกว่า
4 ชั่วโมงค่อยแสดงผล")

| FR | ข้อกำหนด | Acceptance |
|---|---|---|
| FR-WIN-10 | เหลือ > 4 ชม. → **ไม่แสดงแบนเนอร์ใด ๆ** (เดิมแถบฟ้านับถอยหลังค้างตลอด) | เธรดที่ลูกค้าเพิ่งทัก → หัวแชทไม่มีแถบสี |
| FR-WIN-11 | เหลือ ≤ 4 ชม. → แถบเหลือง "ใกล้หมดเวลาตอบ — เหลือ …" (เหมือนเดิม) | เธรดที่เหลือ 3 ชม. → เห็นแถบเหลือง |
| FR-WIN-12 | หมดเวลา / ลูกค้ายังไม่เคยทัก / token เพจเสีย → แถบแดง (เหมือนเดิม) | ไม่เปลี่ยนแปลง |
| FR-WIN-13 | เธรดที่เปิดค้างแล้วข้ามเส้น 4 ชม. → แบนเนอร์โผล่เองโดยไม่ต้อง reload | ตัวนับเดินถึง 4:00:00 → แถบเหลืองปรากฏ |

### E6.2 Implementation

`ChatThread.tsx` — เงื่อนไขที่ **ตัวห่อ** (ไม่ใช่ข้างใน เพื่อไม่ให้เหลือ `px-4 pt-4` ลอยเป็นช่องว่าง):
`isExternal && (tokenInvalid || !liveWindowOpen || liveRemaining <= FOUR_HOURS_MS)`
+ ตัด tier สีฟ้าใน `formatWindowBanner` ทิ้ง (dead code)

ตัวนับ 1 วินาทียังเดินเหมือนเดิม — ใช้ปิด composer อัตโนมัติตอนครบ 24 ชม. และทำให้แบนเนอร์โผล่เอง
ตอนข้ามเส้น 4 ชม. (FR-WIN-13)

### E6.3 ผลกระทบต่อเอกสารเดิม

`BRD.md §6.5` + state diagram §5 sync แล้ว (เดิมระบุ "ต้องเห็นชัดก่อนหมดเวลา" แบบค้างตลอด)
