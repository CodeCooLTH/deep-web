---
name: Deep (SafePay)
description: ระบบสร้างความน่าเชื่อถือสำหรับซื้อขายออนไลน์ C2C — น่าเชื่อถือแบบอบอุ่น, mobile-first, ภาษาไทย
colors:
  primary: "#7367F0"
  primary-light: "#8F85F3"
  primary-dark: "#675DD8"
  verified-green: "#28C76F"
  verified-green-ink: "#18804A"
  signal-cyan: "#00BAD1"
  warning-amber: "#FF9F43"
  error-coral: "#FF4C51"
  ink: "#2F2B3D"
  slate: "#808390"
  surface-mist: "#F8F7FA"
  surface-paper: "#FFFFFF"
  divider: "#2F2B3D1F"
  paces-primary: "#236dc9"
  paces-primary-hover: "#1e5dab"
  paces-success: "#02bc9c"
  paces-info: "#5bc3e1"
  paces-warning: "#f9bf59"
  paces-danger: "#f7577e"
  paces-surface: "#f6f7fb"
  paces-body-ink: "#4c4c5c"
  paces-primary-ink: "#1e3a8a"
  paces-success-ink: "#065f46"
  paces-info-ink: "#1e40af"
  paces-warning-ink: "#92400e"
  paces-danger-ink: "#7f1d1d"
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
  metric:
    fontFamily: "Anuphan, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  dense-overlay:
    fontFamily: "Anuphan, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
  # card: มุมมนของ "การ์ด" บนหน้าร้านสาธารณะ (สินค้า/ห้องพัก/บริการ/ไทล์คลิป/กรอบแท็บ/
  # การ์ดคอลัมน์ซ้าย/การ์ดตัวเลขบนปก/ปฏิทิน) — มาจากไฟล์อ้างอิงที่ user ส่งเมื่อ 2026-08-20
  # และถูกยืนยันเป็นค่าเดียวทั้งหน้าเมื่อ 2026-08-23 (เดิมปนกันอยู่ 14/15/18px)
  # เลขนี้ไม่ได้อยู่ในบันไดเดิม 4/6/8/10 เพราะการ์ดของหน้าร้านใหญ่กว่าองค์ประกอบที่บันไดนั้นครอบ
  # (ชิป/ปุ่ม/ช่องกรอก) — เขียนไว้ที่นี่เพื่อให้เป็นค่าที่ "มีอยู่ในระบบ" ไม่ใช่ค่าที่หลุดออกมา
  card: "14px"
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
  paces-button-primary:
    backgroundColor: "{colors.paces-primary}"
    textColor: "{colors.surface-paper}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  paces-button-primary-hover:
    backgroundColor: "{colors.paces-primary-hover}"
    textColor: "{colors.surface-paper}"
  paces-card:
    backgroundColor: "{colors.surface-paper}"
    rounded: "{rounded.sm}"
    padding: "20px"
---

# Design System: Deep (SafePay)

## Overview

**Creative North Star: "The Trusted Counter"**

Deep รู้สึกเหมือนเคาน์เตอร์ร้านที่ไฟสว่าง สะอาด และเป็นมิตร ที่ทุกอย่างถูกตรวจสอบกันอย่างเปิดเผยตรงหน้า ก่อนเงินจะเปลี่ยนมือ. ความน่าเชื่อถือไม่ได้มาจากการป่าวประกาศ แต่มาจากสัญญาณจริงที่ยืนยันได้ — verified chip, ประวัติออเดอร์, completion rate, รีวิวจริง. โทนคือ fintech ที่เข้าถึงง่าย: มั่นใจแต่ไม่ข่มขู่, โมเดิร์นแต่ไม่เย็นชา.

ระบบวางอยู่บนพื้นเย็นนวล (Cool Mist `#F8F7FA`) กับการ์ดสีขาว ขอบโค้งนุ่ม (6–8px) และเงาฟุ้งบางๆ ที่ผสมหมึกสีพลัม. ม่วงมั่นใจ (`#7367F0`) เป็นเสียงหลักของปุ่ม/ลิงก์/โฟกัส ส่วนเขียว Verified (`#28C76F`) เป็นสีที่มีความหมายเชิงแบรนด์มากที่สุด — มันคือสีของ "เชื่อได้". ตัวอักษร Anuphan ตัวเดียวแบกทุกบทบาทตั้งแต่ heading ถึง label โดยเล่นน้ำหนัก 400/500 เป็นหลัก.

ระบบนี้ **ปฏิเสธ**: ความแข็งทื่อแบบฟอร์มธนาคาร, เทมเพลต AI-SaaS โหลๆ (ไล่สีม่วง, การ์ดตัวเลขใหญ่, กริดไอคอนเหมือนกันเป๊ะ, eyebrow ตัวพิมพ์ใหญ่จิ๋ว, gradient text), และความจัดจ้านแบบ crypto/web3 (นีออนบนดำ, อนิเมชั่นเร่งเร้า). ม่วงคือ "accent ทึบ" ไม่ใช่ "gradient ตกแต่ง".

> **Dual-skin reality.** Deep มีสองสกินในโค้ดเบสเดียว: surface สาธารณะ/ผู้ซื้อ/landing (`(marketing)/**`, Vuexy/MUI) คือ surface แบรนด์ที่ documented ทั้งหมดในไฟล์นี้; surface ปฏิบัติการ seller/admin (`(paces)/**`, Preline) เป็นสกินทำงานหนาแน่นที่ใช้ฟอนต์ Anuphan เหมือนกัน แต่มี neutral surface **และสี primary ของตัวเอง**. เมื่อทำงานฝั่ง seller/admin ให้ override register เป็น `product`.
>
> ⚠️ **สี primary ไม่เหมือนกันสองสกิน.** ม่วง Confident Violet `#7367F0` ที่ documented ในไฟล์นี้คือสีของ **buyer/Vuexy เท่านั้น**. ฝั่ง **seller/admin (Paces) primary = น้ำเงิน `#236dc9`** (`--color-primary` ใน `src/assets/css/config/_root.css`). **ห้าม hardcode `#7367F0` หรือ `rgba(115,103,240,*)` ในหน้า `(paces)/**`** — ใช้ Preline token `bg-primary` / `text-primary` / `bg-primary/10` (อ่าน `var(--color-primary)` → ตามธีม Paces). บทเรียน: command center v6/v7 เคย hardcode ม่วง Vuexy ในหลังบ้าน → user ปฏิเสธ "หลังบ้านต้องเป็น Paces ไม่ใช่ม่วง" (fix commit `2ab35da`).
>
> สกิน Paces ที่ใช้จริงคือ `data-skin="default"` (ตั้งที่ `src/app/(paces)/layout.tsx`) — ไม่ใช่ `saas` ซึ่งเป็นสกินที่ให้ mood แบบ Vuexy. ก่อนสรุปว่า "หน้านี้เป็น Paces แท้" ให้ grep `data-skin` ก่อน.

**Key Characteristics:**
- น่าเชื่อถือแบบอบอุ่น — credible โดยไม่เย็นชา
- Trust แสดงด้วยสัญญาณจริง ไม่ใช่ badge ตกแต่ง
- Mobile-first, ภาษาไทยเรียบง่าย, tap target ใหญ่ (≥44px)
- ม่วงเป็น accent ทึบ ≤ ~10% ของจอ; เขียว Verified สื่อความเชื่อใจ
- ขอบโค้งนุ่ม, เงาฟุ้งบาง, ฟอนต์เดียว Anuphan ทุก surface

## Colors

พาเลตต์เป็น "เย็นนวลเป็นกลาง + ม่วงมั่นใจ + เขียวเชื่อได้" — restrained เป็นพื้น, ปล่อยให้สี semantic ทำงานเชิงความหมายไม่ใช่ตกแต่ง.

### Primary
- **Confident Violet** (`#7367F0`): เสียงหลักของระบบ — ปุ่ม primary, ลิงก์, โฟกัสริง, สถานะ active/selected. ใช้แบบสีทึบเสมอ. คู่ opacity: lighter `0.08`, light `0.16` สำหรับพื้น hover/selected.
- **Violet Light** (`#8F85F3`) / **Violet Dark** (`#675DD8`): ไล่ขึ้น/ลงจาก primary สำหรับ hover, ปุ่มกด, gradient เฉพาะ hero ที่จำเป็น (ไม่ใช้กับ text).
- **Counter Blue** (`#236dc9`): primary ของสกิน Paces (seller/admin) — บทบาทเดียวกับ Confident Violet ทุกประการ แต่คนละสกิน. เข้าถึงผ่าน token `bg-primary`/`text-primary` เท่านั้น ห้าม hardcode.

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
- **Paces Mist** (`#f6f7fb`) / **Paces Body Ink** (`#4c4c5c`): พื้นและหมึกของสกิน seller/admin — เทากลางไม่มีกลิ่นม่วง ต่างจาก Cool Mist โดยตั้งใจ.
- **Photo Scrim** (`rgb(0 0 0 / .72)` → `transparent`): ไล่เงาทับ **รูปถ่ายของผู้ใช้** ให้ตัวหนังสือขาวที่ลอยบนรูปอ่านออก. ค่ามาตรฐาน `linear-gradient(180deg, rgb(0 0 0/.28) 0%, transparent 32%, transparent 52%, rgb(0 0 0/.72) 100%)` — SSOT ในโค้ดคือ `TILE_SCRIM` (`src/views/pages/user-profile/v2/ShopVideos.tsx`) ใช้ทั้งไทล์คลิป 9:16 และการ์ดสินค้า 1:1.

### Named Rules
**The Photo-Scrim Exception.** scrim ทับรูปภาพคือ **ที่เดียว** ที่ใช้ดำสนิทได้ — เป็นข้อยกเว้นของกฎ Ink Plum ที่ห้าม `#000` โดยเจตนา.

เหตุผล: scrim ตกบน **เนื้อหาของผู้ใช้** (รูปสินค้า/รูปปกคลิปที่ร้านถ่ายเอง) ไม่ใช่บนผิวของเรา — ผสมหมึกพลัมเข้าไปคือการเปลี่ยนสีรูปของร้าน ซึ่งเป็นคนละเรื่องกับ Ink-Tinted Shadow ที่เงาตกบนพื้น Cool Mist ของเราเอง. หลักเดียวกับ `docs/conventions/user-supplied-image-assets.md`: ของที่ผู้ใช้ส่งมา เราจัดวางได้ แต่ไม่แต่งใหม่.

ขอบเขต: ใช้ได้เฉพาะ **ทับรูปภาพ** เท่านั้น. ห้ามเอาไปเป็นพื้นของกล่อง/การ์ด/โมดัล/แถบ — พื้นทึบยังคงต้องมาจาก Ink Plum ตามเดิม. และเมื่อไทล์ไม่มีรูป scrim **ยังต้อง render อยู่** เพราะตัวหนังสือขาวบนไทล์ไม่ได้หายไปตามรูป (ถอดออกแล้ว = ขาวบนเทาจาง อ่านไม่ออกทั้งแถบ).

**The One Voice Rule.** Confident Violet ปรากฏ ≤ ~10% ของพื้นที่จอใดๆ — มันคือ accent ของ action ไม่ใช่ของตกแต่ง. ความหายากคือพลังของมัน.

**The Verified-Means-Green Rule.** เขียว `#28C76F` สงวนไว้สำหรับความเชื่อใจที่ "ยืนยันแล้ว" เท่านั้น (verified, สำเร็จ, ผ่าน). ห้ามใช้เขียวกับสถานะที่ยังไม่ยืนยัน มิฉะนั้นสัญญาณความเชื่อใจจะเฟ้อและไร้ความหมาย.

**สองโทน: เขียวเป็นพื้น vs เขียวเป็นหมึก.** `#28C76F` เป็น **สีพื้น** (chip, badge, แถบสถานะ — มีตัวหนังสือทับบนนั้น) ส่วน **ตัวหนังสือสีเขียวบนพื้นขาว** ต้องใช้ **Verified Ink `#18804A`** เสมอ.

เหตุผล: `#28C76F` บนขาวได้ contrast แค่ **2.21:1** — ตกเกณฑ์ AA แม้กับตัวใหญ่ (ต้องการ 3:1) พบตอน Impeccable critique 2026-07-31 ว่าตัวเลขอัตราความสำเร็จซึ่งได้พื้นที่ใหญ่สุดในหน้าร้าน เป็นสีที่กลุ่มผู้ใช้ที่เราผูกไว้ใน PRODUCT.md (ผู้สูงวัย/digital-literacy ต่ำ) อ่านยากที่สุดพอดี. `#18804A` ได้ **4.97:1** ผ่านแม้ที่ขนาด body และอยู่ในตระกูลสีเดียวกัน (hue 149° เทียบ 147°) จึงยังอ่านเป็น "เขียวเชื่อได้" ตัวเดิม.

หลักเดียวกันนี้ถูกขยายเป็นตระกูล token ฝั่ง Paces: `--color-{semantic}-ink` สำหรับตัวหนังสือบนพื้น `{semantic}/15` — `warning-ink #92400e` (6.57:1), `info-ink #1e40af` (7.86:1), `success-ink #065f46` (6.70:1), `danger-ink #7f1d1d` (8.47:1), `primary-ink #1e3a8a` (8.44:1). ทั้งหมดเป็น **token ในธีม ไม่ใช่ arbitrary value** จึงใช้ได้ตามปกติ.

**The Hue-Preserving Contrast Rule.** แก้คอนทราสต์ปรับได้แค่ **ความเข้ม** ของสีเดิม **ห้ามสลับเฉด**. ไอคอนที่ "สี = ตัวตน" (ดาวปักหมุด, โลโก้ช่องทาง) ไม่อยู่ใต้กฎคอนทราสต์ของข้อความ. ก่อนใช้ token สีใหม่ให้ grep `theme/` ก่อนเสมอว่ามันมีอยู่จริง — เหตุการณ์ 2026-08-03 ไล่เปลี่ยน `text-{tone}` เป็น `-ink` 55 จุดโดยที่ `-ink` ยังไม่ใช่ token ของธีมฝั่งนั้น ทำให้ดาวกลายเป็นน้ำตาลและปุ่ม danger กลายเป็นเลือดหมู ต้องย้อนทั้งหมด.

## Typography

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

สกิน Paces เดินบน ramp เดียวกันแต่ตั้ง body เล็กกว่าหนึ่งขั้น (`--text-body: 0.875rem` ≈ 14px) เพราะเป็น surface หนาแน่น และล็อก `line-height: 1.5` ไว้ทุกขั้น. `--text-md: 15px` และ `--text-2xs: 11px` เป็นขั้นเสริมของสกินนั้น.

### Metric & Dense steps (เพิ่ม 2026-07-31)

ramp ด้านบนเป็น ramp ของ "ข้อความ" — สอง use case นี้ไม่ได้อยู่บนมันและใช้ค่าคงที่ของตัวเอง:

- **Metric** (800, 32 / 22 / 20px, tabular-nums, letter-spacing ติดลบเล็กน้อย): ตัวเลขที่ทำหน้าที่เป็นภาพ ไม่ใช่ข้อความ — อัตราความสำเร็จ, แถวสถิติร้าน. ใช้ ramp ข้อความ (46/38/28) จะใหญ่เกินสัดส่วนบนมือถือมาก.
- **Dense overlay** (600, 11px): ข้อความบนรูปภาพในกริดที่ชิดกัน — ชื่อบัญชี/ยอดวิวบนไทล์คลิป. เล็กกว่า label ปกติเพราะแข่งพื้นที่กับตัวรูป และมีไล่เงารองให้อ่านออก. **ใช้เฉพาะบนพื้นภาพเท่านั้น** ห้ามใช้เป็นข้อความบนพื้นสีเรียบ.

### Strong step (เพิ่ม 2026-08-12)

- **Strong** (**700**, ใช้ขนาดจาก ramp ปกติ ไม่มีขนาดของตัวเอง): ข้อความที่ต้องเป็น "สิ่งที่เด่นที่สุดในบล็อกของมัน" บนจอที่ผู้ใช้ต้องตัดสินใจ — ชื่อร้านบนหน้าออเดอร์สาธารณะ, หัวเรื่องสถานะ, ยอดเงินรวมที่มีบริบทกำกับ.

**ทำไมต้องประกาศ:** ramp ประกาศไว้แค่ 400 body / 500 heading+label ส่วน 800 สงวนให้ Metric — แต่โค้ดจริงมีจุดที่ต้องการน้ำหนักระหว่างกลางอยู่หลายที่แล้ว และแต่ละไฟล์เลือก 700 หรือ 800 กันเอง (`safepay-ux` audit 2026-08-12 พบใน `GuestOrderView.tsx` ว่ามีทั้ง 13px/700 และ 18px/800 ในไฟล์เดียว โดยไม่มีตัวไหนอยู่ใน vocab). ทางเลือกมีสองทาง: ยุบทุกจุดลงมาที่ 500 หรือประกาศขั้นนี้ให้ถูก — **เลือกประกาศ** เพราะกลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้ (ผู้สูงวัย/digital-literacy ต่ำ) ต้องการหัวข้อที่แยกจาก body ได้ชัดกว่าที่ 500 ให้ได้ บนจอที่ตัดสินว่าจะโอนเงินหรือไม่.

🛑 **Strong ไม่ใช่ Metric** — Metric มาพร้อม `tabular-nums` + letter-spacing ติดลบ + ขนาดคงที่ของตัวเอง เพราะมันคือ "ตัวเลขที่ทำหน้าที่เป็นภาพ". ยอดเงินที่มีคำว่า "ยอดรวม" กำกับอยู่ข้าง ๆ เป็น **ข้อความ** ใช้ Strong. ตัวเลข 89 ใต้คำว่า "ออเดอร์สำเร็จ" ในแถวสถิติเป็น **ภาพ** ใช้ Metric. ถ้าไม่แน่ใจ ถามว่า "อ่านเป็นประโยคหรืออ่านเป็นตัวเลข".

🛑 **ห้ามใช้ 800 กับข้อความ** อีกต่อไป — ถ้าเจอในโค้ดเก่าให้ลดเป็น 700 ตอนที่แตะไฟล์นั้นอยู่แล้ว ไม่ต้องไล่แก้ทั้งระบบเป็นรอบของตัวเอง.

นอกจากสามชุดนี้ ข้อความทุกจุดต้องอยู่บน ramp — เดิมหน้าร้านสาธารณะมี 11 ขนาดในหน้าเดียว (มีแค่ 15 กับ 13 ที่อยู่บน ramp) ค่าอย่าง 14.5 กับ 12.5 ต่างจากเพื่อนบ้านจนตาไม่เห็น แต่ทำให้หน้าไม่มีจังหวะและอ่านออกว่า "ประกอบขึ้นมา" มากกว่า "ออกแบบมา".

### Named Rules
**The One Family Rule.** Anuphan เท่านั้นทุก surface ทุก subdomain ทุกสกิน (ยกเว้น monospace ใน code block + icon font). ห้าม hardcode Inter/Public Sans/Poppins/Nunito/Roboto ฯลฯ. ดู `docs/conventions/anuphan-font.md`.

**The Sentence-Case Rule.** ปุ่ม/label เป็น sentence case (`textTransform: none`) ไม่ใช่ ALL CAPS. ภาษาไทยไม่มี case อยู่แล้ว — บังคับ uppercase กับข้อความไทยทำให้พังและอ่านยาก.

**The No-Mono-On-Thai Rule.** `font-mono` ฆ่า Anuphan — glyph ไทยตกไป fallback ที่ไม่มีในตระกูล. ใช้ monospace เฉพาะ code block จริงเท่านั้น ห้ามใช้กับ heading/label/ตัวเลขที่มีข้อความไทยปน. ถ้าอยากได้ตัวเลขเรียงคอลัมน์ให้ใช้ `tabular-nums` ไม่ใช่เปลี่ยน family.

## Layout

ระบบวางอยู่บน Tailwind 4 ทั้งสองสกิน แต่ **คนละชุด breakpoint** — นี่คือแหล่งบั๊ก responsive ที่พบบ่อยที่สุดของโปรเจกต์นี้.

**buyer / landing / public (`(marketing)/**`, Vuexy)** — remap breakpoint ของ Tailwind ให้ตรงสเกล MUI ที่ `src/app/(marketing)/marketing.css`:

| token | ค่า |
|---|---|
| `sm` | 600px |
| `md` | **900px** |
| `lg` | 1200px |
| `xl` | 1536px |
| `2xl` | 1920px |

`md:` ฝั่งนี้จึงหมายถึง **900px ไม่ใช่ 768px**. จะจับแท็บเล็ต 768px จริงต้องใช้ arbitrary variant `min-[768px]:` (ใช้อยู่ 4 จุด — เมนูซ้าย buyer โผล่ที่ 768). คอนเทนต์ 2 คอลัมน์ภายในหน้าแตกที่ `lg` (1200) เพราะ main แคบลง 240px จาก sidebar. ช่วง 900–1199 ปล่อย fluid ไม่มี cap.

**seller / admin (`(paces)/**`, Preline)** — ใช้สเกล Tailwind มาตรฐาน (`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 / `2xl` 1536) ไม่ remap.

### Seller mobile shell

หลังบ้านฝั่งผู้ขายมี **breakpoint เส้นเดียว: `lg` (1024px)** — ตรงกับ `lg:hidden` ของ `SellerMobileHeader`/CommandCenter. ต่ำกว่า 1024px คลาส `.seller-mobile-shell` (ใน `safepay-overrides.css`) จะ:

- ซ่อน `.app-menu` (sidebar) และ `.app-header` (topbar เดิม) แล้วแทนด้วย `SellerMobileHeader` + bottom nav
- ล้าง `margin-inline-start` ที่ตั้งไว้เผื่อ sidebar
- บังคับ `padding-inline: 1rem` (16px) สม่ำเสมอทุกหน้า
- กัน bottom nav (fixed, 72px — h-18 ตั้งแต่ 2026-08-06) ทับคอนเทนต์ด้วย `padding-bottom: calc(5.5rem + env(safe-area-inset-bottom))`

ตั้งแต่ 1024px ขึ้นไป: sidebar `--sidenav-width: 245px` (condensed 200 / icon-only 75), topbar `--topbar-height: 65px`, gutter กลับเป็น `px-5` (20px) ตาม `--spacing-base: 20px`.

### Rhythm

จังหวะ spacing เดิน 4 → 8 → 16 → 24 → 40px (`{spacing.*}`). ฝั่ง Paces หน่วยฐานของ chrome คือ 20px (`--spacing-base`) ซึ่งเป็นเหตุผลที่ padding การ์ดฝั่งนั้นเป็น 20 ไม่ใช่ 24. หน้า buyer ที่เป็นคอลัมน์เดียว (โปรไฟล์สาธารณะ) cap ที่ 640px; prose cap ที่ 65–75ch. `FrontLayout` ใช้ `flex flex-col min-bs-[100dvh]` + children `flex-1` เพื่อให้ footer ติดล่างสุดเสมอ ไม่มีพื้นขาวใต้ footer.

### Named Rules
**The Two-Breakpoint-Systems Rule.** `md:` = 900px บน buyer และ 768px บน seller/admin. **ห้ามยกคลาส responsive ข้ามเส้น `(marketing)` ↔ `(paces)` โดยไม่คิดเลขใหม่** — มันจะ compile ผ่าน ดูถูกในเครื่องคุณ และพังเฉพาะบางความกว้าง.

**The Symmetric Gutter Rule.** padding-inline ของหน้าต้องสมมาตรเสมอ. อาการ "ดูชิดขอบ" เกือบทุกครั้งมาจาก asymmetry ไม่ใช่ค่าน้อยไป — เคยมี `padding-right: 0 !important` ที่ฆ่าขอบขวาข้างเดียว (20/0) วิธีแก้คือลบตัวที่ผิด ไม่ใช่เติม gutter ใหม่ทับ.

## Elevation & Depth

ระบบเงาฟุ้ง-นุ่ม-ผสมหมึก: เงาทุกตัวใช้ฐานสี Ink Plum (`rgb(47 43 61 / α)`) ไม่ใช่ดำล้วน จึงดูเป็นส่วนหนึ่งของพื้นเย็นนวลแทนที่จะลอยตัดกัน. ความลึกบางและ ambient — การ์ดแทบแบนตอนพัก ยกตัวเล็กน้อยเมื่อ hover/active. ปุ่ม primary มีเงาม่วงจาง (primary-tinted) เพื่อให้ action เด่นโดยไม่หนัก.

### Shadow Vocabulary
- **sm** (`0 2px 8px rgb(47 43 61 / 0.12)`): การ์ด/dropdown พัก.
- **md** (`0 3px 12px rgb(47 43 61 / 0.14)`): การ์ด hover, แผงลอย.
- **lg** (`0 4px 18px rgb(47 43 61 / 0.16)`): modal, popover, แผงสำคัญ.
- **primary-sm** (`0 2px 6px rgb(115 103 240 / 0.30)`): ปุ่ม primary contained.

ฝั่ง Paces ใช้ชุดของตัวเองที่บางกว่าและผสมเทาอมน้ำเงิน: `--shadow: 0 1px 4px rgba(130,143,163,0.15)` (ค่า default ของ `.card`), `--shadow-sm: 0 1px 2px rgba(76,76,92,0.15)`, `--shadow-lg: 0 4px 16px rgba(76,76,92,0.2)`, `--inset-shadow: inset 0 1px 2px rgba(76,76,92,0.075)`. หลักการเดียวกัน (ผสมหมึก ไม่ใช่ดำ) ต่างกันแค่ hue ของหมึก.

### Named Rules
**The Ink-Tinted Shadow Rule.** เงาทุกตัวผสมหมึกพลัม ไม่ใช่ดำสนิท. ถ้าเงาดูเทา-ดำตัดกับพื้น = ผิด.

**The Flat-At-Rest Rule.** พื้นผิวแบนตอนพัก เงาเพิ่มเป็นการตอบสนองต่อ state (hover/focus/elevation) ไม่ใช่ของตกแต่งถาวร.

## Shapes

ภาษารูปทรงคือ "โค้งนุ่มพอให้เป็นมิตร แต่ไม่กลมจนดูเป็นของเล่น" — ไม่มีมุมฉากคม ไม่มี pill ยกเว้นที่ตั้งใจ.

**buyer / Vuexy:** 4 / 6 / 8 / 10px + `full`. ปุ่มและอินพุต 6px, การ์ดและแผง 8px, chip เป็น `full` (pill). ความต่าง 6 vs 8 คือสิ่งที่แยก "ของที่กดได้" ออกจาก "ภาชนะ" — อย่ายุบให้เท่ากัน.

**seller / admin / Paces:** ฐานคือ `--radius: 4px` และ `.card` ใช้ `rounded` (= 4px) ตรง ๆ. รูปทรงฝั่งนี้คมกว่าฝั่ง buyer โดยตั้งใจ เพราะเป็น surface หนาแน่นที่มีขอบเยอะ. งานใหม่ให้ประกอบจาก primitive ที่ขึ้นทะเบียนไว้ (`rounded-lg`, `size-*`) ตาม Hard Rule 7 — ห้าม `rounded-[Npx]`.

**เส้นขอบ:** 1px เสมอ. ฝั่ง buyer ใช้เงาแทนขอบเป็นหลัก; ถ้าต้องมีขอบใช้ divider `rgb(47 43 61 / 0.12)` เต็มกรอบ. ฝั่ง Paces ใช้ `border-default-300`.

**เส้นประคือ signature ของ Paces.** `.card-header` แยกจาก body ด้วย `border-b border-dashed border-default-300` — **เส้นประ ไม่ใช่เส้นทึบ**. มันคือสิ่งที่ทำให้หลังบ้านอ่านว่าเป็น Paces แท้ ไม่ใช่ dashboard ทั่วไป.

### Named Rules
**The Dashed Card-Header Rule.** หัวการ์ดใน `(paces)/**` คั่นด้วยเส้นประ 1px เสมอ. ถ้าเห็นแล้วคิดว่า "เส้นประนี่บั๊กหรือเปล่า" — ไม่ใช่ อย่าไปแก้เป็นทึบ.

**The One-Pixel Border Rule.** ขอบทุกเส้น 1px. ขอบข้างที่หนากว่านั้นมีทางเดียวคือ `border-s-3 border-{semantic}` ซึ่งเป็นข้อยกเว้นที่ขึ้นทะเบียนแล้วและใช้ได้เฉพาะ `(paces)/**` (ดู Do's and Don'ts).

## Components

### Buttons
- **Shape:** ขอบโค้งนุ่ม 6px (`{rounded.md}`).
- **Primary:** พื้น Confident Violet `#7367F0`, ตัวอักษรขาว, padding `8px 20px`, weight 500, `textTransform: none`, เงา primary-sm. Hover → Violet Dark `#675DD8`.
- **Tonal/Secondary:** พื้นม่วงโปร่ง `rgb(115 103 240 / 0.16)`, ตัวอักษรม่วง — ใช้กับ action รองที่ยังอยากให้เป็นม่วง.
- **Outlined / Text:** ขอบ/ตัวอักษรม่วง พื้นใส; hover เติมพื้นม่วงจาง `0.08`.
- **States:** disabled = หมึก `0.4` บนพื้นเทาจาง; focus-visible = ริงม่วง 2px offset.
- **Paces:** คลาส `btn btn-primary` พื้น `#236dc9` hover `#1e5dab` radius 4px — โครงเดียวกัน คนละสกิน.

### Chips
- **Verified chip:** พื้นเขียวโปร่ง `rgb(40 199 111 / 0.16)`, ตัวอักษร Verified Green, ขอบมน `full`, มักมีไอคอน `tabler-rosette-discount-check`. นี่คือ signature ของแพลตฟอร์ม.
- **Status chip:** ใช้สี semantic เป็นพื้นโปร่ง + ตัวอักษรสีเดียวกันเข้ม (success/warning/error/info) — ไม่ใช่พื้นทึบ. ฝั่ง Paces พื้น `bg-{semantic}/15` + ตัวอักษร `text-{semantic}-ink`.
- **State:** filter chip มี selected (พื้นม่วงจาง + ขอบม่วง) / unselected (ขอบ divider).

### Cards / Containers
- **Corner:** 8px (`{rounded.lg}`) ฝั่ง buyer; 4px (`--radius`) ฝั่ง Paces.
- **Background:** Paper `#FFFFFF` บนพื้น Cool Mist (buyer) / Paces Mist `#f6f7fb` (seller/admin).
- **Shadow:** sm ตอนพัก (ดู Elevation & Depth) — ไม่ซ้อนการ์ดในการ์ด.
- **Border:** ใช้เงาแทนขอบเป็นหลัก; ถ้าต้องมีขอบใช้ divider `rgb(47 43 61 / 0.12)` เต็มกรอบ 1px เท่านั้น.
- **Padding:** 24px (`{spacing.lg}`) ฝั่ง buyer; 20px (`.card-body { p-5 }`) ฝั่ง Paces; การ์ดหนาแน่น 16px.
- **Header:** ฝั่ง Paces `.card-header` = `px-5 py-3.75` + เส้นประล่าง (ดู Shapes).

### Inputs / Fields
- **Style:** พื้น Paper, ขอบ divider 1px, ขอบมน 6px, padding `10px 14px`.
- **Focus:** ขอบเลื่อนเป็นม่วง `#7367F0` + ริงม่วงจาง; ไม่ใช้ glow แรง.
- **Error:** ขอบ/helper text เป็น Error Coral. **Placeholder ต้องผ่าน contrast 4.5:1** ไม่ใช่เทาจางลอย. error ที่ `setError` ไว้ต้องมีที่ render จริงเสมอ — error ที่ไม่มีใครแสดง = error เงียบ.
- **Disabled:** พื้นเทาจาง, หมึก `0.4`.
- **Paces:** `form-select` = ฟิลด์ที่ผูกค่ากับฟอร์ม; `hs-dropdown` = เมนู action. ห้ามสลับบทบาทกัน. `_forms.css` ไม่ได้ห่อด้วย `@layer` และห้ามแทรก element เข้าไปใน `.input-icon-group`.

### Navigation
- **Buyer (brand):** topbar เบา + เมนูแนวนอน/มือถือ; active = ตัวอักษรม่วง + เส้น/พื้นม่วงจาง. เมนูซ้ายโผล่ตั้งแต่ 768px (`min-[768px]:`).
- **Seller/Admin (Paces):** sidebar + topbar หนาแน่น (desktop); mobile <1024px ซ่อน sidebar แทนด้วย `SellerMobileHeader` + bottom nav (ดู Layout → Seller mobile shell).
- **Active/Hover/Default:** active ม่วงทึบ, hover พื้นม่วง `0.08`, default หมึก `0.7`.

### Trust Profile Card (signature)
การ์ดโปรไฟล์สาธารณะ `/u/[username]` แบบคอลัมน์เดียวสไตล์ Instagram (max-width 640px): trust banner (Deep tier — ดู `docs/10 - Business Rules/Tier Lists.md`), avatar, ชื่อร้าน, verified chip, badges, product grid ≤9, avg rating, completion rate. ทุกค่ามาจาก DB จริง — เป็นรูปธรรมของ "show, don't tell".

โปรไฟล์สาธารณะมี **สองเส้นทาง** ที่ใช้ `ShopProfile.tsx` ตัวเดียวกัน: `/u/[username]` (ทุกร้าน) และ `/b/[slug]` (เฉพาะบัญชี BUSINESS) — แก้เส้นเดียวไม่พอ.

### Toast (signature behavior)
`(paces)/**` ใช้ `pacesToast` เท่านั้น (`@/lib/paces-toast`) render ผ่าน `PacesToastContainer` จุดเดียว. ตำแหน่งแยกตามแหล่งที่มา: action/ปุ่ม → **top-right**; แชท → **bottom-right**. `react-toastify` ใช้ได้เฉพาะ buyer `(marketing)/**`. dialog ที่ต้องกดยืนยัน/บล็อกงานใช้ Sweet Alert ไม่ใช่ toast — toast คือสิ่งที่เด้งแล้วหายเอง.

## Do's and Don'ts

### Do:
- **Do** ใช้ Confident Violet `#7367F0` เป็นสีทึบสำหรับ action/ลิงก์/โฟกัส ≤ ~10% ของจอ.
- **Do** สงวน Verified Green `#28C76F` ไว้กับความเชื่อใจที่ยืนยันแล้วเท่านั้น (verified/สำเร็จ/ผ่าน).
- **Do** ใช้ Anuphan ทุก element ทุก surface; ลำดับชั้นด้วย scale + น้ำหนัก 400/500.
- **Do** ใช้ขอบมน 6–8px, เงาฟุ้งผสมหมึกพลัม, พื้น Cool Mist + การ์ด Paper.
- **Do** ใช้ sentence case กับปุ่ม/label; เขียน label เป็น กริยา+กรรม (เช่น "ยืนยันรับของ" ไม่ใช่ "ตกลง").
- **Do** ผ่าน WCAG 2.1 AA: body contrast ≥4.5:1, focus state ชัด, tap target ≥44px, รองรับ `prefers-reduced-motion`, ค่า default ขนาด/spacing ใหญ่หน่อยเพื่อกลุ่ม digital-literacy ต่ำ/ผู้สูงวัย.
- **Do** เช็กว่าอยู่สกินไหนก่อนเขียน responsive class — `md:` คนละเลขสองฝั่ง (ดู Layout).
- **Do** ใช้ icon จริงจาก `@iconify/react` (ชื่อ tabler) ทุกจุดที่อยากได้สัญลักษณ์.

### Don't:
- **Don't** ทำหน้าตาแบบ **เทมเพลต AI-SaaS โหลๆ**: ไล่สีม่วง gradient ตกแต่ง, การ์ดตัวเลขใหญ่ (hero-metric template), กริดไอคอน+หัว+ข้อความเหมือนกันเป๊ะซ้ำๆ, eyebrow ตัวพิมพ์ใหญ่จิ๋วเหนือทุก section, gradient text.
- **Don't** ทำให้ดู **องค์กร/ธนาคารเย็นชา**: ดำสนิท, ฟอร์มแข็งทื่อเหมือนเอกสารราชการ, ไร้ความอบอุ่น.
- **Don't** ทำแบบ **crypto/web3 จัดจ้าน**: นีออนบนดำ, ไล่สีรุนแรง, copy ไฮป์, อนิเมชั่นเร่งเร้า.
- **Don't** ใช้ `border-left`/`border-right` >1px เป็นแถบสีตกแต่งบนการ์ด/alert/list.
  - **ข้อยกเว้นที่ยอมรับ (accepted exception):** `border-s-3 border-{semantic}` (accent card แถบสีฝั่งซ้าย) **ยกเว้นให้เฉพาะ `(paces)/**` (seller/admin)** — ไม่ถือเป็น finding. เหตุผล: เป็น pattern ที่ขึ้นทะเบียนไว้แล้วใน `docs/system/ui-guideline/paces-component-reference.md` §7 และถูกใช้แพร่หลายทั่วหลังบ้านแล้ว การรื้อออกตอนนี้จะทำลาย consistency มากกว่าจะได้. **buyer/Vuexy `(marketing)/**` ยังห้ามตามเดิม** (ไม่มีข้อยกเว้น). ที่มาการตัดสิน: Impeccable audit 2026-07-22, user decision.
- **Don't** ใช้เขียวกับสถานะที่ยังไม่ยืนยัน — สัญญาณ trust จะเฟ้อ.
- **Don't** ซ้อนการ์ดในการ์ด, ใช้ดำ `#000`, หรือ hardcode ฟอนต์อื่นนอกจาก Anuphan.
- **Don't** ใช้ ALL CAPS กับข้อความไทย หรือ placeholder เทาจางที่ตก contrast.
- **Don't** ใส่ choreography page-load ในฝั่ง product (seller/admin) — โหลดเข้างานทันที.
- **Don't** ใช้ emoji เป็น icon ที่ไหนก็ตามใน UI — รวมตัวที่ "ดูเหมือน icon" (👑🔥⭐💬📦✅). จุดที่ควรมี icon แต่สเปกไม่ระบุตัว ให้ถามก่อน ห้ามเดา.
- **Don't** hardcode ม่วง `#7367F0` หรือ `rgba(115,103,240,*)` ในหน้า `(paces)/**` — ใช้ token `bg-primary`/`text-primary`.
- **Don't** ใช้ arbitrary value ใน `(paces)/**` (`text-[NNpx]`, `bg-[rgba()]`, `shadow-[]`, `rounded-[Npx]`, hex ดิบ) — ประกอบจาก primitive. ถ้าจำเป็นจริง (raised-FAB, safe-area ที่ Paces ไม่มี token) ให้เขียน comment กำกับ.
- **Don't** สลับเฉดสีตอนแก้คอนทราสต์ — ปรับได้แค่ความเข้ม (ดู The Hue-Preserving Contrast Rule).
