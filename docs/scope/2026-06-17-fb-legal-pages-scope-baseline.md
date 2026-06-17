# Scope Baseline — FB Legal Pages (Privacy Policy + Data Deletion Instructions)

- **สถานะ:** SIGNED-OFF (2026-06-17 — ทุก S-id ครบ, carried QA-debt: visual QA + noindex curl + Meta dashboard + email reachability)
- **phase-id:** `fb-legal-pages`
- **วันที่:** 2026-06-17
- **อ้างอิง:** Meta App Review requirement สำหรับ Facebook Login · SRS §3.2 (Public routing) · SRS §5 (Tech Stack)
- **branch:** `feat/fb-legal-pages`

---

## Goal

เพิ่มหน้าสาธารณะ 2 หน้า (`/privacy` และ `/data-deletion`) ใต้ `(marketing)/` เพื่อให้ครบ requirement ของ Meta App Review สำหรับ Facebook Login — ไม่ต้องมี account deletion backend ใน phase นี้

---

## Decision Log (ตอบ Open Questions แล้ว — locked 2026-06-17)

| OQ | คำถาม | คำตอบที่ lock |
|----|-------|--------------|
| OQ-1 | URL path | **`/privacy` + `/data-deletion`** (path สั้น ตรงราก domain) |
| OQ-2 | ใครเขียน Privacy Policy content | **Claude ร่างให้** อิงระบบจริงจาก Prisma schema — user review/แก้ทีหลัง (ห้าม Lorem ipsum, ต้องเป็น real content เพราะ Meta ตรวจ) |
| OQ-3 | Email ติดต่อ | **`shinobu22@outlook.com`** (ใช้งานได้จริง; โชว์บนหน้า public) |
| OQ-4 | Footer link | **มี** — เพิ่มลิงก์ Privacy ใน footer landing + public profile (S-6 รับเข้า in-scope) |
| OQ-5 | Data Deletion Option (a) vs (b) | **(a) Instructions URL** — static page อธิบายวิธีขอลบข้อมูล. Callback จริง = Phase 2 |

---

## User Stories

| ID | User Story | Priority |
|----|-----------|----------|
| US-L1 | ในฐานะผู้ใช้ทั่วไป ฉันต้องการอ่านนโยบายความเป็นส่วนตัวของ Deep เพื่อทราบว่าข้อมูลของฉันถูกเก็บและใช้อย่างไร | Must |
| US-L2 | ในฐานะผู้ใช้ที่ต้องการลบข้อมูล ฉันต้องการทราบวิธีขอให้ Deep ลบข้อมูลของฉัน | Must |
| US-L3 | ในฐานะ Meta App Reviewer ระบบต้องมี Privacy Policy URL และ Data Deletion URL ที่ accessible สาธารณะก่อน App Review ผ่าน | Must |

---

## Functional Requirements

> FR-L1 และ FR-L2 เป็น requirement ใหม่ — ยังไม่มี FR-x ใน PRD/SRS. ต้องเพิ่มเข้า PRD §3 และ SRS §3.2 หลัง sign-off (S-4, S-5)

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-L1 | หน้า `/privacy` สาธารณะ (ไม่ต้อง login) — แสดง Privacy Policy ของ Deep เป็นภาษาไทย อย่างน้อย 6 หัวข้อ: ข้อมูลที่เก็บ, วัตถุประสงค์, ผู้ที่เข้าถึง/แชร์, การเก็บรักษา, สิทธิ์ผู้ใช้, วิธีติดต่อ | Must |
| FR-L2 | หน้า `/data-deletion` สาธารณะ (ไม่ต้อง login) — อธิบายชัดเจน (explicit instructions): ช่องทางขอลบ (email `shinobu22@outlook.com`), ข้อมูลที่จะถูกลบ, กรอบเวลาที่คาดหวัง | Must |
| FR-L3 | ทั้ง 2 หน้าเข้าถึงได้โดยไม่ต้อง login (`session=null` ไม่ redirect) | Must |
| FR-L4 | ทั้ง 2 หน้า crawlable (ไม่มี `noindex`) เพื่อให้ Meta verify URL ได้ | Must |
| FR-L5 | URL ตาม path ที่เลือกต้องนำไปใส่ Meta App Dashboard → Privacy Policy URL + User Data Deletion URL ได้ทันที | Must |
| FR-L6 | Footer ของ Landing (`/`) และ Public Profile (`/u/{username}`) ต้องมีลิงก์ไปยัง Privacy Policy | Should |

---

## Non-Functional Requirements

| ID | อ้าง NFR เดิม | ข้อกำหนดเพิ่มเติม |
|----|--------------|----------------|
| NFR-3.1 | UI user-facing ภาษาไทยทั้งหมด | เนื้อหา Privacy Policy + Data Deletion ภาษาไทยเป็นหลัก |
| NFR-1.2 | Public page โหลด < 2s | หน้า static = Server Component (ไม่มี client state) |
| NFR-2.x | — | หน้า legal ไม่มี form/mutation → CSRF/rate-limit ไม่ต้องทำ |

---

## In-Scope

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | หน้า `/privacy` ที่ `src/app/(marketing)/privacy/page.tsx` — static Server Component, copy layout จาก Vuexy theme | `GET /privacy` → HTTP 200 ไม่ redirect, heading "นโยบายความเป็นส่วนตัว" + content ≥6 หัวข้อ (FR-L1); `session=null` ยังเข้าได้ | TODO |
| S-2 | หน้า `/data-deletion` ที่ `src/app/(marketing)/data-deletion/page.tsx` — static Server Component, copy layout จาก Vuexy theme | `GET /data-deletion` → HTTP 200 ไม่ redirect, heading "การลบข้อมูลผู้ใช้" + email + ข้อมูลที่ลบ + กรอบเวลา; `session=null` ยังเข้าได้ | TODO |
| S-3 | ทั้ง 2 หน้าไม่มี `noindex` | `curl -I /privacy` และ `/data-deletion` → ไม่มี `X-Robots-Tag: noindex` | TODO |
| S-4 | อัปเดต SRS §3.2 (Public routing) เพิ่ม 2 path | `docs/SRS.md` §3.2 มี row `/privacy` + `/data-deletion` | TODO |
| S-5 | อัปเดต PRD §3 เพิ่ม FR-L1/FR-L2 | `docs/PRD.md` §3 มี legal pages | TODO |
| S-6 | Footer link → Privacy ใน Landing (`/`) + Public Profile (`/u/[username]`) | footer ทั้ง 2 จุดมีลิงก์ไป `/privacy` คลิกแล้วถึงหน้า | TODO |
| S-7 | หน้า `/terms` (Terms of Service) ที่ `src/app/(marketing)/terms/page.tsx` + footer link — รับเข้าจาก OOS-5 (2026-06-17) | `GET /terms` → HTTP 200 ไม่ redirect, heading "ข้อกำหนดการใช้บริการ", 10 หัวข้อ; footer landing มีลิงก์ `/terms`; ใช้เป็น Meta Terms of Service URL | TODO |

---

## Out-of-Scope (→ Phase 2)

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-1 | Account Deletion backend (deleteUser + cascade: UserBadge/TrustScoreHistory/Review/Order/AuthAccount/Shop) | ยังไม่มี service layer, ต้องออกแบบ cascade ordering รอบคอบ + QA ละเอียด |
| OOS-2 | Meta Data Deletion Callback endpoint (`signed_request` HMAC verify + confirmation_code) | ต้องมี OOS-1 ก่อน + ต้องการ FB App secret |
| OOS-3 | Data Deletion status page (`/data-deletion/status?id=...`) | ผูกกับ OOS-2 |
| OOS-4 | Cookie Consent / PDPA consent UI | ไม่ใช่ Meta requirement |
| ~~OOS-5~~ | ~~Terms of Service page (`/terms`)~~ → **รับเข้า scope เป็น S-7** (2026-06-17, user ขอเพื่อกรอก Meta Terms of Service URL) | — |
| OOS-6 | Privacy Policy ภาษาอังกฤษ | ทีหลัง |
| OOS-7 | Email/form system รับ data-deletion request จริง | phase นี้ทำแค่ instructions page ระบุ channel |

---

## Edge Cases

| # | กรณี | วิธีจัดการ |
|---|------|-----------|
| EC-1 | เข้า 2 หน้าขณะ logged in | แสดงปกติ ไม่ redirect ไม่บังคับออก session |
| EC-2 | Meta crawl bot verify URL | Server Component = ไม่มี JS-gate, 200 ทันที |
| EC-3 | `src/proxy.ts` intercept path ไม่รู้จัก | ยืนยัน `/privacy` + `/data-deletion` ไม่ตกใต้ seller/admin subdomain — ต้องอยู่ `(marketing)/` บน main domain เท่านั้น |
| EC-4 | Meta verify HTTP + HTTPS | prod = HTTPS; HTTP → Vercel 301 → HTTPS ปกติ |
| EC-5 | email ที่ระบุต้อง reachable | ใช้ `shinobu22@outlook.com` (user ยืนยันเข้าถึงได้) |

---

## Assumptions

- **A-1:** Meta App Review ยอมรับ Data Deletion Instructions URL แทน Callback ("provide either a callback URL or a URL that explains how someone can delete their data")
- **A-2:** Privacy Policy content ร่างโดย Claude อิงระบบจริง (Prisma schema) — user review/แก้ก่อน submit Meta; ห้าม placeholder/Lorem
- **A-3:** Vuexy theme มี layout เหมาะกับ long-form static content — ยืนยัน theme file ตอน ux spec
- **A-4:** ไม่ต้องมี footer link ใน seller/admin subdomain — Meta verify เฉพาะ URL ที่ลงทะเบียน
- **A-5:** `/privacy` + `/data-deletion` บน main domain เข้า `(marketing)/` ตามปกติ ไม่ถูก proxy redirect (ยืนยันตอน plan)

---

## Open Questions

(ปิดหมดแล้ว — ดู Decision Log)

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-06-17 | baseline สร้าง + ปิด OQ ทั้ง 5 | Meta App Review requirement สำหรับ Facebook Login | user (lock decision) |
| 2026-06-17 | รับ OOS-5 (Terms of Service `/terms`) เข้า scope เป็น S-7 | user ขอเพื่อกรอก Meta Terms of Service URL (เดิม Meta จะชี้ผิดไป /data-deletion) | user |
