# QA checklist — 00070 EXT หน้าจัดข้อความรายงาน LINE (T14)

Spec: `docs/superpowers/specs/2026-10-05-line-report-message-builder-ux-spec.md` · FR-EXT-11/12
Automation: `e2e/line-report-template.spec.ts` (self-seed/cleanup scope ด้วย id · ไม่กด "ส่งทดสอบ")
รัน (HR14 ปักหมุด local): `DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" DIRECT_URL="<เหมือนกัน>" npx playwright test e2e/line-report-template.spec.ts`

## Pre-flight
- [ ] dev server :4000 serve worktree นี้ (`lsof -p <pid> | grep cwd`)
- [ ] seed: user + 2 shop kind=BUSINESS **+ ShopMember OWNER ทั้งสองร้าน** (ไม่มี = redirect /choose-shop) + BusinessPackageSubscription ACTIVE + LineReportGroup ACTIVE (`dailyTimes` = นาที เช่น 1080 — CHECK constraint)
- [ ] cookie `next-auth.session-token` ต้องมี `activeShopId`

## Settings card (Q1/Q12)
- [ ] 1180/768/375: การ์ด "ข้อความที่ส่งเข้ากลุ่ม" + bubble + chip "ใช้แบบมาตรฐานอยู่" + ลิงก์ "จัดข้อความ" → /template · ไม่มีการ์ดพรีวิวเดิม · ไม่ overflow
- [ ] หลังบันทึก: chip "จัดเองแล้ว" · ประวัติแสดง "ข้าม: …"

## Template page (Q2-Q11)
- [ ] Q2 layout 3 คอลัมน์ @1180 · 2 @768 · สลับ ข้อความ|ตัวอย่าง @375 · ไม่ overflow
- [ ] Q3 เพิ่มบล็อก (+) → chip ยังไม่บันทึก · save primary · หายจากคลัง · พรีวิวอัปเดต
- [ ] Q4 `สรุป **{ชื่อร้าน}** วันนี้` → ตัวหนา · `**ไม่ปิด` → error + save disabled + เหตุผลเห็นบน 375
- [ ] Q5 แนวโน้ม + เทียบรายร้าน → แท่งในพรีวิว
- [ ] Q6 ย้ายด้วยปุ่ม ขึ้น/ลง + คีย์บอร์ด (grip → Space → ArrowDown → Space)
- [ ] Q7 เอาออก → toast "ย้อนกลับ" → กลับที่เดิม
- [ ] Q8 บันทึก → toast → reload คงอยู่ · DB template ถูกเขียน + templateVersion +1
- [ ] Q9 เพิ่มกำไร → Swal · ยกเลิก = ไม่ลง · ยืนยัน = ลง
- [ ] Q10 dirty + กลับ → Swal ออกจากหน้า
- [ ] Q11 ⋯ → คืนเป็นแบบมาตรฐาน → Swal → template NULL (version +1)
- [ ] Z console error = 0 (ยกเว้น 404 ของ /api/account/onboarding-checklist — ไม่เกี่ยวฟีเจอร์)

## ยังไม่ได้เทส (carry)
- [ ] ปุ่ม "ส่งทดสอบ" ยิง LINE จริง (ห้ามกดตอน QA) · skipped[] toast
- [ ] drag ด้วยเมาส์/ทัช (เทสเฉพาะคีย์บอร์ด)
- [ ] TEMPLATE_STALE (แก้พร้อมกัน 2 แท็บ) · ยอดสะสมรอบนี้ (ต้องเปิดรายงานรายเดือน) · ขีดจำกัด 20 บล็อก / ขนาด 16KB gauge เต็ม
- [ ] visual QA ด้วยตา (headless ไม่โหลดไอคอน iconify — ไอคอนว่างใน screenshot เป็นข้อจำกัดของสภาพแวดล้อม)
