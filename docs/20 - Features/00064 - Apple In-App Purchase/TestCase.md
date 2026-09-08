---
title: "TestCase — In-App Purchase (iOS)"
owner: shinobu22
status: draft
created: 2026-09-01
tags: [testcase, feature, iap]
related: ["[[SRS]]", "[[BRD]]"]
---

# TestCase: In-App Purchase (iOS) — feature 00064

> สถานะ: ✅ = อัตโนมัติแล้ว · ⏳ = รอ implement · 🖐️ = ต้องกดเองบนเครื่องจริง

---

## 1. ด่านกันเก็บเงินซ้ำ — อัตโนมัติแล้ว

ไฟล์ `src/lib/__tests__/subscription-source.test.ts` (7 เคส · `[blocker]`)

| # | เคส | สถานะ |
|---|---|---|
| TC-IAP-01 | `isWalletBilled('WALLET')` = true · `('APPLE_IAP')` = false | ✅ |
| TC-IAP-02 | `isWalletBilled` กับ `null`/`undefined`/`''`/`'wallet'`/`'WALLET '`/ค่าที่ไม่รู้จัก = **false ทุกตัว** | ✅ |
| TC-IAP-03 | `isAppleBilled` ไม่ใช่ negation — ค่าที่ไม่รู้จักตอบ false ทั้งคู่ | ✅ |
| TC-IAP-04 | ทุกฟังก์ชันที่เรียก `deductCredit` มีด่านแหล่งที่มา (สแกนทั้งไฟล์ ไม่ hardcode รายชื่อ) | ✅ |
| TC-IAP-05 | ด่านอยู่ **ก่อน** `deductCredit` ไม่ใช่หลัง | ✅ |
| TC-IAP-06 | `upgrade`/`downgrade`/`cancel`/`reactivate` มีด่านครบ | ✅ |
| TC-IAP-07 | cron กรอง `source` ตั้งแต่ใน query | ✅ |
| TC-IAP-08 | schema: `source` default `WALLET` + `appleOriginalTransactionId` UNIQUE | ✅ |

### 1.1 พิสูจน์ด้วย mutation (9 แบบ — แดงครบ)

| mutation | ผล |
|---|---|
| ถอดด่านออกจาก `renewOrLockBusinessPackage` | 🔴 |
| ถอดด่านออกจาก `upgrade` | 🔴 |
| ถอดด่านออกจาก `cancel` | 🔴 |
| ย้ายด่านไปหลัง `deductCredit` ใน `reactivate` | 🔴 |
| ถอดตัวกรอง `source` ออกจาก cron | 🔴 |
| `isWalletBilled` ปล่อยค่าที่ไม่รู้จักผ่าน | 🔴 |
| `isAppleBilled` = `!isWalletBilled` | 🔴 |
| schema default → `APPLE_IAP` | 🔴 |
| ถอด `@unique` ของ `appleOriginalTransactionId` | 🔴 |

---

## 2. ซ่อน Deep Stock ในแอป — อัตโนมัติแล้ว

ไฟล์ `src/lib/__tests__/paid-feature-hidden-in-ios-app.test.ts` (4 เคส · `[blocker]`)

| # | เคส | สถานะ |
|---|---|---|
| TC-IAP-10 | กฎเปลือกแอป 3 ข้อแยกกันจริง (ไม่ใช่ alias) และคืน true เฉพาะ `ios` | ✅ |
| TC-IAP-11 | เมนู Deep Stock หายในแอป **แม้ `entitlementStatus === 'ACTIVE'`** | ✅ |
| TC-IAP-12 | `/inventory` และ `/inventory/movements/[productId]` กันที่หน้าเอง | ✅ |
| TC-IAP-13 | ทุกจุดใน `src/` ที่เรียก `resolveVisibleSellerMenu` ส่งข้อจำกัดเปลือกแอปครบ | ✅ |

### 2.1 mutation (5 แบบ — แดงครบ)

ถอดการลบเมนู · ถอดด่านหน้า `/inventory` · ถอดด่านหน้า movements ·
shortcut ไม่ส่ง `hidePaidFeatures` · `isPaidFeatureRestricted` ปิดบน ios

---

## 2.2 ตรวจลายเซ็นและธุรกรรมของ Apple — อัตโนมัติแล้ว

`src/lib/apple/__tests__/jws.test.ts` (14) + `transaction.test.ts` (13)

> เทสชุดนี้สร้าง **ห่วงโซ่ใบรับรองจริงด้วย openssl** (root → intermediate → leaf) เก็บเป็น
> fixture แล้วประกอบ JWS เซ็นด้วยกุญแจจริง — ไม่ใช่ mock ที่ยืนยันแค่ว่า
> "โค้ดทำตามที่คนเขียนเทสคิด"

| # | เคส | สถานะ |
|---|---|---|
| TC-IAP-20 | ห่วงโซ่ + ลายเซ็นถูกต้อง → ผ่าน ได้ payload ครบ | ✅ |
| TC-IAP-21 | แก้ payload หลังเซ็น → `BAD_SIGNATURE` | ✅ |
| TC-IAP-21b | เซ็นด้วยกุญแจที่ไม่ใช่ของใบปลาย → ปฏิเสธ | ✅ |
| TC-IAP-22 | ห่วงโซ่ขาด (ตัดใบกลาง) → `CHAIN_BROKEN` | ✅ |
| TC-IAP-22b | **ใบรากปลอมที่ตั้งชื่อ `CN=Apple Root CA - G3` เลียนแบบทุกฟิลด์** → `ROOT_NOT_APPLE` | ✅ |
| TC-IAP-22c | `alg: "none"` → ปฏิเสธ (ช่องโหว่คลาสสิกของ JWT) | ✅ |
| TC-IAP-22d | ไม่มี `x5c` → ปฏิเสธ ไม่ใช่เชื่อ payload | ✅ |
| TC-IAP-22e | ใบหมดอายุ → ปฏิเสธแม้ลายเซ็นถูก (ฉีดเวลา ไม่ผูกนาฬิกาจริง) | ✅ |
| TC-IAP-22f | รูปร่างพัง → คืน `MALFORMED` ไม่ throw (throw = 500 แล้ว Apple ยิงซ้ำไม่จบ) | ✅ |
| TC-IAP-22g | ใบรากที่ฝังไว้ต้องตรงลายนิ้วมือที่ปักหมุด + self-signed | ✅ |
| TC-IAP-23 | `bundleId` ของแอปอื่น → `BUNDLE_MISMATCH` | ✅ |
| TC-IAP-23b | Family Sharing → ปฏิเสธ (1 การสมัครห้ามเปิดสิทธิ์ 6 บัญชี) | ✅ |
| TC-IAP-24 | **Sandbox ต้องผ่าน** — คนตรวจของ Apple ซื้อผ่าน Sandbox เสมอ | ✅ |
| TC-IAP-24b | `environment` ค่าอื่น → `BAD_ENVIRONMENT` | ✅ |
| TC-IAP-24c | `productId` ไม่รู้จัก → ปฏิเสธ ไม่เดาเป็น tier ต่ำสุด | ✅ |
| TC-IAP-24d | ไม่มี `expiresDate` → ปฏิเสธ · อ่านเป็น **epoch ms** ไม่ใช่วินาที | ✅ |
| TC-IAP-24e | รหัสสินค้าครบทุก tier · ไม่ซ้ำ · แมปกลับได้ | ✅ |

### 2.2.1 mutation (14 แบบ — แดงครบ)

**ลายเซ็น (7):** ไม่ตรวจ `alg` · ไม่ตรวจใบราก · ไม่ตรวจห่วงโซ่ · ไม่ตรวจลายเซ็น ·
ไม่ตรวจอายุ · เทียบใบรากด้วย **ชื่อ** แทนไบต์ · สลับ PEM ใบราก

**ธุรกรรม (7):** ไม่ตรวจ `bundleId` · ปล่อย Family Sharing · เดา tier เมื่อไม่รู้จักสินค้า ·
อ่านเวลาเป็นวินาที · ไม่ตรวจ `expiresDate` · ปฏิเสธ Sandbox · สอง tier ชี้สินค้าเดียวกัน

### 2.2.2 ด่านกันทางลัด

- โค้ดจริงห้ามเรียก `verifyAppleJwsWithRoot` (ตัวที่ฉีดใบรากได้) — สแกนทั้ง `src/`
- ทุกจุดที่เรียก `decodeAppleJwsWithoutVerifying` ต้องมี **carve-out กำกับบรรทัดนั้น**
  (allow-list ทั้งไฟล์หลวมเกินไป — การเรียกครั้งที่สองในไฟล์เดิมจะลอดเข้ามาได้)

## 3. รอ implement (⏳)

| # | เคส | ต้องได้ |
|---|---|---|
| TC-IAP-25 | `originalTransactionId` เดิม + `ownerId` ใหม่ | ปฏิเสธด้วย `TRANSACTION_OWNED_BY_ANOTHER_ACCOUNT` + ของเจ้าของเดิมไม่เสียหาย — ✅ `tests/integration/apple-iap-lifecycle.test.ts` |
| TC-IAP-26 | webhook `notificationUUID` ซ้ำ | ตอบ 200 · **ไม่ทำงานซ้ำ** — ✅ `tests/integration/apple-iap-webhook-route.test.ts` (นับจำนวนครั้งที่ลงมือจริง · พิสูจน์ด้วย mutation: ถอด `return` ของใบซ้ำ → แดง) |
| TC-IAP-27 | `DID_RENEW` | `nextRenewalAt` = `expiresDate` ของ Apple **ไม่ใช่ +30 วัน** — ✅ `tests/integration/apple-iap-lifecycle.test.ts` (พิสูจน์ด้วย mutation: เปลี่ยนเป็น +30 วัน → แดง) |
| TC-IAP-28 | `REFUND` | ถอนสิทธิ์ + ล็อกร้าน **แม้ยังไม่หมดอายุ/ยังอยู่ในช่วงผ่อนผัน** — ✅ `tests/integration/apple-iap-lifecycle.test.ts` |
| TC-IAP-29 | `DID_FAIL_TO_RENEW` + `GRACE_PERIOD` | ยังใช้ได้จนหมด grace — ✅ **ทำแล้ว** `src/lib/apple/__tests__/entitlement.test.ts` (10) + `tests/integration/apple-iap-grace-period.test.ts` (3) + ด่านกันทางลัดที่ webhook (4) |
| TC-IAP-30 | webhook หายไป 1 รอบ | ตัวเดินตรวจซ้ำแก้สถานะให้ตรงในรอบถัดไป — ⏳ ตัวเดินตรวจซ้ำยังไม่มี (รอ .p8) แต่ **คิวพร้อมแล้ว**: ใบที่ล้มเหลวค้าง `processedAt = NULL` มีเทสครบทุกเหตุผล (`tests/integration/apple-iap-webhook-route.test.ts`) |
| TC-IAP-31 | server ตอบ error หลังจ่ายเงินสำเร็จ | ธุรกรรมไม่ถูก finish · เปิดแอปใหม่แล้วยืนยันซ้ำได้เอง — ✅ ส่วน idempotent ของ service มีเทสแล้ว (`tests/integration/apple-iap-lifecycle.test.ts`) · ส่วนพฤติกรรมบนเครื่องยังเป็น 🖐️ |

---

## 4. ต้องกดเองบนเครื่องจริง (🖐️)

| # | เคส | ต้องได้ |
|---|---|---|
| TC-IAP-40 | เปิดหน้าแพ็กเกจในแอป (ยังไม่มีสิทธิ์) | เห็น 3 tier · **ราคาจาก StoreKit** ไม่ใช่เลขที่เรา hardcode |
| TC-IAP-41 | ซื้อสำเร็จ | สิทธิ์เปิดทันที · จอเปลี่ยนเป็น "ใช้งานอยู่" |
| TC-IAP-42 | ยกเลิกกลางทาง | ไม่มีอะไรเปลี่ยน · ไม่มี error ค้างบนจอ |
| TC-IAP-43 | ลบแอปแล้วลงใหม่ → กดกู้คืนการซื้อ | สิทธิ์กลับมาโดยไม่จ่ายซ้ำ |
| TC-IAP-44 | ยกเลิกใน Settings ของ iPhone | ใช้ได้จนสิ้นรอบ · พ้นรอบแล้วล็อกร้าน |
| TC-IAP-45 | ผู้ใช้ที่มีสิทธิ์จากกระเป๋าเงินอยู่ เปิดแอป | **ไม่เห็นปุ่มซื้อ** · ของเดิมทำงานปกติ |
| TC-IAP-46 | เปิดเว็บบน Safari (iPhone) | ซื้อด้วยกระเป๋าเงินได้ตามปกติ ไม่มีอะไรของ IAP โผล่ |
| TC-IAP-47 | เดินทั้งแอป iOS | **ไม่เจอ Deep Stock ที่ไหนเลย** — เมนู · ทางลัด · หน้าสินค้า |
| TC-IAP-48 | ค้นหาทางลัดในแอป | ไม่มี "แพ็กเกจ" / "จัดการสต็อก" ให้เลือกปักหมุด |
| TC-IAP-49 | **Sign in with Apple บน iPad** (iPad Air M3 / iPadOS 26.6) | ล็อกอินจบ ไม่ค้างหน้าเดิม ← **ข้อที่ Apple ตีกลับ ยังไม่เคยยืนยันบน iPad** |

---

## 5. Regression ที่ต้องไม่พัง

| # | เคส | สถานะ |
|---|---|---|
| TC-IAP-50 | ชุดเทสเดิมทั้งหมด | ✅ **4,976 ผ่าน (416 ไฟล์)** |
| TC-IAP-51 | ผู้ใช้เดิม (WALLET) ครบกำหนด → หักกระเป๋า + ต่ออายุเหมือนเดิม | ⏳ ต้องทดสอบกับข้อมูลจริงหลัง deploy |
| TC-IAP-52 | เว็บทุกหน้าไม่มีพฤติกรรมเปลี่ยน | 🖐️ |

---

## 6. 🛑 หนี้ที่รู้ตัว

- **TC-IAP-51 ยังไม่มีทางทดสอบอัตโนมัติ** — `renewOrLockBusinessPackage` แตะ prisma
  ตรง ๆ ทางแก้คือสกัดส่วนที่ตัดสินใจออกเป็นฟังก์ชันบริสุทธิ์ (ยังไม่ทำ)
- เทสทั้งหมดในเอกสารนี้ที่เป็น ✅ **สแกนซอร์ส** ไม่ได้ยืนยันพฤติกรรมขณะรัน
  (รีโปไม่มี jsdom · vitest environment = node) — จับ "ด่านหายไป" ได้ แต่จับ
  "ด่านมีอยู่แต่ตรรกะข้างในผิด" ไม่ได้ทุกกรณี
