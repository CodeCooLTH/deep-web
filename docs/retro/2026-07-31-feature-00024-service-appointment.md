# Retro — feature 00024 ระบบนัดหมายวันเข้าใช้บริการ (ปิด gate ที่ค้าง)

**วันที่:** 2026-07-31
**Branch:** `feature/reserve-service`
**ขอบเขตของ retro นี้:** เฉพาะช่วงปิด gate ที่ค้างมาจาก session ก่อน — ux gate, impeccable, E2E,
browser QA ไม่ใช่ retro ของการ build ทั้งฟีเจอร์

---

## สิ่งที่เกิดขึ้น

session ก่อนหยุดกลางทางเพราะ `safepay-ux` spawn ไม่ขึ้น เหลือ gate ที่ **ไม่เคยผ่านเลย** 4 อย่าง:
ux (Hard Rule 8), impeccable CLI, E2E (เขียนไว้ 13 เคสแต่ไม่เคยรัน), browser QA

ผลของ session นี้:

| Gate | ผล |
|---|---|
| `safepay-ux` (Hard Rule 8) | ผ่าน — Theme Source Mapping ตรงทั้ง 3 ไฟล์, One Voice + Verified-Means-Green ผ่าน |
| impeccable critique | 24/40 Acceptable — เจอ P0 1 ข้อ, P1 3 ข้อ |
| impeccable detector | 0 findings (แต่เชื่อได้แคบ — ดูบทเรียนข้อ 2) |
| E2E | **14/14 เขียว** จากเดิมแดง 11/13 |
| tsc | 0 |
| Hard Rule 1/3/7/9/12 + label/date | ผ่านหมด |
| browser QA | A/B/C ครบ 3 ขนาดจอ · D (การ์ดผู้ซื้อ) ยังไม่ได้ทำ |

commit ที่เกิดขึ้น: `fd01e2de` (แก้ P0), `323ef829` (แก้ E2E)

---

## บทเรียน

### 1. commit ที่ "แก้บั๊กที่ user เห็น" อาจสร้างบั๊กที่ user ไม่เห็นแทน

`58e5b33b` แก้ปัญหาจริง (ยอดรวม+ปุ่มบันทึกหลุดใต้จอ) ด้วยการย้ายบล็อกนัดเข้าไปในแผงขวา
แต่ที่นั่นมันกลายเป็น accordion ที่พับ **และไม่ถูก render เลยตอนพับ** ทำให้ interaction
เรือธงของฟีเจอร์ (กดวันในปฏิทิน → สร้างออเดอร์) พังเงียบสนิท — ได้ออเดอร์ที่ไม่มีนัด
โดยไม่มี error อะไรเลย

บั๊กเดิมมองเห็น บั๊กใหม่มองไม่เห็น อันหลังแย่กว่าเพราะไม่มีอะไรให้ debug

**กฎที่ได้:** ย้าย component ข้าม container ที่มี conditional render (`{cond && <X/>}`)
ต้องไล่ดูว่ามีใครส่งค่าเข้า component นั้นจากภายนอกหรือเปล่า (query param, prefill,
deep link) ไม่ใช่แค่ดูว่า layout ไม่พัง

### 2. detector ที่ขึ้น exit 0 ไม่ได้แปลว่าตรวจครบ

impeccable detector คืน 0 findings ทั้ง 3 target แต่ Assessment B ไม่เชื่อผลตัวเอง
แล้วทดสอบด้วย fixture ปลอมจนพบว่าไฟล์ `.tsx` ผ่านแค่ **regex engine** เท่านั้น
กฎที่ต้องใช้ DOM ที่ render แล้ว (`low-contrast`, `tiny-text`, `cramped-padding`,
`nested-cards`, `skipped-heading`) **ไม่ได้รันเลย**

พิสูจน์ทันทีหลังจากนั้น: browser QA เจอว่านัดบนปฏิทินมุมมองเดือน contrast **1.04:1**
(วัดพิกเซลจริง) ซึ่ง detector ไม่มีทางเห็น

**กฎที่ได้:** ก่อนอ้าง "detector ผ่าน" ให้ยิง fixture ที่ตั้งใจให้ผิดเข้าไปก่อน
ถ้า fixture ไม่ทำให้มันแดง แปลว่าไฟล์ประเภทนั้นไม่ได้ถูกตรวจด้วยกฎที่คุณคิด
ต่อยอดจาก [[feedback_impeccable_detector_vs_design]]

### 3. เทสที่ไม่เคยรัน ไม่ใช่เทส

13 เคสที่เขียนไว้ครบและอ่านดูสมเหตุสมผล พอรันจริงแดง 11 — **ทุกเคสแดงเพราะตัวเทสเอง
ไม่ใช่เพราะฟีเจอร์** และมีบั๊กที่ซ่อนอยู่ 3 ชั้นซ้อนกัน กว่าจะเจอชั้นในสุดต้องแก้ชั้นนอกก่อน:

1. ร้าน BUSINESS ล่องหน → redirect loop → timeout (บังหมดทุกอย่าง)
2. `.first()` จับใบที่ถูก CSS ซ่อน → strict violation / not visible
3. ข้อความที่คาดไม่ตรงกับ UI จริง (ซึ่ง UI ถูก เทสล้าสมัย)

**กฎที่ได้:** เทสที่ยังไม่เคยรัน = หนี้ ไม่ใช่ทรัพย์สิน อย่านับเป็น coverage ในรายงาน
สถานะจนกว่าจะเห็นมันเขียวจริงอย่างน้อยหนึ่งครั้ง

### 4. `.first()` ผิดเสมอกับ component ที่ render สองใบสลับด้วย CSS

ฟอร์ม POS render `QuickForm` (มือถือ) กับ `CartPanel` (เดสก์ท็อป) พร้อมกันเสมอ
สลับด้วย CSS ไม่ใช่ React ใบแรกใน DOM คือใบมือถือที่ถูก `lg:hidden` ซ่อนบนจอเดสก์ท็อป
`.first()` จึงจับใบที่มองไม่เห็น

ใช้ `locator('visible=true')` แทน — ตรงกับเกณฑ์ "ผู้ใช้เห็นจริง"
([[feedback_visible_means_computed_style]])

### 5. dev server ที่ตั้งเองต้องมี env ครบ ไม่งั้นจะ debug ผิดทาง 2 รอบ

- รอบแรก: ไม่มี `NEXTAUTH_SECRET` → `link-intent.ts` throw ตอน module evaluation →
  **ทุกหน้า** เป็น Runtime Error → เทสแดงยกชุดโดยดูเหมือนฟีเจอร์พัง
- รอบสอง: ไม่มี `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` → `ChatToastListener` ใน
  dashboard layout throw ตอน mount → หน้าพังเฉพาะที่อยู่ใต้ layout นั้น
  (ทำให้ดูเหมือน "เฉพาะหน้า /queues พัง" ซึ่งพาไปวินิจฉัยเรื่อง migration ผิดทาง)

ระหว่างทางยังวินิจฉัย schema ผิดเพราะไป query ชื่อตาราง snake_case
(`service_resources`) ทั้งที่ของจริงเป็น PascalCase (`ServiceResource`) —
`\dt` ที่คืน "Did not find any relation" ควรเป็นสัญญาณให้เช็คชื่อ ไม่ใช่สรุปว่าไม่มีตาราง

**กฎที่ได้:** ก่อนสรุปว่า "โค้ด/DB พัง" ให้เปิดหน้าเว็บดู error จริงก่อนเสมอ —
screenshot ของ Playwright บอกคำตอบใน 10 วินาที ส่วนการเดาใช้เวลาเป็นสิบนาที

### 6. Postgres ในเครื่องเร็วกว่าและปลอดภัยกว่า — ควรเป็น default ของ E2E

รันชุดเดียวกัน:

| เป้าหมาย | เวลา | ความเสี่ยง |
|---|---|---|
| Supabase (แชร์กับ prod) | ~2 นาที | เขียนข้อมูลจริงลงฐาน prod |
| Docker `safepay-db-5434` | **12 วินาที** | ไม่มี |

เร็วขึ้น ~10 เท่าและตรงกับ Hard Rule 14 ที่เพิ่งเพิ่มเข้ามา

---

## หนี้ที่ยังค้าง

| # | เรื่อง | ระดับ |
|---|---|---|
| 1 | **contrast ป้ายนัดบนปฏิทินมุมมองเดือน 1.04:1** — FullCalendar render นัดแบบมีเวลาเป็น `fc-daygrid-dot-event` ที่พื้นหลังโปร่งใส `bg-warning` จึงไม่มีผล เหลือ `text-white` กลืนพื้น · **อยู่บน prod แล้ว** (มาจาก `b03a1ab8`) · ร้านโหมดรายวันไม่โดน (นัด all-day render เป็นบล็อก) | P0 |
| 2 | 5 สถานะเหลือ 3 สี — "ลูกค้าขอเลื่อน" (สถานะเดียวที่ต้องลงมือทำ) หน้าตาเหมือน "นัดแล้ว" · legend อ้างว่าแยกได้ 5 แบบทั้งที่แยกได้ 3 | P1 |
| 3 | สร้างนัดจากปฏิทินบนมือถือไม่ได้เลย — <768px บังคับ `listWeek` ซึ่งไม่มี `dateClick` ทั้งที่ PRD ระบุ persona หลักใช้มือถือเป็นหลัก · ปุ่ม "จอง" ยังผูกกับ `:hover` ซึ่งจอสัมผัสไม่มี | P1 |
| 4 | contrast อีก 4 จุดควรใช้ `-ink` token (`AppointmentBlock:340,344`, `ResourceList:45`, `AppointmentCard:222`) | P1 |
| 5 | `AppointmentCard` ฝั่งผู้ซื้อยังอ่านเป็น admin widget บน brand surface — วันที่ 15px, ชื่อคิวงานไม่มี label, ปุ่มยืนยันเป็น tonal ขณะที่ปุ่มรองเป็น contained | P2 |
| 6 | `GranularitySetting` (ค่าระดับร้าน) render ซ้ำในทุกฟอร์มคิวงาน + บันทึกทันทีที่ change ขณะที่ปุ่ม "ยกเลิก" ของฟอร์มย้อนทุกอย่างยกเว้นมัน | P2 |
| 7 | browser QA ส่วน D (การ์ดผู้ซื้อบน `/o/[token]`) ยังไม่ได้ทำ — ติดด่านของ feature 00015 | — |
| 8 | `58e5b33b` + 2 commit ใหม่ยังไม่ push ขึ้น main | — |

ภาพ QA 12 ใบอยู่ที่ `qa-screens/00024/` (untracked)

---

## เอกสารอ้างอิง

- handoff เดิม: `docs/superpowers/plans/2026-07-31-00024-handoff.md` (ตอนนี้ล้าสมัยแล้ว)
- feature docs: `docs/20 - Features/00024*/`
