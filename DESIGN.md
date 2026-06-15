---
name: Deep (SafePay)
description: ระบบสร้างความน่าเชื่อถือสำหรับซื้อขายออนไลน์ C2C — น่าเชื่อถือแบบอบอุ่น, mobile-first, ภาษาไทย
colors:
  primary: "#7367F0"
  primary-light: "#8F85F3"
  primary-dark: "#675DD8"
  verified-green: "#28C76F"
  signal-cyan: "#00BAD1"
  warning-amber: "#FF9F43"
  error-coral: "#FF4C51"
  ink: "#2F2B3D"
  slate: "#808390"
  surface-mist: "#F8F7FA"
  surface-paper: "#FFFFFF"
  divider: "#2F2B3D1F"
typography:
  display:
    fontFamily: "Anuphan, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "2.875rem"
    fontWeight: 500
    lineHeight: 1.478
    letterSpacing: "normal"
  headline:
    fontFamily: "Anuphan, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.5
  title:
    fontFamily: "Anuphan, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.556
  body:
    fontFamily: "Anuphan, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.467
  label:
    fontFamily: "Anuphan, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.385
    letterSpacing: "0.4px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-paper}"
    rounded: "{rounded.md}"
    padding: "8px 20px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.surface-paper}"
  button-tonal:
    backgroundColor: "#7367F029"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "8px 20px"
  chip-verified:
    backgroundColor: "#28C76F29"
    textColor: "{colors.verified-green}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.surface-paper}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
---

# Design System: Deep (SafePay)

## 1. Overview

**Creative North Star: "The Trusted Counter"**

Deep รู้สึกเหมือนเคาน์เตอร์ร้านที่ไฟสว่าง สะอาด และเป็นมิตร ที่ทุกอย่างถูกตรวจสอบกันอย่างเปิดเผยตรงหน้า ก่อนเงินจะเปลี่ยนมือ. ความน่าเชื่อถือไม่ได้มาจากการป่าวประกาศ แต่มาจากสัญญาณจริงที่ยืนยันได้ — verified chip, ประวัติออเดอร์, completion rate, รีวิวจริง. โทนคือ fintech ที่เข้าถึงง่าย: มั่นใจแต่ไม่ข่มขู่, โมเดิร์นแต่ไม่เย็นชา.

ระบบวางอยู่บนพื้นเย็นนวล (Cool Mist `#F8F7FA`) กับการ์ดสีขาว ขอบโค้งนุ่ม (6–8px) และเงาฟุ้งบางๆ ที่ผสมหมึกสีพลัม. ม่วงมั่นใจ (`#7367F0`) เป็นเสียงหลักของปุ่ม/ลิงก์/โฟกัส ส่วนเขียว Verified (`#28C76F`) เป็นสีที่มีความหมายเชิงแบรนด์มากที่สุด — มันคือสีของ "เชื่อได้". ตัวอักษร Anuphan ตัวเดียวแบกทุกบทบาทตั้งแต่ heading ถึง label โดยเล่นน้ำหนัก 400/500 เป็นหลัก.

ระบบนี้ **ปฏิเสธ**: ความแข็งทื่อแบบฟอร์มธนาคาร, เทมเพลต AI-SaaS โหลๆ (ไล่สีม่วง, การ์ดตัวเลขใหญ่, กริดไอคอนเหมือนกันเป๊ะ, eyebrow ตัวพิมพ์ใหญ่จิ๋ว, gradient text), และความจัดจ้านแบบ crypto/web3 (นีออนบนดำ, อนิเมชั่นเร่งเร้า). ม่วงคือ "accent ทึบ" ไม่ใช่ "gradient ตกแต่ง".

> **Dual-skin reality.** Deep มีสองสกินในโค้ดเบสเดียว: surface สาธารณะ/ผู้ซื้อ/landing (`(marketing)/**`, Vuexy/MUI) คือ surface แบรนด์ที่ documented ทั้งหมดในไฟล์นี้; surface ปฏิบัติการ seller/admin (`(paces)/**`, Preline) เป็นสกินทำงานหนาแน่นที่ใช้ฟอนต์ Anuphan เหมือนกัน แต่มี neutral surface **และสี primary ของตัวเอง**. เมื่อทำงานฝั่ง seller/admin ให้ override register เป็น `product`.
>
> ⚠️ **สี primary ไม่เหมือนกันสองสกิน.** ม่วง Confident Violet `#7367F0` ที่ documented ในไฟล์นี้คือสีของ **buyer/Vuexy เท่านั้น**. ฝั่ง **seller/admin (Paces) primary = น้ำเงิน `#236dc9`** (`--color-primary` ใน `src/assets/css/config/_root.css`). **ห้าม hardcode `#7367F0` หรือ `rgba(115,103,240,*)` ในหน้า `(paces)/**`** — ใช้ Preline token `bg-primary` / `text-primary` / `bg-primary/10` (อ่าน `var(--color-primary)` → ตามธีม Paces). บทเรียน: command center v6/v7 เคย hardcode ม่วง Vuexy ในหลังบ้าน → user ปฏิเสธ "หลังบ้านต้องเป็น Paces ไม่ใช่ม่วง" (fix commit `2ab35da`).

**Key Characteristics:**
- น่าเชื่อถือแบบอบอุ่น — credible โดยไม่เย็นชา
- Trust แสดงด้วยสัญญาณจริง ไม่ใช่ badge ตกแต่ง
- Mobile-first, ภาษาไทยเรียบง่าย, tap target ใหญ่ (≥44px)
- ม่วงเป็น accent ทึบ ≤ ~10% ของจอ; เขียว Verified สื่อความเชื่อใจ
- ขอบโค้งนุ่ม, เงาฟุ้งบาง, ฟอนต์เดียว Anuphan ทุก surface

## 2. Colors

พาเลตต์เป็น "เย็นนวลเป็นกลาง + ม่วงมั่นใจ + เขียวเชื่อได้" — restrained เป็นพื้น, ปล่อยให้สี semantic ทำงานเชิงความหมายไม่ใช่ตกแต่ง.

### Primary
- **Confident Violet** (`#7367F0`): เสียงหลักของระบบ — ปุ่ม primary, ลิงก์, โฟกัสริง, สถานะ active/selected. ใช้แบบสีทึบเสมอ. คู่ opacity: lighter `0.08`, light `0.16` สำหรับพื้น hover/selected.
- **Violet Light** (`#8F85F3`) / **Violet Dark** (`#675DD8`): ไล่ขึ้น/ลงจาก primary สำหรับ hover, ปุ่มกด, gradient เฉพาะ hero ที่จำเป็น (ไม่ใช้กับ text).

### Secondary
- **Verified Green** (`#28C76F`): สีที่มีความหมายเชิงแบรนด์สูงสุด — verified chip, ออเดอร์สำเร็จ, trust-positive, completion rate ดี. นี่คือสีของ "เชื่อได้".
- **Signal Cyan** (`#00BAD1`): ข้อมูล/สถานะกลาง (info), badge ที่ไม่ใช่ verified, ลิงก์เชิงข้อมูล.

### Tertiary
- **Warning Amber** (`#FF9F43`): รอดำเนินการ, ต้องยืนยัน, สถานะเตือนแบบไม่รุนแรง.
- **Error Coral** (`#FF4C51`): ผิดพลาด, ปฏิเสธ, ยกเลิก, ความเสี่ยง. โทนปะการังนุ่มกว่าแดงเลือด — เตือนโดยไม่ข่มขู่.

### Neutral
- **Ink Plum** (`#2F2B3D`): หมึกหลัก (ม่วงเข้มหม่น เข้ากับ hue primary). ใช้เป็นชั้น opacity: text หลัก `0.9`, รอง `0.7`, disabled `0.4`, divider `0.12`. **ห้ามใช้ดำสนิท `#000`.**
- **Slate** (`#808390`): secondary action, ไอคอนเฉยๆ, placeholder ที่ยังต้องผ่าน contrast 4.5:1.
- **Cool Mist** (`#F8F7FA`): พื้นหลัง default ของแอป (off-white เย็นมีกลิ่นม่วงจางๆ ไม่ใช่ cream อุ่น).
- **Paper** (`#FFFFFF`): พื้นการ์ด/แผง/อินพุต.

### Named Rules
**The One Voice Rule.** Confident Violet ปรากฏ ≤ ~10% ของพื้นที่จอใดๆ — มันคือ accent ของ action ไม่ใช่ของตกแต่ง. ความหายากคือพลังของมัน.

**The Verified-Means-Green Rule.** เขียว `#28C76F` สงวนไว้สำหรับความเชื่อใจที่ "ยืนยันแล้ว" เท่านั้น (verified, สำเร็จ, ผ่าน). ห้ามใช้เขียวกับสถานะที่ยังไม่ยืนยัน มิฉะนั้นสัญญาณความเชื่อใจจะเฟ้อและไร้ความหมาย.

## 3. Typography

**Display / Body / Label Font:** Anuphan (fallback `"Noto Sans Thai", system-ui, -apple-system, "Segoe UI", sans-serif`)

**Character:** ฟอนต์เดียวแบกทุกบทบาท — Anuphan เป็น humanist sans ที่รองรับไทยเต็มช่วงน้ำหนัก 100–700 อ่านสบายทั้งหัวเรื่องและ body. ลำดับชั้นมาจาก scale + น้ำหนัก (400 body / 500 heading+label) ไม่ใช่จากการสลับ family. Body แสดงผลจริงราว 15px (root bump เพื่อให้ glyph ไทยอ่านง่ายขึ้น).

### Hierarchy
- **Display / h1** (500, 2.875rem ≈ 46px, lh 1.48): หัวเรื่องหน้า/hero. ใช้ `text-wrap: balance`.
- **h2** (500, 2.375rem ≈ 38px, lh 1.47): หัวเรื่องรอง/section ใหญ่.
- **Headline / h3** (500, 1.75rem ≈ 28px, lh 1.5): หัวข้อ section.
- **h4** (500, 1.5rem ≈ 24px, lh 1.58): หัวการ์ด/บล็อก.
- **Title / h5** (500, 1.125rem ≈ 18px, lh 1.56): หัวข้อย่อย, ชื่อร้าน.
- **h6 / Subtitle** (500, 0.9375rem ≈ 15px, lh 1.47): label เด่น, หัวฟิลด์.
- **Body** (400, 0.9375rem ≈ 15px, lh 1.47): เนื้อหาหลัก. prose จำกัด 65–75ch.
- **Body small** (400, 0.8125rem ≈ 13px, lh 1.54): ข้อความรอง, รายละเอียดออเดอร์หนาแน่น.
- **Label / Caption** (500/400, 0.8125rem ≈ 13px, ls 0.4px): chip, caption, meta.
- **Overline** (0.75rem ≈ 12px, ls 0.8px): ใช้น้อยมาก — ไม่ใช่ eyebrow เหนือทุก section.

### Named Rules
**The One Family Rule.** Anuphan เท่านั้นทุก surface ทุก subdomain ทุกสกิน (ยกเว้น monospace ใน code block + icon font). ห้าม hardcode Inter/Public Sans/Poppins/Nunito/Roboto ฯลฯ. ดู `docs/conventions/anuphan-font.md`.

**The Sentence-Case Rule.** ปุ่ม/label เป็น sentence case (`textTransform: none`) ไม่ใช่ ALL CAPS. ภาษาไทยไม่มี case อยู่แล้ว — บังคับ uppercase กับข้อความไทยทำให้พังและอ่านยาก.

## 4. Elevation

ระบบเงาฟุ้ง-นุ่ม-ผสมหมึก: เงาทุกตัวใช้ฐานสี Ink Plum (`rgb(47 43 61 / α)`) ไม่ใช่ดำล้วน จึงดูเป็นส่วนหนึ่งของพื้นเย็นนวลแทนที่จะลอยตัดกัน. ความลึกบางและ ambient — การ์ดแทบแบนตอนพัก ยกตัวเล็กน้อยเมื่อ hover/active. ปุ่ม primary มีเงาม่วงจาง (primary-tinted) เพื่อให้ action เด่นโดยไม่หนัก.

### Shadow Vocabulary
- **sm** (`0 2px 8px rgb(47 43 61 / 0.12)`): การ์ด/dropdown พัก.
- **md** (`0 3px 12px rgb(47 43 61 / 0.14)`): การ์ด hover, แผงลอย.
- **lg** (`0 4px 18px rgb(47 43 61 / 0.16)`): modal, popover, แผงสำคัญ.
- **primary-sm** (`0 2px 6px rgb(115 103 240 / 0.30)`): ปุ่ม primary contained.

### Named Rules
**The Ink-Tinted Shadow Rule.** เงาทุกตัวผสมหมึกพลัม ไม่ใช่ดำสนิท. ถ้าเงาดูเทา-ดำตัดกับพื้น = ผิด.

**The Flat-At-Rest Rule.** พื้นผิวแบนตอนพัก เงาเพิ่มเป็นการตอบสนองต่อ state (hover/focus/elevation) ไม่ใช่ของตกแต่งถาวร.

## 5. Components

### Buttons
- **Shape:** ขอบโค้งนุ่ม 6px (`{rounded.md}`).
- **Primary:** พื้น Confident Violet `#7367F0`, ตัวอักษรขาว, padding `8px 20px`, weight 500, `textTransform: none`, เงา primary-sm. Hover → Violet Dark `#675DD8`.
- **Tonal/Secondary:** พื้นม่วงโปร่ง `rgb(115 103 240 / 0.16)`, ตัวอักษรม่วง — ใช้กับ action รองที่ยังอยากให้เป็นม่วง.
- **Outlined / Text:** ขอบ/ตัวอักษรม่วง พื้นใส; hover เติมพื้นม่วงจาง `0.08`.
- **States:** disabled = หมึก `0.4` บนพื้นเทาจาง; focus-visible = ริงม่วง 2px offset.

### Chips
- **Verified chip:** พื้นเขียวโปร่ง `rgb(40 199 111 / 0.16)`, ตัวอักษร Verified Green, ขอบมน `full`, มักมีไอคอน `tabler-rosette-discount-check`. นี่คือ signature ของแพลตฟอร์ม.
- **Status chip:** ใช้สี semantic เป็นพื้นโปร่ง + ตัวอักษรสีเดียวกันเข้ม (success/warning/error/info) — ไม่ใช่พื้นทึบ.
- **State:** filter chip มี selected (พื้นม่วงจาง + ขอบม่วง) / unselected (ขอบ divider).

### Cards / Containers
- **Corner:** 8px (`{rounded.lg}`).
- **Background:** Paper `#FFFFFF` บนพื้น Cool Mist.
- **Shadow:** sm ตอนพัก (ดู Elevation) — ไม่ซ้อนการ์ดในการ์ด.
- **Border:** ใช้เงาแทนขอบเป็นหลัก; ถ้าต้องมีขอบใช้ divider `rgb(47 43 61 / 0.12)` เต็มกรอบ 1px เท่านั้น.
- **Padding:** 24px (`{spacing.lg}`); การ์ดหนาแน่น 16px.

### Inputs / Fields
- **Style:** พื้น Paper, ขอบ divider 1px, ขอบมน 6px, padding `10px 14px`.
- **Focus:** ขอบเลื่อนเป็นม่วง `#7367F0` + ริงม่วงจาง; ไม่ใช้ glow แรง.
- **Error:** ขอบ/helper text เป็น Error Coral. **Placeholder ต้องผ่าน contrast 4.5:1** ไม่ใช่เทาจางลอย.
- **Disabled:** พื้นเทาจาง, หมึก `0.4`.

### Navigation
- **Buyer (brand):** topbar เบา + เมนูแนวนอน/มือถือ; active = ตัวอักษรม่วง + เส้น/พื้นม่วงจาง.
- **Seller/Admin (Paces):** sidebar + topbar หนาแน่น (desktop); mobile <1024px ซ่อน sidebar แทนด้วย `SellerMobileHeader` + bottom nav (ดู `.seller-mobile-shell`).
- **Active/Hover/Default:** active ม่วงทึบ, hover พื้นม่วง `0.08`, default หมึก `0.7`.

### Trust Profile Card (signature)
การ์ดโปรไฟล์สาธารณะ `/u/[username]` แบบคอลัมน์เดียวสไตล์ Instagram (max-width 640px): trust banner (Deep tier — ดู `docs/10 - Business Rules/Tier Lists.md`), avatar, ชื่อร้าน, verified chip, badges, product grid ≤9, avg rating, completion rate. ทุกค่ามาจาก DB จริง — เป็นรูปธรรมของ "show, don't tell".

## 6. Do's and Don'ts

### Do:
- **Do** ใช้ Confident Violet `#7367F0` เป็นสีทึบสำหรับ action/ลิงก์/โฟกัส ≤ ~10% ของจอ.
- **Do** สงวน Verified Green `#28C76F` ไว้กับความเชื่อใจที่ยืนยันแล้วเท่านั้น (verified/สำเร็จ/ผ่าน).
- **Do** ใช้ Anuphan ทุก element ทุก surface; ลำดับชั้นด้วย scale + น้ำหนัก 400/500.
- **Do** ใช้ขอบมน 6–8px, เงาฟุ้งผสมหมึกพลัม, พื้น Cool Mist + การ์ด Paper.
- **Do** ใช้ sentence case กับปุ่ม/label; เขียน label เป็น กริยา+กรรม (เช่น "ยืนยันรับของ" ไม่ใช่ "ตกลง").
- **Do** ผ่าน WCAG 2.1 AA: body contrast ≥4.5:1, focus state ชัด, tap target ≥44px, รองรับ `prefers-reduced-motion`, ค่า default ขนาด/spacing ใหญ่หน่อยเพื่อกลุ่ม digital-literacy ต่ำ/ผู้สูงวัย.

### Don't:
- **Don't** ทำหน้าตาแบบ **เทมเพลต AI-SaaS โหลๆ**: ไล่สีม่วง gradient ตกแต่ง, การ์ดตัวเลขใหญ่ (hero-metric template), กริดไอคอน+หัว+ข้อความเหมือนกันเป๊ะซ้ำๆ, eyebrow ตัวพิมพ์ใหญ่จิ๋วเหนือทุก section, gradient text.
- **Don't** ทำให้ดู **องค์กร/ธนาคารเย็นชา**: ดำสนิท, ฟอร์มแข็งทื่อเหมือนเอกสารราชการ, ไร้ความอบอุ่น.
- **Don't** ทำแบบ **crypto/web3 จัดจ้าน**: นีออนบนดำ, ไล่สีรุนแรง, copy ไฮป์, อนิเมชั่นเร่งเร้า.
- **Don't** ใช้ `border-left`/`border-right` >1px เป็นแถบสีตกแต่งบนการ์ด/alert/list.
- **Don't** ใช้เขียวกับสถานะที่ยังไม่ยืนยัน — สัญญาณ trust จะเฟ้อ.
- **Don't** ซ้อนการ์ดในการ์ด, ใช้ดำ `#000`, หรือ hardcode ฟอนต์อื่นนอกจาก Anuphan.
- **Don't** ใช้ ALL CAPS กับข้อความไทย หรือ placeholder เทาจางที่ตก contrast.
- **Don't** ใส่ choreography page-load ในฝั่ง product (seller/admin) — โหลดเข้างานทันที.
