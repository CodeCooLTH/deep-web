# Design Spec — ระบบ "พนักงาน" (Shop Staff Invite via Link) — feature 00012

- **วันที่:** 2026-07-04
- **Feature no.:** 00012 — Shop Staff Invite Links
- **สถานะ:** Design (brainstorming) — รอ user review ก่อนทำ implementation plan
- **ต่อยอดจาก:** feature 00008 "Business Account & Packages" (`ShopMember`, `ShopInvite`, `BusinessPackageSubscription`)

---

## 1. เป้าหมาย (Goal)

ให้เจ้าของร้าน **BUSINESS** เชิญคนอื่นเข้ามาเป็น **แอดมิน/พนักงาน** ของร้าน ด้วย **ลิงก์แชร์** (`deepthailand.app/i/<slug>`) แทนการกรอกเบอร์/อีเมลทีละคน โดย:

- ลิงก์ **unique + reusable** (ใช้ซ้ำได้จนหมดอายุ) + **มีเวลาหมดอายุ** + revoke ได้
- ผู้ถูกเชิญเปิดลิงก์ → login/register (Facebook/LINE/เบอร์ OTP) → เข้าร้านเป็นแอดมิน
- ผู้ถูกเชิญ **ไม่ถือเป็น seller** (ไม่มีร้านของตัวเอง) — แต่ **ขอเปิดร้านเองได้** ภายหลัง
- ถ้าเป็นสมาชิกร้านเดียว → เข้าร้านนั้นอัตโนมัติ; ถ้าหลายร้าน → หน้าเลือกร้านก่อน
- ย้ายการจัดการพนักงานไปเป็น **เมนูซ้าย "พนักงาน"** → route `/admins`

## 2. ขอบเขต (Scope)

**In scope**
- Model ใหม่ `ShopInviteLink` (reusable link) + service + API (สร้าง/ลิสต์/revoke/accept)
- หน้า landing สาธารณะ `/i/[slug]` (login/register + accept) — host บน seller subdomain
- proxy redirect `deepthailand.app/i/*` → `seller.deepthailand.app/i/*`
- เมนูซ้าย "พนักงาน" + หน้า `/admins` (list สมาชิก + จัดการลิงก์เชิญ)
- Lazy Personal shop (เลิก auto-create ตอน login) + ทาง "เปิดร้านของฉัน"
- Post-login routing: 1 ร้าน→เข้าเลย, ≥2 ร้าน→หน้าเลือกร้าน `/choose-shop`
- คงเงื่อนไข **BUSINESS + paid package** + โควตา `maxAdminsPerBusiness`

**Out of scope**
- Role ย่อยกว่า ADMIN (permission granularity) — role คงเป็น `ADMIN` เท่านั้น (field เผื่ออนาคตไว้แล้ว)
- เชิญเข้า PERSONAL shop (เฉพาะ BUSINESS)
- Email/SMS ส่งลิงก์อัตโนมัติ (owner คัดลอกลิงก์ไปแชร์เอง)
- ระบบ audit log การเข้า/ออกของแอดมิน (Phase 2)

## 3. สถาปัตยกรรม & Data model

### 3.1 คงไว้ (reuse จาก 00008)
- `ShopMember { shopId, userId, role: "OWNER"|"ADMIN" }` — **SSOT ของสมาชิกร้าน** (1 user หลายร้าน)
- `BusinessPackageSubscription` — ขับโควตา `maxAdminsPerBusiness` ต่อ tier
- `session.user.activeShopId` / `activeShopRole` — "ร้านปัจจุบัน" ที่ acting อยู่ (สลับได้)
- helpers `src/lib/shop-context.ts` (`isShopMember`, `resolveActiveShopContext`, `requireActiveShop`)

### 3.2 เพิ่มใหม่ — `ShopInviteLink`
```prisma
model ShopInviteLink {
  id              String    @id @default(cuid())
  shopId          String
  slug            String    @unique          // อยู่ใน URL /i/<slug>; random [A-Za-z0-9] ~12 char
  role            String    @default("ADMIN") // future-proof เท่านั้น
  createdByUserId String
  expiresAt       DateTime                    // บังคับมีวันหมดอายุ
  revokedAt       DateTime?                   // owner กด revoke
  createdAt       DateTime  @default(now())

  shop      Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
  createdBy User @relation("ShopInviteLinkCreatedBy", fields: [createdByUserId], references: [id])

  @@index([shopId, revokedAt])
}
```
- **slug เก็บ plaintext** (ต่างจาก sms-code ที่ hash) เพราะ reusable + ต้องแสดงลิงก์ซ้ำในหน้า list ให้ owner คัดลอกได้อีก. เป็น capability-URL ความเสี่ยงต่ำ (จำกัดด้วย expiry + revoke + โควตา + ต้อง login ก่อน accept)
- ผูก membership ที่ join ผ่านลิงก์: เพิ่ม `ShopMember.invitedViaLinkId String?` (optional, ไว้ trace) — ไม่บังคับ, ทำได้ Phase 2 ถ้าไม่จำเป็น

### 3.3 Deprecate (ไม่ลบ DB)
- `ShopInvite` (contact-match) — **หยุดสร้างใหม่** + ซ่อน UI/route เดิม (`InviteMemberForm`, `PendingInvitesTable`, `POST .../invites`, `POST /api/invites/[inviteId]/accept`)
- **ไม่ drop model/table** เพราะ prod DB แชร์กับ dev (ดู `docs/conventions/prisma-shared-db-drift.md`) → ใช้ `migrate deploy` + hand-written migration; แถว PENDING เดิม (ถ้ามี) ปล่อยค้าง/ยกเลิกด้วย data ทีหลัง

### 3.4 Migration
- hand-written migration เพิ่มตาราง `ShopInviteLink` + (optional) column `invitedViaLinkId` — apply ด้วย `prisma migrate deploy -e .env.local` **หลังขอ user ยืนยัน** (touch prod DB ที่แชร์). restart dev server หลัง migrate (stale Prisma client)

## 4. Flow หลัก

### 4.1 สร้างลิงก์ (owner)
หน้า `/admins` → ปุ่ม "สร้างลิงก์เชิญ" → เลือกอายุ (เช่น 24 ชม./7 วัน/30 วัน) → `POST /api/shops/current/invite-links`
- guard: `activeShop.kind==="BUSINESS"` + `activeShopRole==="OWNER"` + package ACTIVE + ยังไม่ล็อก
- gen slug (`crypto` random, unique retry) → insert → คืน full URL `https://deepthailand.app/i/<slug>`

### 4.2 เปิดลิงก์ (invitee) — landing `/i/[slug]`
1. `deepthailand.app/i/<slug>` → **proxy redirect → `seller.deepthailand.app/i/<slug>`** (login/accept เกิดใน seller session; เลี่ยงปัญหา session ข้าม subdomain)
2. resolve slug → ร้าน. ถ้า invalid/expired/revoked → หน้า `/i/invalid` (ข้อความกลาง ๆ ไม่รั่วเหตุผล)
3. **ยังไม่ login** → แสดง "ร้าน {shopName} เชิญคุณร่วมทีมเป็นแอดมิน" + ปุ่ม Facebook / LINE / เบอร์ OTP (callbackUrl กลับมา `/i/<slug>`)
4. **login แล้ว** → ปุ่ม "ยอมรับคำเชิญ" → `POST /api/i/<slug>/accept`

### 4.3 Accept (`POST /api/i/[slug]/accept`)
ตรวจตามลำดับ (fail-closed, ข้อความ error สุภาพ):
1. slug valid + `revokedAt==null` + `expiresAt > now`
2. ไม่ใช่ owner ของร้านนี้เอง / ยังไม่ได้เป็น `ShopMember` อยู่แล้ว (idempotent: ถ้าเป็นแล้ว → เข้าเลย)
3. โควตา: `count(ShopMember where shopId, role=ADMIN) < maxAdminsPerBusiness` (จาก package ของ owner)
4. สร้าง `ShopMember(shopId, userId, role="ADMIN")`
5. set `activeShopId = shopId` (ผ่าน NextAuth `session.update`) → redirect `/dashboard`

### 4.4 Post-login routing (1 vs หลายร้าน)
resolve `ShopMember[]` ของ user:
- **0 ร้าน** (ยังไม่เป็น seller + ไม่ถูกเชิญ) → หน้าชวน: "เปิดร้านของฉัน" / "มีลิงก์เชิญ? วางที่นี่"
- **1 ร้าน** → `activeShopId` = ร้านนั้น → `/dashboard`
- **≥2 ร้าน** → `/choose-shop` (การ์ดเลือกร้าน; ต่อยอด `switch-context` เดิม) → เลือก → set activeShopId → `/dashboard`

### 4.5 Lazy Personal shop
- **ถอด** การ auto-call `ensurePersonalShop` ตอน login/เข้า seller layout
- `needsOnboarding` เดิม `=!shopSlug` → แก้เป็น: **บังคับ onboarding เฉพาะเมื่อ user ตั้งใจเป็น seller** (มี Personal shop ที่ slug ว่าง). ผู้ถูกเชิญ (ADMIN ของ business, ไม่มี Personal shop) → **ไม่โดนเด้ง onboarding**
- ทาง "เปิดร้านของฉัน" (ใน `/choose-shop` / เมนู) → สร้าง Personal shop (`isShop=true`) → เข้า onboarding wizard เดิม
- ⚠️ **ต้อง audit downstream** ทุกจุดที่สมมติ Personal shop ต้องมี (`getPersonalShop`, layout guard, proxy redirect, session callback) — ทำเป็น task แรก ๆ ของ plan

## 5. UI

### 5.1 เมนูซ้าย
- เพิ่ม item **"พนักงาน"** ใน `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` (section STORE หรือ CUSTOMERS) → `url: /admins`, icon tabler (เช่น `tabler-users-group` — **ยืนยัน icon กับ user**)
- แสดงเฉพาะเมื่อ `activeShop.kind==="BUSINESS"` + `activeShopRole==="OWNER"` (runtime filter แบบเดียวกับ `applyInventoryGate`)

### 5.2 หน้า `/admins` (Paces)
- **การ์ดสมาชิก**: list `ShopMember` ทั้งหมด (OWNER + ADMIN) — reuse `CurrentMembersTable` + `RowActionDeleteButton` (ลบ = owner only, ลบตัวเอง/owner ไม่ได้)
- **การ์ดลิงก์เชิญ**: ลิงก์ที่ยัง active (ไม่หมดอายุ/ไม่ revoke) — แสดง URL + วันหมดอายุ + ปุ่มคัดลอก + revoke; ปุ่ม "สร้างลิงก์เชิญ" (เลือกอายุ)
- PII: mask ที่ RSC boundary (ตาม memory `feedback_rsc_pii_neutralize_at_source`)

### 5.3 หน้า `/i/[slug]` landing + `/choose-shop`
- ต้องผ่าน **safepay-ux** ออก Design Spec ก่อน (Hard Rule 8) — seller/Paces `theme/paces/Docs/index.html` (landing อาจใช้ AuthCardShell เดียวกับ onboarding/auth split)
- ทุก UI: Paces primitive, ไม่มี emoji (Hard Rule 12), `pacesToast`/Swal, font Anuphan

## 6. Security & Edge cases
- capability-URL: slug เดา/brute ยาก (random ≥12 char) + rate-limit accept ต่อ IP (reuse `api-rate-limit`/`sms-consume-rl` pattern)
- โควตาเช็ค **ตอน accept** (reusable link อาจมีคนกดพร้อมกัน) → conditional insert / transaction กัน over-quota (pattern `updateMany` guard เหมือน wallet/sms-code)
- owner กด revoke → ลิงก์ตายทันที (คนที่ join ไปแล้วยังเป็นสมาชิก จนกว่าจะถูกลบ)
- package downgrade/หมดอายุ → เกินโควตา admin: คงสมาชิกเดิม แต่บล็อกการ accept ใหม่ (ตาม lock logic 00008)
- ถอด ensurePersonalShop → กัน regression: user เดิมที่มี Personal shop อยู่แล้วต้องไม่กระทบ
- ป้องกันเชิญตัวเอง / accept ซ้ำ (idempotent)

## 7. ผลกระทบ/ความเสี่ยง
- **สูง:** Lazy Personal shop แตะ invariant กลาง (session/onboarding/proxy) — ต้อง audit + regression test รอบด้าน
- **กลาง:** cross-subdomain (proxy redirect) + callbackUrl หลัง social login ต้องกลับ `/i/<slug>` ถูก subdomain
- **กลาง:** shared prod DB → migration ต้อง hand-written + user ยืนยัน

## 8. Deliverables (Documentation-First, Hard Rule 11)
feature 00012 ต้องมีโฟลเดอร์ `docs/20 - Features/00012 - Shop Staff Invite Links/` (PRD/BRD/SRS/SDS/DATABASE/API/Tests) — ทำต่อในขั้น plan/implement. Design spec นี้ + HTML mockup 3 devices เป็น input.

## 9. เปิดค้าง (ต้องถาม/ยืนยันก่อน implement)
- icon เมนู "พนักงาน" + icon ต่าง ๆ (Hard Rule 12: ห้ามเดา icon)
- ตัวเลือกอายุลิงก์ default (24ชม./7วัน/30วัน?)
- ผู้ถูกเชิญที่ยังไม่มี account — register ด้วย social ได้เลย หรือมีขั้นยืนยันเบอร์ก่อน?
