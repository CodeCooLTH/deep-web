# Order Short Link — Design Spec

- **วันที่:** 2026-06-20
- **สถานะ:** Draft → รอ user review
- **เจ้าของ:** Controller (main session)
- **เกี่ยวข้อง:** ระบบ Order Link (`/o/[token]`), SMS Order Link (Phase 4), `feedback_spec_html_mockup` (ไม่มี mockup — ฟีเจอร์นี้ไม่มี visual ใหม่ ปุ่ม copy เดิม เปลี่ยนแค่สตริงที่ copy)

---

## 1. Goal / แรงจูงใจ

ลิงก์ที่ seller กด **"คัดลอกลิงก์"** ปัจจุบันเป็น UUID เต็ม 36 ตัว เช่น
`https://deepthailand.app/o/add8e24a-b023-48ac-8978-9d5a3954503f` — ยาว ดูไม่สวยเวลา
seller แปะส่งผู้ซื้อเองผ่าน LINE/chat/SMS มือ. ต้องการลิงก์สั้น เช่น
`https://deepthailand.app/o/CAPUYPY6T` โดย**คงพฤติกรรมเดิมทุกอย่าง** (ปลอดภัยเท่าเดิม)

## 2. Decisions (เคาะจาก brainstorm 2026-06-20)

| # | ประเด็น | ตัดสิน |
|---|---|---|
| D1 | พฤติกรรมความปลอดภัย | **กรอกเบอร์ปลดล็อก + ใช้ซ้ำได้** (เหมือน UUID เดิม) — ไม่ auto-unlock, ไม่ single-use |
| D2 | ความยาวรหัส | **8 ตัว** จาก charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` = 32⁸ ≈ 1.1×10¹² (40-bit) |
| D3 | ฝั่ง admin | **ใช้ UUID ต่อ** (ลิงก์ "ดู" ภายใน ไม่ใช่ share) |
| D4 | SMS ในแอป | **ไม่แตะ** — ใช้ 12-char single-use auto-unlock code ของตัวเองต่อ |
| D5 | UUID เดิม | **เปิดได้ตลอด** (backward compat 100%) |

> **เหตุผล D1/D2:** copy-link ถูก forward ต่อง่าย → auto-unlock จะเสี่ยง. คง phone-unlock
> ทำให้แม้รหัสหลุด/ถูกเดา ก็ยังเปิดเนื้อหาไม่ได้ถ้าไม่รู้เบอร์ผู้ซื้อ. 40-bit + network brute
> = ไม่ realistic; phone-unlock เป็นด่านป้องกันเนื้อหาอยู่แล้ว (accepted risk AR-1 §9)

## 3. Data Model

เพิ่ม field ใน `model Order` (`prisma/schema.prisma`):

```prisma
shortCode  String?  @unique   // permanent short alias สำหรับ copy/share link (8-char)
```

- **nullable** ชั่วคราว: รองรับ row เก่าตอน migrate → backfill เติมครบ → แอปเซ็ตเสมอตอนสร้าง
- `@unique`: กันชน + ให้ lookup ด้วย `findUnique({ where: { shortCode } })` ได้
- ไม่ตั้ง `@default` (DB default สร้าง random charset-string ไม่ได้ + ต้อง retry ชนใน app)

## 4. การสร้างรหัส (generation)

**4.1 Service ใหม่** — เพิ่มใน `src/services/order.service.ts` (หรือ util ร่วม):

```ts
const SHORT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // เดียวกับ sms-code.service
function genShortCode(len = 8): string {
  const bytes = randomBytes(len);
  let code = "";
  for (let i = 0; i < len; i++) code += SHORT_CHARSET[bytes[i] % 32];
  return code;
}
```

**4.2 Integrate ใน `createOrder`** — ห่อ `prisma.order.create` ด้วย retry loop:
generate shortCode → create → ถ้า `P2002` (unique violation บน shortCode) → regenerate retry ≤5 ครั้ง → เกินนั้น throw (โอกาสชน 5 รอบ ติดกัน ≈ 0). publicToken ยังใช้ `@default(uuid())` เหมือนเดิม

**4.3 Backfill** — สคริปต์ `prisma/backfill-order-shortcode.ts`:
loop ทุก order ที่ `shortCode == null` → generate (retry ชนใน-loop) → update. รันครั้งเดียวหลัง migrate

## 5. Routing — discriminator (หัวใจ)

แก้ `src/app/(marketing)/o/[token]/page.tsx` — เพิ่ม **สาขาที่ 3** ในลำดับ discriminate:

```
1. UUID v4 (UUID_V4_RE)            → flow เดิม (phone unlock)         [ไม่แตะ]
2. 12-char SMS code (SMS_CODE_RE)  → redirect /api/o/sms/{code}       [ไม่แตะ]
3. 8-char permanent (SHORT_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
     → findUnique order by shortCode
        - เจอ  → redirect() ไป /o/{order.publicToken}  (เข้า flow phone-unlock เดิม)
        - ไม่เจอ → redirect /o/link-invalid  (RC-2 uniform เดิม)
4. อื่น ๆ                          → redirect /o/link-invalid          [เดิม]
```

- **ลำดับสำคัญ:** เช็ค UUID และ 12-char ก่อน 8-char (length-disjoint จึงไม่ทับกัน แต่คงลำดับ LOCKED เดิม)
- **redirect→UUID:** ไม่ duplicate logic unlock (SSOT = สาขา UUID). ข้อแลก: address bar
  เปลี่ยนเป็น UUID หลังคลิก — ยอมรับได้ (ผู้ซื้อคลิกแล้ว). ลิงก์ที่ "copy/แชร์" ยังเป็นตัวสั้น
- redirect แบบ permanent ไม่ได้ (ต้อง lookup) → ใช้ 307 ปกติ

## 6. จุดที่เปลี่ยนไปใช้ shortCode

ส่วน **copy/share ฝั่ง seller** — เปลี่ยน `/o/${publicToken}` → `/o/${shortCode}`:

- `OrderCopyLink` / `CopyLinkButton` — หน้า seller order detail
- `OrderActions` — seller orders list (resolve URL)
- `BulkActionBar` — copy หลาย order พร้อมกัน

**ต้อง propagate `shortCode`** จาก server (order page / list query) ลง props ของ component
เหล่านี้ (ปัจจุบันส่ง `publicToken`/`token`). เพิ่ม field `shortCode` ใน data mapping

**คงเดิม (ไม่แตะ):**
- SMS ในแอป (`send-sms/route.ts`) — 12-char single-use (D4)
- admin order/users view link — UUID (D3)
- public order page / QR (ถ้ามี) — ไม่อยู่ใน scope รอบนี้

## 7. Migration Plan

1. แก้ `schema.prisma` เพิ่ม `shortCode String? @unique`
2. `prisma migrate dev --name order_short_code` (สร้าง migration file) — **ขอ user ยืนยันก่อน apply**
   เพราะ DB dev/prod แชร์กัน (memory `project_prisma_migration_env_targets`)
3. apply prod: `prisma migrate deploy -e .env.local` (ยืนยันอีกครั้งก่อนแตะ prod)
4. **restart dev server** หลัง migrate (กัน stale Prisma client → session 500; บทเรียน seller-auth)
5. รัน backfill: `npx tsx prisma/backfill-order-shortcode.ts -e .env.local`

## 8. Backward Compatibility

- UUID link เดิมทุกอันเปิดได้ตลอด (สาขา 1 ไม่แตะ)
- SMS short-code เดิมไม่กระทบ (สาขา 2 ไม่แตะ)
- order เก่าที่ backfill แล้วมี shortCode → copy ได้ลิงก์สั้น; ก่อน backfill เสร็จ
  component ต้อง fallback ไป publicToken ถ้า `shortCode == null` (กัน undefined ใน URL)

## 9. Accepted Risks

- **AR-1 (enumeration):** 8-char = 40-bit เดาได้ในทางทฤษฎี → แต่ phone-unlock ป้องกัน
  เนื้อหา + ไม่ leak ว่า order มีจริงไหม (ทั้งเจอ/ไม่เจอ redirect link-invalid เหมือนกัน — RC-2).
  ถ้าต้องการ margin มากขึ้นในอนาคต ขยายเป็น 10-char ได้โดยไม่ break (regex + gen len)

## 10. Testing

- **Unit:** `genShortCode` — ความยาว 8, อยู่ใน charset, ไม่มี 0/O/1/I; retry loop เมื่อ mock ชน
- **E2E (Playwright):** seller copy short link → เปิด `/o/{8-char}` → redirect ไป `/o/{uuid}` →
  phone-unlock ผ่าน → เปิดซ้ำอีกครั้งยังได้ (reusable, ไม่ consume)
- **Regression:** UUID link + SMS 12-char ยังทำงานเดิม

## 11. Out of Scope

- เปลี่ยน SMS ในแอปให้ใช้ permanent code (คง single-use auto-unlock)
- admin view link เป็นตัวสั้น
- custom/vanity short code (seller ตั้งเองได้) — feature อนาคต
- QR code ของ short link
