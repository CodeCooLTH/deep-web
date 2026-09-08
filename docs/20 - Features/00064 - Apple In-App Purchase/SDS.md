---
title: "SDS — In-App Purchase (iOS)"
owner: shinobu22
status: draft
created: 2026-09-01
tags: [sds, feature, iap]
related: ["[[SRS]]", "[[API]]", "[[DATABASE]]"]
---

# SDS: In-App Purchase (iOS) — feature 00064

---

## 1. ภาพรวมการไหล

```mermaid
sequenceDiagram
    participant U as ผู้ขาย (ในแอป iOS)
    participant W as หน้าเว็บใน WebView
    participant N as เปลือก native (expo-iap)
    participant A as Apple / StoreKit
    participant S as server ของเรา

    U->>W: เปิดหน้าแพ็กเกจ
    W->>N: postMessage {type:'deep:iap-products'}
    N->>A: getProducts()
    A-->>N: ราคาตามประเทศของผู้ใช้
    N-->>W: ราคาที่จะแสดง (ห้าม hardcode ฝั่งเรา)
    U->>W: กดซื้อ tier ที่เลือก
    W->>N: postMessage {type:'deep:iap-buy', productId}
    N->>A: requestPurchase()
    A-->>N: ธุรกรรมที่เซ็นแล้ว (JWS)
    N-->>W: inject JWS กลับเข้าหน้าเว็บ
    W->>S: POST /api/iap/apple/verify (มี cookie ครบ)
    S->>S: ตรวจลายเซ็นด้วย root cert ของ Apple
    S->>S: เปิดสิทธิ์ (source='APPLE_IAP')
    S-->>W: 200
    W->>N: postMessage {type:'deep:iap-finish'}
    N->>A: finishTransaction()  ← หลัง server ยืนยันเท่านั้น
```

### 1.1 🛑 ทำไม native ไม่ยิง API เอง

ผู้ขายล็อกอินในเว็บ — session อยู่ในรูป cookie ของ WebView ฝั่ง native ไม่มี cookie/Bearer
ยิงเองจะได้ 401 เสมอ · การ inject ให้หน้าเว็บ `fetch` เองแปลว่า request วิ่งออกจาก origin
ของเว็บพร้อม cookie ครบ และมี `Origin` header ถูกต้อง ผ่าน CSRF check ของ `proxy.ts`
**แพตเทิร์นเดียวกับ push token ที่ใช้อยู่แล้ว** (`buildPushScript`)

### 1.2 🛑 ลำดับ finishTransaction

`finishTransaction` ต้องเกิด **หลัง** server ตอบ 200 เท่านั้น (FR-IAP-12)
ธุรกรรมที่ยังไม่ finish จะถูก StoreKit ส่งกลับมาใหม่ทุกครั้งที่เปิดแอป = กลไกกู้คืนในตัว
สำหรับเคส "จ่ายเงินแล้วแต่ server ล่ม"

---

## 2. โครงไฟล์

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `src/lib/subscription-source.ts` | ✅ **เสร็จ** | SSOT ของ "ใครเก็บเงินใบนี้" + fail-closed |
| `src/services/business-package.service.ts` | ✅ **เสร็จ** | ด่าน `assertWalletBilled` 6 จุด |
| `src/app/api/cron/business-package-lifecycle/route.ts` | ✅ **เสร็จ** | กรอง `source` ใน query |
| `src/lib/app-shell.ts` | ✅ **เสร็จ** | `isPaidFeatureRestricted` (กฎข้อที่ 3) |
| `src/lib/seller-menu.ts` · `seller-menu-server.ts` | ✅ **เสร็จ** | ซ่อน Deep Stock ในแอป |
| `src/services/shortcut.service.ts` | ✅ **เสร็จ** | ปิดรูแคตตาล็อกทางลัด |
| `src/lib/apple/jws.ts` | ✅ **เสร็จ** | ตรวจลายเซ็น JWS ออฟไลน์ + ปักหมุดใบรากของ Apple |
| `src/lib/apple/root-ca.ts` | ✅ **เสร็จ** | Apple Root CA G3 (ดาวน์โหลดจาก Apple) + ลายนิ้วมือปักหมุด |
| `src/lib/apple/product-ids.ts` | ✅ **เสร็จ** | รหัสสินค้า ↔ tier (fail-closed) |
| `src/lib/apple/transaction.ts` | ✅ **เสร็จ** | ตรวจ bundleId/Family Sharing/expiry แล้วสกัดข้อเท็จจริง |
| `src/lib/apple/entitlement.ts` | ✅ **เสร็จ** | ช่วงผ่อนผัน (BR-IAP-14) + ตัดสิน "ยังใช้ได้ไหม" |
| `src/services/apple-iap.service.ts` | ✅ **เสร็จ** | เปิด/ถอนสิทธิ์จากธุรกรรมที่ตรวจแล้ว · ช่วงผ่อนผันผ่าน `isEntitlementActive` |
| `src/app/api/iap/apple/verify/route.ts` | ✅ **เสร็จ** | รับ JWS จากหน้าเว็บ (มี session) |
| `src/app/api/webhooks/apple-iap/route.ts` | ✅ **เสร็จ** | webhook v2 — วางใต้ `/api/webhooks/` เพื่อใช้การยกเว้น CSRF ที่มีอยู่ · verify `signedRenewalInfo` แยกอีกก้อน |
| `src/app/api/cron/apple-iap-reconcile/route.ts` | ⏳ รอ .p8 | ตัวเดินตรวจซ้ำ (BR-IAP-15) |

---

## 3. การตรวจลายเซ็น (ออกแบบไว้ ยังไม่ implement)

```mermaid
flowchart TD
    A[JWS จาก StoreKit] --> B{ถอด header x5c<br/>ได้ห่วงโซ่ใบรับรอง?}
    B -->|ไม่ได้| R[ปฏิเสธ]
    B -->|ได้| C{ใบบนสุด = Apple Root CA G3?}
    C -->|ไม่| R
    C -->|ใช่| D{ลายเซ็นถูกต้องตลอดห่วงโซ่?}
    D -->|ไม่| R
    D -->|ใช่| E{bundleId ตรงกับของเรา?}
    E -->|ไม่| R
    E -->|ใช่| F{environment ตรงกับที่รันอยู่?}
    F -->|ไม่| R
    F -->|ใช่| G[เชื่อถือได้ → เปิดสิทธิ์]
```

🛑 **ตรวจแบบ offline** — ไม่ยิง network ต่อการยืนยันหนึ่งครั้ง (NFR-IAP-4)
Apple Root CA ฝังไว้ในโค้ด ไม่ดึงสด

---

## 4. การจับคู่ธุรกรรมกับบัญชี

```mermaid
flowchart TD
    A[ธุรกรรมผ่านการตรวจแล้ว] --> B{originalTransactionId<br/>มีในฐานแล้ว?}
    B -->|ไม่มี| C{ownerId นี้มี subscription อยู่แล้ว?}
    B -->|มี| D{ผูกกับ ownerId เดียวกัน?}
    D -->|ใช่| E[อัปเดตรอบบิลตาม expiresDate]
    D -->|ไม่ใช่| F[ปฏิเสธ + อธิบายเหตุผล<br/>BR-IAP-04]
    C -->|ไม่มี| G[สร้างใบใหม่ source=APPLE_IAP]
    C -->|มี WALLET| H[เคสค้าง Q-2<br/>ยังไม่ตัดสิน]
    C -->|มี APPLE_IAP| E
```

🛑 กิ่ง **F** ต้องบอกเหตุผลกับผู้ใช้ ไม่ใช่เงียบ — Apple ID เดียวเปิดสิทธิ์ให้หลายบัญชี Deep ไม่ได้

---

## 5. ด่านความปลอดภัยที่วางแล้ว (เฟส 1)

```mermaid
flowchart LR
    subgraph cron["cron ต่ออายุ"]
      Q["query: source='WALLET'"] --> R["renewOrLockBusinessPackage()"]
      R --> G{"isWalletBilled(source)?"}
      G -->|ไม่| S["return 'SKIPPED'"]
      G -->|ใช่| D["deductCredit()"]
    end
```

**2 ชั้นโดยตั้งใจ** — ชั้น query ไว้ประสิทธิภาพ · ชั้นในฟังก์ชันไว้ความถูกต้อง
เพราะฟังก์ชัน export ออกไปและมีผู้เรียกรายอื่นได้

### 5.1 พิสูจน์แล้วด้วย mutation 14 แบบ

| กลุ่ม | จำนวน | ผล |
|---|---|---|
| ด่านกันเก็บเงินซ้ำ | 9 | 🔴 แดงครบ |
| ด่านซ่อน Deep Stock | 5 | 🔴 แดงครบ |

---

## 6. สิ่งที่ตัดสินใจไว้แล้วและห้ามเปลี่ยนโดยไม่อ่านเหตุผล

| # | การตัดสินใจ | เหตุผลย่อ |
|---|---|---|
| SDS-1 | กฎเปลือกแอป **3 ตัวแยกกัน** | ตอบคนละคำถาม · จะถูกผ่อนคนละเวลา · ยุบแล้วผ่อนทีเดียวจะเปิดหมด |
| SDS-2 | `source` เป็น `String` ไม่ใช่ enum | เพิ่ม Google Play ทีหลังไม่ต้อง `ALTER TYPE` บนฐาน prod |
| SDS-3 | ไม่เพิ่ม `source` ให้ `InventoryEntitlement` | ไม่มีแหล่งที่มาที่สอง · คอลัมน์ที่ไม่มีใครใช้แย่กว่าไม่มี |
| SDS-4 | ส่งข้อจำกัดเปลือกแอปเป็น **parameter** ไม่ถามเองในฟังก์ชัน | ให้ service ยัง test ได้โดยไม่ผูกกับ request — และมีเทสสแกนบังคับว่าต้องส่งจริง |
| SDS-5 | ไม่แตะผู้ใช้เดิม (D-3) | Apple ห้าม "ขาย" ในแอป ไม่ได้ห้าม "ให้สิทธิ์ที่ซื้อมาก่อนทำงานต่อ" |
