---
name: mockup-to-nextjs
description: Use เมื่อ user ส่ง HTML/CSS mockup (ไฟล์ .html, "แปลง mockup", "ทำตาม mockup นี้", "เอา design นี้มาลง") แล้วต้อง port เข้าหน้า/component Next.js ของ SafePay/Deep ให้ตรง mockup ที่สุด (สี ตำแหน่ง การจัดวาง) โดยไม่คิดเอง และทักท้วงส่วนที่ระบบทำไม่ได้. ครอบทั้ง buyer Vuexy และ seller/admin Paces.
---

# Mockup → Next.js (port ให้ตรง ไม่เพี้ยน)

## Core principle — dual source of truth

- **Mockup = SSOT ของ "หน้าตาต้องเป็นยังไง"** (สี ตำแหน่ง ลำดับ spacing การจัดวาง content). **ห้ามคิดเอง ห้าม redesign ห้าม "ปรับให้สวยขึ้น"** — reproduce ตาม mockup.
- **Theme (Paces/Vuexy) = SSOT ของ "สร้างยังไง"** (primitive/token ที่ใช้ประกอบ — Hard Rule 1/7).

เมื่อ 2 อย่างนี้ **ขัดกัน** (mockup ใช้ค่าที่ไม่มีใน theme token) หรือ mockup แสดง **ข้อมูลที่ระบบไม่มี** → **หยุด แล้วทักท้วง user ก่อนเขียนโค้ด**. off-token value = ประเภทเดียวกับ impossible-data: ทั้งคู่คือ "STOP-and-ask" ไม่ใช่ "เดาต่อเงียบ ๆ".

**การละเมิด letter ของกฎ = ละเมิด spirit** — "map ให้ใกล้ ๆ พอ" / "แต่งนิดหน่อยให้เข้า theme" โดยไม่ถาม = ผิด.

## Workflow

### 1. อ่าน mockup ให้ครบก่อน (ห้ามกวาดตา)
`Read` ทุกไฟล์ .html/.css ของ mockup. ถ้ามี inline `<style>` / class → อ่านค่าจริง ไม่ใช่เดาจากภาพ.

### 2. Mockup Inventory — สกัดเป็นตาราง (ต่อ section/element)
| Section/Element | Content (ไทย) | สี (hex) | spacing/radius | font/size/weight | layout (flex/grid, align, order) | **Data ที่แสดง** |

"Data ที่แสดง" = ทุกตัวเลข/สถานะ/สถิติ (ยอด view, จำนวนคนดู, rating, badge, "ขายแล้ว N") — จดไว้ทุกตัว.

### 3. Data-feasibility pass — เช็คว่าระบบให้ข้อมูลได้ไหม
ทุก "Data ที่แสดง" → หาใน Prisma schema (`prisma/schema.prisma`) / `src/services/` / API. อันไหน **ระบบไม่ได้เก็บ/คำนวณไม่ได้** → เข้า **FLAG list** (อย่า invent, อย่าเงียบ ๆ ลบ, อย่าใส่ mock ค้างไว้).

### 4. Token-mapping pass — map ค่า visual → theme token
ทุกสี/spacing/radius/font-size → หา token ที่ตรงใน theme (Paces primitive: `bg-primary`/`bg-{semantic}/15`/`p-*`/`rounded-lg`/`text-default-*`/`size-*`; Vuexy: MUI/theme token).
- ตรง token พอดี → ใช้ token
- **ไม่มี token ตรง / map แล้วจะเพี้ยนตาสังเกตได้** → เข้า **FLAG list** พร้อม delta (mockup `#FF5733` ≠ token ใด, ใกล้สุด = `warning`)

Font ต้องเป็น **Anuphan** เท่านั้น (Hard Rule 5) — mockup ระบุ font อื่นก็ยังใช้ Anuphan (จดใน FLAG ถ้า mockup ตั้งใจใช้ font อื่นจริง).

### 5. 🛑 นำ FLAG list ให้ user ตัดสิน — ก่อนเขียนโค้ด
```
⚠️ ส่วนที่ mockup กับระบบ/theme ไม่ตรง — ขอ user ตัดสินก่อน build:
[data] "ยอด view 1,240" — ระบบไม่เก็บ view count → ลบ / stub "—" / สร้าง backend?
[token] hero bg #FF5733 — ไม่มีใน Paces token, ใกล้สุด bg-warning → ใช้ token / override?
```
ห้าม build จนกว่า user ตอบ. (`ลุยเลย/ok หมด` = ตอบครบทุกข้อพร้อมกันได้)

### 6. ส่งต่อ safepay-ux (Hard Rule 8 ยังบังคับ)
Mockup ไม่ได้ข้าม `safepay-ux` — แต่ mockup + Mockup Inventory + Token Mapping คือ **input** ให้ ux ออก Design Spec + Theme Source Mapping (ชี้ theme file ที่จะ copy). ux ยืนยัน primitive/path; skill นี้ยืนยัน fidelity ต่อ mockup.

### 7. Copy theme file → adapt ตาม mockup (Hard Rule 1/3)
Developer copy theme file ที่ ux ชี้ แล้วปรับ layout/order/spacing/content **ให้ตรง mockup** ด้วย token ที่ map ไว้. Commit มี `Base: theme/...` line.

### 8. Verify fidelity (ครบ 3 ชั้น — ห้ามข้าม)
1. **Side-by-side screenshot** — Chrome DevTools MCP เปิด mockup.html เทียบหน้า Next.js จริง (`*.deepth.local:4000`) ทุก section
2. **Computed-value grep** — `getComputedStyle` element สำคัญ เทียบ color/px/font-family กับ mockup (เลข/hex ตรงไหม)
3. **Element checklist** — ไล่ทุก element ใน Mockup Inventory ว่ามีครบในหน้าจริง (ไม่ตกหล่น / ไม่เพิ่มเอง)

## Red flags — เจอความคิดพวกนี้ = หยุด กลับไปทำตาม workflow

| ความคิด | ความจริง |
|---|---|
| "map สีให้ใกล้ ๆ พอ ไม่ต้องถาม" | off-token = FLAG ต้องถาม user (บทเรียน CC V4 blue/radius20 → user ปฏิเสธ) |
| "ใส่ mock ยอด view ไว้ก่อน เดี๋ยวค่อยต่อ backend" | impossible-data ต้อง FLAG ไม่ใช่ค้าง mock (user จะเข้าใจผิดว่ามีจริง) |
| "แต่งจาก mockup ให้เข้า theme นิดหน่อย" | redesign เงียบ ๆ = ละเมิด; mockup = SSOT ของหน้าตา ถาม user ก่อนเปลี่ยน |
| "Base: comment ไว้แล้ว จะใช้ arbitrary value ก็ได้" | Base: + arbitrary = ยังละเมิด Hard Rule 7 (บทเรียน v6/v7) |
| "component render ผ่าน = ตรง mockup แล้ว" | render-pass ≠ fidelity; ต้อง side-by-side + computed-value เทียบจริง |
| "ดูภาพ mockup แล้วกะเอาน่าจะ ~16px" | อ่านค่าจริงจาก CSS mockup ห้ามกะจากภาพ |
| "mockup ใช้ Inter ก็ใช้ Inter" | Anuphan เท่านั้น (Hard Rule 5) — font อื่นใน mockup = FLAG |

## Reference (deep)
- Theme-copy + Base: line → skill `ui-theme-sourcing`
- Paces no-arbitrary-value → memory `feedback_paces_no_arbitrary_value`, Hard Rule 7
- reference asset vs theme layer → memory `feedback_reference_adapt_not_copy`
- mockup token cross-check → memory `feedback_mockup_token_crosscheck`
- visual quality gate → memory `feedback_visual_quality_gate`
