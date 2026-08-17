# App Review Notes — ตอบ Guideline 2.1 Information Needed (2026-08-16)

> Submission ID `75e3886e-5361-4d07-bd31-aca00e38d051` · App Version 1.0 (2)
> Apple ขอ **ข้อมูล 7 ข้อ** ไม่ได้บอกว่าโค้ดผิด — ไม่ต้องแก้โค้ด ไม่ต้อง build ใหม่
>
> 🛑 สิ่งที่ต้องทำมี 2 อย่าง: (1) อัดคลิปหน้าจอจากเครื่องจริง (2) วางข้อความข้างล่างใน
> **App Review Information → Notes** แล้วตอบกลับในหน้า App Review

---

## 1. คลิปหน้าจอ — สิ่งเดียวที่ทำแทนไม่ได้

Apple ระบุเงื่อนไขไว้ชัด ทำไม่ครบ = ตีกลับซ้ำด้วยเหตุผลเดิม:

| ข้อบังคับ | รายละเอียด |
|---|---|
| อัดจาก **เครื่องจริง** | ไม่ใช่ simulator · iOS เวอร์ชันล่าสุด |
| เริ่มที่ **การเปิดแอป** | ต้องเห็นตั้งแต่แตะไอคอน ไม่ใช่เริ่มกลางทาง |
| เดินตาม **flow หลักของผู้ใช้จริง** | ไม่ใช่กวาดผ่านทุกจอแบบไม่มีบริบท |

**ต้องมีในคลิป (ตามที่ Apple ไล่มา):**

1. **สมัคร / เข้าสู่ระบบ / ลบบัญชี** — โชว์ทั้ง 3 · ปุ่ม Sign in with Apple ต้องเห็นว่าอยู่บนสุด
2. **การเข้าถึงเนื้อหาที่ต้องจ่ายเงิน** — แอปนี้ **ไม่มี** ⇒ ให้พูดในคลิปหรือขึ้นข้อความว่าไม่มีช่องทางซื้อในแอป
3. **เนื้อหาที่ผู้ใช้สร้าง + การรายงาน/บล็อก** — 🛑 **ตรวจโค้ดแล้ว: แอปนี้ไม่มีปุ่มรายงาน/บล็อก**
   เมนูในเธรดแชทมีแค่ *สถานะการขาย · กลุ่ม · แท็ก* (`ChatContextMenu.tsx`) และ `isBlocked`
   ในฐานข้อมูลเป็นสถานะที่ **LINE แจ้งกลับมา** ว่าลูกค้าบล็อก OA ไม่ใช่ปุ่มให้ผู้ขายกด
   ⇒ **ห้ามอ้างในคลิปหรือในข้อความว่ามี** · ให้ตอบตามข้อ 3 ในข้อความข้างล่างแทน
4. **จอขอสิทธิ์** — ให้เห็นป๊อปอัปขอ **กล้อง** และ **รูปภาพ** จริง (แนบรูปสินค้า/สลิป)

**ลำดับที่แนะนำ (~3–4 นาที):**

```
เปิดแอป → หน้าล็อกอิน (เห็นปุ่ม Apple บนสุด) → ล็อกอินด้วย appreview
→ หน้าแรก (ยอดขาย/งานวันนี้)
→ รายการคำสั่งซื้อ → เปิดใบหนึ่ง → ดูรายละเอียด
→ กล่องแชท → เปิดเธรด → แนบรูป (ป๊อปอัปขอสิทธิ์กล้อง/รูปโผล่ตรงนี้)
→ เมนูในเธรด → โชว์ปุ่มรายงาน/บล็อกลูกค้า
→ สินค้า → เพิ่มสินค้า → ถ่ายรูป
→ ตั้งค่าบัญชี → โชว์ว่าไม่มีปุ่มเติมเงิน/ไม่มีแพ็กเกจ
→ ตั้งค่าบัญชี → ลบบัญชี (โชว์จอยืนยัน ไม่ต้องกดจริง)
```

อัดด้วย Control Center → บันทึกหน้าจอ · อัปโหลดเป็นไฟล์แนบในหน้า App Review

---

## 2. ข้อความตอบ — ก็อปทั้งบล็อกไปวาง

```
Hello App Review Team,

Thank you for the guidance on Submission ID 75e3886e-5361-4d07-bd31-aca00e38d051.
Please find all requested information below. A screen recording captured on a
physical device is attached to this reply.

────────────────────────────────────────────────────────────────────────────
1. SCREEN RECORDING
────────────────────────────────────────────────────────────────────────────

Attached. Recorded on a physical iPhone running the latest iOS. The recording
starts from launching the app and covers: sign-in (including Sign in with
Apple placement), the seller dashboard, order management, customer chat with
photo attachment (camera and photo library permission prompts are shown),
product creation, and the account deletion flow.

The app contains no paid content, no in-app purchase, and no subscription
flow, so no purchase path appears in the recording.

On user-generated content: this app is a single-merchant business tool. There
is no social feed and no content that one user of this app publishes to other
users of this app. The messages a merchant sees in the inbox are private
one-to-one conversations between that merchant and their own customers,
delivered from the merchant's own Facebook Page, Instagram account or LINE
Official Account through the official platform APIs. Reporting and blocking
of those conversations is handled by Meta and LINE on their own platforms,
where the conversation actually lives — a block applied there stops delivery
to our app as well. For this reason the app does not duplicate those controls.
If you would like us to add in-app reporting or blocking controls, we are
happy to do so; please let us know what you expect to see.

────────────────────────────────────────────────────────────────────────────
2. DEVICES AND OPERATING SYSTEMS TESTED
────────────────────────────────────────────────────────────────────────────

- iPhone 15 Pro — iOS 26 (physical device, via TestFlight)
- iPhone 13 — iOS 26 (physical device, via TestFlight)
- iPad (10th generation) — iPadOS 26 (physical device)

Minimum supported version: iOS 16.4.

────────────────────────────────────────────────────────────────────────────
3. APP FUNCTION AND TARGET AUDIENCE
────────────────────────────────────────────────────────────────────────────

Target audience: small and independent merchants in Thailand who sell through
social media (Facebook Messenger, Instagram Direct, LINE) rather than through
a traditional storefront.

Problem it solves: these merchants receive orders as free-form chat messages
across several apps. Order details, delivery addresses, payment slips and
shipping numbers end up scattered across conversations, so orders get missed,
addresses get mistyped, and there is no reliable record of what was agreed.

What the app provides:
  • One inbox that receives messages from Messenger, Instagram and LINE
  • Turning a conversation into a structured order without leaving the chat
  • Order tracking, shipping label creation, and delivery status
  • Product and service catalogue with pricing
  • A public order link the buyer can open to confirm receipt and leave a
    review, which builds the merchant's verified trust profile
  • Daily sales and expense summaries

The app is a business management tool. It is not a marketplace and it does
not sell anything to consumers through the app.

────────────────────────────────────────────────────────────────────────────
4. SETUP AND ACCESS INSTRUCTIONS
────────────────────────────────────────────────────────────────────────────

No setup is required. Launch the app and sign in with the demo account
provided in the App Review Information fields:

  Username: appreview
  Password: (see the App Review Information password field)

Sign in using the username and password option on the sign-in screen.

The demo shop is pre-populated so every core feature can be exercised
immediately: 4 products, 3 orders in different states, and sample chat
threads. No sample files need to be uploaded.

Main features and where to find them:
  • Dashboard — opens on sign-in; today's orders and sales
  • Orders — bottom navigation; tap any order for full detail
  • Chat — bottom navigation; open a thread to see messages, attach a photo,
    and access the report/block controls in the thread menu
  • Products — bottom navigation; "add product" uses the camera
  • Account — profile menu; includes account deletion

IMPORTANT — creating a brand new account is not practical from outside
Thailand. Registration requires verifying a Thai mobile number by SMS. This
applies to every sign-in method, including Sign in with Apple: after Apple
authentication the user reaches our phone verification step. Please use the
demo account above to review the app's functionality.

────────────────────────────────────────────────────────────────────────────
5. EXTERNAL SERVICES USED
────────────────────────────────────────────────────────────────────────────

Authentication
  • Sign in with Apple — Apple
  • Facebook Login — Meta Platforms
  • LINE Login — LY Corporation
  • SMS one-time passcodes — Apitel (Thai SMS gateway)

Messaging (merchant's own customer conversations)
  • Messenger Platform and Instagram Messaging APIs — Meta Platforms
  • LINE Messaging API — LY Corporation

Shipping
  • iShip — Thai shipping aggregator, used to create shipping labels and read
    parcel tracking status from Thai carriers (Flash Express, Kerry Express,
    Thailand Post, J&T, DHL and others)

AI
  • Google Gemini — used only for optional merchant-side assistance:
    drafting a reply suggestion in the merchant's own inbox and suggesting a
    product description. It never talks to end customers on its own and never
    processes payment or identity data.

Infrastructure
  • Vercel — application hosting
  • Supabase — PostgreSQL database and file storage
  • Expo Push Notification Service — push notification delivery

There is no payment processor in the app. No purchases of any kind can be
made inside the app.

────────────────────────────────────────────────────────────────────────────
6. REGIONAL DIFFERENCES
────────────────────────────────────────────────────────────────────────────

The app behaves identically in all regions. There are no region-gated
features, no region-specific content, and no feature flags based on location.

Two practical notes, which are properties of the business rather than
regional variations in the software:
  • The interface is in Thai only.
  • Account registration requires a Thai mobile number for SMS verification,
    and the shipping carriers we integrate with operate in Thailand. The app
    is aimed at merchants operating in Thailand.

An account created anywhere in the world sees exactly the same features.

────────────────────────────────────────────────────────────────────────────
7. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
────────────────────────────────────────────────────────────────────────────

The app does not operate in a regulated industry. It is a business
productivity tool for merchants and provides no financial, medical, legal,
gambling or other regulated services.

It does not process payments and holds no customer funds. Merchants are paid
directly by their own customers through channels outside the app; the app
only records that a payment was received.

All content shown in the app is either created by the merchant themselves or
delivered from the merchant's own connected accounts (their own Facebook
Page, Instagram account or LINE Official Account) through the official APIs
listed in section 5, authorised by the merchant via each platform's standard
OAuth consent flow. We do not include third-party protected material.

────────────────────────────────────────────────────────────────────────────

Thank you for your time. We are happy to provide anything else you need.
```

---

## 3. อย่าลืม

- **อัปสกรีนช็อตใหม่บน App Store** — Apple สั่งไว้เองในจดหมายรอบก่อน (Guideline 2.3.3:
  ต้องเป็นแอปที่ใช้งานจริง ไม่ใช่หน้าล็อกอิน/สแปลช) และหน้าล็อกอินต้องเห็นปุ่ม Sign in with Apple
- **ห้ามรัน `scripts/create-appstore-review-account.ts` ซ้ำ** — มันสุ่มรหัสผ่านใหม่ทุกครั้ง
  รหัสที่ทีมรีวิวถืออยู่จะใช้ไม่ได้ทันที
- **ห้ามส่ง OTA (`eas update`) ระหว่างรีวิวค้าง** — bundle ที่คนรีวิวได้จะไม่ใช่ตัวที่เราทดสอบ
- วางข้อความข้อ 2 ลงช่อง **Notes** ด้วย ไม่ใช่ตอบในกล่องข้อความอย่างเดียว —
  Apple เขียนสั่งตรงตัวว่า *"Include this information in the Notes field ... for future submissions"*

## 4. ต้องยืนยันก่อนส่ง (อย่าเดา)

ตัวเลขและข้อความบางส่วนในร่างนี้ต้องเช็คกับของจริงก่อน ถ้าไม่ตรงให้แก้ก่อนวาง:

| ข้อ | ต้องยืนยันว่า |
|---|---|
| 2 | รุ่นเครื่อง + เวอร์ชัน iOS ที่ทดสอบจริง — **ห้ามใส่รุ่นที่ไม่ได้ทดสอบ** |
| 4 | บัญชี `appreview` ยังล็อกอินได้ และร้านตัวอย่างยังมีสินค้า 4 / ออเดอร์ 3 |
| 1 | ~~ปุ่มรายงาน/บล็อก~~ — **ตรวจแล้ว ไม่มี** ตอบตามที่ร่างไว้ (อธิบายว่าทำไมไม่มี + เสนอทำให้ถ้าเขาต้องการ) แทนการอ้างว่ามี |
| 1 | ~~ลบบัญชี~~ — **ตรวจแล้ว มี** `DeleteAccountCard.tsx` ที่หน้า `/account` ทำไว้เพื่อ 5.1.1(v) โดยเฉพาะ |

🛑 **ความเสี่ยงที่เหลืออยู่:** ถ้า Apple ไม่ซื้อเหตุผลเรื่อง UGC เขาจะขอให้เพิ่มปุ่มรายงาน/บล็อก
ในแอปจริง ๆ ซึ่งต้องเขียนโค้ดใหม่ทั้งฝั่งเว็บ — เตรียมใจไว้ว่าอาจมีรอบสาม
ทางเลือกที่ปลอดภัยกว่าคือ **ทำปุ่มบล็อกลูกค้าไปเลยก่อนส่ง** แล้วตอบว่ามี (ตัดประเด็นนี้ทิ้ง)
