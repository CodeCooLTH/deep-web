# Retro — Impeccable remediation (backoffice + public profile) + POS order-create fixes

> ช่วงงาน: 2026-07-22 → 2026-07-23
> Surface: seller/admin `(paces)/**` (backoffice), buyer `(marketing)/u,/b` (public profile), POS `/orders/new`
> ผลลัพธ์: **deployed prod** ทั้งหมด (merge เข้า `main`) — public profile + POS verify บนเบราว์เซอร์ prod จริง

---

## สิ่งที่ทำ (สรุป)

1. **Impeccable audit 3 รอบ** → Scope Baseline 2 phase (backoffice `docs/scope/2026-07-22-impeccable-backoffice-*`, public profile `...-public-profile-*`)
2. **Phase A — backoffice remediation** (S-A1..S-A10): บั๊กสีการ์ด CANCELLED ขึ้นเขียว (Verified-Means-Green), gradient ม่วง badge modal, eyebrow uppercase, gradient text 404, Sweet Alert hardcode hex (Vuexy warning หลุดเข้า Paces), ลบ dead code `IdentityBar`
3. **Phase B — public profile** (S-B1..S-B16): token normalize (Tailwind slate → Ink Plum), `getTierAccentColor`/`getTierGradient` sync tonalRamp, **desktop layout ใหม่แบบ Instagram** (คอลัมน์เดียว 960px + stat bar + badge pill + โซนความน่าเชื่อถือ 3 การ์ด), `completionRate` + sample gate
4. **Impeccable critique** (20/40) → แก้ P0 สองข้อ: verified badge บอกระดับ (L1 OTP ไม่ได้เขียว), ร้านใหม่ banner เทา + "ร้านใหม่ · ยังไม่มีประวัติเพียงพอ" ผูก `completionRate===null` (ทนการปั๊มรีวิว)
5. **POS `/orders/new`** — พบ+แก้ 6 บั๊ก desktop + เปลี่ยนช่องเลือกสินค้าเป็น type-to-search + แถวเปล่ารอเสมอ (spreadsheet) + ลบปุ่มเพิ่มรายการเอง

---

## บทเรียนใหญ่ที่สุด — grep + tsc ผ่านหมด แต่พังจริง ต้องกดบนเบราว์เซอร์ถึงเจอ

**4 บั๊กในงาน POS ที่ static analysis (grep gate + `tsc --noEmit`) ผ่านทั้งหมด แต่พังจริงบน prod:**

| บั๊ก | ทำไม static มองไม่เห็น |
|---|---|
| ช่องเลือกสินค้ากว้าง 0px | CSS cascade: `.form-input{width:100%}` (unlayered) ชนะ `w-14` (@layer utilities) — เป็น layout runtime ไม่ใช่ type/syntax |
| dropdown อยู่หลัง fullscreen layer | z-index 30 < wrapper z-50 = stacking occlusion (ไม่ใช่ geometric clip) — วัด `getBoundingClientRect` ยัง "ไม่ถูก clip" แต่ `elementFromPoint` เจอว่ามี layer ทับ |
| โหลดหน้าได้ 2 แถวเปล่าแทน 1 | `useWatch` async → effect ยิงซ้ำก่อน state สะท้อน append — static trace บอก "1 แถว ปลอดภัย" ผิด |
| ไอคอนแว่นขยายทับตัวอักษร | `<label>` คั่นระหว่าง `.input-icon` กับ input ทำให้ adjacent-sibling selector (`+ .form-input`) ไม่ match → ไม่ได้ padding |

→ **ยืนยันชัดเจน: visual QA แทนด้วย static analysis ไม่ได้.** งานที่แตะ layout/CSS/interaction ต้องกดจริงบนเบราว์เซอร์ (Chrome DevTools MCP + `elementFromPoint`/computed-style ไม่ใช่แค่ screenshot) ก่อน claim complete. developer เทสต์เองไม่ได้ (dev server เป็น worktree อื่น) → Controller ต้อง verify

## บทเรียน — คอมเมนต์ที่มี arbitrary-value class ทำ build พังทั้งแอป

commit P0 profile fix ใส่คอมเมนต์อธิบายโค้ดเก่าที่มีสตริง `` `border-[var(--mui-palette-...)]` `` (มี `...` ข้างใน `var()`) — **Tailwind scanner อ่านไฟล์เป็น text ล้วน ไม่ parse โครง TS** จึงเก็บสตริงในคอมเมนต์ไปเป็น class candidate → generate CSS ผิดไวยากรณ์ → `Parsing CSS source code failed` → **build ล้มทั้งแอป (push ขึ้น prod ไปแล้วต้องรีบแก้)**

→ **`tsc` ไม่แตะ CSS pipeline — ผ่าน tsc ≠ build ผ่าน.** งานที่อาจกระทบ Tailwind/CSS ควรรัน `build` จริงก่อน push ไม่ใช่แค่ `tsc --noEmit`. และห้ามเขียนตัวอย่าง arbitrary-value class (วงเล็บเหลี่ยม) ลงในคอมเมนต์

## บทเรียน — Paces `_forms.css` ไม่ห่อ `@layer` = width utility บน `.form-input` ไม่มีผลทั้งระบบ

`src/assets/css/custom/_forms.css` เป็นไฟล์เดียวในชุด Paces ที่**ไม่ได้ห่อ `@layer components`** (ต่างจาก `_buttons/_badge/_card/_dropdown`). Tailwind v4 = unlayered ชนะทุก `@layer` เสมอ → `.form-input{width:100%}` ชนะ `w-14` เขียนยังไงก็ไม่ชนะ. วิธีคุมความกว้าง `.form-input` ในแถว flex = ห่อ `.input-group` (มี `> .form-input{width:1%}` unlayered specificity สูงกว่า). และ `.input-icon-group` = `.input-icon:first-child + .form-input{!ps-10}` (adjacent sibling — ห้ามแทรก element คั่น)

## บทเรียน — component ที่ซ่อนด้วย `lg:hidden` ยัง mount + รัน effect

หน้า POS render ทั้ง mobile (`QuickForm`) และ desktop (`CartPanel`) พร้อมกัน ซ่อนด้วย CSS. effect ของ `QuickForm` ("ลบจนเหลือ 0 → มี 1 บรรทัดว่าง") ยังรันบน desktop ยัดแถวผีเข้า `items` ที่ desktop ใช้ร่วม → **กฎที่กระทบ shared state ต้องอยู่ที่ owner (`OrderCreateForm` ที่ถือ `useFieldArray`) ไม่ใช่ใน component เฉพาะ platform**

## บทเรียน — ux gate จับ assumption ที่ Controller ตั้งผิด

หลายรอบที่ Controller ตั้ง assumption แล้ว `safepay-ux` ตรวจพบว่าผิดก่อนลงมือ:
- S-A7 badge SERVICE: Controller เดา `info` → ux พบว่าชนกับ `DIGITAL` → ใช้ `secondary`
- tier gradient contrast: ux คำนวณ WCAG จริงพบ Gold/Diamond ตก AA (tier-name 15px/600 ไม่เข้าเกณฑ์ large-text) → ขยับ scrim
- POS bug 2 → ux เจอว่า `_forms.css` unlayered เป็น root cause (Controller เดาว่า specificity ชนกันเฉย ๆ)
- reviewCount≥3 = ด่านที่มิจฉาชีพในโจทย์ critique ผ่านพอดี (KG-1)

→ **Hard Rule 8 (ux gate ก่อน dev) คุ้มจริง** — โดยเฉพาะเมื่อ Controller "รู้คำตอบอยู่แล้ว" ซึ่งมักเป็นตอนที่พลาด

## บทเรียน — reviewer จับ traceability gap (โค้ดไม่ตรง baseline)

reviewer flag ว่าโค้ดไม่ตรง scope baseline หลายจุด — ตรวจแล้วเป็น **เอกสารตามหลังการตัดสินใจไม่ทัน** ไม่ใช่โค้ดผิด (การตัดสินเกิดในแชทแต่ไม่เขียนกลับ baseline). รวมถึง **S-B9 = S-id ที่ Controller ประดิษฐ์ในคำสั่ง dev แล้ว cite ในคอมมิตโดยไม่เขียนลง baseline ก่อน** (invent ID ให้ดูเหมือนอนุมัติแล้ว — สิ่งที่ Controller คอยจับคนอื่นทั้งงาน)

→ **การตัดสินใจระหว่างทางต้องเขียนกลับ baseline ทันที** ไม่ใช่ค้างในแชท — ไม่งั้น reviewer/audit รอบหน้าสับสน

---

## Process ที่ได้ผล

- **prod-verify loop:** dev server เป็น worktree ผู้ใช้ (ทำ feat 00017 ค้าง, dirty) → verify บน dev ไม่ได้ → push → รอ Vercel deploy (~2.5 นาที background wait) → กด Chrome MCP บน prod จริง (ผู้ใช้ล็อกอินไว้). ได้ผลดีสำหรับ verify UI ที่ dev server ใช้ไม่ได้
- **cherry-pick แทน merge เมื่อ branch ตามหลัง main มาก:** branch เดิม `impeccable/revise-ui` ตามหลัง main 77 commit + main ทำ Impeccable fix ชุดเดียวกันไปแล้ว (`b986b042` ลบ `PlatformReputationList` เพราะตัวเลขปลอม) → สร้าง `impeccable/on-main` จาก main ใหม่ cherry-pick เฉพาะของที่เรามีจริง (Phase A ไม่ชนเลย, layout เขียนใหม่บนฐาน main). user ตัดสิน "ยก main เป็นฐาน" ถูก

## Carry / ยังไม่ทำ

- **Gate 2 sign-off + `phase-retro` ceremony** ของ Phase A/B (retro นี้ทำแทนบางส่วน แต่ไม่ได้ flip สถานะ baseline เป็น SIGNED-OFF อย่างเป็นทางการ)
- **known-gap โปรไฟล์ 10 ข้อ** ใน `docs/scope/2026-07-22-impeccable-public-profile-scope-baseline.md` (KG-1..KG-10) — เด่น: **KG-1** reviewCount≥3 มิจฉาชีพผ่านได้ (ต้อง product ออกแบบ business rule), **KG-10** `/o/[token]` ยังไม่มี new-shop override (จังหวะผู้ซื้อกดยืนยัน เดิมพันสูงกว่าโปรไฟล์)
- **coverage gap backoffice audit:** ลงลึกจริง ~28/281 ไฟล์ (`inventory/`, `products/` ส่วนใหญ่, `customers/`, `notifications/`, seller auth ยังไม่ตรวจ)
- **test `getSellerPageTitle` แดง** (pre-existing บน branch: label เมนู "ยืนยันตน" vs test คาด "การยืนยันตัวตน")
- **promote 3 บทเรียน Paces CSS ลง `docs/system/ui-guideline/paces-component-reference.md`** (`_forms.css` unlayered, `.input-icon-group` adjacent sibling, comment-arbitrary-value-breaks-build)
