# Design Spec — Command Center V4 Visual Polish

> วันที่: 2026-06-07 | สถานะ: APPROVED (visual mockup) — polish โครงเดิม
> Visual SoT: `docs/mockups/home/command-center-v4.html` (อนุมัติแล้ว)
> ฐาน build เดิม: `docs/superpowers/specs/2026-06-07-seller-mobile-command-center-DESIGN-SPEC-v3.md`
> ขอบเขต: **Polish อย่างเดียว** — ไม่เปลี่ยนโครง/ลำดับ section, ไม่เพิ่ม route/feature
> เป้าหมาย: ทันสมัย + คุม tone + ใช้ง่ายสำหรับ mobile-native ที่ใช้ OMS ไม่เป็น

---

## หลักการออกแบบ (3 เสา)

### 1. คุม tone — สีตามความหมาย ไม่ใช่สีรุ้ง
เลิก palette 8 สีต่อ tile (ดู uncontrolled) → จัดเป็น **4 กลุ่มความหมาย** (color = meaning ช่วยมือใหม่จำ):
| กลุ่ม | สี | tile |
|------|-----|------|
| งานหลัก (core ops) | น้ำเงิน (blue-tint/blue-600) | คำสั่งซื้อ, สินค้า, ลูกค้า |
| เงิน | เขียว (emerald-50/600) | เติมเงิน |
| engagement | เหลือง (amber-50/600) | รีวิว, ความสำเร็จ |
| utility | เทา (slate-100/600) | ตั้งค่า, Blacklist (disabled จาง) |

Order status คงสี semantic (amber/blue/emerald/slate = สถานะ มีความหมายอยู่แล้ว). Activity feed คง icon-color ต่อ type.

### 2. ทันสมัย — card-based, depth, rhythm
- **8 tile เก็บเข้า card เดียว** (contained panel) แทนลอยบน bg เปล่า
- radius นุ่มขึ้น: card = **20px** (จาก 16px)
- shadow เป็นชั้นแบบลอยเบา: `0 1px 2px rgba(16,24,40,.04), 0 6px 16px -8px rgba(16,24,40,.10)`
- spacing rhythm: section gap สม่ำเสมอ (px-4, mb-4), section header pattern เดียว
- section header เพิ่ม link ขวา: "จัดการ ›" (order status → /orders), "ดูทั้งหมด ›" (activity → /orders)
- top bar: avatar + ชื่อร้าน + tier chip, sticky พร้อม bg-gradient fade ด้านล่าง, bell เป็น dot แทนตัวเลข

### 3. ใช้ง่าย — เน้นสิ่งที่ต้องทำก่อน
- **Order status: แถบ "รอคุณดำเนินการ N รายการ" เด่นสีน้ำเงิน** ด้านบน (actionable, กดไป /orders) — มือใหม่เห็นทันทีว่าทำอะไรก่อน
- 3 สถานะที่เหลือ (จัดส่ง/สำเร็จ/ยกเลิก) ย่อเป็นแถวเล็ก grid-3 ข้างล่าง (ลดน้ำหนัก)
- tile badge pending คงเด่น (แดง ring ขาว)
- label/ตัวเลขชัด

---

## การเปลี่ยนต่อ component (polish — แก้ใน component เดิม)

| Component | เดิม (v3) | polish (v4) |
|-----------|-----------|-------------|
| **CommandTopBar** | hamburger ปุ่มน้ำเงินทึบ / ชื่อร้านกลาง / bell เลข + avatar เหลี่ยม | hamburger ghost (ไม่ทึบ) / avatar กลม ring + ชื่อร้าน + **tier chip** ซ้าย / bell dot แดง ขวา / sticky + gradient fade |
| **ShortcutPanel** | 8 tile ลอยบน bg, สีรุ้งต่อ tile, chip 56px | **8 tile ใน card เดียว** (p-3, gap-y-4), chip 52px, **สี 4 กลุ่มความหมาย**, badge ring ขาว |
| **OrderStatusTimeline** | 4 node เท่ากัน + chevron | **highlight bar "รอดำเนินการ"** (blue-tint, ใหญ่, actionable) + grid-3 สถานะที่เหลือ (เล็ก) |
| **RecentActivityFeed** | timeline (ok แล้ว) | refine spacing/line color (var --line), node ring-4 ขาว — minor |
| **MiniBanner** | null=ซ่อน | คงเดิม (polish เฉพาะตอนมี banner — ใช้ card+radius ใหม่) |
| **CommandCenter** | stack sections | section header pattern (label + link), spacing rhythm, shortcut card wrapper |
| **CreateFab** | 60px | คงเดิม (อาจลด 58px ตาม mockup — minor, optional) |

---

## Theme Sourcing (HARD RULE 1)
Polish = แก้ className/Tailwind ใน component เดิมที่ source จาก Paces แล้ว → `Base:` line เดิมของแต่ละ component carry over (CommandTopBar←MenuToggler, ShortcutPanel/OrderStatus/MiniBanner←StatisticCard/ShippingActivity, Activity←TimeLine). องค์ประกอบใหม่:
- **tier chip** ใน top bar → source จากการแสดง tier ที่มีอยู่ (เช่น `/u/[username]` หรือ AchievementLevel) — **ต้องอ่าน `docs/10 - Business Rules/Tier Lists.md` ใช้ชื่อ tier จริงตาม SSOT** (mockup ขึ้น "ระดับ B" เป็น placeholder — ของจริงใช้ tier name จาก `getTrustLevel`)
- avatar ring, gradient sticky, highlight bar → Tailwind primitives (ภายใน Paces token)

## Data ใหม่ที่ต้องส่งเพิ่ม
- CommandTopBar ต้องรับ **trust tier/level** เพิ่ม (เดิมรับแค่ shopName, avatarUrl). dashboard page มี `level` + `levelColor` จาก `getTrustLevel(score)` อยู่แล้ว → ส่งเข้า CommandCenterData → CommandTopBar. ใช้ชื่อ tier ตาม SSOT
- ไม่มี data อื่นเพิ่ม (order counts, activity, pending มีครบจาก build เดิม)

## Out of Scope (ยืนยัน polish เท่านั้น)
- ไม่เปลี่ยนลำดับ section, ไม่เพิ่ม/ลบ tile, ไม่เพิ่ม route, ไม่แตะ desktop, ไม่แตะ service layer (ยกเว้นส่ง level ที่ page มีอยู่แล้ว)
- bell notification ยัง dot คงที่ (ไม่มี notification system จริง — Phase 2)

## Acceptance (เทียบ mockup v4 @ ≤420px)
- tile สี 4 กลุ่มถูกต้อง, อยู่ใน card เดียว
- order status: highlight bar "9 รอดำเนินการ" เด่น + 3 สถานะเล็ก
- top bar: avatar กลม + ชื่อ + tier chip (ชื่อจริงตาม SSOT) + bell dot
- card radius 20px + shadow ลอย, spacing rhythm
- ยังผ่านทุก acceptance เดิม (touch ≥44px, Anuphan, no h-scroll @360, PII masked, desktop ไม่ regress)
