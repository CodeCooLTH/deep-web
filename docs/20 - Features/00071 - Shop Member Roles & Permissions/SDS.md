---
title: "SDS — บทบาทและสิทธิ์สมาชิกร้าน (Shop Member Roles & Permissions)"
owner: shinobu22
status: draft
created: 2026-10-10
tags: [feature, sds, roles, permissions]
related: ["[[SRS]]", "[[API]]", "[[DATABASE]]", "[[TestCase]]"]
---

> **โมดูล:** 00071 - Shop Member Roles & Permissions
> **ประเภทเอกสาร:** System Design Spec (SDS)
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-10-10
> **สถานะ:** P1 implement แล้ว · **P2 implement แล้ว** (โมเดล `roles` + CHECK + มอบบทบาทตอนเชิญ/แก้สมาชิก) · **P3 implement แล้ว** (ด่านกลาง + ทะเบียน + inventory test + เมนูจากกฎเดียว + Prisma global omit ต้นทุน)
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# SDS: บทบาทและสิทธิ์สมาชิกร้าน (System Design Spec)

---

## 1. บทนำ & References

### 1.1 วัตถุประสงค์
ออกแบบการ implement ตัวตัดสินสิทธิ์กลาง ระดับเงิน และโมเดลบทบาท ตาม [[SRS]] สำหรับ DEV/QA/DevOps

### 1.2 ขอบเขตการออกแบบ
- เปลี่ยน: `src/lib/shop-permissions.ts` (ใหม่) · guard ของ route/RSC · service/DAL ที่คืนฟิลด์เงิน · `*-access` services · `shop-member.service` · invite services · schema 3 ตาราง (P2) · เมนู
- ไม่เปลี่ยน: สูตรยอดขาย/กำไร · โควตา/กติกาเจ้าของหลัก (00012) · ฝั่งผู้ซื้อ

### 1.3 เอกสารอ้างอิง
| เอกสาร | ความสัมพันธ์ |
|--------|-------------|
| [[SRS]] ของโมดูลนี้ | TFR-001..007 |
| [[BRD]] ของโมดูลนี้ | §8.3 ตารางสิทธิ์ SSOT · §8.5 เมนู |
| [[PRD]] ของโมดูลนี้ | เป้าหมายและ KPI |
| `docs/conventions/rule-must-be-enforced-not-described.md` | ทุกกฎต้องมีเทสที่แดงเมื่อละเมิด |
| `docs/conventions/session-exists-is-not-identity.md` | มี session ≠ รู้ว่าเป็นใคร |

---

## 2. Architecture Overview

### 2.1 มุมมองสถาปัตยกรรม
แยก "ตัดสิน" (pure) ออกจาก "บังคับ" (guard ที่ route) และ "ตัดข้อมูล" (service/DAL) ให้ตารางสิทธิ์อยู่ที่เดียว ตามแพตเทิร์นเดียวกับ `shop-member-rules.ts` ของ 00012 (กฎ pure + service เป็น I/O)

```mermaid
graph TD
    Client[Browser / DeepSellerApp WebView]
    Route[Route handler / RSC page]
    Ctx[resolveActiveShopContext อ่าน ShopMember สด]
    Perm[shop-permissions: can / moneyLevel / rolesFromMembership]
    Svc[Service / DAL ตัดฟิลด์เงิน]
    Menu[เมนูเดสก์ท็อป + มือถือ]
    DB[(PostgreSQL / Prisma)]

    Client --> Route
    Route --> Ctx
    Ctx --> DB
    Route --> Perm
    Route --> Svc
    Svc --> Perm
    Svc --> DB
    Menu --> Perm
```

### 2.2 มุมมองการ Deploy (ถ้าจำเป็น)
ไม่มี topology ใหม่ — Next.js บน Vercel + Supabase เดิม · deploy P2 รัน `prisma migrate deploy` ในตัว (HR15)

---

## 3. Component Design

| Component | หน้าที่ (Responsibility) | Dependency (Submodule / Stack / Store) |
|-----------|--------------------------|-----------------------------------------|
| **`shop-permissions`** | ตาราง capability × บทบาท · `can` · `moneyLevel` · `rolesFromMembership` · ไม่มี I/O | TypeScript pure (`src/lib`) |
| **Guard (route/RSC)** ✅ P3 | อ่านบทบาทสด → ถาม `can` → 403 `FORBIDDEN_ROLE` หรือหน้าแจ้งไม่มีสิทธิ์ · `requireShopCapability` / `gatePage` / `canAccessShopWith` / `listAccessibleShopIds(userId, cap)` / `ForbiddenRoleError` | `src/lib/shop-capability.ts` → `requireShopForRequest` → Prisma `ShopMember` |
| **Money-level slicing** | ตัดฟิลด์เงินใน service/DAL ตาม `moneyLevel` | `src/services/*` |
| **Finance access (`expense/agent-report/product-report`)** | เลิกอ่าน `staffCanViewFinance` ใช้ "การเงินเต็ม = เจ้าของ" | `src/services/*-access.service` |
| **`shop-member.service`** ✅ P2 | `changeMemberRole` (เจ้าของเท่านั้น) · `inviteShopMember` เก็บ `roles` · `acceptShopInvite` คัดลอก `invite.roles` ลง `ShopMember` | Prisma `ShopMember` · `shop-role-assignment.ts` (pure) · `shop-member-errors.ts` |
| **Invite services** ✅ P2 | `invite-link.service` (`createInviteLink` รับ `roles` · accept คัดลอก `link.roles`) | Prisma `ShopInvite`/`ShopInviteLink` |
| **`shop-role-picker`** ✅ P2 | ตรรกะ+ข้อความตัวเลือกบทบาทใน UI (ซ่อน BILLING · ปุ่มบันทึกกดได้ไหม · ลำดับ) — pure, client-safe `src/lib/shop-role-picker.ts` | `STAFF_ROLES` |
| **Menu layer** ✅ P3 | คำนวณเมนู/FAB/แถบล่าง/ทางลัดจาก union ของบทบาท โดยอ่านทะเบียนเดียวกับ `gatePage` | `src/lib/role-nav.ts` (`canSeePage` · `applyCapabilityMenu` · `resolveMobileNav` · `buildFabActions` · `shopQuickLinks`) + `src/lib/seller-menu.ts` |
| **ทะเบียน capability** ✅ P3 | path → เมธอด → cap / คลาส (MEMBER, SELF, BUYER, PUBLIC, PLATFORM_ADMIN, CRON, WEBHOOK + reason) · เหตุที่เป็นไฟล์กลาง: Next 16 ไม่ให้ `route.ts` export นอกจาก handler | `src/lib/route-capabilities.ts` |
| **Route inventory test** ✅ P3 | แดงเมื่อพบ route/หน้าฝั่งร้านที่ไม่ประกาศ capability · key ไม่มีไฟล์จริง · handler ไม่เรียกด่านด้วย literal cap ตรงทะเบียน · คลาสที่ไม่ใช่ cap เรียกตัวหาร้านดิบ · wrapper ใหม่นอก allow-list · หน้า/route แอดมิน cron webhook ไม่เรียกด่านของตัวเอง · PENDING > 0 | Vitest `src/lib/__tests__/route-capability-inventory.test.ts` (มี mutation M1-M20) |
| **Order view by level** ✅ P3 | allow-list ทุกทางออกของออเดอร์/นัดหมายสำหรับระดับ NONE | `src/lib/order-view-by-level.ts` |
| **Order role rules** ✅ P3 | `isBillingOnly` · `isBillingOnlyEditor` · `canEditOrderAs` · `orderEditLockReason` · `isOrderUnpaid` (`order-payment-state.ts`, ต่อยอด `computeOrderMoney`) | `src/lib/order-role-rules.ts` · `src/lib/order-payment-state.ts` |
| **Prisma global omit** ✅ P3 | `OrderItem.cost` / `Product.cost` ไม่ติดมากับ query ปกติ · เจ้าของ opt-in (`select`/`omit:{cost:false}`/`include…omit`) · ไม่ครอบ `$queryRaw`/aggregate | `src/lib/prisma.ts` · ด่าน `cost-optin-guard.test.ts` |

---

## 4. Data Flow

### 4.1 Flow หลัก: ตัดสินสิทธิ์ต่อคำขอ

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Route
    participant X as resolveActiveShopContext
    participant P as shop-permissions
    participant S as Service
    participant DB as PostgreSQL

    C->>R: คำขอ + (capability ที่ route ประกาศ)
    R->>X: ขอบริบทร้าน active
    X->>DB: อ่าน ShopMember ของ user ในร้าน (≤1 query เพิ่ม)
    DB-->>X: role, roles
    X-->>R: roles (ร้าน PERSONAL = OWNER)
    R->>P: can(roles, cap)
    alt ไม่มีสิทธิ์ / อ่านล้ม / ไม่ใช่สมาชิก
        R-->>C: 403 FORBIDDEN_ROLE (RSC: หน้าแจ้งไม่มีสิทธิ์)
    else มีสิทธิ์
        R->>S: เรียก service พร้อม moneyLevel(roles)
        S->>DB: อ่าน/เขียน
        S-->>R: payload ที่ตัดฟิลด์เงินแล้ว
        R-->>C: 200
    end
```

### 4.2 Flow กรณีล้มเหลว / ชดเชย (ถ้ามี)
- อ่านบทบาทล้ม → ปฏิเสธ (fail-closed) ไม่มี fallback เป็นเจ้าของ (P3 S-17 ✅ `resolveSessionActiveShop`)
- ไม่ใช่สมาชิกของร้านที่ระบุทรัพยากร → route ที่รับ `reason:'NOT_MEMBER'` แปลงเป็น 404 (ไม่บอกว่ามีอยู่) · สมาชิกแต่ไม่มี cap → 403 `FORBIDDEN_ROLE`
- เปลี่ยนบทบาทระหว่างใช้งาน: คำขอถัดไปอ่านสดจึงได้สิทธิ์ใหม่ทันที (ไม่ต้อง invalidate cache)
- migration P2 ล้ม = deploy ไม่ขึ้น (HR15 ข้อ 3) ย้อนด้วยการไม่ใช้คอลัมน์ใหม่ (โค้ด P1 ไม่อ่าน `roles`)

---

## 5. Integration Points

| จุดเชื่อม | ประเภท (internal/external/3rd-party) | Protocol / Contract | ความเสี่ยงเมื่อล่ม |
|-----------|--------------------------------------|----------------------|---------------------|
| **กล่องแชทรวม 00037 / unread / แจ้งเตือน / ความคิดเห็น** | internal | กรองรายร้านตาม H1 | ร้านที่ไม่มี H1 รั่วเข้ากล่องรวม |
| **แดชบอร์ด 00069 / Command Center** | internal | ตัดวิดเจ็ตเงินตาม `moneyLevel` (ห้ามเปลี่ยนสูตร) | กราฟยอดขายรั่ว |
| **00067 แท็บการเงินร้านบริการ / 00016 P&L** | internal | F1 เจ้าของเท่านั้น | กำไรรั่ว |
| **00019-ext-mem** | internal | OOS-17 ปิดโดยอ้าง H1 (S-18) | — |
| **iShip** | external | S1 สร้างพัสดุ · S2 ตั้งค่า/เชื่อมบัญชีขนส่ง (เจ้าของ + ผู้ดูแล — มติ C-2) | — |

- **Timeout / Retry / Idempotency:** ไม่มีการเรียกภายนอกใหม่ · `PATCH members` ส่งซ้ำด้วยค่าเดิมได้ผลเดิม
- **สัญญา API เต็ม:** ดู [[API]]

---

## 6. Technical Decisions

### TD-001: เก็บ `role` เดิมและเพิ่ม `roles String[]` (แทนการเปลี่ยนค่า `role`)
- **ตัดสินใจ:** คง `ShopMember.role` = `'OWNER'|'ADMIN'` (เจ้าของ vs พนักงาน) เพิ่ม `roles` = หน้าที่ของพนักงาน
- **เหตุผล:** กติกา 00012 (BR-MR-01..08), `staffCountWhere()`, `canAccessShop`, โค้ดที่เช็ค `role==='OWNER'` ใช้ต่อได้ · migration additive ย้อนกลับได้
- **ทางเลือกที่ตัดทิ้ง:** แทนที่ `role` ด้วยรหัสบทบาทใหม่ — กระทบทุกที่ที่เช็ค role และ DROP/แก้ค่า ผิดกติกา additive
- **ผลกระทบ:** invariant `role='OWNER' ⇒ roles=[]` และ `role='ADMIN' ⇒ 1-4 ค่า` — **ตัดสินแล้ว (P2 มติ 0.3): เพิ่ม DB CHECK 3 ตัว** (`ShopMember_roles_check` · `ShopInvite_roles_check` · `ShopInviteLink_roles_check` ใน migration `20261010120000_shop_member_roles`) บังคับซ้ำที่ service (`src/lib/shop-role-assignment.ts`: `validateAssignableRoles` · `planMemberRoleChange`) · CHECK เป็น unmanaged SQL ห้าม `db pull`/`migrate dev`
- **ศัพท์ (มติ P2):** `ShopMember.role` = ประเภทสมาชิก แสดง "เจ้าของ"/"พนักงาน" · "ผู้ดูแล" = บทบาท `MANAGER` ใน `roles`
- **BILLING:** เลือกได้เฉพาะร้านที่ `canUseAppointments(shop)` (`src/lib/appointments.ts`, vertical `SERVICE_QUEUE`) — ใช้ฟังก์ชันนี้ ห้ามเขียนเทียบ vertical ซ้ำ · ร้านเปลี่ยน vertical ทีหลังแล้ว BILLING เดิมค้างได้ (service ตรวจเฉพาะตอนตั้งชุดใหม่)
- **session (S-17):** `src/lib/session-active-shop.ts` — อ่านสมาชิกล้ม/ไม่เจอ ⇒ ถอยไปร้านส่วนตัว ไม่ถอยเป็นเจ้าของร้านที่ token ชี้ (ไม่มีร้านส่วนตัว ⇒ ไม่มีบทบาท)

### TD-002: ตารางสิทธิ์เป็นโมดูล pure ตัวเดียว
- **ตัดสินใจ:** `src/lib/shop-permissions.ts` ไม่มี I/O · unknown cap = OWNER เท่านั้น
- **เหตุผล:** เทสได้ตรง (ทุกคู่ + mutation) · ทุกที่ (route, service, เมนู) อ่านที่เดียว (BRD §6.1)
- **ทางเลือกที่ตัดทิ้ง:** กระจายเช็ค role ตามไฟล์ — ตกหล่นและเมนูกับ API ไม่ตรงกัน
- **ผลกระทบ:** ทุก route ต้องประกาศ capability (P3 ✅ ทะเบียน `route-capabilities.ts` + inventory test) · P3 เพิ่มชั้น `shop-capability.ts` ที่ต่อ `can()` กับแถวสมาชิกสด (PERSONAL/T4/BILLING ตัดทิ้ง) โดย `shop-permissions.ts` ยังบริสุทธิ์ · capability เพิ่มจากมติ P3: S1 (แยกจัดส่งจาก O4) · F4 · X1-X5

### TD-003: P1 ปิดการเงินก่อนมีโมเดลบทบาท
- **ตัดสินใจ:** P1 ใช้ `rolesFromMembership('OWNER'|'ADMIN')` → `['OWNER']`|`['MANAGER']` โดยไม่แตะ schema · **P2: `rolesFromMembership(role, roles)` อ่านคอลัมน์ `roles`** (OWNER → `['OWNER']` ไม่สน roles · ADMIN → `roles ∩ STAFF_ROLES` เรียงตามลำดับมาตรฐาน · ADMIN ที่ roles ว่าง/แปลก = `[]` ไม่ fallback เป็น MANAGER — fail-closed)
- **เหตุผล:** แก้ "ทุกคนเห็นกำไรขาดทุน" ได้ทันทีโดยไม่ต้อง migrate · P2 แทนที่แหล่งบทบาทเป็น `roles` โดยผลต้องเท่าเดิม (S-9: backfill ADMIN → `['MANAGER']`)
- **ทางเลือกที่ตัดทิ้ง:** รอทำพร้อม P2 — เงินรั่วนานขึ้น
- **ผลกระทบ:** ADMIN เสีย F1-F3/P3 ตั้งแต่ P1 (ผลข้างเคียงที่ตั้งใจ)

### TD-004: ตัดเงินที่ service/DAL ไม่ใช่ที่ UI
- **ตัดสินใจ:** ฟิลด์เงินเต็มไม่ออกจาก service ให้ผู้ที่ไม่ใช่เจ้าของ
- **เหตุผล:** ซ่อน UI ไม่กัน flight payload/API (กฎ 00016: "ต้องไม่อยู่ใน flight payload")
- **ทางเลือกที่ตัดทิ้ง:** ซ่อนเฉพาะ UI — รั่วทาง RSC payload
- **ผลกระทบ:** ทุก DAL ที่มีฟิลด์เงินต้องรับ `moneyLevel` หรือถูกครอบด้วย guard — รายชื่อผิว (P1 สรุปแล้ว): ต้นทุนสินค้า/รายบรรทัด · ยอดสะสมลูกค้า · แดชบอร์ด/Command Center · กระเป๋า/เครดิต AI · รายงานแอดมิน · ค่าใช้จ่าย/P&L/ลูกหนี้/ซีรีส์ยอดขาย — ตัวช่วยอยู่ `src/lib/{dashboard-money,order-cost-redact,agent-revenue-redact,shop-owner,forbidden-role}.ts` และบังคับด้วยเทส `src/lib/__tests__/finance-surface-guard.test.ts` (ไฟล์ page/layout/route ใดเรียกแหล่งเงินโดยไม่มีตัวตัดสินในไฟล์ = เทสแดง ยกเว้นอยู่ใน ALLOW พร้อมเหตุผล)

### TD-005: ปฏิเสธด้วย 403 `FORBIDDEN_ROLE` และหน้าแจ้งไม่มีสิทธิ์
- **ตัดสินใจ:** API → 403 `{ error: 'FORBIDDEN_ROLE' }` · RSC → หน้าแจ้งว่าต้องขอบทบาทไหนจากเจ้าของ
- **เหตุผล:** แยกจาก `FORBIDDEN`/`NOT_OWNER` เดิม ให้ client แสดงข้อความถูก · ไม่ใช้ 404 เงียบ
- **ทางเลือกที่ตัดทิ้ง:** reuse `NOT_OWNER` — ความหมายไม่ตรง (บทบาทอื่นก็เป็นสมาชิก)
- **ผลกระทบ:** error code ใหม่ต้องมี route-catch map และข้อความไทย · P3: `ForbiddenRoleError` (message `'FORBIDDEN'` + `code`) จาก service ถูกแปลงเป็น 403 ที่ route (`OrderRoleRestrictedError`/`OrderLockedForRoleError` สืบจากมัน) · body 403 ไม่มี field เหตุ (ฝั่ง client แยก "ชำระแล้ว" กับ "ไม่ใช่บิลบริการ" จาก 403 ไม่ได้ — ดูหนี้ในแผน P3)

---

## 7. Traceability

| SRS Requirement (TFR/NFR) | SDS Element (component / decision / flow) | สถานะ |
|---------------------------|-------------------------------------------|-------|
| TFR-001 | `shop-permissions` / TD-002 | Draft |
| TFR-002 | Guard / Flow 4.1 / TD-005 | Draft |
| TFR-003 | Money-level slicing / TD-004 | Draft |
| TFR-004 | Finance access / TD-003 | Draft |
| TFR-005 | `shop-member.service` + Invite services / TD-001 | Draft |
| TFR-006 | Guard + ทะเบียน + route inventory + order role rules + order view by level / Flow 4.1 | P3 implement แล้ว |
| TFR-007 | Menu layer (`role-nav.ts`) | P3 implement แล้ว |
| NFR Performance | Flow 4.1 (≤1 query) | Draft |

---

## 8. สรุป (Summary)

เอกสาร SDS นี้กำหนด **การออกแบบเชิงระบบ** ของ **บทบาทและสิทธิ์สมาชิกร้าน (00071)** เพื่อให้ DEV นำไป implement, QA นำความเสี่ยงไปวางแผนทดสอบ, และ DevOps ประเมินผลกระทบ migration ได้ตรงกับข้อกำหนดใน [[SRS]]

**ลำดับการ build ที่แนะนำ:**
- P1: `shop-permissions` + เทส (S-2) → ตัดเงิน service/DAL (S-3) → guard ผิวการเงินเต็ม (S-4) → ยกเลิก `staffCanViewFinance` (S-5) → เมนูการเงิน (S-6)
- P2: schema + migration (S-8) → อ่านบทบาทจาก `roles` (S-9) → UI เชิญ/ตารางสมาชิก (S-10)
- P3: inventory + guard ทุก route (S-12) → แชท (S-13) → บิล/ออเดอร์ (S-14) → ฝ่ายช่าง (S-15) → เมนู (S-16) → fail-closed auth (S-17)

**Open Questions:**
- ~~ต้องเพิ่ม DB CHECK หรือไม่~~ — ตัดสินแล้ว: เพิ่ม (TD-001)
- ~~รายชื่อผิวการเงินที่ต้องตัด~~ — ตัดสินแล้วใน P1 (ดู TD-004 และ finance-surface-guard)
