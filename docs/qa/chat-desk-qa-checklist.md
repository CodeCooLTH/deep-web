# QA checklist — 00077 โต๊ะแชท (Chat Desk)

รัน: seed → `npx playwright test e2e/chat-desk.spec.ts` (ปักหมุด DATABASE_URL/DIRECT_URL = localhost:5434 ในคำสั่ง) → cleanup
seed: `scripts/qa-00077-seed.ts` (รันซ้ำได้ · ห้อง "ร้านเพิ่งตอบ" หมดอายุ 180 วิ จึงต้อง seed ก่อนถ่ายภาพ) · cleanup: `scripts/qa-00077-cleanup.ts` · cookie: `scripts/qa-00077-login.ts <userId> <shopId>`
หมายเหตุ: id ต้องเป็น UUID (route validate) — prefix 77770000-

## Pre-flight
- [ ] dev server :4000 ชี้ worktree นี้ · seed สำเร็จ (7 รอ / 2 เกินเวลา / 10 กำลังคุย / 2 ปิดวันนี้)
## L1 สิทธิ์/เมนู
- [x] OWNER เห็น "โต๊ะแชท" ลำดับ 2 กลุ่มแชท (ต่อจากข้อความ)
- [x] ADMIN ไม่เห็นเมนู · เปิดตรง = การ์ดไม่มีสิทธิ์ ไม่มีตัวเลข
- [x] anon → sign-in · API snapshot OWNER 200 / ADMIN 403 FORBIDDEN_ROLE / anon 401
- [x] preview ห้องร้านอื่น 404 (OWNER+ADMIN) · ห้องไม่มี 404 · shopId ร้านอื่น 403
- [x] ไอคอนโต๊ะแชทใน ChatNavRail ของ /inbox: OWNER เห็น · ADMIN ไม่เห็น (รอบ 2)
## L2 desktop 1440
- [x] ฉาก 3D (canvas) + glb 200 ทุกไฟล์ · การ์ด 7/2/0-3/0/10/2/44/55/ป้าย 7 ข้อความ
- [x] ⓘ กางได้ · ซ่อนตัวเลข · หมุน/ซูม/เต็มจอ · ตัวกรอง → URL ?platforms= คงหลังรีเฟรช · รายการ 2D
- [x] แผงอ่านอย่างเดียว: ข้อความถูกลบ · 30 ใบ · ไม่มี textarea · ลิงก์ /inbox/{id} · shopLastReadAt ไม่เปลี่ยน
- [x] poll ~8.1 วิ · console สะอาด (เว้น 404 onboarding-checklist ของ layout)
## L3
- [x] 390 เปิดเป็นรายการ + bottom-sheet · 834 ฉาก 3D + แถบสรุป · no-WebGL → 2D+แบนเนอร์ · บล็อก glb → แคปซูล
- [x] inbox + chat-desk ออนไลน์นับ 1/3
## รอบ 2 (recheck หลัง 50b33225f) — `e2e/chat-desk-r2.spec.ts`
- [x] ป้ายฉาก 3D 1440/834/390(กดเปิดฉาก 3D): ไม่ล้นขอบ canvas · ไม่ซ้อน >25% (ยกเว้นป้าย +N ตามมอกอัพ) · เกินเวลา 2 คน = ป้ายยุบเดียว
- [x] บล็อก *.glb: ไม่มี pageerror/uncaught · แคปซูลแทนโมเดล · ปุ่ม N ไม่มีตัวเลข Issues (ตรวจตาจากภาพ)
- [x] ตาราง 2D "รอมา" บรรทัดเดียว (line ratio 1.2)
- [x] presence unavailable (routeWebSocket supabase realtime ปิด) → "ออนไลน์ —" "ว่างรับแชท —" + ป้ายเตือน ไม่ใช่ 0/N
- [x] prefers-reduced-motion: ไม่มี CSS animation ค้าง
- [x] poll 500 > 30 วิ → ป้าย "ข้อมูลเก่า N วินาที"
- [x] ลูกค้าใหม่ insert ระหว่างเปิดหน้า → โผล่ <12 วิ + แถว "เข้ามารอคำตอบ" + รอคำตอบ 8
- [x] หน้า /inbox ไม่มี console error · /orders /dashboard มีแค่ 404 resource เดิม
- [ ] (บั๊กต่ำ) 390 2D: บรรทัดย่อยแถวลาวน์จ ตัด "รอ 12 น. ..." ท้ายสุด
## ยังไม่ได้เทส (carry)
- [ ] mutation M-1..M-8 · สอง tab realtime animation เห็นตัวเดินจริง (เทียบเฟรม) · ขอบ 200 ห้อง · dev overlay Issues ด้วย assertion อัตโนมัติ
