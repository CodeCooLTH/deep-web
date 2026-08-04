---
title: "UX Design Spec — 00028 Shop Business Type (ประเภทร้านค้า)"
owner: shinobu22
status: draft
module: M00028-ShopBusinessType
version: "1.0"
created: 2026-08-03
tags: [feature, ux, design-spec, vertical, shop-type, onboarding, public-profile]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** 00028 — Shop Business Type
> **ประเภทเอกสาร:** UX Design Spec (ผลผลิตของ `safepay-ux` — Hard Rule 8 mandatory gate)
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-03
> **สถานะ:** Draft — รอ implement

# Design Spec — Feature 00028: Shop Business Type (ประเภทร้านค้า)

อ่านตามลำดับที่ Hard Rule 8 กำหนดแล้ว: `.impeccable/design.json` + `DESIGN.md` + `PRODUCT.md` → playbook `shape.md`/`operate.md`/`craft-floor.md` → `docs/system/ui-guideline/paces-component-reference.md` (A1/A2 ฝั่ง seller) + โค้ดจริงของ 3 surface ก่อนออกแบบ

ไม่มี theme file ไหนมี "vertical picker" หรือ "public service list" สำเร็จรูป ดังนั้นทุก component ใหม่ใน spec นี้อ้างอิง **pattern ที่มีอยู่แล้วในโค้ดเบส** (ผ่านรีวิว/ขึ้น prod แล้ว) เป็น Base แทนการคัดลอก raw theme file ใหม่ — สอดคล้อง Hard Rule 1 เพราะ pattern เหล่านั้นประกาศ Base ไปยัง theme file ไว้แล้วในคอมเมนต์หัวไฟล์ (chain of custody ครบ)

อ้างอิง requirement: `docs/20 - Features/00028 - Shop Business Type/{PRD,BRD}.md` — spec นี้ไม่ re-litigate ข้อตัดสินใดใน 2 ไฟล์นั้น (immutable, backfill, guard, matrix §8.1 ยึดตามทั้งหมด)

---

## ภาพรวม 4 surface ที่ออกแบบ

| # | Surface | Route | Skin |
|---|---|---|---|
| A1 | Personal onboarding — เพิ่ม step เลือกประเภทร้านค้า + แตก step สุดท้ายตาม vertical | `src/app/(paces)/seller/onboarding/page.tsx` | Paces |
| A2 | Business creation — ขยาย radio-card จาก 2 → 3 | `src/app/(paces)/seller/(dashboard)/business/create/components/CreateBusinessForm.tsx` | Paces |
| A2b | **(พบระหว่างสำรวจ ไม่ได้อยู่ใน ask เดิม — ต้องทำคู่กับ A2 ไม่งั้น inconsistent)** Business onboarding wizard — step สุดท้ายต้องแตกตาม vertical เหมือน A1 | `src/app/(paces)/seller/(dashboard)/business/[shopId]/onboarding/components/BusinessOnboardingWizard.tsx` | Paces |
| B | Public Profile สาขาที่ 3 (SERVICE_QUEUE) | `src/app/(marketing)/u/[username]/page.tsx` + `src/views/pages/user-profile/v2/*` | Vuexy |

A2b ไม่ได้ถูกระบุใน task list ของ Controller โดยตรง — แต่ CreateBusinessForm (A2) เก็บ vertical ไว้แล้วส่งต่อให้ BusinessOnboardingWizard (A2b) รันทันทีหลังสร้างร้าน ถ้าไม่แก้ A2b คู่กัน ร้าน Business ที่เลือก LODGING/SERVICE_QUEUE จะเจอ step "สร้างสินค้าแรก" ที่ผิดประเภทเหมือนที่ Personal onboarding เจอ — เป็นจุดเดียวกันทุกประการ ไม่ใช่ scope ใหม่

---

## A1. หน้า: Personal onboarding (`src/app/(paces)/seller/onboarding/page.tsx`)

### User stories ที่ครอบ
FR-SBT-01 (เลือกประเภทร้านค้าตอนสร้างร้าน ฝั่ง Personal), FR-SBT-02 (immutable), FR-SBT-07 (บัญชีบุคคลใช้คิวงานได้) — ตอนจบ flow ต้องได้ shop ที่มี vertical ถูกต้อง + landing ที่ตรงกับ vertical นั้น ไม่ใช่ "สร้างสินค้า" เสมอ

### การตัดสินใจหลัก: step ใหม่ vs รวมกับ step เดิม

**ตัดสิน: แทรกเป็น step ใหม่ ลำดับที่ 1 (ก่อน "หมวดหมู่")** ไม่รวมเข้ากับ step ใดที่มีอยู่

เหตุผล:
1. **นี่คือการตัดสินใจที่กลับไม่ได้ที่สุดในทั้ง flow** (immutable ตลอดชีพของร้าน กำหนดเมนู/ความสามารถทั้งหมด) — ทุก step ที่มีอยู่ตอนนี้ (หมวดหมู่/URL/ที่อยู่/สินค้าแรก) แก้ไขทีหลังได้หมด มีแต่ตัวนี้ที่แก้ไม่ได้ ควรมีจอเป็นของตัวเอง ไม่ใช่เป็น field รองใต้ dropdown หมวดหมู่ที่ผู้ใช้เผลอมองข้ามได้ง่าย
2. Wizard นี้ (ทั้ง 2 ที่) ยึด pattern "1 จอ = 1 การตัดสินใจ" มาตลอด (category/slug/address/product แยกจอกันหมด) — การยัด 2 การตัดสินใจในจอเดียวทำลายจังหวะที่ตั้งไว้แล้ว และขัด operate.md "Consistency over surprise"
3. **ต้องมาก่อน category ไม่ใช่หลัง** เพราะ step ท้าย ๆ (โดยเฉพาะ "สินค้าแรก") ต้องรู้ vertical ก่อนถึงจะตัดสินใจได้ว่าจะแสดง field ชุดไหน — category ไม่ต้องรู้ vertical ก่อน (เลือกได้อิสระทั้ง 3 ประเภท)
4. วางไว้ **จอแรกสุด** ขณะที่ผู้ใช้เพิ่งเริ่ม onboarding (attention สูงสุด) ดีกว่าฝังกลาง/ท้าย flow ที่คนมักกดผ่านเร็วเพราะ "ใกล้จะเสร็จแล้ว"

### การตัดสินใจ step สุดท้าย ("สินค้าแรก") ต้องเปลี่ยนตาม vertical

| vertical | step สุดท้ายกลายเป็นอะไร | เหตุผล |
|---|---|---|
| `ONLINE_SALES` | เหมือนเดิมทุกประการ — "สร้างสินค้าแรกของคุณ" (ชื่อ+ราคา, POST `/api/products`) | ไม่กระทบ persona ที่ pain point คือ "กลัวของเดิมเปลี่ยน" |
| `SERVICE_QUEUE` | เปลี่ยนเป็น **"สร้างคิวงานแรกของคุณ"** — ฟอร์ม 2 ช่อง (ชื่อคิวงาน + จำนวนคิวที่รับพร้อมกัน) POST `/api/shops/current/service-resources` (endpoint มีอยู่แล้ว ใช้อยู่ใน `ResourceForm.tsx`) | สินค้าไม่ใช่ของที่ร้านนี้ "อยากทำก่อน" — คิวงานคือหัวใจของร้านประเภทนี้ (PRD §2.2 persona) การบังคับสร้างสินค้าก่อนขัดกับสิ่งที่ร้านเพิ่งบอกเราว่าตัวเองเป็น |
| `LODGING` | **ไม่มี step นี้เลย** — ปุ่มของ step "ที่อยู่" (step ก่อนหน้า) เปลี่ยนข้อความเป็น "เสร็จสิ้น ไปสร้างห้องพักแรก →" แล้วนำทางออกจาก wizard ไป `/rooms/new` ทันที (หน้าเต็มที่มีอยู่แล้วจาก feature 00017) | ฟอร์มห้องพักจริง (รูป/สิ่งอำนวยความสะดวก/ราคา/ปฏิทิน) หนักเกินกว่าจะยัดใน step แบบ 2-field inline — เอาไปทำในโมดัลแคบ ๆ จะออกมาแย่กว่าไม่มี (craft-floor: "Reinventing standard affordances" = ข้อห้าม) |

ผลคือจำนวน step ไม่เท่ากันตาม vertical: ONLINE_SALES/SERVICE_QUEUE = **5 step**, LODGING = **4 step** — dot progress คำนวณใหม่ทันทีที่เลือก vertical ที่ step 1 (ก่อนหน้านั้นแสดง "ขั้นที่ 1/5" เป็นค่าตั้งต้น แล้วปรับเป็น "/4" ถ้าเลือกบ้านพัก)

### Layout (ASCII wireframe) — step ใหม่ "เลือกประเภทร้านค้า"

Shell เดิมเป็น card กลางจอ `max-w-md` คงเดิมทุก breakpoint (ไม่ fluid ตาม operate.md) — ต่างกันแค่ระยะขอบรอบ ๆ

```
MOBILE (≤767px)                     TABLET (768–1023px)                 DESKTOP (≥1024px)
┌───────────────────────┐           ┌─────────────────────────┐         ┌───────────────────────────────┐
│ bg-default-100         │           │  bg-default-100          │         │    bg-default-100              │
│ ┌───────────────────┐ │           │   ┌───────────────────┐  │         │      ┌───────────────────┐    │
│ │      [Logo]        │ │           │   │      [Logo]        │  │         │      │      [Logo]        │    │
│ │   • • ○ ○ ○  1/5    │ │           │   │   • • ○ ○ ○  1/5    │  │         │      │   • • ○ ○ ○  1/5    │    │
│ │  (icon วงกลม)       │ │           │   │  (icon วงกลม)       │  │         │      │  (icon วงกลม)       │    │
│ │ ร้านของคุณเป็นแบบไหน │ │           │   │ ร้านของคุณเป็นแบบไหน │  │         │      │ ร้านของคุณเป็นแบบไหน │    │
│ │ เลือกครั้งเดียว จะ  │ │           │   │ เลือกครั้งเดียว จะ  │  │         │      │ เลือกครั้งเดียว จะ  │    │
│ │ ใช้กำหนดเมนู...ตลอดไป│ │           │   │ ใช้กำหนดเมนู...ตลอดไป│  │         │      │ ใช้กำหนดเมนู...ตลอดไป│    │
│ │                     │ │           │   │                     │  │         │      │                     │    │
│ │ ┌─────────────────┐ │ │           │   │ ┌─────────────────┐ │  │         │      │ ┌─────────────────┐ │    │
│ │ │● ขายออนไลน์      │ │ │           │   │ │● ขายออนไลน์      │ │  │         │      │ │● ขายออนไลน์      │ │    │
│ │ │ขายสินค้าที่ต้อง   │ │ │ (เลือกแล้ว │   │ │ขายสินค้าที่ต้อง   │ │  │         │      │ │ขายสินค้าที่ต้อง   │ │    │
│ │ │จัดส่ง มีสต็อก...  │ │ │ border-    │   │ │จัดส่ง มีสต็อก...  │ │  │         │      │ │จัดส่ง มีสต็อก...  │ │    │
│ │ │[มีจัดส่งสินค้า]  │ │ │ primary)   │   │ │[มีจัดส่งสินค้า]  │ │  │         │      │ │[มีจัดส่งสินค้า]  │ │    │
│ │ └─────────────────┘ │ │           │   │ └─────────────────┘ │  │         │      │ └─────────────────┘ │    │
│ │ ┌─────────────────┐ │ │           │   │ ┌─────────────────┐ │  │         │      │ ┌─────────────────┐ │    │
│ │ │○ สินค้าและบริการ │ │ │           │   │ │○ สินค้าและบริการ │ │  │         │      │ │○ สินค้าและบริการ │ │    │
│ │ │รับนัดคิว ไม่มี    │ │ │           │   │ │รับนัดคิว ไม่มี    │ │  │         │      │ │รับนัดคิว ไม่มี    │ │    │
│ │ │จัดส่ง...          │ │ │           │   │ │จัดส่ง...          │ │  │         │      │ │จัดส่ง...          │ │    │
│ │ │[ไม่มีจัดส่งสินค้า]│ │ │           │   │ │[ไม่มีจัดส่งสินค้า]│ │  │         │      │ │[ไม่มีจัดส่งสินค้า]│ │    │
│ │ └─────────────────┘ │ │           │   │ └─────────────────┘ │  │         │      │ └─────────────────┘ │    │
│ │ ┌─────────────────┐ │ │           │   │ ┌─────────────────┐ │  │         │      │ ┌─────────────────┐ │    │
│ │ │○ บ้านพัก          │ │ │           │   │ │○ บ้านพัก          │ │  │         │      │ │○ บ้านพัก          │ │    │
│ │ │ให้เช่าที่พัก...   │ │ │           │   │ │ให้เช่าที่พัก...   │ │  │         │      │ │ให้เช่าที่พัก...   │ │    │
│ │ │[ไม่มีจัดส่งสินค้า]│ │ │           │   │ │[ไม่มีจัดส่งสินค้า]│ │  │         │      │ │[ไม่มีจัดส่งสินค้า]│ │    │
│ │ └─────────────────┘ │ │           │   │ └─────────────────┘ │  │         │      │ └─────────────────┘ │    │
│ │                     │ │           │   │                     │  │         │      │                     │    │
│ │ [   ถัดไป →   ]     │ │ min-h 44px │   │ [   ถัดไป →   ]     │  │         │      │ [   ถัดไป →   ]     │    │
│ └───────────────────┘ │           │   └───────────────────┘  │         │      └───────────────────┘    │
└───────────────────────┘           └─────────────────────────┘         └───────────────────────────────┘
```

### Section breakdown (prose)

- **Icon circle + heading + subtitle** — ใช้ pattern เดิมเป๊ะจาก `STEP_META` (icon วงกลม `bg-primary/15 text-primary size-14`) icon = `building-store` (verified ใช้อยู่แล้วใน `BusinessOnboardingWizard.tsx` step `info` — ปลอดภัย ไม่ต้องยืนยันใหม่)
- **Radio-card × 3** — วางแนวตั้ง `grid-cols-1 gap-2` (ต่างจาก A2 ที่เป็น 3 คอลัมน์ เพราะ shell แคบกว่ามาก `max-w-md`) แต่ละใบ: ชื่อประเภท (bold) + hint 1 บรรทัด + badge เล็กบอก "มีจัดส่งสินค้า"/"ไม่มีจัดส่งสินค้า" (สีกลาง ไม่ใช่ semantic color — ดู Impeccable compliance) เลือกแล้ว border เปลี่ยนเป็น `border-primary bg-primary/5` (ยืม pattern จาก CreateBusinessForm ตรง ๆ)
- **Default selection = "ขายออนไลน์"** — ตาม BR-SBT-07 (ค่าเริ่มต้นบังคับใน BRD) ปุ่ม "ถัดไป" กดได้ทันทีโดยไม่ต้องแตะอะไรก่อน — ความเสี่ยงที่ผู้ใช้กดผ่านโดยไม่อ่านถูกลดด้วย subtitle ที่พูดถึง "ตลอดไป" ตรง ๆ แทนที่จะฝากไว้แค่ข้อความเล็กใต้กลุ่ม
- **ปุ่ม "ถัดไป →"** — เรียก endpoint บันทึก vertical (ดู Open Questions #1) แล้วไป step "หมวดหมู่"

### Layout (ASCII) — step สุดท้ายที่แตกตาม vertical (SERVICE_QUEUE branch)

```
MOBILE                                DESKTOP (เหมือน mobile, กว้างกว่ารอบนอก)
┌───────────────────────┐             ┌───────────────────────────────┐
│ ┌───────────────────┐ │             │      ┌───────────────────┐    │
│ │ • • • • ●   5/5     │ │             │      │ • • • • ●   5/5     │    │
│ │  (icon armchair)    │ │             │      │  (icon armchair)    │    │
│ │ สร้างคิวงานแรกของคุณ│ │             │      │ สร้างคิวงานแรกของคุณ│    │
│ │ เพิ่มคิวงานที่รับได้ │ │             │      │ เพิ่มคิวงานที่รับได้ │    │
│ │ เพื่อเริ่มนัดลูกค้า  │ │             │      │ เพื่อเริ่มนัดลูกค้า  │    │
│ │                     │ │             │      │                     │    │
│ │ ชื่อคิวงาน           │ │             │      │ ชื่อคิวงาน           │    │
│ │ [(icon) หมอนวด A__] │ │             │      │ [(icon) หมอนวด A__] │    │
│ │                     │ │             │      │                     │    │
│ │ จำนวนคิวที่รับพร้อมกัน│ │             │      │ จำนวนคิวที่รับพร้อมกัน│    │
│ │ [ 1 ] คิว            │ │             │      │ [ 1 ] คิว            │    │
│ │                     │ │             │      │                     │    │
│ │ [  เพิ่มคิวงานเลย  ]│ │             │      │ [  เพิ่มคิวงานเลย  ]│    │
│ │  ข้ามไปก่อน...       │ │             │      │  ข้ามไปก่อน...       │    │
│ └───────────────────┘ │             │      └───────────────────┘    │
└───────────────────────┘             └───────────────────────────────┘
```

(LODGING branch = ไม่มีจอนี้ — กดปุ่ม "เสร็จสิ้น ไปสร้างห้องพักแรก →" ที่ step ที่อยู่ แล้ว navigate ตรงไป `/rooms/new`)

### Theme Source Mapping

| Section | Base path | Component | หมายเหตุ adapt |
|---|---|---|---|
| Shell/dots/icon-circle/STEP_META pattern | `src/app/(paces)/seller/onboarding/page.tsx` (ตัวมันเอง) | ขยาย `Step` union + `STEP_DOTS`/`STEP_META` | เพิ่ม `'vertical'` เข้า union, คำนวณ `STEP_DOTS` แบบ dynamic ตาม vertical ที่เลือก |
| Radio-card × 3 (เลือกประเภทร้านค้า) | `src/app/(paces)/seller/(dashboard)/business/create/components/CreateBusinessForm.tsx:139-174` | คัด markup ใบ radio-card มาวางใน `grid-cols-1` แทน `md:grid-cols-3` | ที่มาสุดของ markup คือ `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx` ตามที่ CreateBusinessForm ประกาศไว้แล้ว — ห่วงโซ่ Base ครบ |
| ฟอร์ม "สร้างคิวงานแรก" (ชื่อ+จำนวนคิว) | `src/app/(paces)/seller/(dashboard)/queues/components/ResourceForm.tsx:182-256` | คัดเฉพาะ 2 field (`name`, `capacity`) มาวางในรูปแบบ `input-icon-group`/flex เหมือน step "product" เดิม | ตัดฟิลด์ description/duration/deposit/granularity ออกทั้งหมด (ไปเติมทีหลังในหน้า `/queues`) |
| Badge "มีจัดส่งสินค้า" | `docs/system/ui-guideline/paces-component-reference.md` §6 | `<span className="badge bg-default-100 text-default-600">มีจัดส่งสินค้า</span>` | ใช้ neutral tone `default` ไม่ใช่ semantic color |

### User flow

1. เข้า `/onboarding` (มี `needsOnboarding=true` เหมือนเดิม) → step แรกเปลี่ยนจาก "หมวดหมู่" เป็น "เลือกประเภทร้านค้า"
2. เห็น 3 radio-card, "ขายออนไลน์" ถูกเลือกไว้ล่วงหน้า → เลือกใบอื่นได้ → กด "ถัดไป →"
3. → step หมวดหมู่ (เดิม) → URL (เดิม) → ที่อยู่ (เดิม, subtitle ปรับคำตาม vertical)
4. ที่ step ที่อยู่: ถ้า vertical = LODGING → ปุ่มอ่านว่า "เสร็จสิ้น ไปสร้างห้องพักแรก →" กดแล้วจบ onboarding + ไป `/rooms/new` ทันที; ถ้าไม่ใช่ → "ถัดไป →" ไป step สุดท้าย
5. step สุดท้าย: ONLINE_SALES เห็นฟอร์มสินค้า (เดิม), SERVICE_QUEUE เห็นฟอร์มคิวงาน (ใหม่) — ทั้งคู่ข้ามได้ → จบ onboarding → `/dashboard`

### Content outline (ภาษาไทย)

| ตำแหน่ง | ข้อความ |
|---|---|
| Step vertical — heading | ร้านของคุณเป็นแบบไหน |
| Step vertical — subtitle | เลือกครั้งเดียว จะใช้กำหนดเมนูและสิ่งที่ร้านทำได้ตลอดไป |
| Card 1 ชื่อ / hint / badge | ขายออนไลน์ / ขายสินค้าที่ต้องจัดส่ง มีระบบสต็อก ประมูล และจัดส่งผ่าน iShip / มีจัดส่งสินค้า |
| Card 2 ชื่อ / hint / badge | สินค้าและบริการ / รับนัดคิวลูกค้าเข้ารับบริการ ไม่มีการจัดส่งสินค้า ขายของเสริมได้ / ไม่มีจัดส่งสินค้า |
| Card 3 ชื่อ / hint / badge | บ้านพัก / ให้เช่าที่พักรายคืน มีระบบห้องพัก ปฏิทินว่าง และการจอง / ไม่มีจัดส่งสินค้า |
| ปุ่มหลัก | ถัดไป → |
| Step ที่อยู่ — subtitle (ONLINE_SALES) | ที่อยู่สำหรับจัดส่งสินค้า |
| Step ที่อยู่ — subtitle (SERVICE_QUEUE) | ที่อยู่ร้าน ให้ลูกค้ารู้ว่าต้องมาหาที่ไหน |
| Step ที่อยู่ — subtitle (LODGING) | ที่อยู่ที่พัก ให้ผู้เข้าพักหาเจอ |
| Step ที่อยู่ — ปุ่ม (LODGING) | เสร็จสิ้น ไปสร้างห้องพักแรก → |
| Step สุดท้าย SERVICE_QUEUE — heading | สร้างคิวงานแรกของคุณ |
| Step สุดท้าย SERVICE_QUEUE — subtitle | เพิ่มคิวงานที่รับได้ เพื่อเริ่มนัดลูกค้า |
| ฟิลด์ 1 label / placeholder | ชื่อคิวงาน / เช่น หมอนวด A |
| ฟิลด์ 2 label / placeholder | จำนวนคิวที่รับพร้อมกัน / 1 |
| ปุ่มหลัก / รอง | เพิ่มคิวงานเลย / ข้ามไปก่อน เพิ่มทีหลังได้ |

### Edge states ที่ต้องออกแบบ

- **ไม่ได้เลือก vertical แล้วกดถัดไป** — ไม่เกิดขึ้นจริงเพราะมี default เลือกไว้แล้วเสมอ
- **บันทึก vertical ไม่สำเร็จ (เครือข่าย/เซิร์ฟเวอร์ล่ม)** — `pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')` เหมือน step อื่นทุกจุด ไม่เปลี่ยน step
- **ชื่อคิวงานว่าง** — `pacesToast.error('กรุณากรอกชื่อคิวงาน')` มิเรอร์ pattern เดิม (`กรุณากรอกชื่อสินค้า`)
- **จำนวนคิวว่าง** — ไม่ error, default = 1 ที่ server

---

## A2. หน้า: Business creation (`.../business/create/components/CreateBusinessForm.tsx`)

### User stories ที่ครอบ
FR-SBT-01 (ฝั่ง Business), FR-SBT-02

### Design decision — ขยาย ไม่เขียนใหม่

โค้ดเดิม (`SHOP_VERTICAL_KEYS.map(...)`) **generic อยู่แล้ว** — วนตาม array คีย์ ไม่ hardcode 2 ค่า เมื่อ `src/lib/lodging.ts` ขยายเป็น 3 คีย์ JSX ส่วน radio-card **ไม่ต้องแก้เลยสักบรรทัด** สิ่งเดียวที่ต้องแก้คือ grid class จาก `grid-cols-1 gap-2 lg:grid-cols-2` (ออกแบบมาสำหรับ 2 ใบ) เป็น `grid-cols-1 gap-2 sm:grid-cols-3` — นี่คือตัวอย่างที่ "extend" ทำงานได้ตรงเป้าที่สุดในทั้ง feature นี้

### Layout (ASCII wireframe)

```
MOBILE (1 col, การ์ดเดิมกว้างขึ้น)      TABLET/DESKTOP (sm:grid-cols-3, การ์ดเรียงแถวเดียว)
┌─────────────────────┐               ┌───────────────────────────────────────────────┐
│ card ข้อมูลธุรกิจใหม่ │               │ card ข้อมูลธุรกิจใหม่ (max-w-2xl)              │
│ ชื่อธุรกิจ [_______] │               │ ชื่อธุรกิจ[____]  หมวดหมู่[▾ไม่บังคับ]        │
│ หมวดหมู่  [▾ไม่บังคับ]│               │                                                 │
│                       │               │ ประเภทร้านค้า *                                │
│ ประเภทร้านค้า *       │               │ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ ┌───────────────────┐│               │ │● ขายออนไลน์│ │○ สินค้าและ│ │○ บ้านพัก   │         │
│ │● ขายออนไลน์         ││               │ │ขายสินค้าที่│ │บริการ     │ │ให้เช่าที่ │         │
│ │ขายสินค้าที่ต้อง...  ││               │ │ต้องจัดส่ง │ │รับนัดคิว  │ │พักราย... │         │
│ └───────────────────┘│               │ └──────────┘ └──────────┘ └──────────┘         │
│ ┌───────────────────┐│               │ (i) เลือกแล้วเปลี่ยนภายหลังไม่ได้...            │
│ │○ สินค้าและบริการ    ││               │                                                 │
│ │รับนัดคิว...          ││               │ ประเภทผู้ประกอบการ *  ○บุคคลธรรมดา ○นิติบุคคล │
│ └───────────────────┘│               │ คำอธิบาย [____________________]               │
│ ┌───────────────────┐│               │                                    [+ สร้างธุรกิจ]│
│ │○ บ้านพัก             ││               └───────────────────────────────────────────────┘
│ │ให้เช่าที่พัก...       ││
│ └───────────────────┘│
│ (i) เลือกแล้วเปลี่ยน..│
│ ...(ฟิลด์ที่เหลือ)     │
│         [+ สร้างธุรกิจ]│
└─────────────────────┘
```

### Theme Source Mapping

| Section | Base path | หมายเหตุ adapt |
|---|---|---|
| Radio-card grid | `CreateBusinessForm.tsx:139-174` (ตัวมันเอง) | เปลี่ยนเฉพาะ `className` ของ grid wrapper บรรทัด 143: `lg:grid-cols-2` → `sm:grid-cols-3`; ตรวจ `col-span-2` ของ field อื่นให้ layout ไม่บิดตอน implement |

### Content outline
ไม่มี copy ใหม่ — ใช้ `SHOP_VERTICALS`/`SHOP_VERTICAL_HINTS` ชุดเดียวกับ A1 (ต้องเป็นแหล่งเดียว ห้ามพิมพ์ซ้ำที่อื่น — `src/lib/lodging.ts` คือ SSOT ที่มีอยู่แล้ว)

### Edge states
เหมือนเดิมทั้งหมด (validation ผ่าน Yup `SHOP_VERTICAL_KEYS` อยู่แล้ว ไม่มี edge state ใหม่จากการเพิ่มตัวเลือกที่ 3)

---

## A2b. หน้า: Business onboarding wizard step สุดท้าย (`.../business/[shopId]/onboarding/components/BusinessOnboardingWizard.tsx`)

### Design decision
เหมือน A1 เป๊ะ — step `'product'` (บรรทัด 349-399) ต้องรับ `vertical` เป็น prop (ส่งมาจาก `page.tsx` ที่ query shop อยู่แล้ว เพิ่ม `select: { vertical: true }`) แล้วแตกเนื้อหาแบบเดียวกับ A1:
- `ONLINE_SALES` → เหมือนเดิม
- `SERVICE_QUEUE` → ฟอร์ม "ชื่อคิวงาน" (เรียก endpoint เดียวกับ A1: `/api/shops/current/service-resources` — **ไม่ใช่** endpoint onboarding เดิม `/api/business/shops/{shopId}/onboarding` เพราะนั่นออกแบบมาสำหรับ product เท่านั้น)
- `LODGING` → step `'product'` ไม่ถูกสร้างเลย, `STEP_DOTS` เหลือ `['info','slug']`, ปุ่มที่ step `'slug'` เปลี่ยนเป็น "เสร็จสิ้น ไปสร้างห้องพักแรก →" แล้ว `finish()` (switch context) ก่อน redirect ไป `/rooms/new` แทน `/dashboard`

### Layout / Theme Mapping / Content
มิเรอร์ A1 ทุกประการ (icon/heading/subtitle/field ชุดเดียวกัน)

---

## B. หน้า: Public Profile สาขา SERVICE_QUEUE (`(marketing)/u/[username]` + `views/pages/user-profile/v2/*`)

### User stories ที่ครอบ
FR-SBT-09 (Public Profile แสดงผลถูกสาขา — SERVICE_QUEUE ต้องไม่ fallback ไป product grid เปล่า)

### ข้อมูลที่ต้องใช้ — ตรวจแล้วว่า **มีอยู่แล้ว ไม่ต้องสร้าง query ใหม่**

`src/services/service-resource.service.ts` มี `listServiceResources(shopId, { activeOnly })` + `serializeServiceResource()` อยู่แล้ว (feature 00024) — `RESOURCE_SELECT` มีแค่ `id/name/description/durationMinutes/capacity/depositMode/depositValue/isActive` ไม่มี PII และไม่มี field ที่ผูก session เลย เรียกจาก RSC สาธารณะได้ตรง ๆ ปลอดภัย (ฟังก์ชันตรวจแค่ `assertShopCanUseAppointments(shopId)` ซึ่งเป็น feature-gate ไม่ใช่ authz check ที่ต้องมี session) — **ไม่ต้องเพิ่ม service function ใหม่** แค่ import แล้วเรียกใน `page.tsx` เหมือนที่ `getPublicRooms` ถูกเรียกวันนี้

**Note ประสิทธิภาพ (ไม่บล็อกดีไซน์):** `assertShopCanUseAppointments` query `Shop` ซ้ำอีกรอบทั้งที่ `page.tsx` มี `user.shop.vertical` อยู่ในมือแล้ว — เป็น double-fetch เล็กน้อย ให้ developer ตัดสินตอน implement

### Design decision — โครงสร้าง 3 สาขา + แก้จุดชนกันของคำ

**พบปัญหาสำคัญระหว่างสำรวจโค้ด (ต้องแก้พร้อมกัน ไม่งั้น feature นี้ทำร้ายตัวเอง):** `ShopProfile.tsx:81` ใช้ label tab สินค้าว่า **"สินค้าและบริการ"** — คำเดียวกับที่ PRD/BRD เพิ่งประกาศให้เป็น **display name ของ vertical `SERVICE_QUEUE` โดยเฉพาะ** และ PRD §6.1 เตือนเองว่า "ผู้ใช้สับสนระหว่าง 'สินค้าและบริการ' เดิม (หมายถึงทุกอย่างที่ไม่ใช่บ้านพัก) กับความหมายใหม่" — ถ้าไม่แก้ tab label นี้ก่อน ship ร้าน `SERVICE_QUEUE` ที่มีทั้งแท็บ "บริการ" (ใหม่) และแท็บ "สินค้าและบริการ" (ชื่อ generic เดิม) วางเคียงกันในหน้าเดียว = การชนกันของคำที่ PRD เตือนไว้ **เกิดขึ้นจริงในหน้าเดียวที่เรากำลังแก้พอดี**

**แก้:** เปลี่ยน label tab นั้นจาก "สินค้าและบริการ" → **"สินค้า"** (ตรงกับป้ายเมนูฝั่ง seller ที่ `seller-menu.ts:45` ใช้อยู่แล้ว) — ทำให้คำว่า "สินค้าและบริการ" เหลือความหมายเดียวในระบบทั้งหมด: ชื่อ vertical เท่านั้น

**tab array ใหม่ใน `ShopProfile.tsx`** (ต่อจากของเดิม ไม่รื้อโครง):
```
ปักหมุด (ถ้ามีคลิป) → ห้องพัก (ถ้า LODGING+มีห้อง) → บริการ (ถ้า SERVICE_QUEUE+มีคิวงาน, ใหม่)
  → สินค้า (ถ้า !LODGING+มีสินค้า, label เปลี่ยนจาก "สินค้าและบริการ") → เกี่ยวกับร้าน (เสมอ) → รีวิว (ถ้ามี)
```
ร้าน `SERVICE_QUEUE` ที่มีทั้งคิวงานและสินค้าเสริม (FR-SBT-08) จะเห็น **2 แท็บแยกกันชัดเจน** "บริการ" กับ "สินค้า" — ไม่ปนกัน

**Empty state ของ SERVICE_QUEUE ที่ยังไม่มีคิวงานเลย:** ใช้ pattern เดิมของระบบ ("แท็บที่ไม่มีข้อมูลไม่ถูกสร้างเป็นตัวเลือกเลย") — **ไม่สร้าง empty-state message พิเศษ** ผู้เข้าชมจะเห็นแค่ Hero + "เกี่ยวกับร้าน" (+ "รีวิว" ถ้ามี) นี่คือพฤติกรรมที่ถูกต้องตาม requirement ("ต้องไม่ fallback ไป product grid เปล่า") — ไม่ fallback ไปไหนเลยดีกว่า fallback ไปที่ผิด

### Layout (ASCII wireframe) — SERVICE_QUEUE branch, container กลางจอ max-width 960px ทุก breakpoint

```
MOBILE (≤767px, full-bleed)          TABLET (768–1023px)                     DESKTOP (≥1024px, cap 960px)
┌───────────────────────┐            ┌─────────────────────────────┐        ┌───────────────────────────────────┐
│ [cover gradient tier]  │            │      [cover gradient]        │        │         [cover gradient]           │
│      (avatar)          │            │           (avatar)           │        │              (avatar)              │
│   ร้านนวดคุณสมศรี       │            │       ร้านนวดคุณสมศรี         │        │          ร้านนวดคุณสมศรี            │
│  ✓ 87  ระดับทองแดง      │            │      ✓ 87  ระดับทองแดง        │        │         ✓ 87  ระดับทองแดง           │
│ @somsri · บริการ-ดิจิทัล│            │  @somsri · บริการ-ดิจิทัล      │        │     @somsri · บริการ-ดิจิทัล        │
│ [เหรียญ...] [เหรียญ...] │            │      [เหรียญ] [เหรียญ]        │        │         [เหรียญ] [เหรียญ]           │
│  12    45     8         │            │       12     45     8         │        │          12     45     8           │
│ นัดหมาย ลูกค้า ใช้ซ้ำ    │            │     นัดหมาย  ลูกค้า  ใช้ซ้ำ    │        │       นัดหมาย   ลูกค้า   ใช้ซ้ำ     │
│ 96% อัตราความสำเร็จจาก  │            │  96% อัตราความสำเร็จจากนัดหมาย│        │    96% อัตราความสำเร็จจากนัดหมาย   │
│ นัดหมายทั้งหมดบน Deep   │            │  ทั้งหมดบน Deep               │        │    ทั้งหมดบน Deep                   │
│──────────────────────  │            │───────────────────────────  │        │────────────────────────────────── │
│ [บริการ][สินค้า][เกี่ยว.]│            │ [บริการ][สินค้า][เกี่ยวกับร้าน]│        │  [บริการ] [สินค้า] [เกี่ยวกับร้าน] [รีวิว]│
│──────────────────────  │            │───────────────────────────  │        │────────────────────────────────── │
│ ┌─────────┐┌─────────┐ │            │ ┌────────┐┌────────┐┌──────┐│        │┌───────┐┌───────┐┌───────┐┌──────┐│
│ │(icon)    ││(icon)    ││            │ │(icon)  ││(icon)  ││(icon)││        ││(icon) ││(icon) ││(icon) ││(..) ││
│ │ นวดไทย 60││นวดน้ำมัน││ │            │ │นวดไทย60││นวดน้ำมัน││นวดฝ่าเท้า││        ││นวดไทย ││นวดน้ำมัน││นวดฝ่าเท้า││..││
│ │ ~60 นาที ││~90 นาที││ │            │ │~60นาที ││~90นาที ││~30นาที ││        ││~60นาที││~90นาที││~30นาที││..││
│ │ มัดจำ ฿100││มัดจำ 20%││ │            │ │มัดจำ100││มัดจำ20%││ไม่มีมัดจำ││        ││฿100   ││20%    ││ไม่มี  ││..││
│ └─────────┘└─────────┘ │            │ └────────┘└────────┘└──────┘│        │└───────┘└───────┘└───────┘└──────┘│
│ ┌─────────┐            │            │                              │        │                                     │
│ │นวดฝ่าเท้า │            │            │                              │        │                                     │
│ │~30 นาที  │            │            │                              │        │                                     │
│ │ไม่มีมัดจำ │            │            │                              │        │                                     │
│ └─────────┘            │            │                              │        │                                     │
│ (แชทกับร้าน ปุ่มลอย     │            │ (แชทกับร้าน ปุ่มลอยล่าง)      │        │      (แชทกับร้าน ปุ่มลอยมุมขวาล่าง) │
│  เต็มความกว้าง มือถือ)  │            │                              │        │                                     │
└───────────────────────┘            └─────────────────────────────┘        └───────────────────────────────────┘
```

grid การ์ดบริการ: `grid-cols-2` มือถือ/tablet (มิเรอร์ `PublicRoomList` เป๊ะ), ขยายเป็น `sm:grid-cols-3` บนจอกว้างถ้าจำนวนบริการเยอะ (ตัดสินตอน implement ตามจำนวนจริง)

### Section breakdown (prose)

- **Hero (ProfileHero)** — เหมือนทุก vertical: cover/avatar/trust chip/badge/stat 3 ช่อง/อัตราความสำเร็จ/ปุ่มแชท — เปลี่ยนแค่ **คำเรียกตัวเลข**: "ออเดอร์"→"นัดหมาย" (ขยาย `STAT_LABELS` เพิ่ม key `serviceQueue` — ไม่รื้อ component)
- **Tab "บริการ"** — การ์ดกริด 2 คอลัมน์ (มือถือ) แสดง: ไอคอนวงกลมแทนรูป (ServiceResource ไม่มีรูปในสคีมา — ไม่ใช่ "loading state" แต่เป็นการออกแบบที่ตั้งใจว่าประเภทนี้ไม่มีรูป) + ชื่อคิวงาน + ป้ายระยะเวลา (ถ้ามี) + ป้ายมัดจำ (ถ้ามี — ไม่แสดงบรรทัดถ้าไม่เก็บมัดจำ เงียบดีกว่าพูดว่า "ไม่มี" ทุกใบ)
- **Tab "สินค้า"** — เหมือนกลไกเดิมทุกประการ (label เปลี่ยนอย่างเดียว) แสดงเมื่อร้านมีสินค้าเสริมจริง (FR-SBT-08)
- **เกี่ยวกับร้าน / รีวิว / ปุ่มแชท** — ไม่เปลี่ยนแปลง (ความสามารถกลาง)

### Theme Source Mapping

| Section | Base path | Component | หมายเหตุ adapt |
|---|---|---|---|
| `page.tsx` data-fetch branch | `src/app/(marketing)/u/[username]/page.tsx:74-85` (ตัวมันเอง) | ขยาย `isLodging` → เพิ่ม `isServiceQueue = user.shop?.vertical === 'SERVICE_QUEUE'` + เรียก `listServiceResources`/`serializeServiceResource` (มีอยู่แล้ว) เมื่อ true | คงโครง `Promise.all` เดิม เพิ่ม branch คู่กับ rooms |
| การ์ดบริการสาธารณะ (ใหม่) | `src/views/pages/user-profile/v2/PublicRoomList.tsx` (ทั้งไฟล์) | ไฟล์ใหม่ `PublicServiceList.tsx` ใน dir เดียวกัน — คัด grid/card/no-image-box structure มาทั้งหมด เปลี่ยนแค่ field ที่แสดง | ไม่มี `imageUrl` เลยในของจริง (schema ServiceResource ไม่มี field รูป) — กล่องไอคอนแสดงเสมอ ไม่ใช่ fallback |
| ShopProfile tab array | `src/views/pages/user-profile/v2/ShopProfile.tsx:50-132` (ตัวมันเอง) | เพิ่ม conditional block `services`, เปลี่ยน label `items` จาก "สินค้าและบริการ" → "สินค้า" | ไฟล์เดิม ไม่รื้อ |
| Tab icon map | `src/views/pages/user-profile/v2/ProfileTabs.tsx:26-33` (ตัวมันเอง) | เพิ่ม `services: 'tabler:armchair'` | icon มีจริง verified แล้ว (ใช้ใน seller-menu.ts) |
| Hero stat label | `src/views/pages/user-profile/v2/ProfileHero.tsx:60-73` (ตัวมันเอง) | เพิ่ม `serviceQueue` key ใน `STAT_LABELS`, เปลี่ยน `data.isLodging?: boolean` → prop ที่บอก vertical ได้ 3 ทาง | ไม่รื้อ logic การแสดงผล |

### User flow

1. ผู้เข้าชมเปิด `/u/somsri` (ร้านนวด, vertical=SERVICE_QUEUE)
2. เห็น Hero (นัดหมาย/ลูกค้า/ใช้บริการซ้ำ/อัตราสำเร็จ) เหมือนร้านทั่วไป
3. Default tab = "บริการ" (มาก่อน "สินค้า" เพราะเป็นตัวตนหลักของร้าน) เห็นรายการบริการพร้อมระยะเวลา/มัดจำ
4. อยากจอง → กด "แชทกับร้าน" (ปุ่มเดิม กลไกเดิม — ไม่มี self-serve booking บนหน้านี้ ตรงกับสถาปัตยกรรมปัจจุบันที่ seller เป็นคนสร้างนัดผ่าน POS หลังคุยกับลูกค้า)

### Content outline (ภาษาไทย)

| ตำแหน่ง | ข้อความ |
|---|---|
| Tab label ใหม่ | บริการ |
| Tab label ที่แก้ | สินค้า (เดิม "สินค้าและบริการ") |
| Stat label (serviceQueue) — orders | นัดหมาย |
| Stat label — rateCaption | อัตราความสำเร็จจากนัดหมายทั้งหมดบน Deep |
| การ์ดบริการ — duration | ~60 นาที |
| การ์ดบริการ — deposit (FIXED) | มัดจำ ฿100 |
| การ์ดบริการ — deposit (PERCENT) | มัดจำ 20% |
| การ์ดบริการ — ไม่มี duration/deposit | ไม่แสดงบรรทัดนั้นเลย |

### Edge states ที่ต้องออกแบบ

- **ร้าน SERVICE_QUEUE ไม่มีคิวงานเลย ไม่มีสินค้าเลย** — ไม่มีแท็บ "บริการ"/"สินค้า" เลย เหลือแค่ Hero + เกี่ยวกับร้าน (+รีวิวถ้ามี) — ตั้งใจ ไม่ใช่บั๊ก
- **มีคิวงานเยอะมาก (>20)** — grid ยาวลงเรื่อย ๆ ไม่มี pagination/"ดูเพิ่มเติม" ในเวอร์ชันนี้ (มิเรอร์พฤติกรรม product grid เดิมที่ก็ไม่มี pagination — consistency)
- **ชื่อคิวงานยาวผิดปกติ** — `line-clamp` เดียวกับที่ `PublicRoomList` ใช้กับชื่อห้อง (ต้อง verify ว่ามี clamp จริงตอน implement — ของเดิมไม่เห็น clamp ชัดเจนใน snippet ที่อ่าน ให้ developer เติมถ้ายังไม่มี)
- **มัดจำ 0 กับมัดจำที่ยังไม่ตั้งค่า** — เหมือนกัน (ไม่แสดงบรรทัดเลย — ไม่ใช่ error state)

---

## Impeccable compliance (ครอบทั้ง 4 surface)

**Mode:**
- A1 / A2 / A2b (seller onboarding + business creation) → **Operate** — register override เป็น `product` ตาม PRODUCT.md (ฝั่ง `(paces)/**`) ทำงานตาม operate.md: "earned familiarity", "1 family พอ", "ไม่มี orchestrated page-load" — wizard เดิมยึดหลักนี้อยู่แล้ว งานนี้ต่อยอด ไม่เปลี่ยน mode
- B (Public Profile) → **Persuade** — register `brand` ตาม default ของ PRODUCT.md (`(marketing)/**`, `/u/[username]`) หน้านี้มีหน้าที่ตรง ๆ คือทำให้ผู้เข้าชม "กล้าโอน" (PRODUCT.md Product Purpose) ทุก element ต้องมีข้อมูลจริงหนุนหลัง (Design Principle #1 "show, don't tell") — บริการที่แสดงเป็นของจริงจาก `ServiceResource` ไม่ใช่ placeholder

**One Voice Rule** — สี primary ปรากฏเฉพาะ: radio-card ที่ถูกเลือก (border+bg จาง), progress dot ปัจจุบัน, ปุ่มหลัก, tab underline indicator, ปุ่มแชทลอย — ทั้งหมดคือ "action หรือ selection state" ไม่ใช่ตกแต่ง สัดส่วนต่อจอ ≤10% ทุกจอ (การ์ดบริการ/สินค้า/ข้อความ hint ทั้งหมดเป็นสีกลาง)

**Verified-Means-Green Rule — จุดที่ต้องระวังเป็นพิเศษในงานนี้:** badge "มีจัดส่งสินค้า"/"ไม่มีจัดส่งสินค้า" (A1/A2) เป็น **ข้อมูลข้อเท็จจริง ไม่ใช่สถานะยืนยัน** — จงใจเลือก `bg-default-100 text-default-600` (neutral) ไม่ใช่เขียว/แดง แม้จะมีสัญชาตญาณอยากใช้เขียว=มี/แดง=ไม่มี เพราะนั่นคือการติดสี semantic บนสิ่งที่ไม่ใช่ verified/error — เขียวสงวนไว้ให้ verified chip เดิมของ hero เท่านั้น (คงเดิม ไม่แตะ)

**Sentence-case Rule** — ทุก label/heading ใหม่เป็น sentence case ภาษาไทย ไม่มี ALL CAPS

**Ink-tinted shadow** — ไม่มี shadow ใหม่ที่ต้องออกแบบเอง (การ์ดทั้งหมดยืม `.card`/border ของ pattern เดิมที่ผ่าน Impeccable มาแล้ว)

**Anti-slop (narrative.donts)** — ไม่มี gradient ตกแต่งใหม่, ไม่มี hero-metric template ใหม่, ไม่มี eyebrow, ไม่ซ้อนการ์ดในการ์ด

**น้ำเสียงข้อความ** — copy บอกทางออก/ผลลัพธ์ตรง ๆ ("เสร็จสิ้น ไปสร้างห้องพักแรก" บอกว่าจะเกิดอะไรขึ้นจริง ไม่ใช่ "ถัดไป" generic ที่หลอกไว้ก่อนว่ายังมีต่อ) ไม่มีคำราชการ/ไฮป์

**จุดที่ pattern เดิมขัดกับ Impeccable และวิธีตัดสิน:**
- Tab label "สินค้าและบริการ" (ของเดิม ผ่าน Impeccable มาก่อนหน้านี้ตอนออกแบบ ShopProfile) ชนกับคำศัพท์ใหม่ของ feature นี้โดยตรง — ตัดสินใจ **เปลี่ยน label เดิม** แทนที่จะหลีกเลี่ยงคำใหม่ เพราะคำว่า "สินค้าและบริการ" ในฐานะชื่อ vertical เป็น requirement ที่ผ่าน user review แล้ว (PRD/BRD) ในขณะที่ tab label เป็นแค่ UI copy ที่ยังไม่เคยถูกล็อกเป็น requirement — แก้จุดที่ freedom สูงกว่า

---

## Anti-slop self-check

1. **เอาไปใช้กับสินค้าอื่นได้ทันทีไหม** — ไม่ได้ทันที: copy ("คิวงาน", "มัดจำ", "หมอนวด A") ผูกกับ vocabulary ของ feature 00024 ที่มาจาก persona จริง (ร้านแต่งไฟหน้ารถ) ไม่ใช่ SaaS ทั่วไป; การตัดสินใจ "LODGING ข้าม step สุดท้ายไปหน้าเต็ม" ผูกกับสถาปัตยกรรมจริงของ `/rooms/new` ที่มีอยู่แล้วในระบบนี้เท่านั้น
2. **มีของเด่นที่สุด 1 อย่างต่อจอไหม** — A1/A2: การ์ดที่ถูกเลือกเด่นด้วย border-primary ชัดกว่า 2 ใบที่เหลือ; B: อัตราความสำเร็จยังคงเป็นตัวเลขที่ได้พื้นที่ใหญ่สุดในหน้าเหมือนเดิม การ์ดบริการทุกใบน้ำหนักเท่ากันโดยตั้งใจ (เป็น list ของตัวเลือกที่เท่าเทียมกันจริง)
3. **element ไหนซ้ำ/ค่าคงที่ที่ต้องตัด** — ตัด "step สินค้าแรก" ออกจาก LODGING branch (เดิมเป็นค่าคงที่ที่ผิดบริบทเสมอ); ตัดคำว่า "สินค้าและบริการ" ที่ซ้ำความหมายออกจาก tab label เดิม
4. **state ครบไหม** — empty (ไม่มีคิวงาน/สินค้า → ไม่สร้างแท็บ), error (บันทึก vertical ล้มเหลว → toast), loading (ปุ่ม disabled+spinner ระหว่างบันทึก มิเรอร์ของเดิม), ข้อความยาว (ระบุให้ developer เติม line-clamp), ตัวเลข 0/มาก (มัดจำ 0 = ไม่แสดงบรรทัด, คิวงานเยอะ = grid ยาวไม่ pagination)
5. **copy บอกผลลัพธ์จริงไหม** — "เสร็จสิ้น ไปสร้างห้องพักแรก →" บอกตรง ๆ ว่าจะออกจาก wizard ไปหน้าอื่น; ปุ่ม "เพิ่มคิวงานเลย" มิเรอร์ "สร้างสินค้าเลย" ตรงรูปแบบกริยา+กรรมที่ระบบใช้อยู่แล้ว
6. **คำเดียวกันหมายถึงของเดียวกันทั้ง spec ไหม** — "คิวงาน" ใช้คำเดียวกับเมนู seller จริง (`seller-menu.ts`), "สินค้าและบริการ" สงวนไว้เป็นชื่อ vertical อย่างเดียวหลังแก้ tab label, "บริการ" (tab) ↔ "คิวงาน" (แนวคิดข้างใน) ใช้สม่ำเสมอตามบริบท (tab บนหน้าร้านสาธารณะเรียก "บริการ" เพราะผู้ซื้อไม่รู้จักคำว่า "คิวงาน" ที่เป็นภาษาภายในของ seller — ความต่างที่ตั้งใจ ไม่ใช่ inconsistency)
7. **สีสื่อความหมายถูกไหม** — ตรวจแล้วในหัวข้อ Impeccable compliance (badge จัดส่งใช้ neutral ไม่ใช้เขียว/แดง)
8. **แตะได้จริงบนมือถือไหม** — ปุ่มทุกปุ่มมิเรอร์ `min-h-11`/`min-bs-[44px]` ของ pattern เดิม; radio-card ทั้งใบเป็น `<label>` คลิกได้ทั้งพื้นที่ (ไม่ใช่แค่ dot วงกลม) เหมือน A2 เดิม; ปุ่มแชทลอยของ B อยู่ตำแหน่งเดิมไม่เปลี่ยน
9. **จอกว้าง 1440 คอลัมน์ไหนว่าง** — A1 (`max-w-md` กลางจอ) และ B (`max-is-[960px]` กลางจอ) เป็น layout กลางจอ single-column ที่ผ่านการตัดสินใจมาแล้วก่อนหน้านี้; A2 เป็น `max-w-2xl` การ์ดเดี่ยวกลางจอ ไม่มีคอลัมน์ข้างที่ว่างเปล่า

---

## Open questions (ให้ Controller/planner/developer ตัดสิน)

1. **Endpoint ที่ A1 step "vertical" จะเรียกบันทึกยังไง** — `Shop` ของ Personal ถูกสร้างไว้ก่อนแล้ว (ตอน signup, มี `needsOnboarding=true`) การตั้ง `vertical` ที่ step ใหม่นี้คือการ **update** shop ที่มีอยู่ แต่ BR-SBT-09 ห้าม service แก้ shop รับ field `vertical` เข้ามาเลย — ต้องมีเงื่อนไข "ตั้งได้ครั้งเดียวตอนที่ shop ยังอยู่ในสถานะ onboarding ไม่เสร็จ (ไม่มี slug) เท่านั้น" เป็นการตัดสินใจ backend/SRS ล้วน ๆ (SDS TD-002 ตอบข้อนี้แล้ว: ใช้ `slug === null` เป็นเงื่อนไข)
2. **A2b (BusinessOnboardingWizard) อยู่ใน scope รอบนี้หรือแยก sprint** — ออกแบบไว้ครบเพื่อไม่ให้เกิดช่องว่าง UX แต่ Controller เป็นคนตัดสิน
3. **ไอคอนที่ยังไม่เคยใช้ในโปรเจกต์ ต้องยืนยันก่อนใช้จริง (Hard Rule 12):**
   - `lucide:clock` (badge ระยะเวลาในการ์ดบริการสาธารณะ ฝั่ง Vuexy)
   - `lucide:wallet` หรือ `lucide:banknote` (badge มัดจำในการ์ดบริการสาธารณะ)
   - `lucide:calendar-check` (ไอคอนกล่องแทนรูปในการ์ดบริการที่ไม่มีรูป — ทางเลือกแทน `lucide:image` เดิมของ PublicRoomList)

   ที่ **verified แล้วปลอดภัย** (ใช้อยู่จริงใน production codebase): `tabler:armchair`, `tabler:building-store`, `tabler:map-pin`, `tabler:link`, `tabler:package`, `tabler:category` — ไม่ต้องยืนยันซ้ำ
4. **จำนวนคอลัมน์ grid การ์ดบริการสาธารณะบนจอกว้าง** — เสนอ `sm:grid-cols-3` ถ้าร้านมีบริการเยอะ แต่ยังไม่มีข้อมูลจริงว่าร้าน SERVICE_QUEUE ทั่วไปมีกี่บริการโดยเฉลี่ย (ข้อมูล prod ตอนนี้มีแค่ 2 `ServiceResource` ทั้งระบบ)
5. **`STAT_LABELS.serviceQueue` กับ `ProfileHeroData.isLodging` typing** — ระบุ "ต้องมี 3 ทาง" ไว้ในดีไซน์ แต่รูปแบบ TypeScript ที่แน่นอน (ขยาย `isLodging` เป็น union หรือเพิ่ม field `vertical` คู่กันไปเลย) เป็นการตัดสินใจของ developer/SDS

---

## ไฟล์ที่อ่านประกอบการออกแบบ (traceability)

`DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, `~/.claude/skills/impeccable/reference/{shape,operate,craft-floor}.md`, `docs/20 - Features/00028 - Shop Business Type/{PRD,BRD}.md`, `docs/system/ui-guideline/paces-component-reference.md`, `src/app/(paces)/seller/onboarding/page.tsx`, `src/lib/lodging.ts`, `src/app/(paces)/seller/(dashboard)/business/create/components/CreateBusinessForm.tsx`, `src/app/(paces)/seller/(dashboard)/business/[shopId]/onboarding/components/BusinessOnboardingWizard.tsx`, `src/services/business-shop.service.ts`, `src/app/(marketing)/u/[username]/page.tsx`, `src/views/pages/user-profile/v2/{ShopProfile,PublicRoomList,ProfileHero,ProfileTabs}.tsx`, `src/views/pages/user-profile/profile/AboutOverview.tsx`, `src/services/{service-resource,appointment}.service.ts`, `src/lib/seller-menu.ts`, `src/lib/shop-categories.ts`, `src/app/(paces)/seller/(dashboard)/queues/components/ResourceForm.tsx`, `src/app/(paces)/seller/(dashboard)/rooms/new/page.tsx`
