# Design Spec — ระบบเช็ก/รายงานความเสี่ยงมิจฉาชีพ (Scam Risk Check & Report)

- **วันที่:** 2026-06-20
- **สถานะ:** Design approved (brainstorming) — รอ user review ก่อนทำ PRD/BRD (Hard Rule 11) แล้วค่อย implement
- **เจ้าของ:** Deep (deep-web)

---

## 1. เป้าหมาย & หลักการ

เครื่องมือ **"เช็กก่อนโอน"** ให้ผู้ใช้ค้นด้วย "ตัวระบุธุรกรรม" แล้วเห็น **ข้อเท็จจริงรวม** ว่าตัวระบุนั้นเคยถูกรายงาน (ที่ผ่านการตรวจสอบ) กี่ครั้ง มูลค่าความเสียหายรวมเท่าไหร่ และประเภทไหนบ้าง

**หลักการคุมความเสี่ยง (สำคัญที่สุด):**
- **โชว์ "จำนวน" ไม่ "ตัดสิน"** — ไม่ขึ้นคำว่า "เป็นมิจฉาชีพ"/"เสี่ยง/ไม่เสี่ยง" แค่แสดงตัวเลขให้ผู้ใช้ตัดสินเอง
- **ไม่ประจานตัวบุคคล** — ไม่โชว์ชื่อ/รูป/โปรไฟล์ของผู้ถูกรายงาน และไม่โชว์ผู้รายงาน
- **มีหลักฐาน + admin ตรวจ ก่อนนับ** — เป็นฐานทางกฎหมายป้องกันหมิ่นประมาท + PDPA
- ป้องกันทั้ง **ผู้ใช้และ Deep (ผู้ควบคุมข้อมูล)** จากการถูกฟ้องกลับ

**ตัวระบุที่ค้น/รายงานได้ (MVP ครบ 4):** เบอร์โทร, ชื่อ-นามสกุล, เลขบัตรประชาชน, เลขบัญชีธนาคาร

---

## 2. สถาปัตยกรรม (ยืม pattern จาก `VerificationRecord` ที่มีอยู่)

| ส่วน | Auth | หมายเหตุ |
|---|---|---|
| ค้นหา (อ่าน) | ไม่ต้อง login | นับเฉพาะรายงานสถานะ `APPROVED` |
| รายงาน (เขียน) | **ต้อง login** | บังคับแนบหลักฐาน |
| Admin review queue | admin เท่านั้น | PENDING → APPROVE/REJECT (mirror `/admin/verifications`) |

flow: `รายงาน (PENDING)` → `admin ตรวจหลักฐาน` → `APPROVED` (เริ่มถูกนับในผลค้นหา) หรือ `REJECTED` (ไม่ถูกนับ)

---

## 3. Data Model

### 3.1 `ScamReport` (รายงาน 1 เคส)
| field | type | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| reporterId | FK → User | ผู้รายงาน (login required) |
| status | string | `PENDING`(default) / `APPROVED` / `REJECTED` |
| scamType | string | enum-like: `TRANSFER_NO_DELIVERY` (โอนแล้วไม่ส่งของ), `ITEM_NOT_AS_DESCRIBED` (ไม่ตรงปก), `FAKE_INVESTMENT` (หลอกลงทุน), `OTHER` |
| amountLost | int | บาท (ใช้รวมมูลค่าเสียหาย) |
| description | string | รายละเอียดเหตุการณ์ |
| evidence | Json | fileId จาก `/api/upload` (อย่างน้อย 1 — **บังคับ**) |
| reviewedById | FK → User? | admin ที่ตรวจ |
| reviewedAt | DateTime? | |
| rejectedReason | string? | |
| createdAt / updatedAt | DateTime | |

### 3.2 `ScamReportIdentifier` (ตัวระบุของรายงาน — 1 รายงานมีได้หลายตัว)
| field | type | หมายเหตุ |
|---|---|---|
| id | uuid PK | |
| reportId | FK → ScamReport (cascade) | |
| type | string | `PHONE` / `NAME` / `NATIONAL_ID` / `BANK_ACCOUNT` |
| valueHash | string (indexed) | คีย์ค้นหา — HMAC-SHA256 ของค่าที่ normalize แล้ว |
| valueMasked | string | สำหรับแสดงผลแบบปลอดภัย (`08x-xxx-xx89`, `สมชาย ก.`) |
| bankName | string? | เฉพาะ `BANK_ACCOUNT` |

- **index** บน `(type, valueHash)` เพื่อค้นเร็ว
- ผลค้นหา = `aggregate ScamReportIdentifier` join `ScamReport` ที่ `status = APPROVED` group ตาม identifier ที่ค้น

> หมายเหตุ: ปรับ `prisma/schema.prisma` + migration; รายละเอียด field/enum สุดท้ายให้ยึดตอนทำเอกสาร DATABASE (Hard Rule 11) — owner `safepay-database`

---

## 4. ความปลอดภัย / PDPA (บังคับ)

1. **เลขบัตรประชาชน + เลขบัญชี = ข้อมูลอ่อนไหวสูง** → เก็บเป็น **HMAC-SHA256 (secret = NEXTAUTH_SECRET หรือ key เฉพาะ)** เท่านั้น
   - **ไม่เก็บเลขจริง (plaintext) ลง DB, ไม่ส่งกลับ client, ไม่โชว์**
   - ค้นแบบ exact-match เทียบ hash → กันทั้งข้อมูลรั่ว และกันไล่สุ่มเลข (keyed HMAC brute-force ไม่ไหว)
2. **เบอร์/ชื่อ** normalize (เบอร์=ตัวเลขล้วน, ชื่อ=trim+lowercase) ก่อน hash; แสดงผลกลับแบบ **mask** เท่านั้น
3. **บังคับแนบหลักฐาน** + **admin verify ก่อนนับ** = ฐานทางกฎหมาย
4. **กันสแปม/กลั่นแกล้ง:** login required, 1 รายงาน/ตัวระบุ/ผู้ใช้, rate-limit ต่อ IP/ผู้ใช้, consent checkbox + คำเตือน "ผู้รายงานรับผิดชอบหากข้อมูลเท็จ"
5. **ผลลัพธ์ = ตัวเลขรวมเท่านั้น** — count, มูลค่ารวม, breakdown ประเภท, ช่วงเวลาล่าสุด; **ไม่มีชื่อผู้รายงาน/ผู้ถูกรายงาน, ไม่มี description ดิบ**
6. **สิทธิเจ้าของข้อมูล (PDPA):** MVP มี **ช่องทางติดต่อขอแก้ไข/ลบ**; ระบบ dispute เต็มรูป = Phase 2

---

## 5. UX / จุดเข้า

| หน้า | path | auth | รายละเอียด |
|---|---|---|---|
| Home section "เช็กก่อนโอน" | `/#check` (section ใน landing) | - | ช่องค้นหา + เลือกประเภทตัวระบุ → submit ไป `/check` |
| ผลค้นหา | `/check?type=...&q=...` | - | สรุป: ถูกรายงาน N ครั้ง, มูลค่ารวม ฿X, breakdown ประเภท. **ถ้าไม่เจอ → "ไม่พบการรายงาน" เฉย ๆ** |
| ฟอร์มรายงาน | `/report` | **login** | กรอกตัวระบุ (≥1) + ประเภท + มูลค่า + รายละเอียด + **อัปโหลดหลักฐาน (บังคับ)** + consent |
| Admin queue | `/admin/(dashboard)/scam-reports` | admin | list PENDING/APPROVED/REJECTED → detail → APPROVE/REJECT (+เหตุผล) |
| Nav | FrontMenu | - | เพิ่มลิงก์ "เช็กมิจฉาชีพ" |

UI: หน้า public (`/check`, `/report`, home) = **Vuexy** (`(marketing)/**`); admin queue = **Paces** (`(paces)/admin/**`). ทุกหน้าผ่าน `safepay-ux` ก่อน build (Hard Rule 8).

---

## 6. API (ร่าง)

| method + path | auth | หน้าที่ |
|---|---|---|
| `GET /api/scam-reports/search?type=&q=` | - | คืน aggregate (count, totalLoss, byType, lastReportedAt) จาก APPROVED |
| `POST /api/scam-reports` | login | สร้างรายงาน (PENDING) + identifiers (hash) + evidence |
| `GET /api/admin/scam-reports` | admin | queue |
| `PATCH /api/admin/scam-reports/[id]` | admin | APPROVE/REJECT (+reason) — mirror verifications |

guard เดิม: `requireAdmin()` สำหรับ admin; เพิ่ม `requireAuth()` (buyer) สำหรับ POST report (ตอนนี้ยังไม่มี helper นี้ — สร้างใหม่จาก `getServerSession`). ผ่าน `guardApi` (CSRF + rate-limit) เดิมใน `proxy.ts`.

---

## 7. ขอบเขต

**MVP (รอบนี้):**
- ค้นครบ 4 ตัวระบุ (เบอร์/ชื่อ/บัตรปชช./บัญชี)
- รายงาน + บังคับหลักฐาน + login + consent
- admin verify queue
- ผลค้นหาแบบ count/มูลค่า/ประเภท + "ไม่พบการรายงาน" เมื่อไม่เจอ
- ช่องทางติดต่อขอแก้ไข/ลบ

**Phase 2 (ไม่ทำตอนนี้):**
- ระบบ dispute/ขอลบเต็มรูป (เจ้าของข้อมูลโต้แย้ง)
- แจ้งเตือน, risk scoring/threshold, สถิติเชิงลึก

---

## 8. ความเสี่ยงที่รับรู้ & การลด

| ความเสี่ยง | การลด |
|---|---|
| หมิ่นประมาท / ฟ้องกลับ | โชว์จำนวนไม่ตัดสิน, ไม่เผยตัวตน, บังคับหลักฐาน, admin verify, consent |
| PDPA (เก็บบัตร/บัญชี) | HMAC เท่านั้น, ไม่เก็บ/ไม่โชว์ plaintext, ช่องทางขอลบ |
| ค้นชื่อ false-match (ชื่อซ้ำ) | โชว์เป็น "จำนวนรายงานของชื่อนี้" + เตือนว่าชื่ออาจซ้ำ; แนะนำค้นด้วยเบอร์/บัญชีจะแม่นกว่า |
| กลั่นแกล้ง/สแปม | login + 1/ตัวระบุ/ผู้ใช้ + rate-limit + admin gate |
| ไล่สุ่มเลขบัตร/บัญชี | keyed HMAC + ค้น exact-match เท่านั้น (ไม่มี list/enumerate) |

---

## 9. ขั้นต่อไป (ตาม Hard Rule 11 — Documentation-First)
1. user review spec นี้
2. ทำ Feature docs `docs/20 - Features/<NNNNN> - ScamRiskCheckReport/`: **PRD+BRD** (safepay-product) → SRS/SDS/API (safepay-planner) → DATABASE (safepay-database) → Tests (safepay-qa) — ผ่าน user review
3. `safepay-ux` Design Spec ของแต่ละหน้า (Hard Rule 8)
4. implement ผ่าน agent-team (Hard Rule 4) — **ห้าม implement ก่อน PRD+BRD ผ่าน review**
