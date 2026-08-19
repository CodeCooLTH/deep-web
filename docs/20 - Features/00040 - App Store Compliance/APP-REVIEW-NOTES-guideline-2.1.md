# App Review Notes — ตอบ Guideline 2.1 Information Needed (2026-08-16)

> Submission ID `75e3886e-5361-4d07-bd31-aca00e38d051` · App Version 1.0 (2)
> Apple ขอ **ข้อมูล 7 ข้อ** ไม่ได้บอกว่าโค้ดผิด — ไม่ต้องแก้โค้ด ไม่ต้อง build ใหม่
>
> 🛑 สิ่งที่ต้องทำมี 2 อย่าง: (1) อัดคลิปหน้าจอจากเครื่องจริง (2) วางข้อความข้างล่างใน
> **App Review Information → Notes** แล้วตอบกลับในหน้า App Review

---

## 1. คลิปหน้าจอ — สิ่งเดียวที่ทำแทนไม่ได้

### 1.1 บัญชีที่ใช้อัด

| | |
|---|---|
| Username | `appreview` |
| Password | **อยู่ใน App Store Connect → App Review Information → ช่อง Password** |

🛑 **ห้ามรัน `scripts/create-appstore-review-account.ts` เพื่อ "ดูรหัส"** — สคริปต์ **สุ่มรหัสใหม่ทุกครั้ง**
(`makePassword()` บรรทัด 113) รันปุ๊บรหัสที่กรอกไว้ใน App Store Connect ใช้ไม่ได้ทันที

หารหัสไม่เจอจริง ๆ → รันสคริปต์ได้ **แต่ต้องเอารหัสใหม่ที่มันพิมพ์ออกมาไปแก้ใน App Store Connect
ทันทีในคราวเดียว** ห้ามทิ้งไว้ข้ามวัน · สคริปต์เป็น idempotent ข้อมูลร้าน/สินค้า/ออเดอร์ไม่ซ้ำ

ร้านตัวอย่างชื่อ **"ร้านตัวอย่าง Deep"** มีสินค้า ออเดอร์ และแชทตัวอย่างพร้อมอยู่แล้ว

### 1.2 เตรียมเครื่องก่อนอัด (สำคัญ — ทำผิดต้องอัดใหม่)

1. **ติดตั้งจาก TestFlight** ไม่ใช่ build จากเครื่อง (Apple ต้องเห็นตัวเดียวกับที่ส่งรีวิว)
2. **ลบแอปแล้วติดตั้งใหม่** — เพื่อให้ป๊อปอัปขอสิทธิ์กล้อง/รูปโผล่จริง
   ⚠️ ถ้าเคยกด "อนุญาต" ไปแล้วมันจะไม่ถามอีก แล้วคลิปจะขาดสิ่งที่ Apple ขอมาตรง ๆ
3. **ออกจากระบบ** ให้เริ่มที่หน้าล็อกอิน
4. เปิด **โหมดห้ามรบกวน** กันแจ้งเตือนเด้งกลางคลิป
5. แบตเตอรี่ > 30% · Wi-Fi แรง (คนรีวิวเห็นแอปค้างจะตีเป็นบั๊ก)

### 1.3 เริ่มอัด

**ตั้งค่า → ศูนย์ควบคุม → เพิ่ม "บันทึกหน้าจอ"** (ถ้ายังไม่มี)
ปัดลงจากมุมขวาบน → แตะปุ่มวงกลม → **รอ 3 วิ แล้วกลับไปหน้าโฮมก่อน**

🛑 **ต้องเห็นตัวเองแตะไอคอนแอปบนหน้าโฮม** — Apple เขียนว่า *"must begin with launching the app"*
เริ่มอัดตอนแอปเปิดอยู่แล้ว = ผิดเงื่อนไข

### 1.4 ลำดับที่ต้องเดิน (~3–4 นาที)

| # | ทำอะไร | ทำไมต้องมี |
|---|---|---|
| 1 | แตะไอคอน **Deep Seller** บนหน้าโฮม รอ splash | Apple บังคับให้เริ่มจากการเปิดแอป |
| 2 | หน้าล็อกอิน — **ค้างไว้ 3 วินาที** ให้เห็นปุ่ม **"เข้าสู่ระบบด้วย Apple" อยู่บนสุด** | Guideline 4.8 (รอบที่แล้วโดนข้อนี้) |
| 3 | ล็อกอินด้วย `appreview` + รหัส | Apple ขอ "instructions for accessing" |
| 4 | **หน้าหลัก** — เลื่อนดูยอดขาย/งานวันนี้ ช้า ๆ | โชว์ core feature |
| 5 | แตะ **คำสั่งซื้อ** (แถบล่าง) → เปิดออเดอร์สัก 1 ใบ → เลื่อนดูรายละเอียด | core feature |
| 6 | แตะ **แชท** (แถบล่าง) → เปิดเธรด → แตะปุ่มแนบรูป → **เลือกกล้อง** | ✅ **ป๊อปอัปขอสิทธิ์กล้องต้องโผล่ตรงนี้** |
| 7 | กด **อนุญาต** → ถ่ายรูป → กลับมา | โชว์ว่า permission ใช้จริง ไม่ได้ขอลอย ๆ |
| 8 | แตะปุ่มแนบรูปอีกครั้ง → **เลือกคลังรูป** | ✅ **ป๊อปอัปขอสิทธิ์รูปภาพต้องโผล่** |
| 9 | แตะ **ร้านค้า** (แถบล่าง) → เข้าหน้าสินค้า → กด **เพิ่มสินค้า** → เลื่อนดูฟอร์ม | core feature |
| 10 | ไปหน้า **บัญชี** → เลื่อนลงหา **"ลบบัญชี"** → แตะให้จอยืนยันขึ้น → **กดยกเลิก** | Guideline 5.1.1(v) — โชว์ว่ามีทางลบบัญชีในแอป **อย่ากดลบจริง** |
| 11 | เลื่อนดูทั้งหน้าบัญชีช้า ๆ ให้เห็นว่า **ไม่มีปุ่มเติมเงิน ไม่มีหน้าแพ็กเกจ** | Guideline 3.1.1 (รอบที่แล้วโดนข้อนี้ด้วย) |

**หยุดอัด** → ปัดลงจากมุมขวาบน → แตะปุ่มบันทึกหน้าจอสีแดง

### 1.5 ข้อห้ามระหว่างอัด

- **อย่าเร็ว** — แตะแล้วรอให้โหลดจบก่อนแตะต่อ คนรีวิวต้องอ่านทัน
- **อย่าข้ามจอ** ด้วยการ deep-link — ต้องเดินด้วยการแตะจริง
- **อย่าตัดต่อ** — ต้องเป็นคลิปเดียวต่อเนื่อง
- **ไม่ต้องพากย์** — Apple ไม่ได้ขอเสียง

### 1.6 หลังอัด

คลิปอยู่ในแอปรูปภาพ → **อัปโหลดเป็นไฟล์แนบในหน้า App Review ของ App Store Connect**
(ปุ่มคลิปหนีบ 📎 ในกล่องตอบข้อความ)

ไฟล์ใหญ่เกินอัปไม่ขึ้น → ตัดความละเอียดลงด้วยแอป Photos (แชร์ → ปรับขนาด) **อย่าตัดเนื้อหาออก**

## 2. ข้อความตอบ — ก็อปทั้งบล็อกไปวาง

🛑 **ห้ามเขียนถึงฟีเจอร์ที่แอปไม่มี แม้แต่คำเดียว** — ร่างแรกของไฟล์นี้เขียนใน §4 ว่า
*"access the report/block controls in the thread menu"* ซึ่ง **ไม่มีอยู่จริงทั้งแอป**
(ตรวจแล้ว: ไม่มีสตริง "รายงาน"/"บล็อก" ที่เป็นข้อความบนจอเลยสักจุด) และมัน **ขัดกับ §1
ในไฟล์เดียวกัน** ที่อธิบายไว้ถูกต้องแล้วว่าเราตั้งใจไม่ทำซ้ำเพราะบทสนทนาอยู่บนแพลตฟอร์มของ
Meta/LINE

คนรีวิวอ่าน §4 → เข้าไปหาในเมนูเธรด → ไม่เจอ → **ตีกลับด้วย 2.1 ซ้ำ และคราวนี้มีเหตุผลว่า
เราให้ข้อมูลที่ไม่ตรง** ซึ่งแย่กว่าไม่มีฟีเจอร์นั้นมาก

เกณฑ์: ทุกประโยคใน Notes ที่อ้างว่า "มีปุ่ม/หน้าจอ/ทำอะไรได้" ต้องชี้ได้ว่าอยู่ไฟล์ไหน
บรรทัดไหน ก่อนส่ง (คลาสเดียวกับ `docs/conventions/value-fate-decided-at-write-site.md`)

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

- iPhone 13 Pro Max — iOS 26.5.2 (physical device, installed via TestFlight)
- iPad Air (4th generation) — iPadOS 18.6.2 (physical device, installed via TestFlight)

Minimum supported version: iOS 16.4. The app declares iPad support and was
tested on both form factors.

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
  • Chat — bottom navigation; open a thread to see messages and attach a photo
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
| 2 | ~~ค่าที่ยังว่าง~~ — **เติมครบแล้ว 2026-08-17:** iPhone 13 Pro Max / iOS 26.5.2 · iPad Air (4th gen) / iPadOS 18.6.2 |
| 2 | 🛑 **`app.config.ts:46` ตั้ง `supportsTablet: true`** ⇒ แอปประกาศเองว่ารองรับ iPad และ Apple เขียนในจดหมายว่า *"Test the app on each supported device platform"* — ตอบว่าทดสอบแต่ iPhone = บอกเขาว่าไม่เคยทดสอบ platform ที่เราประกาศรองรับ (user รับไปยืม iPad 2026-08-17) |
| 4 | บัญชี `appreview` ยังล็อกอินได้ และร้านตัวอย่างยังมีสินค้า 4 / ออเดอร์ 3 |
| 1 | ~~ปุ่มรายงาน/บล็อก~~ — **ตรวจแล้ว ไม่มี** ตอบตามที่ร่างไว้ (อธิบายว่าทำไมไม่มี + เสนอทำให้ถ้าเขาต้องการ) แทนการอ้างว่ามี |
| 1 | ~~ลบบัญชี~~ — **ตรวจแล้ว มี** `DeleteAccountCard.tsx` ที่หน้า `/account` ทำไว้เพื่อ 5.1.1(v) โดยเฉพาะ |

### มติเรื่องปุ่มรายงาน/บล็อก — **ส่งคำอธิบายไปก่อน ไม่ทำปุ่ม** (user เคาะ 2026-08-17)

| | ทำอะไร | ต้นทุน | ความเสี่ยง |
|---|---|---|---|
| **A (เลือก)** | ส่งคำอธิบายว่าทำไมไม่มี | 0 — ส่งได้ทันที | Apple ไม่ซื้อ = รออีกรอบ 1–3 วัน |
| B | ทำปุ่มบล็อก+รายงานก่อนส่ง | หลายวัน (คอลัมน์ฐาน · API · UI แชท · กรองกล่องข้อความ · ฝั่งแอดมินรับเรื่อง) | เสียเวลาแน่นอน แม้ Apple อาจไม่ถาม |

เหตุผลที่เลือก A:
1. คำอธิบายมีน้ำหนักจริง ไม่ใช่แก้ตัว — แชทตัวต่อตัวของธุรกิจไม่ใช่โซเชียล
   เทียบได้กับแอปอีเมล ซึ่ง Apple ไม่บังคับให้มีปุ่มบล็อก
2. ทำ B ตอนนี้ = เขียนโค้ดหลายวันเพื่อตอบคำถามที่เขา **ยังไม่ได้ถาม**
3. ถ้าเขาถามจริง เขาจะระบุชัดว่าต้องการอะไร → ทำถูกตัวรอบเดียว ดีกว่าเดาแล้วทำผิดที่

🛑 **ถ้าโดนรอบ 3 ด้วยเรื่องนี้ ให้ทำ B ทันที อย่าอธิบายซ้ำ** — ทีมรีวิวที่ปฏิเสธคำอธิบายหนึ่งครั้งแล้ว
จะไม่รับคำอธิบายเดิมที่เรียบเรียงใหม่
