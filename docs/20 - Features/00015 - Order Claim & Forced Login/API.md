---
title: "API — Order Claim & Forced Login"
owner: shinobu22
status: draft
module: M00015-OrderClaimForcedLogin
version: "1.1"
created: 2026-07-07
tags: [feature, order, login, identity, buyer, api]
related: ["[[SDS]]", "[[SRS]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00015-OrderClaimForcedLogin
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.1
> **วันที่จัดทำ:** 2026-07-07
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: Order Claim & Forced Login

---

## 1. Overview

API ชุดนี้รองรับการออกแบบใน [[SDS]] §3-6 — เปลี่ยน 6 endpoint เดิม (2 ลบ, 4 แก้), เพิ่ม 1 endpoint ใหม่ (`/claim`), และเปลี่ยน error contract ของ 4 bid/buy-now endpoint provider คือ Next.js 16 Route Handler (nodejs runtime) ทั้งหมด, ผู้บริโภคคือ buyer browser (`(marketing)` Vuexy) และ Deep-App (mobile, Bearer token)

- **เอกสารออกแบบต้นทาง:** [[SDS]] ของโมดูลนี้
- **Base URL:** `https://deepthailand.app` (prod), `https://deepth.local` (dev) — ตาม subdomain routing เดิม (`main` domain)
- **Content-Type:** `application/json` (ยกเว้น `/slip` = `multipart/form-data`)
- **Convention:** response envelope ตรง (ไม่มี wrapper `{data, meta}`) — ตรง convention เดิมของ `src/app/api/orders/**` ทั้งหมด (ไม่เปลี่ยน)

---

## 2. Authentication

| รายการ | ค่า |
|--------|-----|
| **วิธี (Auth Method)** | NextAuth v4 session cookie (JWT strategy) — web; Bearer HMAC token (`lib/app-token.ts`) — Deep-App |
| **Header** | Web: cookie อัตโนมัติจาก browser; App: `Authorization: Bearer <token>` |
| **Token/Scope** | Session ผูกกับ `User.id` เดียว ไม่มี scope ย่อย — ทุก endpoint ในเอกสารนี้ต้องการแค่ "login แล้ว" (ไม่มี role-check เพิ่มยกเว้นที่ระบุ) |
| **กรณีไม่ผ่าน** | `401 { "error": "..." }` (ข้อความ generic ไม่บอกรายละเอียด — ตาม convention เดิม) |
| **CSRF/Rate-limit** | ทุก mutation route (POST) ผ่าน `guardApi()` ใน `src/proxy.ts` อัตโนมัติ: Origin-check (เฉพาะ non-`/api/app/*`) + rate-limit ต่อ IP (mutation: auth 30/min, unauth 100/min) — **ไม่ต้องแก้ proxy.ts** endpoint ใหม่ (`/claim`) เข้าเงื่อนไขเดิมโดยอัตโนมัติเพราะ path ตรงกับ `/api/orders/**` |

---

## 3. Endpoint List

| Method | Path | คำอธิบาย | สถานะ |
|--------|------|----------|-------|
| `GET` | `/o/{token}` | RSC หน้าออเดอร์สาธารณะ — force-login gate | แก้ไข |
| `GET` | `/api/o/sms/{code}` | Consume SMS short-code → redirect pre-fill/expired | แก้ไข |
| `POST` | `/api/orders/{token}/claim` | ยืนยัน claim-OTP (เบอร์ fixed ของ session) | **ใหม่** |
| `POST` | `/api/orders/{token}/confirm` | ยืนยันคำสั่งซื้อ | แก้ไข |
| `POST` | `/api/orders/{token}/cancel` | ยกเลิกคำสั่งซื้อ | แก้ไข |
| `POST` | `/api/orders/{token}/slip` | แนบสลิปโอนเงิน | แก้ไข |
| `POST` | `/api/orders/{token}/unlock` | ตรวจเบอร์ก่อนเข้าถึง (guest phone-unlock) | **ลบ** |
| `GET` | `/api/orders/{token}/buyer-phone` | ดึงเบอร์จาก SMS-unlock cookie (account prompt) | **ลบ** |
| `POST` | `/api/orders` | สร้างออเดอร์ (seller manual-create) | แก้ไข (validation) |
| `POST` | `/api/auctions/{id}/bid` | วางบิด (เว็บ) | แก้ไข (error contract) |
| `POST` | `/api/app/auctions/{id}/bid` | วางบิด (แอป) | แก้ไข (error contract) |
| `POST` | `/api/auctions/{id}/buy-now` | ซื้อทันที (เว็บ) | แก้ไข (error contract) |
| `POST` | `/api/app/auctions/{id}/buy-now` | ซื้อทันที (แอป) | แก้ไข (error contract) |
| `POST` | `/api/app/orders/{id}/confirm` | ยืนยันคำสั่งซื้อ (แอป) | แก้ไข (drop phone param ภายใน) |

---

## 4. Endpoint Detail

### 4.1 `GET /o/{token}`

RSC page — ไม่ใช่ JSON API แต่เป็น navigable route ที่ผลลัพธ์คือ HTML/redirect Header ตาม decision ของ `resolveOrderAccess()`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `token` | `string` | yes | UUID v4 / 12-char SMS-code / 8-char permanent short-code |

**Response — Behavior (ไม่ใช่ JSON, เป็น navigation outcome)**

| เงื่อนไข | ผลลัพธ์ |
|----------|---------|
| Token format ไม่ตรงทั้ง 3 แบบ | `redirect('/o/link-invalid')` |
| UUID + order ไม่พบ | `notFound()` (Next.js 404 page) |
| UUID + order พบ + ไม่มี session | `redirect('/auth/sign-in?callbackUrl=/o/{token}')` |
| UUID + order พบ + session + decision=`OWNER_MATCH`/`OPEN_CLAIM`/`PHONE_MATCH_AUTO_CLAIM` | render `PublicOrderClient` (200, order detail) |
| UUID + order พบ + session + decision=`OTP_CLAIM_REQUIRED` | render `ClaimOtpPrompt` (200, ไม่มี order PII) |
| UUID + order พบ + session + decision=`OWNER_MISMATCH`/`OTP_CLAIM_BLOCKED`/`LEGACY_NO_CLAIM` | render `OrderAccessBlock` (200, ไม่มี order PII) |
| 12-char SMS-code | `redirect('/api/o/sms/{code}')` |
| 8-char permanent short-code + พบ | `redirect('/o/{uuid}')` |
| 8-char permanent short-code + ไม่พบ | `redirect('/o/link-invalid')` |

**Error contract:** ไม่มี JSON error — เป็น redirect/404 ทั้งหมด (คง uniform-error เดิมสำหรับ token ผิด/ไม่พบ)

---

### 4.2 `GET /api/o/sms/{code}`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `code` | `string` | yes | 12-char SMS short-code |

**Response — Success (302 redirect)**

| เงื่อนไข | Location Header |
|----------|-----------------|
| Consume สำเร็จ | `/auth/sign-in?callbackUrl=%2Fo%2F{publicToken}&prefillPhone={buyerContact}` |
| Rate-limit เกิน | `/o/link-invalid` |
| Format ผิด | `/o/link-invalid` |
| Consume ล้มเหลว (not-found/expired/used/phone-mismatch) | `/auth/sign-in?smsExpired=1` |

**หมายเหตุ:** **ไม่มี `Set-Cookie` อีกต่อไป** ในทุก branch (เดิมมี `SMS_UNLOCK_COOKIE`) — นี่คือการเปลี่ยนแปลงหลักของ endpoint นี้ ทุกอย่างอื่น (rate-limit, single-use consume, uniform-error สำหรับ rate-limit/format) คงเดิม 100%

**Idempotency:** consume ยังคง single-use (ตาม RC-1 เดิม) — เรียกซ้ำด้วย code เดียวกันหลัง consume ไปแล้ว = ล้มเหลว (ตกไป branch "consume ล้มเหลว")

---

### 4.3 `POST /api/orders/{token}/claim` (ใหม่)

Endpoint ใหม่สำหรับ decision `OTP_CLAIM_REQUIRED` — ยืนยัน OTP ที่ผูกกับเบอร์ของ**บัญชีที่ login อยู่เท่านั้น** (server resolve เบอร์เอง ไม่รับจาก client)

**Auth:** NextAuth session required — ไม่มี session → `401`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `token` | `string` (uuid) | yes | `Order.publicToken` |
| Body | `otp` | `string` (6 หลัก) | yes | รหัส OTP ที่ขอผ่าน `POST /api/otp/send` ด้วย `contact` = เบอร์ของ session user เอง |

Valibot schema (ใหม่, `src/lib/validations.ts`):
```ts
export const ClaimOrderSchema = v.object({
  otp: v.pipe(v.string(), v.length(6)),
});
```

**Response — Success (200)**

```json
{ "ok": true }
```

**Logic (สรุปจาก SDS §4.5):**
1. โหลด order ด้วย `token`; ไม่พบ → 404
2. ถ้า `order.buyerUserId === session.user.id` อยู่แล้ว (idempotent-hit, เช่น double-submit) → คืน `200 {ok:true}` ทันที ไม่ต้อง verify OTP ซ้ำ
3. ถ้า `order.buyerUserId` ตั้งเป็นคนอื่นแล้ว (race) → `409`
4. Resolve เบอร์ของ session user จาก DB (`prisma.user.findUnique`) — ไม่มีเบอร์ → `400`
5. `normalizePhone(order.buyerContact) !== sessionPhone` → `403` (defense-in-depth — หน้า UI ไม่ควรพา user มาถึงจุดนี้ถ้าเบอร์ไม่ตรงอยู่แล้ว)
6. `verifyOtp(sessionPhone, otp)` เป็น false → `401`
7. ผ่านทุกเงื่อนไข → `guaranteeOrderLink({orderId, userId, phone: sessionPhone})` → `200 {ok:true}`

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 400 | body invalid (ValiBot parse fail) หรือ session user ไม่มีเบอร์ลงทะเบียน |
| 401 | ไม่มี session, หรือ OTP ผิด/หมดอายุ |
| 403 | เบอร์ของ session user ไม่ตรงกับ `order.buyerContact` |
| 404 | ไม่พบ order |
| 409 | order ถูก claim โดยบัญชีอื่นไปแล้ว (race) |

**CSRF/Rate-limit:** ผ่าน `guardApi()` เดิม (mutation, auth 30/min) + `verifyOtp()` มี attempt-limit ภายในตัว (3 ครั้ง/OTP)

---

### 4.4 `POST /api/orders/{token}/confirm` (แก้ไข)

**เดิม:** 2 paths (SMS-unlock cookie / UUID contact-parity) — **ใหม่:** 1 path เดียว, session+ownership

**Auth:** NextAuth session required — ไม่มี session → `401`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `token` | `string` | yes | — |
| Body | *(ไม่มี field บังคับอีกต่อไป — เดิมมี `contact`/`smsUnlock`, ตัดออกทั้งคู่)* | — | no | body ที่ส่งมาจะถูก**ละเว้น** |

**Response — Success (200)**

```json
{ "id": "...", "publicToken": "...", "status": "CONFIRMED", "...": "..." }
```

(shape เดิมของ `Order` record — ไม่เปลี่ยน field)

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 401 | ไม่มี session |
| 403 | `session.user.id !== order.buyerUserId` (`OrderOwnershipError`) |
| 400 | invalid state transition (`assertTransition` throw) หรือ order ไม่พบ |

---

### 4.5 `POST /api/orders/{token}/cancel` (แก้ไข)

**Auth:** NextAuth session — seller (owner ของ shop) ไม่ต้อง phone; buyer ต้องมี session และเป็นเจ้าของ (`session.user.id === order.buyerUserId`)

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `token` | `string` | yes | — |
| Body | *(ไม่มี — เดิมมี `contact` สำหรับ buyer path, ตัดออก)* | — | no | — |

**Response — Success (200):** shape เดิมของ `Order` record หลัง cancel (รวม `cancelInitiator`)

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 404 | order ไม่พบ |
| 403 | ไม่ใช่ seller-owner และไม่ใช่ buyer-owner (รวมเคส `order.buyerUserId == null` — ไม่มีใครยกเลิกได้ยกเว้น seller) |
| 400 | invalid state transition (cancel หลัง CONFIRMED) |

---

### 4.6 `POST /api/orders/{token}/slip` (แก้ไข)

**Auth:** NextAuth session required; `session.user.id === order.buyerUserId`

**Request** (multipart/form-data)

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `token` | `string` | yes | — |
| Form field | `file` | `File` | yes | รูปสลิป (≤5MB, image/PDF) |
| Form field | `contact` | *(ลบ)* | — | — |

**Response — Success (200)**

```json
{ "slipFileId": "..." }
```

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 401 | ไม่มี session |
| 403 | ไม่ใช่เจ้าของออเดอร์ |
| 400 | ไม่แนบไฟล์ / ไฟล์ไม่ถูกต้อง / status ไม่ใช่ PENDING |

---

### 4.7 `POST /api/orders/{token}/unlock` — **ลบ**

Dead code — ไม่มี caller เหลือหลัง `PhoneUnlock.tsx` ถูกลบ (force-login ทำหน้าที่แทนทั้งหมด) ลบทั้ง route + service function `checkOrderPhone()`

### 4.8 `GET /api/orders/{token}/buyer-phone` — **ลบ**

Dead code — ไม่มี caller เหลือหลัง `AccountPromptCard.tsx` ถูกลบ (guest SMS-unlock account-prompt ไม่มีอยู่จริงอีกต่อไปเพราะไม่มี guest-view)

---

### 4.9 `POST /api/orders` (แก้ไข validation)

ไม่เปลี่ยน method/path/auth — เปลี่ยนเฉพาะ validation ของ field `buyerContact`

**Request (เฉพาะ field ที่เปลี่ยน)**

| ฟิลด์ | ชนิดเดิม | ชนิดใหม่ |
|-------|----------|----------|
| `buyerContact` | `optional(string)` (เบอร์/อีเมล/ว่างได้) | `required, regex ^0[0-9]{9}$` (เบอร์ไทยเท่านั้น) |

**Error contract เพิ่ม:**

| Status | เงื่อนไข |
|--------|----------|
| 400 | `Invalid input` (valibot parse fail — รวมกรณี `buyerContact` ว่าง/เป็นอีเมล/ผิดรูปแบบ) |

**ไม่กระทบ:** ออเดอร์ auction-win (สร้างผ่าน `settleAuctionCore` โดยตรง ไม่ผ่าน endpoint นี้)

---

### 4.10 4 Bid/Buy-Now Routes (แก้ไข error contract)

`POST /api/auctions/{id}/bid`, `POST /api/app/auctions/{id}/bid`, `POST /api/auctions/{id}/buy-now`, `POST /api/app/auctions/{id}/buy-now`

**Request:** ไม่เปลี่ยน (`{amount}` สำหรับ bid; ไม่มี body สำหรับ buy-now)

**Response — Error ใหม่ (403)**

```json
{ "error": "ต้องยืนยันเบอร์โทรก่อนวางบิด", "code": "PHONE_NOT_VERIFIED" }
```

เงื่อนไข: `bidder.phone == null` — ตรวจก่อน guard อื่นทั้งหมด (auction live/self-bid/ราคา/concurrency)

**Client action ที่คาดหวัง:** ตรวจ `body.code === 'PHONE_NOT_VERIFIED'` → นำทางไป flow เพิ่ม/ยืนยันเบอร์ (reuse `POST /api/otp/send` + `POST /api/account/set-phone`) แทนที่จะแสดง error ทั่วไป — **หมายเหตุ:** error นี้แทบไม่เกิดกับ Deep-App เพราะ app account ทุกบัญชีมี phone จาก auth model อยู่แล้ว (ดู SDS §4.6 grounding) จุดที่ต้องมี UI จริง ๆ คือ 2 route ฝั่งเว็บเท่านั้น

**Error code ที่ endpoint เหล่านี้คืนได้ (ไม่เปลี่ยนจากเดิม, เพิ่มแค่ 1 code):** 404 (ไม่พบ auction), 403 (self-bid / **ใหม่:** phone-not-verified), 409 (ปิดแล้ว/ราคาเปลี่ยน/buy-now ซ้ำ), 400 (ราคาต่ำกว่าขั้นต่ำ)

---

### 4.11 `POST /api/app/orders/{id}/confirm` (แก้ไขภายใน — contract ไม่เปลี่ยน)

**Request/Response:** ไม่เปลี่ยนจาก client มุมมอง (`{ok: true}` เดิม) — เปลี่ยนแค่ internal call `confirmOrder(token, auth.user.id)` แทน `confirmOrder(token, auth.user.phone ?? '', auth.user.id)` (signature service เปลี่ยนตาม SRS TFR-011) `getOrderTokenForBuyer()` ที่เรียกก่อนหน้าอยู่แล้ว scope ด้วย `buyerUserId` เหมือนเดิม (double-guard, ไม่เปลี่ยน)

---

## 5. Error Code Table

| Error Code | HTTP Status | ความหมาย/เงื่อนไข |
|------------|-------------|----------------------|
| `PHONE_NOT_VERIFIED` | `403` | (ใหม่) บัญชีพยายาม bid/buy-now โดยไม่มี `User.phone` ยืนยันแล้ว |
| *(generic, ไม่มี code field)* `Unauthorized`/`ไม่ได้เข้าสู่ระบบ` | `401` | ไม่มี session (confirm/cancel/slip/claim) หรือ OTP ผิด/หมดอายุ (`/claim`) |
| *(generic)* `OrderOwnershipError` → ข้อความ generic | `403` | `session.user.id !== order.buyerUserId` (confirm/cancel/slip/claim) |
| *(generic)* — | `400` | invalid state transition / validation fail (valibot) / ไม่มีเบอร์ลงทะเบียน (`/claim`) |
| *(generic)* — | `404` | order/auction ไม่พบ |
| *(generic)* — | `409` | race condition (claim ซ้ำโดยบัญชีอื่น, buy-now ซ้ำ, ราคาเปลี่ยน) |
| *(generic)* — | `429` | rate-limit (SMS consume, OTP send, `guardApi` ต่อ IP) |

**โครง error response มาตรฐาน (คงเดิมจากทั้งระบบ — ไม่มี wrapper `error.code/message/details`):**

```json
{ "error": "ข้อความสำหรับผู้ใช้ (ไทย)" }
```

หรือเมื่อมี distinguishable code (เฉพาะ bid/buy-now):

```json
{ "error": "ข้อความสำหรับผู้ใช้ (ไทย)", "code": "PHONE_NOT_VERIFIED" }
```

---

## 6. Sequence (flow ซับซ้อน)

ดู [[SDS]] §4.2-4.6 สำหรับ sequence diagram เต็มของทุก flow (force-login round-trip, SMS pre-fill, owner-match, OTP-claim, bid phone-gate) — ไม่ duplicate ที่นี่เพื่อไม่ให้ diagram สอง version drift กัน

---

## 7. Traceability

| Endpoint | SDS Component/Decision | BRD FR |
|----------|--------------------------|--------|
| `GET /o/{token}` | §4.0 `resolveOrderAccess`, §4.2 | FR-OCL-01, FR-OCL-04, FR-OCL-05 |
| `GET /api/o/sms/{code}` | §4.3, TD-003 | FR-OCL-03 |
| `POST /api/orders/{token}/claim` | §4.5, §4.1 `guaranteeOrderLink` | FR-OCL-06, FR-OCL-07 |
| `POST /api/orders/{token}/confirm` | TD-004 | FR-OCL-02 (guest-bypass removal), (derived TFR-011) |
| `POST /api/orders/{token}/cancel` | TD-004 | (derived TFR-011) |
| `POST /api/orders/{token}/slip` | TD-004 | (derived TFR-011) |
| `POST /api/orders/{token}/unlock` (ลบ) | — | FR-OCL-02 |
| `GET /api/orders/{token}/buyer-phone` (ลบ) | — | FR-OCL-02 |
| `POST /api/orders` | file-change list §8 | FR-OCL-09 |
| 4× bid/buy-now | §4.6 | FR-OCL-10 |
| `POST /api/app/orders/{id}/confirm` | TD-004 | (derived TFR-011) |

---

## 8. สรุป (Summary)

API Contract นี้ครอบคลุมทุก endpoint ที่แตะโดย Order Claim & Forced Login: 1 endpoint ใหม่ (`/claim`), 2 endpoint ลบ (dead code หลัง force-login), 3 endpoint แก้ไข authorization model (confirm/cancel/slip → session+ownership แทน phone-contact parity), 4 endpoint เพิ่ม error code ใหม่ (`PHONE_NOT_VERIFIED`), 1 endpoint แก้ validation (`buyerContact` required) — ทุก endpoint reuse CSRF/rate-limit เดิมของ `proxy.ts` โดยไม่ต้องแก้ proxy

**Open Questions:**
- UI ของ prompt-to-verify-phone บนปุ่ม bid/buy-now ฝั่งเว็บ (ต้องผ่าน `safepay-ux` ก่อน — endpoint ที่ใช้ชัดเจนแล้วคือ `/api/otp/send` + `/api/account/set-phone` ที่มีอยู่แล้ว ไม่ต้องสร้างใหม่)

---

## 9. ภาคผนวก — Phase 2 (2026-07-25): ปลายทางที่เพิ่มและเปลี่ยน

### 9.1 `POST /api/orders/{token}/verify-phone`

ยืนยันเบอร์ที่ใช้สั่งซื้อ สำหรับผู้ใช้ที่ล็อกอินแล้วแต่บัญชีพิสูจน์ความเป็นเจ้าของไม่ได้ (สถานะ `PHONE_VERIFY_REQUIRED`)

ต่างจาก `/claim` ตรงที่ `/claim` ใช้เบอร์ของบัญชีที่ระบบค้นเองจากฐานข้อมูล ส่วนปลายทางนี้รับเบอร์ที่ผู้ใช้กรอกมาแล้วพิสูจน์ด้วยรหัสยืนยันก่อนผูกให้

**คำขอ** `{ "phone": "0812345678", "otp": "482910" }` — ต้องมีสถานะเข้าสู่ระบบ

**ลำดับการตรวจ (บังคับ ห้ามสลับ)**
1. ตรวจสถานะเข้าสู่ระบบและรูปแบบข้อมูล
2. คำสั่งซื้อผูกกับบัญชีนี้แล้ว คืนสำเร็จทันทีโดยไม่ตรวจรหัสซ้ำ (รองรับการกดซ้ำ)
3. คำสั่งซื้อผูกกับบัญชีอื่นแล้ว ปฏิเสธ
4. **ตรวจรหัสยืนยันของเบอร์ที่กรอก** — ขั้นนี้ต้องมาก่อนขั้นถัดไปเสมอ มิฉะนั้นปลายทางนี้จะกลายเป็นเครื่องมือเดาเบอร์ผู้ซื้อ
5. เปรียบเทียบกับเบอร์ในคำสั่งซื้อ
6. ผูกเบอร์เข้ากับตัวตนตามกรณี

| สถานะ | รหัส | ความหมาย |
|---|---|---|
| 200 | — | ยืนยันสำเร็จ เข้าถึงคำสั่งซื้อได้ |
| 400 | — | ข้อมูลไม่ถูกต้อง |
| 401 | — | ไม่ได้เข้าสู่ระบบ หรือรหัสยืนยันไม่ถูกต้อง/หมดอายุ |
| 403 | `PHONE_MISMATCH` | เบอร์ไม่ตรงกับที่ร้านบันทึกไว้ |
| 404 | — | ไม่พบคำสั่งซื้อ |
| 409 | `ACCOUNT_EXISTS` | เบอร์เป็นของบัญชีอื่น — คืน `linkTicket` มาด้วยเพื่อไปต่อที่ §9.2 |
| 409 | `ACCOUNT_HAS_OTHER_PHONE` | บัญชีนี้ผูกเบอร์อื่นไว้แล้วและเบอร์เปลี่ยนไม่ได้ |

### 9.2 `POST /api/orders/{token}/link-account`

ย้ายช่องทางล็อกอินของบัญชีที่ใช้อยู่ไปผูกกับบัญชีเดิมที่ถือเบอร์ของคำสั่งซื้อนี้

**คำขอ** `{ "ticket": "<linkTicket จาก §9.1>" }` — ต้องมีสถานะเข้าสู่ระบบ

**ตอบสำเร็จ** `{ "ok": true, "provider": "facebook" }` — ฝั่งหน้าเว็บต้องเรียกเข้าสู่ระบบด้วยช่องทางที่คืนมาอีกครั้งทันที เพราะสถานะเดิมยังชี้บัญชีต้นทางที่เพิ่งถูกย้ายช่องทางออกไป

| สถานะ | รหัส | ความหมาย |
|---|---|---|
| 200 | — | เชื่อมสำเร็จ |
| 400 | — | สิทธิ์ไม่ถูกต้องหรือหมดอายุ ต้องยืนยันเบอร์ใหม่ |
| 403 | — | สิทธิ์ไม่ได้เป็นของผู้ที่ล็อกอินอยู่ |
| 404 | — | ไม่พบคำสั่งซื้อหรือบัญชี หรือคำสั่งซื้อไม่ตรงกับที่ระบุในสิทธิ์ |
| 409 | `SOURCE_HAS_DATA` | บัญชีที่ใช้อยู่มีข้อมูลแล้ว เชื่อมอัตโนมัติไม่ได้ ต้องให้แอดมินจัดการ |
| 409 | `ALREADY_LINKED` | บัญชีเดิมมีช่องทางประเภทนี้ผูกอยู่แล้ว แปลว่าเป็นคนละบัญชีของช่องทางนั้น |

### 9.3 `PATCH /api/shops/{id}` — เปลี่ยนพฤติกรรม

รับช่อง `coverImage` เพิ่ม (ค่าที่ได้จากการอัปโหลดไฟล์)

**แก้ช่องโหว่:** เดิมปลายทางนี้ส่งเนื้อหาคำขอทั้งก้อนเข้าสู่คำสั่งปรับปรุงฐานข้อมูลโดยไม่กรอง ทำให้สมาชิกร้านเขียนทับช่องใดก็ได้ในตาราง เช่น เจ้าของร้าน ประเภทร้าน ชื่อย่อสาธารณะ หรือสถานะการลบ ปัจจุบันชั้นบริการคัดเฉพาะช่องที่อนุญาตและรับเฉพาะค่าที่เป็นข้อความ ช่องอื่นที่ส่งมาจะถูกละทิ้งเงียบ ๆ

ช่องที่แก้ได้: ชื่อร้าน คำอธิบาย โลโก้ ภาพหน้าปก หมวดหมู่ ที่อยู่ ประเภทธุรกิจ
