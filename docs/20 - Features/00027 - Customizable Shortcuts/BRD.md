---
title: "BRD — Customizable Shortcuts"
owner: shinobu22
status: draft
module: M00027-CustomizableShortcuts
version: "1.0"
created: 2026-08-02
tags: [feature, seller, dashboard, command-center, navigation, personalization, brd]
related: ["[[PRD]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00027-CustomizableShortcuts
> **ประเภทเอกสาร:** Business Requirements Document (BRD) — NON-TECHNICAL
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-02
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** BA (ดู [[Feature-Docs-Ownership]])

# BRD: เมนูลัดที่ตั้งค่าเองได้ (Customizable Shortcuts) (Business Requirements Document)

---

## 1. บทนำ

### 1.1 วัตถุประสงค์ของเอกสาร

เอกสารนี้มีวัตถุประสงค์เพื่อ:
1. กำหนด Functional Requirements ระดับ non-technical สำหรับการตั้งค่าเมนูลัดต่อคน×ต่อร้าน บนการ์ด Command Center มือถือ
2. กำหนดขอบเขตของแคตตาล็อกเมนูลัด (SSOT เดียวกับ sidebar), cap 8 ช่อง, พฤติกรรม default และ entitlement drift
3. ระบุเงื่อนไขการรับงาน (Acceptance Criteria) แบบ Given/When/Then ที่ทีม QA นำไปสร้าง Test Case ได้โดยตรง — โดยเฉพาะความถูกต้องของสิทธิ์การมองเห็น (authorization) และการซ่อนรายการที่หมดสิทธิ์
4. สร้างความเข้าใจร่วมกันระหว่างทีมธุรกิจและทีมพัฒนา ก่อนเริ่ม implement feature

### 1.2 ขอบเขตของระบบ

**Customizable Shortcuts** คือระบบที่ให้ seller (owner หรือ ShopMember role=ADMIN) เลือก/ถอดรายการเมนูลัดของตัวเองบนการ์ด "เมนูลัด" ของ Command Center มือถือ (`/dashboard`) ได้สูงสุด 8 รายการ จากแคตตาล็อกที่ derive มาจาก sidebar เมนูจริง (`_seller-menu.ts`) หลัง apply ตัวกรองสิทธิ์เดิมของระบบทั้งหมด การตั้งค่าผูกกับคู่ (ผู้ใช้, ร้าน) แยกกันเสมอ — แก้ไขผ่านปุ่มบนการ์ดเดิม ไม่มีหน้าตั้งค่าแยก

**เข้าสู่ระบบ (Input):**
- Session ปัจจุบัน (`session.user.id`) + active shop context (จาก `requireActiveShop`)
- Action ของผู้ใช้ในโหมดแก้ไข: เพิ่ม/ถอดรายการ (ระบุด้วย slug เช่น `seller:sales`), กดรีเซ็ต
- ข้อมูลจาก DB ที่มีอยู่แล้ว: `ShopMember` (role ของผู้ใช้ต่อ shop), `Shop` (vertical, kind, staffCanViewFinance), `BusinessPackageSubscription`/`InventoryEntitlement` (สถานะ package)

**ออกจากระบบ (Output):**
- ชุดเมนูลัด (≤8 รายการ) ที่ render บนการ์ด Command Center — คำนวณสด ไม่มี dead tile
- Preference record ที่บันทึก/แก้/รีเซ็ตสำเร็จ
- Validation error (เกิน 8, เหลือต่ำกว่า 1, เลือกรายการที่ไม่อยู่ในแคตตาล็อกของตัวเอง)

**ระบบที่เกี่ยวข้อง:**
- `_seller-menu.ts` — SSOT ของเมนู + ฟังก์ชัน `applyStaffMenu`/`applyVerticalMenu`/`applyAppointmentMenu`/`applyExpenseMenu`/`applyInventoryGate` (reuse ตรง ๆ)
- `shop-context.ts` (`requireActiveShop`) — resolve active shop + role ปัจจุบัน
- `expense-access.service.ts` (`resolveExpenseAccess`) — gate ของรายการ "ค่าใช้จ่าย"
- `dashboard/page.tsx`, `CarouselGrid.tsx`, `ShortcutGrid.tsx` — จุด render เมนูลัดปัจจุบันที่ต้องเปลี่ยนจาก static เป็น dynamic

### 1.3 กลุ่มผู้ใช้งาน

| กลุ่มผู้ใช้ | บทบาท | สิทธิ์การใช้งาน |
|-----------|--------|----------------|
| **Owner ของร้าน (PERSONAL หรือ BUSINESS)** | เจ้าของร้าน | ตั้งเมนูลัดของตัวเองสำหรับทุกร้านที่ตนเป็นเจ้าของ แยกกันต่อร้าน |
| **ShopMember(role=ADMIN)** | พนักงานที่ owner invite เข้า Business shop | ตั้งเมนูลัดของตัวเองสำหรับร้านที่ตนเป็นสมาชิก — เห็นแคตตาล็อกตามสิทธิ์ role ตัวเอง (ไม่เห็น "พนักงาน" เป็นต้น) |
| **ผู้ใช้ที่ยังไม่เคยตั้งค่า** | Owner/Admin คนใดก็ได้ที่ยังไม่เคยแก้ไขเมนูลัด | เห็นชุด default ที่คำนวณสดตามสิทธิ์ของตัวเอง — ไม่ถือเป็นสิทธิ์แยกต่างหาก |

---

## 2. ความต้องการหลัก (Functional Requirements)

### 2.1 แคตตาล็อกและขอบเขตการเก็บค่า

#### FR-SC-01: แคตตาล็อกเมนูลัด derive จาก SSOT sidebar

**User Story:**
> ในฐานะ Seller ฉันต้องการเลือกเมนูลัดจากรายการเมนูจริงที่ฉันมีสิทธิ์เข้าถึงเท่านั้น เพื่อไม่ให้ปักหมุดสิ่งที่กดแล้วใช้ไม่ได้

**Acceptance Criteria:**
- [ ] `[FR-SC-01-AC-01]` **Given** ผู้ใช้เปิดโหมดแก้ไขเมนูลัด **When** ระบบสร้างแคตตาล็อกให้เลือก **Then** แคตตาล็อกต้องเท่ากับผลลัพธ์ของ `sellerMenuItems` หลัง apply `applyStaffMenu` + `applyVerticalMenu` + `applyAppointmentMenu` + `applyExpenseMenu` ด้วยบริบทของผู้ใช้/ร้านนั้นจริง (ตัวกรองชุดเดียวกับที่ sidebar ใช้)
- [ ] `[FR-SC-01-AC-02]` **Given** รายการที่ยังเห็นได้แต่มี badge/isDisabled จาก `applyInventoryGate` (เช่น "จัดการสต็อก" ที่ยังไม่ได้สมัคร) **When** ตรวจสอบแคตตาล็อก **Then** รายการนั้น**ยังปรากฏเป็นตัวเลือกได้** (ไม่ถูกกรองออก)
- [ ] `[FR-SC-01-AC-03]` **Given** รายการที่ไม่มีอยู่ใน `sellerMenuItems` เลย หรือมี `url = null` **When** ตรวจสอบแคตตาล็อก **Then** รายการนั้น**ไม่ปรากฏ**เป็นตัวเลือก
- [ ] `[FR-SC-01-AC-04]` `seller:dashboard` **ไม่ปรากฏ**เป็นตัวเลือกในแคตตาล็อกเสมอ (เป็นหน้าที่เมนูลัดอาศัยอยู่)
- [ ] `[FR-SC-01-AC-05]` **Given** ผู้ใช้พยายามปักหมุด slug ที่ไม่อยู่ในแคตตาล็อกของตัวเอง (เช่น เรียก API ตรง ๆ ด้วย slug `seller:admins` ทั้งที่เป็น staff) **When** ระบบตรวจสอบ server-side **Then** ปฏิเสธคำขอ (ไม่ trust ค่าจาก client — server ต้อง recompute แคตตาล็อกเองเสมอ)

#### FR-SC-02: การเก็บค่าต่อคน × ต่อร้าน

**User Story:**
> ในฐานะ Seller ที่เปิดหลายร้าน หรือเป็นสมาชิกหลายร้าน ฉันต้องการตั้งเมนูลัดแยกกันในแต่ละร้าน โดยไม่ปนกับคนอื่นที่อยู่ร้านเดียวกัน

**Acceptance Criteria:**
- [ ] `[FR-SC-02-AC-01]` **Given** ผู้ใช้ A เป็น owner ของร้าน X และร้าน Y **When** ตั้งเมนูลัดของร้าน X **Then** เมนูลัดของร้าน Y ไม่เปลี่ยนตาม (preference แยกกันตาม shopId)
- [ ] `[FR-SC-02-AC-02]` **Given** ผู้ใช้ A (owner) และผู้ใช้ B (admin) เป็นสมาชิกร้าน X ด้วยกัน **When** A ตั้งเมนูลัดของตัวเอง **Then** เมนูลัดที่ B เห็นไม่เปลี่ยนตาม (preference แยกกันตาม userId)
- [ ] `[FR-SC-02-AC-03]` **Given** ผู้ใช้สลับ active shop (shop switcher) **When** กลับมาเปิด `/dashboard` **Then** เห็นเมนูลัดของร้านที่กำลัง active อยู่ ณ ขณะนั้น ตามที่ตัวเองเคยตั้งไว้สำหรับร้านนั้น (ไม่ใช่ของร้านก่อนหน้า)
- [ ] `[FR-SC-02-AC-04]` ทุก query/update preference ต้อง scope ด้วย `(userId, shopId)` ที่มาจาก session/active-shop จริงเท่านั้น — ห้าม trust `userId`/`shopId` จาก request body (ตาม memory `feedback_rsc_dal_authz`)

---

### 2.2 แก้ไขเมนูลัด (เพิ่ม/ลด)

#### FR-SC-03: เพิ่มเมนูลัด (สูงสุด 8)

**User Story:**
> ในฐานะ Seller ฉันต้องการเพิ่มรายการจากแคตตาล็อกเข้าเมนูลัดของตัวเอง เพื่อให้เข้าถึงฟีเจอร์ที่ใช้บ่อยได้เร็วขึ้น

**Acceptance Criteria:**
- [ ] `[FR-SC-03-AC-01]` **Given** จำนวนที่ปักหมุดอยู่ปัจจุบัน < 8 **When** ผู้ใช้เลือกรายการใหม่จากแคตตาล็อก **Then** รายการนั้นถูกเพิ่มเข้า preference สำเร็จ
- [ ] `[FR-SC-03-AC-02]` **Given** รายการเดิมที่ถูกเพิ่มแล้ว **When** ผู้ใช้พยายามเพิ่มรายการเดิมซ้ำ **Then** ระบบไม่สร้างรายการซ้ำ (idempotent)

#### FR-SC-04: ถอดเมนูลัด (ขั้นต่ำ 1)

**User Story:**
> ในฐานะ Seller ฉันต้องการถอดรายการที่ไม่ใช้แล้วออกจากเมนูลัดของตัวเอง

**Acceptance Criteria:**
- [ ] `[FR-SC-04-AC-01]` **Given** จำนวนที่ปักหมุดอยู่ปัจจุบัน > 1 **When** ผู้ใช้ถอดรายการหนึ่งออก **Then** รายการนั้นหายจาก preference สำเร็จ
- [ ] `[FR-SC-04-AC-02]` **Given** จำนวนที่ปักหมุดอยู่ปัจจุบัน = 1 (รายการสุดท้าย) **When** ผู้ใช้พยายามถอดรายการนั้น **Then** ระบบปฏิเสธ พร้อมข้อความอธิบายว่าต้องเหลืออย่างน้อย 1 รายการ

#### FR-SC-05: บล็อกเมื่อครบ 8 ช่อง

**User Story:**
> ในฐานะระบบ ฉันต้องบล็อกการเพิ่มรายการที่ 9 เพื่อรักษาคำมั่นว่าเมนูลัดมีไม่เกิน 8 ช่องเสมอ ไม่มี carousel หลายหน้า

**Acceptance Criteria:**
- [ ] `[FR-SC-05-AC-01]` **Given** จำนวนที่ปักหมุดอยู่ปัจจุบัน = 8 **When** ผู้ใช้พยายามเพิ่มรายการที่ 9 **Then** ระบบปฏิเสธทั้ง UI (ปุ่มเพิ่มถูก disable/แจ้งเตือน) และ backend (validation reject แม้เรียก API ตรง ๆ) พร้อมข้อความให้ถอดรายการเดิมก่อน
- [ ] `[FR-SC-05-AC-02]` ระบบ**ไม่**auto-ถอดรายการที่เก่าที่สุด/ตำแหน่งสุดท้ายออกเองเพื่อเปิดที่ว่างให้รายการใหม่ — ต้องเป็นการตัดสินใจของผู้ใช้เท่านั้น

---

### 2.3 ค่าเริ่มต้น (Default)

#### FR-SC-06: ค่าเริ่มต้นสำหรับผู้ที่ยังไม่เคยตั้งค่า

**User Story:**
> ในฐานะ Seller ที่ยังไม่เคยแตะเมนูลัด ฉันต้องการเห็นชุดเมนูลัดที่สมเหตุสมผลตั้งแต่ครั้งแรก โดยไม่ต้องตั้งค่าเอง

**Acceptance Criteria:**
- [ ] `[FR-SC-06-AC-01]` **Given** ผู้ใช้ (userId, shopId) คู่หนึ่งไม่เคยมี preference record มาก่อน **When** เปิด `/dashboard` **Then** ระบบคำนวณ default = 8 รายการแรกตามลำดับที่ปรากฏใน `sellerMenuItems` ของแคตตาล็อกที่มองเห็นจริง (ตาม FR-SC-01) ไม่นับ `seller:dashboard`
- [ ] `[FR-SC-06-AC-02]` **Given** แคตตาล็อกของผู้ใช้คนนั้นมีน้อยกว่า 8 รายการ **When** คำนวณ default **Then** แสดงทุกรายการที่มี (ไม่เติมรายการหลอกให้ครบ 8)
- [ ] `[FR-SC-06-AC-03]` **Given** ร้าน vertical=LODGING **When** คำนวณ default ของ owner ร้านนั้น **Then** default ไม่มีรายการที่ถูกกรองออกโดย `applyVerticalMenu` (เช่น "สินค้า"/"ประมูล"/"จัดการสต็อก") ปนอยู่เลย
- [ ] `[FR-SC-06-AC-04]` การคำนวณ default เป็นการคำนวณสด (ไม่ persist เป็น preference record จนกว่าผู้ใช้จะแก้ไขจริงครั้งแรก หรือกดยืนยัน — รายละเอียด persist-on-first-view vs compute-on-read เป็น technical decision ที่ SRS)

---

### 2.4 พฤติกรรมเมื่อหมดสิทธิ์ (Entitlement Drift)

#### FR-SC-07: ซ่อนเมนูที่หมดสิทธิ์ทันที

**User Story:**
> ในฐานะ Seller ฉันไม่ต้องการเห็น tile ที่กดแล้วพัง เมื่อสิทธิ์เข้าถึงเมนูที่เคยปักหมุดไว้หมดไปแล้ว

**Acceptance Criteria:**
- [ ] `[FR-SC-07-AC-01]` **Given** ผู้ใช้เคยปักหมุดรายการ X ไว้ **When** สิทธิ์เข้าถึง X หมดไป (เช่น `staffCanViewFinance` ถูกปิด, ลดจาก OWNER เป็น ADMIN, ร้านเปลี่ยน vertical, package หมดอายุ) **Then** เปิด `/dashboard` ครั้งถัดไป tile X ไม่ปรากฏบนการ์ดอีกต่อไป
- [ ] `[FR-SC-07-AC-02]` **Given** สถานการณ์ข้างต้น **When** ตรวจสอบ preference record ที่บันทึกไว้ **Then** record ยัง**คง**มี X อยู่ (ไม่ถูกลบอัตโนมัติ)
- [ ] `[FR-SC-07-AC-03]` **Given** การ์ดมีรายการที่หายไปจากการหมดสิทธิ์ (เหลือ เช่น 7/8) **When** render การ์ด **Then** ระบบ**ไม่**เติมรายการอื่นมาแทนที่ช่องว่างนั้นโดยอัตโนมัติ
- [ ] `[FR-SC-07-AC-04]` **Given** สิทธิ์ที่หายไปกลับมา (เช่น owner เปิด `staffCanViewFinance` คืน) **When** ผู้ใช้เปิด `/dashboard` ครั้งถัดไป **Then** tile X กลับมาแสดงอัตโนมัติ โดยผู้ใช้ไม่ต้องปักหมุดใหม่

#### FR-SC-08: หน้าแก้ไขแสดงรายการที่ปักไว้แต่ใช้ไม่ได้แล้ว

**User Story:**
> ในฐานะ Seller ฉันต้องการรู้ว่าทำไมเมนูลัดที่เคยปักไว้หายไป และเลือกได้ว่าจะถอดทิ้งหรือเก็บไว้เผื่อสิทธิ์กลับมา

**Acceptance Criteria:**
- [ ] `[FR-SC-08-AC-01]` **Given** preference มีรายการที่ตอนนี้ไม่อยู่ในแคตตาล็อกที่มองเห็นได้แล้ว (entitlement drift) **When** ผู้ใช้เปิดโหมดแก้ไขเมนูลัด **Then** รายการนั้นแสดงเป็นสถานะ "ใช้ไม่ได้แล้ว" (แยกจากรายการที่เลือกได้ปกติ) ไม่ใช่หายไปเงียบ ๆ จากหน้าแก้ไขด้วย
- [ ] `[FR-SC-08-AC-02]` **Given** รายการที่แสดงสถานะ "ใช้ไม่ได้แล้ว" **When** ผู้ใช้กดถอดรายการนั้นออกจากหน้าแก้ไข **Then** รายการถูกลบออกจาก preference จริง (เปิดที่ว่างให้เลือกรายการอื่นได้ครบ 8 ใหม่)
- [ ] `[FR-SC-08-AC-03]` รายการสถานะ "ใช้ไม่ได้แล้ว" **นับรวม**อยู่ในโควตา 8 ช่อง (ไม่ใช่ช่องพิเศษเพิ่ม) — ตราบใดที่ยังไม่ถูกถอด

---

### 2.5 จุดเข้าตั้งค่า (Editing Entry Point)

#### FR-SC-09: ปุ่มแก้ไขอยู่บนการ์ดเมนูลัด

**User Story:**
> ในฐานะ Seller ฉันต้องการแก้ไขเมนูลัดจากจุดเดียวกับที่ใช้งานมันอยู่ ไม่ต้องไปหาหน้าตั้งค่าแยกต่างหาก

**Acceptance Criteria:**
- [ ] `[FR-SC-09-AC-01]` **Given** ผู้ใช้อยู่หน้า `/dashboard` (มือถือ) **When** มองหาทางแก้ไขเมนูลัด **Then** พบปุ่ม/action แก้ไขอยู่บนการ์ด "เมนูลัด" โดยตรง (เช่น ที่ card-header)
- [ ] `[FR-SC-09-AC-02]` การเข้าโหมดแก้ไข**ไม่**เปลี่ยน URL ไปหน้าอื่นในระบบ routing ของ sidebar/เมนูหลัก (ไม่ใช่ route `/settings/shortcuts` แยกต่างหาก — รูปแบบ UI จริง เช่น modal/bottom sheet เป็น technical decision ของ `safepay-ux`)

#### FR-SC-10: ขอบเขต MVP = มือถือเท่านั้น

**User Story:**
> ในฐานะระบบ ฉันต้องจำกัดฟีเจอร์นี้ไว้ที่พื้นผิวที่เมนูลัดมีอยู่จริงเท่านั้น ไม่สร้างพื้นผิวใหม่ที่ไม่มีอยู่ก่อน

**Acceptance Criteria:**
- [ ] `[FR-SC-10-AC-01]` **Given** ผู้ใช้เปิด `/dashboard` บนหน้าจอ `< lg` (มือถือ/แท็บเล็ตเล็ก) **When** ตรวจสอบ **Then** เห็นการ์ดเมนูลัดที่ตั้งค่าได้ตามฟีเจอร์นี้
- [ ] `[FR-SC-10-AC-02]` **Given** ผู้ใช้เปิด `/dashboard` บนหน้าจอ `≥ lg` (เดสก์ท็อป) **When** ตรวจสอบ **Then** ไม่มี regression ต่อ widget เดสก์ท็อปเดิม (UserCard/StatisticCard/AchievementLevel/SalesReport/RecentOrder) — ฟีเจอร์นี้ไม่เพิ่ม/แก้สิ่งใดในฝั่งเดสก์ท็อป

---

### 2.6 ลำดับการแสดงผล และ รีเซ็ต

#### FR-SC-11: ลำดับแสดงผลตาม SSOT sidebar order (ไม่มี manual reorder)

**User Story:**
> ในฐานะ Seller ฉันต้องการให้เมนูลัดของฉันเรียงในลำดับที่คาดเดาได้เสมอ โดยไม่ต้องมาจัดเรียงเอง

**Acceptance Criteria:**
- [ ] `[FR-SC-11-AC-01]` **Given** ผู้ใช้ปักหมุด A, B, C ตามลำดับที่กด (เช่น กด C ก่อน แล้วกด A แล้วกด B) **When** render การ์ด **Then** ลำดับที่แสดงคือลำดับตาม `sellerMenuItems` (SSOT) เสมอ ไม่ใช่ลำดับที่กด
- [ ] `[FR-SC-11-AC-02]` ไม่มี UI drag-to-reorder ในเวอร์ชันนี้

#### FR-SC-12: รีเซ็ตกลับค่าเริ่มต้น

**User Story:**
> ในฐานะ Seller ที่ตั้งค่าจนไม่พอใจ ฉันต้องการรีเซ็ตเมนูลัดกลับเป็นค่าเริ่มต้นได้ง่าย ๆ

**Acceptance Criteria:**
- [ ] `[FR-SC-12-AC-01]` **Given** ผู้ใช้อยู่ในโหมดแก้ไข **When** กดปุ่ม "รีเซ็ตเป็นค่าเริ่มต้น" และยืนยัน **Then** preference ปัจจุบันถูกแทนที่ด้วย default ที่คำนวณสด (ตาม FR-SC-06) ณ ขณะนั้น
- [ ] `[FR-SC-12-AC-02]` การกดปุ่มรีเซ็ตต้องมีขั้นตอนยืนยันก่อนเสมอ (ป้องกันกดพลาด)

**Business Flow:**
