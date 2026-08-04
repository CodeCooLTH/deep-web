# ลบบัญชีผู้ใช้ (Account Deletion) — Design Spec

> วันที่ 2026-08-04 · สถานะ: อนุมัติแล้ว (user approve 2026-08-04)
> เหตุผลที่ทำ: **App Store Guideline 5.1.1(v)** — แอปที่สมัครบัญชีได้ ต้องให้ผู้ใช้ "เริ่มลบบัญชี"
> ได้จากในแอป มิฉะนั้น `deep-seller-app` จะถูกตีกลับตอนส่ง production

---

## 1. ปัญหา

หน้า `/data-deletion` ปัจจุบันบอกให้ "ส่งอีเมลมาขอลบ" ซึ่ง Apple ไม่รับ — ต้องเป็นการกระทำที่ผู้ใช้
เริ่มได้เองจากในแอป และบัญชีต้องใช้งานไม่ได้จริงหลังจากนั้น

`deep-seller-app` เป็น WebView-first (โหลด `seller.deepthailand.app`) → **ปุ่มอยู่ในเว็บก็นับว่า
"อยู่ในแอป"** ไม่ต้องเขียน native ใหม่ ตรงกับหลัก WebView-first ของโปรเจกต์

---

## 2. ข้อจำกัดที่ต้องเคารพ

| ข้อจำกัด | ผลต่อการออกแบบ |
|---|---|
| `onDelete: Cascade` 85 จุดใน schema | **ห้าม physical DELETE แถว User** — จะลากออเดอร์/รีวิว/แชทของคู่ค้าหายไปด้วย |
| ออเดอร์เป็นหลักฐานของผู้ซื้อด้วย | ต้องเก็บแถว Order ไว้ ลบได้แค่ตัวตนของผู้ขาย |
| เอกสารการเงิน (สลิป/ledger) | เก็บตามรอบ retention ไม่ลบทันที |
| บัญชี Deep = ใบเดียวใช้ทั้งซื้อและขาย | ปุ่มต้องมีทั้งฝั่ง seller (Paces) และ buyer (Vuexy) และใช้ service เดียวกัน |
| `User.username` / `phone` / `email` เป็น `@unique` | ต้องปล่อยค่าคืนตอน purge ไม่งั้นเบอร์เดิมสมัครใหม่ไม่ได้ตลอดกาล |

---

## 3. ทางที่เลือก — มิเรอร์ soft-delete ของ `Shop`

`Shop` มีระบบนี้ครบอยู่แล้ว (`deletedAt` / `deletedReason` / `purgedAt` + cron
`purgeExpiredShops` + `lib/auth.ts` กรอง `deletedAt/purgedAt` อยู่ 9 จุด) จึงลอกโครงเดียวกัน
ไม่สร้างตาราง `AccountDeletionRequest` ใหม่

**ทางที่ไม่เลือก**

- *ตารางคำขอแยก* — เพิ่ม join ทุกจุดที่ต้องเช็ค "บัญชีนี้ยังใช้ได้ไหม" โดยไม่ได้อะไรเพิ่ม
- *ลบแถวจริง* — ผิดข้อจำกัดข้อ 1 และ `purgeExpiredShops` ก็เขียน comment ห้ามไว้แล้ว
- *deactivate อย่างเดียว* — Apple ระบุชัดว่าไม่พอ

---

## 4. โมเดลข้อมูล

เพิ่ม 3 คอลัมน์ใน `User` (ชื่อและความหมายตรงกับ `Shop` เป๊ะ):

```prisma
deletedAt     DateTime?   // มีค่า = ล็อกอินไม่ได้ทุกช่องทาง
deletedReason String?     // "USER_DELETED" (เผื่อ "ADMIN_BANNED" ในอนาคต)
purgedAt      DateTime?   // ล้าง PII แล้ว — ห้ามลบซ้ำ
@@index([deletedAt, purgedAt], map: "User_deletedAt_purgedAt_idx")
```

`prisma/migrations/20260804000000_user_soft_delete/migration.sql` — เขียนมือ (`ADD COLUMN` +
`CREATE INDEX` เท่านั้น ไม่มี destructive statement) เพราะ **Hard Rule 14 ห้ามรัน `migrate dev`**
(dev DB = prod DB ตัวเดียวกัน) ปล่อยให้ `prisma migrate deploy` ใน build ของ Vercel apply เอง

---

## 5. สองจังหวะของการลบ

### จังหวะที่ 1 — กดยืนยัน (ทันที)

ใน `$transaction` เดียว:

1. `User.deletedAt = now()`, `deletedReason = 'USER_DELETED'`
2. soft-delete ร้านที่ผู้ใช้เป็นเจ้าของทุกใบ (`deletedReason = 'OWNER_DELETED'` — ค่าเดิมของ `Shop`)
3. ลบ `PushToken` ทุกแถวของผู้ใช้ — ไม่ให้ noti เด้งเข้าเครื่องอีก
4. ลบ `ShopMember` ทุกแถว — หลุดจากร้านที่เคยถูกเชิญ (ร้านคนอื่นต้องไม่ค้างสมาชิกผี)

จากนั้น client ถอน push token ของเครื่อง แล้ว `signOut()`

> **ลำดับสำคัญ** — ถอน push token *ก่อน* เรียก API ลบเสมอ เหตุผลเดียวกับ `SignOutCard.tsx`:
> endpoint auth ด้วย cookie ถ้ายิงหลังบัญชีถูกปิดจะได้ 401 แล้ว token ค้างในฐานตลอดไป

### จังหวะที่ 2 — cron วันที่ 31

`purgeExpiredAccounts()` ล้าง PII ในแถวเดิม (ไม่ลบแถว):

| คอลัมน์ | ค่าใหม่ |
|---|---|
| `displayName` | `'ผู้ใช้ที่ลบบัญชี'` |
| `username` | `deleted_<8 ตัวแรกของ id>` — คืน username เดิมให้คนอื่นใช้ได้ |
| `phone` / `email` / `avatar` / `passwordHash` | `null` |
| `AuthAccount` ทุกแถว | ลบทิ้ง — ตัดการเชื่อม Facebook/LINE/IG ถาวร |
| `purgedAt` | `now()` |

คงไว้: `Order`, `Review`, `WalletTransaction`, `ChatMessage` — ผูกกับ `userId` ที่ไม่มีตัวตนแล้ว
ประวัติของคู่ค้าไม่พัง

**retention 30 วัน** (`ACCOUNT_DELETE_RETENTION_DAYS`) — เท่ากับ `BUSINESS_DELETE_RETENTION_DAYS`
ของ Shop เพื่อให้ทั้งสองหมดอายุพร้อมกัน ไม่เกิดสภาพ "ร้านถูกล้างแล้วแต่เจ้าของยังอยู่"

---

## 6. เงื่อนไขกันลบ

`checkAccountDeletable(userId)` คืน `{ blockers[], warnings[] }`

**บล็อก (ลบไม่ได้)**

- ออเดอร์สถานะ `PENDING` หรือ `SHIPPED` ในร้านที่ผู้ใช้เป็นเจ้าของ
  → ผู้ซื้ออาจจ่ายเงินแล้วแต่ยังไม่ได้ของ ปล่อยให้ร้านหายไปคือทิ้งคู่ค้า
  → ข้อความบอกจำนวน + ลิงก์ไป `/orders?status=PENDING`

**เตือน (ลบได้ แต่ต้องรู้ก่อน)**

- เครดิต SMS คงเหลือ > 0 → "฿250 จะหายและขอคืนไม่ได้"
- เป็นเจ้าของร้าน Business ที่มีสมาชิก → "พนักงาน N คนจะเข้าร้านนี้ไม่ได้อีก"

> Apple ยอมรับการบล็อกได้ถ้าอธิบายเหตุผลชัดและบอกว่าต้องทำอะไรก่อน — ข้อความจึงต้องระบุ
> จำนวนจริงและมีปุ่มพาไปจัดการ ไม่ใช่ error ลอย ๆ

`POST` ต้อง **เรียก `checkAccountDeletable` ซ้ำฝั่ง server เสมอ** ไม่เชื่อผลจาก `GET` ที่ client
ถืออยู่ (fail-closed — ออเดอร์ใหม่อาจเข้ามาระหว่างที่โมดัลเปิดค้าง)

---

## 7. ยืนยันตัวตน — พิมพ์ชื่อร้าน/ชื่อที่แสดงให้ตรง

ไม่ใช้รหัสผ่าน เพราะคนที่ล็อกอินด้วย Facebook/LINE/IG **ไม่มี `passwordHash`** จะลบบัญชีไม่ได้เลย
ไม่ใช้ OTP เพราะมีค่า SMS ต่อครั้งและเพิ่มขั้นตอนโดยไม่ได้ปลอดภัยขึ้นในบริบทนี้ (ผู้โจมตีที่ยึด
session ไปแล้วก็อ่าน SMS ไม่ได้ก็จริง แต่เขาเห็นชื่อร้านบนหน้าจอเหมือนกัน — เกณฑ์จริงคือ
"กันกดพลาด" ไม่ใช่ "กันคนแปลกหน้า")

- ฝั่ง seller เทียบกับ **ชื่อร้านที่ active**
- ฝั่ง buyer เทียบกับ **ชื่อที่แสดง (displayName)**
- เทียบแบบ trim แล้ว case-insensitive — ไม่ทรมานคนพิมพ์ภาษาอังกฤษ
- ตรวจซ้ำฝั่ง server ด้วย (client ซ่อนปุ่มเป็นแค่ UX)

---

## 8. กันล็อกอินหลังถูกลบ

`lib/auth.ts` มีทางเข้า 6 ทาง ต้องปิดให้ครบ:

| ทางเข้า | จุดที่เพิ่ม guard |
|---|---|
| `phone-otp` | หลัง `findFirst({where:{phone}})` — ต้อง reject ไม่ใช่สร้าง user ใหม่ (เบอร์ยังจองอยู่ใน 30 วัน) |
| `seller-credentials` | หลัง `findUnique({where:{username}})` |
| `buyer-credentials` | หลัง `findUnique({where:{username}})` |
| `admin-credentials` | หลัง `findUnique({where:{username}})` |
| `mobile-ticket` | หลัง `findUnique({where:{id}})` |
| OAuth (FB/LINE/IG) | ใน `upsertOAuthUser` — เจอ `dbUser.deletedAt` → `throw AccountDeletedError` |

ทุกจุดใช้ helper เดียวกัน `isDeletedUser(u)` จาก `lib/account-deletion.ts` เพื่อไม่ให้กติกา
แตกเป็นหลายชุด และ **ห้ามบอกเหตุผลต่างจาก "รหัสผ่านไม่ถูกต้อง"** — กัน account enumeration
(ผู้โจมตีต้องแยกไม่ออกว่าบัญชีถูกลบหรือไม่มีอยู่จริง)

เพิ่มใน `jwt` callback: query ที่มีอยู่แล้วตอน sign-in/update เพิ่ม `select: { deletedAt: true }`
→ ถ้ามีค่า คืน token เปล่า (session ที่ค้างอยู่ถูกตัดในรอบ refresh ถัดไป)

---

## 9. API

`src/app/api/account/delete/route.ts` — วางใต้ `/api/account/*` ซึ่งเป็น cookie-auth และ
proxy บังคับ CSRF Origin-check ให้อยู่แล้ว

| Method | หน้าที่ | คืนอะไร |
|---|---|---|
| `GET` | preflight | `{ canDelete, blockers[], warnings[], confirmLabel }` |
| `POST` | ลบจริง | `{ ok: true, purgeAt }` หรือ 409 พร้อม `blockers[]` |

- ไม่มี session → 401
- `confirmText` ไม่ตรง → 400 `CONFIRM_MISMATCH`
- มี blocker → 409 `HAS_BLOCKERS` (ไม่ใช่ 403 — ปัญหาอยู่ที่สถานะข้อมูล ไม่ใช่สิทธิ์)
- ลบไปแล้ว → 409 `ALREADY_DELETED`

`confirmLabel` ให้ server เป็นคนบอกว่าต้องพิมพ์อะไร — client ไม่เดาเอง

---

## 10. หน้าจอ

### ฝั่งผู้ขาย (Paces) — `/account`

> **แก้ไข 2026-08-04 (หลัง `git pull`):** เดิมวางไว้ที่ `/shop` ใต้ `SignOutCard` — ย้ายมา
> `/account` (feature 00026 ที่เพิ่ง merge เข้ามา) ด้วย 3 เหตุผล:
> 1. ลบบัญชีคือลบ **"ตัวคน"** ไม่ใช่ลบร้าน — หน้า `/account` มีกติกาชัดว่าเป็นของตัวคน
>    ("ห้ามแสดงชื่อร้าน โลโก้ร้าน ไม่งั้นจะกลายเป็นฝาแฝดของ /shop")
> 2. ที่ `/shop` การ์ดไปอยู่ปนกับชื่อร้าน/โลโก้ร้าน จนอ่านไม่ออกว่าจะลบร้านหรือลบบัญชี
> 3. แถบ "บันทึกการเปลี่ยนแปลง" ของ `ShopForm` เป็น `fixed` → ลอยทับการ์ดลบบัญชีที่ไม่เกี่ยว
>    กับฟอร์มเลย (user ทักเอง)
>
> **ผลตามมา:** ปุ่มยืนยันเปลี่ยนจากพิมพ์ *ชื่อร้าน* เป็นพิมพ์ *ชื่อที่แสดงของตัวเอง*
> (`subject: 'DISPLAY_NAME'`) — เพราะหน้านี้ห้ามแสดงชื่อร้าน การให้พิมพ์สิ่งที่ไม่ได้แสดงไว้
> ที่ไหนเลยคือการบังคับให้ผู้ใช้ออกไปหาเอง · ผลพลอยได้คือตรงกับฝั่งผู้ซื้อ ทั้งระบบเหลือเกณฑ์เดียว
>
> `ConfirmSubject = 'SHOP_NAME'` ยังอยู่ใน type/service แต่**ไม่มี call-site แล้ว** — เก็บไว้เผื่อ
> อนาคตมี surface ที่ผูกกับร้านจริง ๆ ถ้าไม่มีภายในรอบถัดไปให้ลบทิ้ง

`account/components/DeleteAccountCard.tsx` วางท้ายสุด ถัดจากการ์ด "วิธีเข้าสู่ระบบ"
(ไม่อยู่ใน `lg:hidden` — ต้องเห็นทุกความกว้างจอ ดูเหตุผลที่ตาราง §14.5 ข้อ 1)

- การ์ด `.card` + `card-header` `bg-danger/10 border-danger/30 border-dashed` (โซนอันตราย —
  ต่างจากการ์ดอื่นที่ใช้ `bg-light/15 border-default-300`)
- ปุ่ม `bg-danger/15 text-danger hover:bg-danger hover:text-white` + `py-3` (tap ≥44px)
  — โทนเดียวกับปุ่มออกจากระบบ ไม่ตะโกนกว่ากันจนสับสนว่าอันไหนอันตรายกว่า
- กด → โมดัล Preline (`hs-overlay`) แบบเดียวกับ `InviteLinkModal` — ไม่ใช้ Swal เพราะต้องมี
  ช่องพิมพ์ยืนยัน + รายการ blocker ซึ่ง Swal ทำได้ไม่สวย
- ทุก class มาจาก Paces primitive ตาม Hard Rule 7 — ไม่มี arbitrary value
- toast ใช้ `pacesToast` ตาม Hard Rule 9

### ฝั่งผู้ซื้อ (Vuexy) — `/settings/profile` และ `/m/settings/profile`

`DeleteAccountSection.tsx` (MUI) วางท้ายหน้า ถัดจาก `SignOutButton`

- `Card` + `CardContent` โทน `error` — `Button variant='outlined' color='error'`
- โมดัลใช้ `Dialog` ของ MUI + `CustomTextField` (`@core/components/mui/TextField`)
- toast ใช้ `react-toastify` ตามฝั่ง buyer (Hard Rule 9 อนุญาตเฉพาะโซนนี้)
- มือถือ `/m` ใช้ component เดียวกัน แต่ห่อด้วยแถวสไตล์ `MenuRow` ให้กลืนกับ hub เดิม

### หน้าเว็บสาธารณะ — `/data-deletion`

เปลี่ยนขั้นที่ 1 จาก "ส่งอีเมลมา" เป็น "เข้าไปกดที่หน้าตั้งค่าบัญชี" พร้อมลิงก์ตรง
คงช่องทางอีเมลไว้เป็นทางสำรองสำหรับคนที่ล็อกอินไม่ได้แล้ว (Apple ยอมรับ ตราบใดที่ทางหลัก
อยู่ในแอป)

---

## 11. Cron

`src/app/api/cron/account-purge/route.ts` — โครงเดียวกับ `business-package-lifecycle`
(export ทั้ง `GET` และ `POST`; `Bearer ${CRON_SECRET}`; ตรวจ env ว่างแล้ว 401 ทันที)

`vercel.json` เพิ่ม `{ "path": "/api/cron/account-purge", "schedule": "0 23 * * *" }`
— ช่องเวลาว่างถัดจาก `auto-reply-sweeper` (22:00) ไม่ให้ cron ชนกันบน Hobby ที่รันพร้อมกันไม่ได้

รันหลัง `business-package-lifecycle` (20:00) โดยตั้งใจ — ร้านถูก purge ก่อน เจ้าของถูก purge ตาม

---

## 12. แอปมือถือ

**ไม่แตะโค้ด native เลย** — ยึดหลัก WebView-first ของ `deep-seller-app`:

- ปุ่มอยู่ในเว็บ → โผล่ใน WebView ทันที ไม่ต้อง build ใหม่เพื่อฟีเจอร์นี้
- ถอน push token ใช้ `window.__DEEP_PUSH_TOKEN__` ที่ `SellerWebView.tsx` ฝากไว้อยู่แล้ว
  (ทางเดียวกับ `SignOutCard`)
- หลัง `signOut()` WebView เด้งไป `/auth/sign-in` เอง ตาม `callbackUrl` เดิม

> ยังต้อง build binary ใหม่อยู่ดี แต่เป็นเพราะ build บน TestFlight ตอนนี้เป็น commit ก่อนหน้างาน
> push ทั้งหมด (ปล่อยเป็น OTA) ไม่เกี่ยวกับฟีเจอร์นี้

---

## 13. เทส

`src/services/__tests__/account-deletion.test.ts` (Vitest, ไม่แตะ DB — mock prisma)

- `checkAccountDeletable` คืน blocker เมื่อมีออเดอร์ `PENDING` / `SHIPPED`
- ออเดอร์ `CONFIRMED` / `CANCELLED` ไม่บล็อก
- ยอดเครดิต > 0 เป็น warning ไม่ใช่ blocker
- `confirmText` ไม่ตรง → throw `CONFIRM_MISMATCH`
- `purgeExpiredAccounts` ข้ามแถวที่ `purgedAt` ไม่ว่าง (ไม่ล้างซ้ำ)
- username หลัง purge ขึ้นต้น `deleted_` และไม่ชนกัน

> 🛑 Hard Rule 13 — ห้ามมี `deleteMany()` ไร้ `where` ในไฟล์เทส ไฟล์นี้ mock prisma ล้วน
> ไม่แตะฐานจริงเลย

---

## 14. สิ่งที่ต้องทำนอกโค้ด

| งาน | ใคร |
|---|---|
| รัน `prisma migrate deploy` (หรือปล่อย Vercel build ทำเอง) | deploy |
| ใส่ตำแหน่งปุ่มลบบัญชีใน App Review Notes ของ App Store Connect | ผู้ส่งแอป |
| เตรียมบัญชีเดโมให้ Apple (ต้องมีสินค้า/ออเดอร์/แชทจริง) | ผู้ส่งแอป |

---

## 14.5 สิ่งที่พบเพิ่มตอน self-review (2026-08-04) — แก้แล้วทั้งหมด

รายการนี้ไม่ได้อยู่ในดีไซน์รอบแรก เจอตอนไล่ตรวจซ้ำหลัง implement เสร็จ

| # | สิ่งที่พลาด | ผลถ้าไม่แก้ | ทางแก้ |
|---|---|---|---|
| 1 | ปุ่มลบฝั่งผู้ขายอยู่ใน `lg:hidden` | `supportsTablet: true` → คนตรวจของ Apple เปิดบน iPad (กว้าง >1024px) แล้ว **หาปุ่มไม่เจอ** → ถูกตีกลับด้วยข้อเดียวกับที่ฟีเจอร์นี้เกิดมาแก้ | ย้ายออกนอก `lg:hidden` + การ์ดใช้ `-mx-4 lg:mx-0` |
| 2 | `/u/{username}` ไม่กรองบัญชีที่ถูกลบ | โปรไฟล์สาธารณะ (ชื่อ รูป สินค้า ยอดออเดอร์) ยังเปิดดูได้อีก 30 วันหลังผู้ใช้สั่งลบ | เพิ่ม `if (u.deletedAt) return null` ใน `findByUsername` — คอขวดเดียวที่ครอบทั้งหน้าเว็บ, `/api/public/profile/*` และ `/api/app/users/*` |
| 3 | schema เขียนว่า `Shop.deletedAt` NULL เสมอสำหรับ PERSONAL | โค้ดใหม่ละเมิดกติกาที่เขียนไว้ คนอ่านทีหลังเข้าใจผิด | แก้ comment ให้ตรงความจริง + อธิบายว่าทำไมต้อง soft-delete PERSONAL ด้วย (ไม่งั้นร้านยังโผล่ในผลค้นหา) |
| 4 | ลิงก์ "ไปที่คำสั่งซื้อ" ในโมดัลฝั่งผู้ซื้อ | `/orders` บนโดเมนหลัก = ออเดอร์ที่ **ซื้อ** ไม่ใช่ของร้าน → กดแล้วไปเจอหน้าที่ไม่มีอะไรค้าง แล้วงง | ฝั่ง buyer ไม่ render เป็นลิงก์ เปลี่ยนเป็นข้อความบอกว่าไปจัดการที่ระบบผู้ขาย |
| 5 | ผู้ซื้อลบบัญชีทั้งที่ยังมีของยังไม่ได้รับ | ไม่มีใครเตือนเลย ลบแล้วยืนยันรับของ/ทวงร้านไม่ได้อีก | เพิ่ม warning `PENDING_PURCHASES` (นับด้วย `buyerUserId`) — **เตือนไม่บล็อก** เพราะถ้าบล็อก ผู้ซื้อที่เจอร้านเงียบจะติดในระบบตลอดไป ขัดเจตนาของ 5.1.1(v) |
| 6 | `purgedUsername` ชนกันได้ (uuid 8 ตัวแรก) | P2002 → แถวนั้นล้ม **ทุกคืนตลอดไป** PII ไม่เคยถูกล้าง | จับ P2002 แล้ว retry ด้วย id เต็ม |
| 7 | cron `findMany` ไม่มีเพดาน | วันที่มีบัญชีครบกำหนดพร้อมกันมาก → เกิน `maxDuration` 60 วิ ถูกตัดกลางคัน | `take: 500` + `orderBy: { deletedAt: 'asc' }` (มาก่อนได้ก่อน ไม่มีแถวไหนอดตลอดกาล) |
| 8 | preflight ยิง query เรียงกัน | ผู้ใช้รอ round-trip เกินจำเป็นตอนเปิดโมดัล | `Promise.all` + ข้าม query ที่ไม่จำเป็น (ไม่มีร้าน = ไม่นับออเดอร์ฝั่งขาย, ไม่มี Business = ไม่นับพนักงาน) |

**Performance ที่ยืนยันแล้ว**

- `order.count` ฝั่งร้านใช้ index `Order_shopId_status_createdAt` ที่มีอยู่แล้ว (prefix `(shopId, status)` ตรงกับ where) — ไม่ต้องเพิ่ม index
- `order.count` ฝั่งผู้ซื้อใช้ FK index ของ `buyerUserId`; ผู้ซื้อหนึ่งคนมีออเดอร์หลักสิบ ไม่ใช่หลักแสน
- cron ใช้ `User_deletedAt_purgedAt_idx` ที่เพิ่มใน migration นี้ — ไม่ full-table scan
- preflight ของผู้ซื้อทั่วไป (ไม่มีร้าน) = 3 query (user, shops, order.count ฝั่งซื้อ)

---

## 15. นอกขอบเขต

- กู้บัญชีคืนภายใน 30 วัน (`restoreAccount`) — โครงข้อมูลรองรับแล้ว (`purgedAt` ยังว่าง)
  แต่ยังไม่มี UI/endpoint เพราะต้องออกแบบวิธียืนยันตัวตนของคนที่ล็อกอินไม่ได้แล้ว
- หน้า admin ดูรายการบัญชีที่รอ purge
- ส่งอีเมล/SMS ยืนยันหลังกดลบ
- Sign in with Apple (Guideline 4.8) — คนละเรื่อง ประเมินแยก
