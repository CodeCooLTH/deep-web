# 🛑 Impeccable = Design System หลักของงาน UI ทุกชิ้น

> **กฏ:** งาน frontend/UI **ทุกชิ้น** ของ Deep ต้องยึด **Impeccable design system** เป็นหลักในการตัดสินใจด้านดีไซน์ (สี, hierarchy, spacing, เงา, motion, typography) — ควบคู่กับ theme-copy (Hard Rule 1/8). ห้ามตัดสินใจดีไซน์ตามใจ/ตาม default ของ AI

## แหล่งอ้างอิง (source of truth)
| ไฟล์ | ใช้ทำอะไร |
|------|----------|
| `.impeccable/design.json` | design system ฉบับ machine — สี/tonal ramp, typography, shadows, motion, breakpoints, narrative. **อ่านก่อนทำ UI เสมอ** |
| `DESIGN.md` | design system ฉบับคน — palette + named rules + เหตุผล |
| https://impeccable.style/ | วิธีคิด (method) — anti-slop, hierarchy, contrast, restraint |

## North Star: **"The Trusted Counter"**
fintech ที่เข้าถึงง่าย — เคาน์เตอร์ร้านที่ไฟสว่าง สะอาด เป็นมิตร ทุกอย่างตรวจสอบได้เปิดเผย. มั่นใจแต่ไม่ข่มขู่, โมเดิร์นแต่ไม่เย็นชา. **Trust แสดงด้วยสัญญาณจริง ไม่ใช่ badge ตกแต่ง**

## กฏสีที่ห้ามผิด (Named Rules)
1. **The One Voice Rule** — Confident Violet `#7367F0` ปรากฏ **≤ ~10% ของจอ** = accent ของ *action* เท่านั้น ไม่ใช่ของตกแต่ง. ความหายาก = พลังของมัน
2. **The Verified-Means-Green Rule** — เขียว `#28C76F` สงวนไว้สำหรับ **"ยืนยันแล้ว/สำเร็จ/ผ่าน"** เท่านั้น. ห้ามใช้เขียวกับสถานะที่ยังไม่ยืนยัน (ไม่งั้นสัญญาณ trust เฟ้อ)
3. **Ink Plum ไม่ใช่ดำสนิท** — text ใช้ `#2F2B3D` ที่ opacity `0.9`(หลัก)/`0.7`(รอง)/`0.4`(disabled)/`0.12`(divider). **ห้าม `#000`**

## Token ที่ต้องใช้ (ห้าม hardcode ค่าอื่น)
- **สี:** primary(ม่วง), verified-green, signal-cyan, warning-amber(รอ/เตือน), error-coral, surface-mist `#F8F7FA`(พื้น) — ใช้ผ่าน `var(--mui-palette-*)` / Preline token
- **เงา (design.json shadows):** sm `0 2px 8px rgb(47 43 61/.12)`(การ์ดพัก), md(hover), lg(modal), primary-sm(ปุ่มม่วง)
- **มุมโค้ง:** นุ่ม (`rounded-lg`/`rounded-xl`/`rounded-2xl`)
- **Motion:** easing `cubic-bezier(0.25,1,0.5,1)`; `150ms`(hover) / `200ms`(transition ทั่วไป)
- **ฟอนต์:** Anuphan เท่านั้น (Hard Rule 5)
- **Mobile-first:** tap target ≥44px

## วิธี Impeccable (method) — ยึดตอนออกแบบ/รีวิว
1. **Anti-slop** — ตัด default/reflex ของ AI ทิ้ง (เช่น "marketplace ไทย → เลย์เอาต์ Shopee", ฮีโร่บล็อกสีไม่มีภาพ, 4-icon แถวแบน). ดูว่ามัน "ดูเป็นเทมเพลต" ไหม
2. **System respect** — inherit token/component เดิม (Vuexy/Paces + design.json) **ห้ามเขียนทับ**
3. **Register: brand vs product** — landing เล่นตามกฎ brand, dashboard/หลังบ้านเล่นตามกฎ product (คนละ register)
4. **Hierarchy · Contrast · Restraint** — เน้นสิ่งสำคัญให้เด่น (เช่น trust score), ตัดของฟุ่มเฟือย, ม่วงน้อยแต่ตรงจุด

## Workflow ก่อนทำ UI (เพิ่มจาก Hard Rule 1/8)
1. อ่าน `.impeccable/design.json` + `DESIGN.md` (design decision)
2. Theme-copy จาก Vuexy/Paces (Hard Rule 1) + ผ่าน `safepay-ux` (Hard Rule 8)
3. Apply named rules + tokens ข้างบน
4. Self-check anti-slop: "มันดูเป็นเทมเพลต/generic ไหม? ม่วงเกิน 10% ไหม? เขียวใช้ผิดที่ไหม? ดำสนิทไหม?"

## ตัวอย่างที่ใช้จริง (บทเรียน)
- Buyer dashboard 2026-07-04: hero banner โชว์ trust score + สถานะยืนยันตัวตน (สัญญาณจริง ไม่ใช่การ์ตูนลอย), stat tiles สีตาม semantic (เขียว=สำเร็จ), sidebar เอา bullet ออก + ไอคอน active=ม่วง/inactive=สีรอง
