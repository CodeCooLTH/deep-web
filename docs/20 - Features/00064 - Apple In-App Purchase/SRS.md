---
title: "SRS — In-App Purchase (iOS)"
owner: shinobu22
status: draft
created: 2026-09-01
tags: [srs, feature, iap]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]", "[[API]]"]
---

# SRS: In-App Purchase (iOS) — feature 00064

---

## 1. ขอบเขตเชิงเทคนิค

| | |
|---|---|
| ขายผ่าน IAP | **Business Package เท่านั้น** (Growth / Pro / Business) |
| ไม่ขาย | Deep Stock — และต้องซ่อนฟีเจอร์ในแอปด้วย (FR-IAP-30) |
| แพลตฟอร์ม | iOS · StoreKit 2 |
| ตรวจ receipt | **ตรวจลายเซ็น JWS เองบน server** ไม่ใช้ตัวกลาง |
| ต่ออายุ | Apple เป็นเจ้าของ — เรารับแจ้งผ่าน App Store Server Notifications v2 |

---

## 2. Functional Requirements

### 2.1 แหล่งที่มาของสิทธิ์

**FR-IAP-01** `BusinessPackageSubscription.source` เก็บว่าใครเก็บเงินใบนี้ — `WALLET` หรือ `APPLE_IAP`
แถวที่มีอยู่ก่อนฟีเจอร์นี้ทั้งหมดเป็น `WALLET` (บังคับด้วย DB default)

**FR-IAP-02** 🛑 **cron ต่ออายุประมวลผลเฉพาะ `source='WALLET'`**
บังคับ **2 ชั้น**:
1. ตัวกรองใน query ของ `/api/cron/business-package-lifecycle` (ไม่ลากแถวที่ไม่เกี่ยวมาตั้งแต่แรก)
2. ด่านใน `renewOrLockBusinessPackage()` เอง — ชั้นนี้คือชั้นจริง เพราะฟังก์ชัน export
   ออกไปและมีผู้เรียกรายอื่นได้ **ด่านที่อยู่แต่ในผู้เรียก คือด่านที่หายทันทีที่มีผู้เรียกรายที่สอง**

**FR-IAP-03** ฟังก์ชันที่แก้ subscription ที่มีอยู่แล้วทุกตัวต้องผ่านด่านแหล่งที่มา:
`upgradeBusinessPackage` · `downgradeBusinessPackage` · `cancelBusinessPackage` ·
`reactivateBusinessPackage` · `renewOrLockBusinessPackage`
ใบของ Apple → โยน `MANAGED_BY_APPLE` (cron คืน `'SKIPPED'` แทน เพราะ error ใบเดียวต้องไม่ล้มทั้งรอบ)

**FR-IAP-04** `subscribeBusinessPackage` เขียน `source: 'WALLET'` ตรง ๆ ไม่พึ่ง DB default
— ความปลอดภัยของเส้นทางนี้มาจาก 2 อย่างประกอบกัน: `SUBSCRIPTION_ALREADY_EXISTS`
(มีใบของ Apple อยู่ก็เข้ามาไม่ถึง) + บรรทัดนี้ (ใบที่เกิดจากเส้นทางนี้เป็น WALLET เสมอ)

### 2.2 เกณฑ์ตัดสิน (ฟังก์ชันบริสุทธิ์ · `src/lib/subscription-source.ts`)

**FR-IAP-05** `isWalletBilled(source)` — **fail-closed**
คืน `true` เฉพาะ `'WALLET'` เป๊ะ · `null` / `undefined` / `''` / ค่าที่ไม่รู้จัก → `false`

> เดาผิดเป็น `false` → ใบไม่ถูกต่ออายุ เห็นจากรายงาน แก้ตามได้
> เดาผิดเป็น `true` → **หักเงินลูกค้าซ้ำ + ล็อกร้านเขาทั้งหมด** กู้คืนความเชื่อมั่นไม่ได้

**FR-IAP-06** `isAppleBilled(source)` **ต้องไม่ใช่** `!isWalletBilled(source)`
"ไม่รู้ว่าใครดูแล" ≠ "Apple ดูแล" — ถ้าเขียนเป็น negation ค่าขยะจะกลายเป็นของ Apple
แล้วหลุดเข้าเส้นทาง webhook ที่ไม่ควรแตะมัน

### 2.3 การซื้อ

**FR-IAP-10** จอเลือกแพ็กเกจในแอปแสดงราคา **จาก StoreKit เท่านั้น** ห้ามใช้เลขจากฝั่งเรา
— ราคาจริงขึ้นกับประเทศ/สกุลเงิน/ภาษีของบัญชี Apple ผู้ใช้ ถ้าเดาเองจะมีวันที่จอบอกเลขหนึ่ง
แต่ถูกตัดอีกเลขหนึ่ง

**FR-IAP-11** การซื้อถือว่าสำเร็จเมื่อ **server ตรวจลายเซ็น JWS ผ่าน** ไม่ใช่เมื่อ SDK ฝั่งเครื่องบอกว่าสำเร็จ

**FR-IAP-12** 🛑 ห้าม `finishTransaction` จนกว่า server จะบันทึกสิทธิ์เสร็จ
ธุรกรรมที่ยังไม่ finish จะถูก StoreKit ส่งกลับมาใหม่ทุกครั้งที่เปิดแอป = กลไกกู้คืนในตัว
ปิดก่อนแล้ว server ล่ม = ผู้ใช้จ่ายเงินแล้วไม่ได้ของ **และไม่มีทางกู้**

**FR-IAP-13** ตรวจ `bundleId` ในธุรกรรมให้ตรงกับของเราเสมอ — ไม่งั้นธุรกรรมจากแอปอื่นใช้ได้

**FR-IAP-14** ธุรกรรม `Sandbox` ห้ามให้สิทธิ์บน environment `Production`

### 2.4 วงจรชีวิต

**FR-IAP-20** `nextRenewalAt` ของใบ `APPLE_IAP` มาจาก `expiresDate` ที่ Apple แจ้ง
**ห้ามคำนวณ +30 วันเอง** — รอบของ Apple ไม่ตรง 30 วันเสมอ และเปลี่ยนได้จาก
billing retry / grace period

**FR-IAP-21** ยกเลิกกับ Apple → สิทธิ์อยู่จนถึง `expiresDate` แล้วค่อยหมด (ไม่ใช่ทันที)

**FR-IAP-22** `REFUND` → ถอนสิทธิ์ทันที + ล็อกร้านตามกติกาเดิมของ 00008

**FR-IAP-23** `DID_FAIL_TO_RENEW` → เข้าสถานะ `LOCKED_RENEWAL_FAILED` เมื่อพ้น grace period ที่ Apple ให้

**FR-IAP-24** ทุกการแจ้งเตือนต้อง insert `AppleIapNotification` **ก่อน** ลงมือ (กันซ้ำที่ระดับ DB)

**FR-IAP-25** ต้องมี cron เดินตรวจซ้ำเทียบกับ App Store Server API — **webhook หายได้**
(Apple ยิงตอนเราล่ม/ตอบช้า) การพึ่ง webhook อย่างเดียวแปลว่าวันหนึ่งจะมีคนใช้ฟรีตลอดไป
โดยไม่มีใครรู้

### 2.5 การแสดงผล

**FR-IAP-30** ฟีเจอร์ Deep Stock ต้องไม่ปรากฏในแอป iOS — ทั้งเมนู · หน้า `/inventory` ·
หน้า `/inventory/movements/[productId]` · แคตตาล็อกทางลัด
บังคับด้วย `isPaidFeatureRestricted()` ซึ่ง **แยกจาก** `isPaymentRestricted` และ `isSignUpRestricted`

**FR-IAP-31** คนที่มีสิทธิ์อยู่แล้ว (ทางไหนก็ตาม) ต้องไม่เห็นปุ่มซื้อ

**FR-IAP-32** ทุกจุดที่ประกอบรายการเมนูจาก `resolveVisibleSellerMenu` ต้องส่ง
`hidePayments` **และ** `hidePaidFeatures` — บังคับด้วยเทสสแกนซอร์สทั้ง `src/`

**FR-IAP-33** บนเว็บต้องไม่มีอะไรของ IAP โผล่เลย — เปิดเว็บบน Safari ของ iPhone
ยังต้องซื้อด้วยกระเป๋าเงินได้ตามปกติ

---

## 3. NFR

| # | ข้อกำหนด |
|---|---|
| NFR-IAP-1 | `getAppShell()` ถูก `cache()` ต่อ request ⇒ เรียก `shouldHide*()` หลายครั้งในหน้าเดียวไม่เพิ่ม I/O |
| NFR-IAP-2 | cron กรอง `source` ตั้งแต่ใน SQL (มี index รองรับ) ไม่ดึงแถวมากรองใน TS |
| NFR-IAP-3 | webhook ต้องตอบ Apple ภายในเวลาที่กำหนด — งานหนักแยกไปทำนอก request path |
| NFR-IAP-4 | ตรวจ JWS แบบ offline ด้วย root cert ของ Apple ไม่ยิง network ต่อการยืนยันหนึ่งครั้ง |

---

## 4. ผลกระทบต่อเอกสารระบบ

🛑 งานนี้แตะ data model ⇒ ต้อง sync `docs/SRS.md` ด้วย (Hard Rule 11) — **ทำแล้ว** §6.2:
- `BusinessPackageSubscription` + 4 คอลัมน์ใหม่
- ตารางใหม่ `AppleIapNotification`
- นิยาม "ใครต่ออายุ subscription" เปลี่ยนจาก "cron เท่านั้น" เป็น "ขึ้นกับ `source`"

🛑 ระหว่างทางพบว่า **`BusinessPackageSubscription` ไม่เคยอยู่ใน `docs/SRS.md` เลย
ตั้งแต่ feature 00008** — เป็นหนี้เดิมที่เพิ่งถูกปิดไปพร้อมกับรอบนี้
