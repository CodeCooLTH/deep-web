# QA Checklist — feature 00017 Lodging Vertical

> reusable regression checklist. รอบถัดไป recheck ตามนี้ได้ทันที.
> ทดสอบด้วย seller test account `0000000001` / OTP `123456` (ร้าน GENERAL — `btpremium_suksawat`).
> dev server: user รันเองที่ port 4000; subdomain จริง `http://seller.deepth.local:4000`, `http://deepth.local:4000`.

## Pre-flight / setup
- [x] server health 3 subdomain (buyer 200 / seller 307 / admin 307)
- [x] login seller ผ่าน phone-otp callback (in-page fetch → browser เก็บ httpOnly cookie)
- [ ] **BLOCKER (ต้องมี test data จาก Controller):** ร้านประเภท LODGING + ห้องพัก ≥1 (ยังไม่มีในระบบ — ทุกร้าน GENERAL) → happy-path ของ /rooms, /rooms/new, /calendar, booking ยังเทสไม่ได้
- [ ] **BLOCKER:** บัญชีที่มี Business subscription ACTIVE → เข้าฟอร์ม `/business/create` ไม่ได้ถ้าไม่มีแพ็กเกจ

## Gate / security (BR-LODG-03 / TFR-001 — สำคัญสุด)
- [x] เมนูซ้าย seller (ร้าน GENERAL) **ไม่มี** "ห้องพัก" / "ปฏิทินการจอง" — PASS
- [x] GET `/rooms` (ร้าน GENERAL) → **404** notFound — PASS
- [x] GET `/rooms/new` → **404** — PASS
- [x] GET `/calendar` → **404** — PASS
- [x] GET `/api/shops/current/rooms/availability` (GENERAL) → **403 NOT_LODGING_SHOP** — PASS (ใช้ `requireLodgingShop()` guard)
- [ ] **GET `/api/shops/current/rooms` (GENERAL) → คาดหวัง 403 NOT_LODGING_SHOP แต่ได้ 200 `{"rooms":[]}` — FAIL** (route ใช้ `requireShopMember()` + `listRooms()` ที่ไม่เรียก `assertLodgingShop()`; ขัด docstring ของ route เอง + availability route)
- [ ] **GET `/api/shops/current/rooms/<id>` (GENERAL) → คาดหวัง 403 แต่ได้ 404 ROOM_NOT_FOUND — FAIL(รอง)** (getRoom scope shopId แต่ไม่ assert lodging ก่อน)
- [x] POST `/api/shops/current/rooms` → 403 CSRF (curl ไม่มี Origin) / createRoom มี assertLodgingShop ภายใน — โครงถูก
- [ ] regression: หลังแก้ GET gate — recheck GENERAL 403 + LODGING 200

## หน้าสร้างธุรกิจ — ช่อง "ประเภทกิจการ" ใหม่ (BR-LODG-04/30)
- [ ] **ตรวจ live ไม่ได้** (gate Business subscription) — review จากโค้ด `CreateBusinessForm.tsx`:
- [x] มี 2 ช่องแยก: "ประเภทกิจการ" (radio ในการ์ด border-2 + highlight `border-primary bg-primary/5`) และ "ประเภทผู้ประกอบการ" (radio เรียบ INDIVIDUAL/COMPANY) — โครงถูกตาม spec
- [x] มีข้อความเตือน "เลือกแล้วเปลี่ยนภายหลังไม่ได้..." + icon info — มีในโค้ด
- [ ] **ประเมิน live**: การ์ด highlight เห็นชัดจริงไหม / mobile 375px การ์ดเรียงลง ไม่ล้น / tap target ≥44px — ยังเทสไม่ได้
- [ ] ความเสี่ยงสับสน: ป้าย 2 ช่องใกล้กัน ("ประเภท**กิจการ**" vs "ประเภท**ผู้ประกอบการ**") — differentiate ด้วย layout (การ์ด vs radio เรียบ) + helper text; ควรประเมินกับผู้ใช้จริง

## Regression — ร้าน GENERAL เดิมต้องไม่พัง
- [x] `/dashboard` render (widget โหลด, เมนูครบ) — PASS
- [x] `/orders` render — PASS
- [x] `/products` render เต็ม (10 สินค้า, stat cards, ตาราง, pagination) — PASS
- [x] console ไม่มี JS error ของ feature (เหลือแต่ ERR_CONNECTION_REFUSED/incomplete-chunk ช่วง server restart + manifest.webmanifest 404 pre-existing) — PASS
- [x] เมนูอื่นครบเหมือนเดิม (ANALYTICS/ORDERS/PRODUCTS/CUSTOMERS/SHOPS/STORE) — PASS

## โปรไฟล์สาธารณะ (P0/P1 impeccable critique) — `/u/<username>`
- [x] **ไม่มี** section "ชื่อเสียงแพลตฟอร์มอื่น" / Shopee / Lazada / TikTok — PASS (regex สแกน body = ไม่พบ)
- [x] เครื่องหมายยืนยันตัวตนข้างชื่อ = **สีเขียว** — PASS (✓ ขาวบนวงกลม `rgb(40,199,111)` = #28C76F Verified-Means-Green)
- [x] หัวข้อ section ไม่เป็น uppercase ถ่างตัวอักษร — PASS (สแกน computed style = 0 uppercase+letter-spacing header)

## ยังไม่ได้เทส (carry — ต้องมี test data / บัญชีเพิ่ม)
- [ ] happy path: สร้างห้องพัก (/rooms/new) + list + edit + images
- [ ] ปฏิทินการจอง (/calendar FullCalendar) — render + booking
- [ ] booking flow: quote → create → update → confirm → availability (guard กันผู้จองยืนยันเอง, EXCLUDE overlap)
- [ ] cancelOrder รับเหตุผล
- [ ] business/create form live @375px + submit → vertical=LODGING → ปลดล็อกเมนู/เพจ
- [ ] Playwright e2e spec `e2e/lodging.spec.ts` (ยังไม่มี — บังคับตาม QA rule เมื่อมี test data)

## Evidence
- `.screenshots/2026/7/22/public-profile-no-otherplatform-green-verified-134500.png`
- API gate results (curl, ร้าน GENERAL): availability 403 / rooms GET 200(FAIL) / room-by-id 404 / pages /rooms|/rooms/new|/calendar 404
