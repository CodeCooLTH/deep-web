# Retro — 00071 P1 ปิดการเงิน (2026-10-10)

ขอบเขต: S-1..S-7 · branch `feat/00071-member-roles` · Gate 2 SIGNED-OFF · ไม่มี migration
ทีม: product (Gate 0/1/2) → planner → ux (B1/B2) → developer ×8 task (ขนานสูงสุด 3) → reviewer ทุก task → security (T1 + ปลาย phase) → impeccable critique/clarify → docs

## Problems

1. **ช่องรั่ว "ระดับรูปร่าง response" หลุดจาก developer ซ้ำ 3 ครั้ง ต้องให้ reviewer/security จับ**
   - T2: หน้า `reports/agents/[agentId]/page.tsx` ซ่อน revenue ใน JSX แต่ส่ง `detail.trend` ทั้งก้อนเข้า `AgentTrendChart` ('use client') ⇒ revenue อยู่ใน RSC payload (แก้ใน `3cf6b3a8`)
   - T7: `createOrder`/`updateOrder`/`getOrdersByShop` คืน `include: { items: true }` แล้ว route ส่งต่อเป็น JSON ⇒ `items[].cost` ถึงผู้ดูแลทั้งที่ developer ตัด cost ออกจาก "ขาเข้า" และ GET รายใบแล้ว (แก้ใน `53d55fc3` ด้วย `src/lib/order-cost-redact.ts`)
   - security ปลาย phase: ช่องรั่ว **เดิมก่อน P1** 3 จุด — `/api/public/reviews/[username]` (ไม่ต้องล็อกอิน) คืนต้นทุนรายบรรทัด + เบอร์/อีเมลผู้รีวิว + take ไม่มีเพดาน · `getOrdersByBuyer` คืน cost · `/categories` ยอดขายรายหมวด (แก้ใน `fix(00071): ปิดช่องรั่วการเงินเดิม`)
2. **ค่าตั้งต้นของพารามิเตอร์สิทธิ์เป็น "เปิด"** — `canSeeBalance ?? true` (2 service), `insufficientCreditHtml(canTopUp = true)`, `CanTopUpContext` default `true` ⇒ ผู้เรียกที่ลืมส่ง = รั่ว · ต้องตามแก้ 3 รอบ (review T3 → T8 → security L2)
3. **`finance-surface-guard.test` จับได้แค่ระดับไฟล์** — ไฟล์ที่มีตัวตัดสินอะไรก็ได้หนึ่งครั้งก็ผ่าน · จับ `items: true`/`aggregate` ตรงไม่ได้ (M1 หลุดเพราะใช้ `getOrdersByShop`+`reduce` ซึ่งไม่อยู่ในรายชื่อแหล่งเงิน)
4. **`sed -i -E` บน macOS สร้างไฟล์สำรอง `*-E` และ mutation เขียวหลอก** — agent T6 ทิ้ง `tests/services/product-capability.test.ts-E` (สำเนา HEAD) · agent T5 รายงานว่า mutation รอบแรก "sed ของ macOS พัง ได้ผลเขียวปลอม" ต้องรันซ้ำด้วย python
5. **อ่านผล background job ผิด** — job `next build ... ; echo exit=$? >> log` รายงาน exit 0 เพราะคำสั่งสุดท้ายคือ `echo` · build จริง exit 1 (Turbopack `next/font/google` ใน `global-error.tsx` — เวิร์กทรีสะอาด build HEAD เดียวกันผ่าน exit 0 ⇒ เป็นสภาพแวดล้อมของเวิร์กทรีนี้)
6. **เทสแดงเดิม 7 ตัว** (`tests/integration/media-asset-dedup*.test.ts` ×6, `signup-achievement.test.ts` ×1) — พิสูจน์แล้วว่าแดงเหมือนกันบน base `a4e11d7f` ในเวิร์กทรีสะอาด **ไม่เกี่ยวกับ 00071** แต่ไม่มีใครเป็นเจ้าของ

## Root causes

1. developer ตีความ "ตัดเงินที่ข้อมูล" เป็น "ตัดที่ query/props ที่ฉันเขียน" ไม่ใช่ "ไล่ทุกทางที่แถวนั้นออกจาก server" — ทำไม: แผนให้รายการ surface เป็น **ไฟล์:บรรทัดที่แสดงตัวเลข** (มองจากจอ) ไม่ใช่ **ทุก response/prop ที่มีแถวของตารางนั้น** (มองจากข้อมูล) · ช่องรั่วเดิมก่อน P1 ยิ่งมองจากจอไม่เห็น เพราะไม่มีจอไหนแสดง (H1/H2 ไม่มีผู้เรียกในแอปเลย)
2. พารามิเตอร์ใหม่ถูกเพิ่มแบบ "ไม่ทำให้ caller เดิมพัง" (`= true`) เพื่อ compile ผ่าน — ทำไม: นิสัย backward-compat ใช้ผิดที่ · กับสิทธิ์ ค่าตั้งต้นที่ปลอดภัยคือ "ปิด" และให้ tsc บังคับ caller
3. ด่านสแกนซอร์สเขียนจาก "รายชื่อฟังก์ชันแหล่งเงิน" ที่ไล่ด้วยมือ — ทำไม: ไม่มีด่าน runtime ที่เรียก route จริงด้วย session ผู้ดูแลแล้วไล่คีย์ JSON
4. BSD sed ตีความ `-i -E` ว่า suffix = `-E` (ต้อง `-i '' -E`) — agent ไม่ได้ `diff` ยืนยันว่าไฟล์เปลี่ยนจริงก่อนอ่านผล mutation
5. ใส่ `; echo exit=$?` ต่อท้ายทำให้ exit code ของ job = ของ echo

## Conventions to adopt

1. **ปิดสิทธิ์ข้อมูล = ไล่ตามแถว ไม่ใช่ตามจอ** → `docs/conventions/permission-gate-follows-the-row.md`: ทุกครั้งที่ตัดฟิลด์ X ของตาราง T ให้ grep ทุกที่ที่แถว T ออกจาก server (`include: { t: true }`, `select` ที่มี X, `findMany` ที่คืนทั้งแถว, `NextResponse.json(<prisma result>)`, prop ที่ส่งทั้งก้อนเข้า 'use client') รวม route ที่ "ไม่มีจอเรียก" ด้วย
2. **พารามิเตอร์/context ที่ตัดสินสิทธิ์ห้ามมีค่าตั้งต้นที่เปิด** — required (ให้ tsc บังคับ) หรือ default ปิด · อยู่ในไฟล์ convention ข้อ 1
3. **mutation ทุกครั้งต้องพิสูจน์ว่าไฟล์เปลี่ยนจริง** (`diff`/`cmp` ก่อนรันเทส) · บน macOS ใช้ python แทน `sed -i` (มีอยู่ใน `mutation-silence-means-weak-corpus.md` แล้ว — ย้ำใน memory)
4. **อ่านผล background job จาก log เสมอ ไม่ใช่จาก exit ของ job** เมื่อคำสั่งลงท้ายด้วย `echo`

## What went right

- **ล็อกสัญญา (role codes, data model, module path, error code) ก่อนปล่อย planner + docs ขนาน** — ไม่มีงานชนกันเลยตลอด 8 task
- **ขั้น UX spec ก่อน developer** ทำให้ข้อความ/การจัดผังตรงกันทุกหน้า และ critique เหลือแค่เรื่อง copy (27/40, 0 P0)
- **reviewer อิสระทุก task จับของจริง 2 ครั้ง** (T2 RSC payload, T7 response shape) + security ปลาย phase จับช่องรั่วเดิม 3 จุดที่อยู่บน prod มานาน (H1 เป็น PII ด้วย)
- **พิสูจน์เทสแดง "ไม่ใช่ของเรา" ด้วยเวิร์กทรีสะอาดที่ base** แทนการเดา
- `rolesFromMembership` เป็นจุดสลับเดียว — P2 เปลี่ยนที่เดียว · ค่าแปลก → `[]` (security T1 แนะ)
- `keepLineCosts` ปิดบั๊กแฝงที่ P1 จะสร้างเอง (ผู้ดูแลแก้ใบ → ต้นทุนรายบรรทัดถูกทับเงียบ) ก่อนเกิด

## Action items

1. ✅ เขียน `docs/conventions/permission-gate-follows-the-row.md` + บรรทัดใน `CLAUDE.md` + `docs/claude/conventions-index.md`
2. ✅ memory: `feedback_permission_param_default_closed.md` · `feedback_macos_sed_inplace_flag.md`
3. P3 S-12: runtime contract test (เรียก route ด้วย session ผู้ดูแล/ช่าง/ไม่ล็อกอิน แล้วไล่คีย์เงิน) · พิจารณา Prisma global `omit` สำหรับ `cost` · redactor แบบ allow-list (บันทึกในแผน P1 ท้ายไฟล์)
4. ✅ build ล้มในเวิร์กทรี main-3 = สภาพแวดล้อม: เวิร์กทรีสะอาด (`npm ci` ใหม่) build ได้ทั้ง `origin/main` และ HEAD `ad852c77` exit 0 · ในเวิร์กทรีที่ใช้งานอยู่ล้มด้วย Turbopack `next/font/google` (สงสัย `next-env.d.ts` ที่สร้างเองแบบย่อ/แคช) — ห้ามตัดสิน build จากเวิร์กทรีที่ประกอบสภาพแวดล้อมเอง
5. เทสแดงเดิม 7 ตัว — แจ้ง user ให้เลือกเจ้าของ/แก้แยก (ไม่ใช่งาน 00071)
6. แจ้ง user ก่อน push `main` (R-3): ผู้ดูแลเสียยอดขาย/ค่าใช้จ่าย/รายงาน/กระเป๋า/ต้นทุน/ยอดสะสมลูกค้า · P1 ไม่มี migration (HR15)
7. browser QA (user ตรวจเอง): แดชบอร์ดผู้ดูแล RecentOrder เต็มกว้าง · การ์ดโปรไฟล์ลูกค้า 3 แถว · hero มือถือไม่มีลิงก์ร้าน · ชื่อสินค้ายาว 320/390
