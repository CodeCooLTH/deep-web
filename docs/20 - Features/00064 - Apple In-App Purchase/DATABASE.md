---
title: "DATABASE — In-App Purchase (iOS)"
owner: shinobu22
status: draft
created: 2026-09-01
tags: [database, feature, iap]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]"]
---

# DATABASE: In-App Purchase (iOS) — feature 00064

> migration: `prisma/migrations/20260901120000_business_package_source_apple_iap/`
> **additive ล้วน** — เพิ่มคอลัมน์ที่มี DEFAULT / คอลัมน์ nullable / ตารางใหม่ / index ใหม่
> ไม่มี DROP · ไม่มี ALTER ที่เปลี่ยนชนิด · ไม่มี NOT NULL ที่ไม่มี DEFAULT

---

## 1. `BusinessPackageSubscription` — คอลัมน์ใหม่ 4 ตัว

| คอลัมน์ | ชนิด | Null | Default | หน้าที่ |
|---|---|---|---|---|
| `source` | TEXT | ไม่ | **`'WALLET'`** | ใครเก็บเงินและต่ออายุใบนี้ — `WALLET` \| `APPLE_IAP` |
| `appleOriginalTransactionId` | TEXT | ได้ | — | รหัสธุรกรรมแรกของสายการสมัครฝั่ง Apple · **UNIQUE** |
| `appleProductId` | TEXT | ได้ | — | product id ใน App Store Connect ที่ผูกกับ tier |
| `appleEnvironment` | TEXT | ได้ | — | `Production` \| `Sandbox` |

### 1.1 🛑 ทำไม `DEFAULT 'WALLET'` คือหัวใจของความปลอดภัยตอน deploy

แถวที่มีอยู่บน prod (นับ 2026-09-01 = **1 แถว**) ได้ค่านี้ทันทีที่ migration รัน
⇒ cron ยังหยิบไปต่ออายุเหมือนเดิมทุกประการ ผู้ใช้รายนั้นไม่รู้สึกอะไรเลย

ถ้าปล่อยเป็น `NULL` แล้วให้โค้ดตีความเอง จะมีช่วงหนึ่งที่ cron มองไม่เห็นใบเดิม
(เพราะ `isWalletBilled(null)` = `false` ตาม fail-closed) แล้วลูกค้าที่จ่ายเงินอยู่
จะถูกปล่อยให้หมดอายุ **เงียบ ๆ โดยไม่มีอะไรฟ้อง**

### 1.2 ทำไม `source` เป็น `String` ไม่ใช่ enum

แพตเทิร์นเดียวกับ `tier` ในตารางเดียวกัน และ `Order.status` / `WalletTransaction.type`
ทั้งโปรเจกต์ — เพิ่มช่องทางใหม่ (Google Play) จะได้ไม่ต้อง `ALTER TYPE` บนฐานที่มีข้อมูลจริง

### 1.3 ทำไม `appleOriginalTransactionId` ต้อง UNIQUE **ที่ระดับฐาน**

บังคับ BR-IAP-04 (1 การสมัครของ Apple ผูกได้กับบัญชี Deep เดียว) — ถ้าบังคับแค่ที่โค้ด
แพตเทิร์น find-then-insert จะแพ้ race เสมอ เพราะ **webhook ของ Apple กับการยืนยันจากเครื่อง
ผู้ใช้วิ่งเข้ามาพร้อมกันได้** (บทเรียน 00038 Critical #3 — partial unique index พิสูจน์ถูก
ที่ชั้น DB แต่โค้ดใช้ find-then-update จึงไม่เคยมีโอกาสทำงานเป็นตัวกันชน)

---

## 2. Index

| index | ใช้โดย |
|---|---|
| `(status, nextRenewalAt)` *(เดิม — ไม่ลบ)* | query อื่นที่ยังใช้อยู่ · การลบระหว่าง deploy จะทำให้ช่วงนั้นช้าโดยไม่จำเป็น |
| **`(source, status, nextRenewalAt)`** *(ใหม่)* | cron ต่ออายุ — `source` มาก่อนเพราะเป็น equality ที่ตัดแถวทิ้งได้มากที่สุด |
| `appleOriginalTransactionId` UNIQUE | จับคู่ webhook กับแถว + บังคับ BR-IAP-04 |

---

## 3. ตารางใหม่ `AppleIapNotification`

บันทึกดิบของ App Store Server Notifications v2

| คอลัมน์ | ชนิด | Null | หน้าที่ |
|---|---|---|---|
| `id` | TEXT PK | ไม่ | |
| `notificationUUID` | TEXT **UNIQUE** | ไม่ | กุญแจกันประมวลผลซ้ำ |
| `notificationType` | TEXT | ไม่ | `DID_RENEW` · `EXPIRED` · `REFUND` · … |
| `subtype` | TEXT | ได้ | `BILLING_RETRY` · `VOLUNTARY` · `GRACE_PERIOD` |
| `originalTransactionId` | TEXT | ได้ | จับคู่กับ subscription · บาง type ไม่มี (เช่น `TEST`) |
| `environment` | TEXT | ได้ | `Production` \| `Sandbox` |
| `signedPayload` | TEXT | ไม่ | JWS ดิบ — หลักฐานตั้งต้นเวลามีข้อโต้แย้งเรื่องเงิน |
| `processedAt` | TIMESTAMP | ได้ | `NULL` = รับไว้แล้วแต่ยังทำไม่สำเร็จ |
| `error` | TEXT | ได้ | เหตุผลที่ล้มเหลว — ไม่กลืนเงียบ |
| `createdAt` | TIMESTAMP | ไม่ | |

### 3.1 🛑 ทำไมต้องเป็นตาราง ไม่ใช้ `console.log`

Vercel plan ที่ใช้อยู่ **query runtime log ย้อนหลังไม่ได้** (`/v1/deployments/{id}/runtime-logs`
คืน 404 — ยืนยันแล้ว 2026-08-08) log ที่อ่านย้อนหลังไม่ได้มีค่าเท่ากับไม่มี
เรื่องเงินของลูกค้าต้องตรวจสอบย้อนหลังได้เสมอ · แพตเทิร์นเดียวกับ `ChatHandoverEvent`

### 3.2 🛑 ต้อง insert **ก่อน** ลงมือให้/ถอนสิทธิ์

insert ทีหลัง = การยิงซ้ำที่มาถึงระหว่างที่รอบแรกยังทำงานอยู่จะลอดเข้าไปทำซ้ำได้
(บทเรียน 00038 Critical #3 — "จองแถวก่อนยิง")

### 3.3 index

| index | ใช้โดย |
|---|---|
| `notificationUUID` UNIQUE | กันประมวลผลซ้ำ |
| `originalTransactionId` | สืบประวัติของ subscription ใบหนึ่ง |
| `processedAt` | ตัวเดินตรวจซ้ำ (BR-IAP-15) หาใบที่ยังไม่สำเร็จ |

---

## 4. สิ่งที่ **ไม่** เปลี่ยน

| ตาราง | เหตุผล |
|---|---|
| `InventoryEntitlement` | Deep Stock ไม่ขายเป็น IAP ⇒ ไม่มีแหล่งที่มาที่สอง ไม่ต้องมี `source` · **เพิ่มคอลัมน์ที่ไม่มีใครใช้ แย่กว่าไม่เพิ่ม** |
| `SellerWallet` / `WalletTransaction` | กระเป๋าเงินยังทำงานเหมือนเดิมทุกอย่าง (SMS · AI · pin slot ยังใช้) |
| `TopUpRequest` | ไม่เกี่ยวกับ IAP |

---

## 5. ผลกระทบต่อข้อมูลที่มีอยู่ (นับจาก prod 2026-09-01)

| | จำนวน | หลัง migration |
|---|---|---|
| `BusinessPackageSubscription` | 1 แถว (ACTIVE · BUSINESS) | ได้ `source='WALLET'` → พฤติกรรมไม่เปลี่ยน |
| `InventoryEntitlement` | **0 แถว** | ไม่มีอะไรเปลี่ยน |
| `AppleIapNotification` | — | ตารางใหม่ เริ่มจากว่าง |

**ไม่ต้อง backfill อะไรเลย** — `DEFAULT` จัดการให้ทั้งหมด
