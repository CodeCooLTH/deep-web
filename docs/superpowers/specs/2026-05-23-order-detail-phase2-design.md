# Order Detail Phase 2 — Slip Attachment + Digital Access Link — Design Spec

> **วันที่:** 2026-05-23 · **สถานะ:** design approved (user "ลุยเลย") → รอ implementation plan
> **ต่อจาก:** Order Detail V1 port (SIGNED-OFF) — ปลดล็อก OOS-1 (slip) + OOS-2 (digital link) ที่ถูก defer
> **Branch:** `feat/seller-orders-phase-a` · buyer = Vuexy/MUI, seller = Paces

---

## 1. Goal

ปลดล็อก 2 ส่วนที่ defer จาก V1 port:
- **OOS-1 — สลิปโอนเงิน** (scenario 1/2): buyer แนบสลิปบน transfer PENDING order
- **OOS-2 — ลิงก์เข้าถึง digital** (scenario 8): seller ส่งมอบ URL, buyer เปิดได้

ทั้งคู่ใช้ prior art ที่มีอยู่ (storage abstraction, `/api/files` gate, dedicated order-action endpoints) — ไม่สร้างของใหม่จากศูนย์.

---

## 2. Key decisions (จาก brainstorm Q&A)

| # | คำถาม | คำตอบที่เลือก |
|---|-------|--------------|
| Q1 | slip มีบทบาทใน state machine? | **แนบไว้เฉย ๆ ไม่เปลี่ยน state** (ง่ายสุด) — ไม่มี PAID state, ไม่มี requiresSlip toggle |
| Q2 | ใครดูรูปสลิปได้? | **seller(owner) + admin เท่านั้น** (sensitive, no-cache — ตาม TopUp slip). buyer guest อ่าน /api/files ไม่ได้ → preview client-side หลัง upload เท่านั้น |
| Q3 | digital ส่งมอบยังไง? | **URL field** `Order.accessUrl` — seller ใส่ที่ seller order detail; buyer เห็น "เปิด" button |

---

## 3. Data model — additive migration (nullable, no backfill)

```prisma
model Order {
  // ... existing fields
  slipFileId String?   // fileId ของสลิปโอนเงิน (storage); null = ยังไม่แนบ (OOS-1)
  accessUrl  String?   // URL ส่งมอบ digital order; null = ยังไม่ส่งมอบ (OOS-2)
}
```

- ทั้ง 2 nullable → ไม่ break order เดิม, ไม่ต้อง backfill.
- ไม่มี `requiresSlip` (Q1 = attach-only, ไม่ใช่ toggle).
- migration ผ่าน `safepay-database` review (additive ปลอดภัย).

---

## 4. Buyer flow — slip (OrderDetailMobile, scenarios 1/2)

### Visibility predicate (pure helper — extend `src/lib/order-display.ts` หรือ inline)
```
showSlipZone = order.status === 'PENDING' && !isCODPayment(order.paymentMethod)
```
(transfer PENDING เท่านั้น — COD/scenario 3 ไม่มี slip)

### Two states
- `slipFileId == null` → **slip-empty**: zone อัปโหลด ("อัปโหลดสลิปการโอนเงิน", "≤ 5MB", ปุ่ม "เลือกรูปสลิป") — ตาม mockup `.slip-empty`
- `slipFileId != null` → **slip-done**: การ์ด "แนบสลิปแล้ว ✓" + filename/doc-icon + ปุ่ม "เปลี่ยน" — ตาม mockup `.slip-done`. **ไม่โชว์รูปจริง** (guest อ่าน /api/files ไม่ได้); โชว์ client-side `URL.createObjectURL` preview เฉพาะรอบที่เพิ่ง upload, reload แล้วเหลือ text/icon

### Upload mechanics (2-step, reuse prior art)
1. client POST `multipart/form-data` → `POST /api/upload` → `{ fileId }` (reuse — `validateUpload`: ≤5MB, jpeg/png/webp/pdf)
2. client POST `POST /api/orders/[token]/slip` `{ contact, fileId }` (หรือ `{ smsUnlock: true, fileId }` สำหรับ SMS flow) → server set `Order.slipFileId`
3. optimistic UI → slip-done (เก็บ object URL ไว้โชว์ preview รอบนี้)

**ไม่เปลี่ยน state.** confirm CTA เดิม ("ยืนยันการชำระเงิน") ทำงานเหมือนเดิม (PENDING→CONFIRMED) แยกจาก slip.

---

## 5. Buyer flow — digital access link (OrderDetailMobile, scenario 8)

- แสดงการ์ด "การเข้าถึง / ลิงก์เข้าถึง" เมื่อ `fulfillmentMode === 'NO_SHIPPING'` (digital/service) **และ** `accessUrl != null`
- ปุ่ม "เปิด" = anchor `href={accessUrl}` `target="_blank"` `rel="noopener noreferrer"` — render ปุ่มเฉพาะเมื่อ `accessUrl` scheme ∈ {http, https} (กัน `javascript:`/`data:`)
- `accessUrl == null` → ซ่อนการ์ด (keep simple; ไม่โชว์ "รอส่งมอบ")

---

## 6. Seller flow (Paces `(paces)/seller/(dashboard)/orders/[token]/`)

### View slip
- ถ้า `slipFileId` set → แสดง thumbnail ผ่าน `<img src="/api/files/{slipFileId}">` ใน `OrderActions.tsx`/`OrderSummary.tsx` (seller owner เข้าถึงได้ผ่าน gate ใหม่ §7). คลิกเปิดดูเต็มได้ (เหมือน TopUp `SlipImageClient` pattern)

### Set accessUrl (digital orders เท่านั้น)
- field URL + ปุ่ม "บันทึกลิงก์" ใน `OrderActions.tsx` → `POST /api/orders/[token]/access-url` `{ url }` (session owner only)
- แสดงเฉพาะเมื่อ order เป็น digital/NO_SHIPPING

---

## 7. APIs (ใหม่ — ตาม dedicated-endpoint convention: cancel/confirm/ship/review)

| Endpoint | Auth | Body (Valibot) | Action |
|----------|------|----------------|--------|
| `POST /api/orders/[token]/slip` | buyer — contact parity (mirror cancel route) หรือ SMS-unlock cookie | `{ contact: string }` หรือ `{ smsUnlock: true }` + `{ fileId: string }` | set `slipFileId` (เฉพาะ PENDING; ถ้า CONFIRMED/CANCELLED → 400) |
| `POST /api/orders/[token]/access-url` | seller — session owner ของ shop เท่านั้น (ไม่ใช่ buyer) | `{ url: string }` — Valibot: scheme http/https only | set `accessUrl` |

- service layer: เพิ่ม `attachSlip(token, fileId, contact?)` + `setAccessUrl(token, url, shopOwnerId)` ใน `order.service.ts`
- ทั้งคู่ Valibot schemas ใน `src/lib/validations.ts`

---

## 8. `/api/files/[fileId]` access gate (เพิ่ม order-slip case)

ปัจจุบัน gate: KYC docs (owner/admin), TopUp slip (shop-owner/admin), public (product images). **เพิ่ม**:
- `fileId === Order.slipFileId` (findFirst) → **sensitive**: viewable เฉพาะ seller(shop owner ของ order นั้น) + admin → `private, no-cache` + `nosniff`. mirror block ของ TopUp slip เป๊ะ (indexed query ต่อ request ยอมรับได้ — slip ไม่ใช่ public traffic สูง)
- buyer (guest, ไม่มี session) → 401/403 (สอดคล้อง Q2: buyer ไม่ดูสลิปตัวเองผ่าน server)

---

## 9. Security (→ safepay-security review หลัง dev)

- **File upload:** reuse `validateUpload` (≤5MB; jpeg/png/webp/pdf) — server-side enforce ใน /api/upload (มีอยู่แล้ว)
- **accessUrl XSS/redirect:** server-side validate scheme ∈ {http, https} (Valibot) — reject `javascript:`/`data:`/อื่น ๆ; buyer-side render `rel="noopener noreferrer"`. กัน stored-XSS ผ่านปุ่ม "เปิด"
- **slip attach authz:** buyer contact parity (เหมือน cancel) — guest ที่ phone ตรง / SMS-unlock เท่านั้น; order ที่ยังไม่มี buyerContact + ไม่ใช่ owner → ปฏิเสธ (เหมือน cancel RC)
- **accessUrl authz:** shop-owner session เท่านั้น (body ไม่ override owner — กัน spoof)
- **slip file serving:** sensitive gate §8 — ไม่ leak สลิปสู่ public/guest
- ไม่มี env/secret ใหม่

---

## 10. Testing

- **Vitest (pure):** URL-scheme validator (accept http/https; reject javascript:/data:/ftp); `showSlipZone` predicate (PENDING+transfer = true; COD/SHIPPED/CONFIRMED = false)
- **QA seed extension** (`prisma/qa-seed-order-detail.ts`): transfer PENDING order ที่มี slipFileId (seeded fileId) + order digital ที่มี accessUrl; เพิ่ม URL ใน scenario ที่มีอยู่
- **Browser QA (Chrome DevTools, deepth.local):** scenario 1 (upload slip → slip-done), scenario 2 (slip-done seeded), scenario 8 (accessUrl → "เปิด" ทำงาน, target=_blank); seller order detail (เห็น slip thumbnail + set accessUrl); /api/files gate (guest ขอ slip → 403)

---

## 11. Out of scope (keep tight)

- ❌ payment state machine / PAID state (Q1 = attach-only)
- ❌ `requiresSlip` per-order toggle (Q1)
- ❌ slip OCR / auto-verify / amount-match
- ❌ multi-file slip (1 ไฟล์/order)
- ❌ buyer re-view slip image ผ่าน server (Q2 — guest ไม่มี session)
- ❌ admin slip UI ใหม่ (ใช้ /api/files gate เดิม + admin มี session)
- ❌ accessUrl set ตอนสร้าง order (Q3 = ที่ seller order detail หลังสร้าง)

---

## 12. Workflow note

≥3 tasks → **agent-team-phase**: Gate 0 scope baseline → Planner → tasks (migration / buyer slip+link UI / seller UI / 2 APIs+service / files gate / validations+tests) → Reviewer → **safepay-security** (touches upload+authz+url) → QA → Gate 2 sign-off → retro. `safepay-database` review สำหรับ migration. mockup SSOT visual = `docs/mockups/order-detail-scenarios.html` (slip-empty/slip-done/access card มีครบ).
