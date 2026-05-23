# Retro — Public Shop Profile redesign (`/u/[username]`)

> วันที่: 2026-05-23 · branch `feat/seller-orders-phase-a` · commits `58f7488`→`300e6c0`
> Phase: redesign หน้า public shop profile ตาม mockup Instagram-style + 2-mode responsive + visual polish หลายรอบ

## สิ่งที่ทำ (สรุป)
product → ux → planner → developer (6 tasks 3 batches) → reviewer/QA → commit; ตามด้วย rework ใหญ่ (single-column ตาม mockup), 2-mode responsive, และ visual polish หลายรอบจาก user feedback (full-bleed, centered, verify badge, back button, ลบ FAB/caption, Instagram product grid, seed avatar+product images).

---

## Problems + Root causes

### P1 — Turbopack phantom-500 ทำให้เสีย debugging cycle (false alarm)
หลัง parallel UI batch + rework, หน้า `/u/testuser` คืน **HTTP 500** ตอน QA ทั้งที่ tsc สะอาด + reviewer MERGE. ไล่เป็นระบบ (isolate data layer repro, grep compiled chunks หา string ใหม่, ใส่ temp `error.tsx` boundary) พบว่า **โค้ดถูกทุกบรรทัด** — เป็น **transient Turbopack dev phantom-crash**; การเพิ่ม/ลบไฟล์ force recompile แล้วหายเอง (แก้โค้ด 0 บรรทัด).
- **Root cause:** Turbopack dev in-memory module/render state เพี้ยนหลัง rapid HMR หลายไฟล์รัว ๆ. **compiled chunk มี string ใหม่ + mtime ใหม่กว่า source → ไม่ได้แปลว่าไม่ phantom** (เคยใช้เป็นหลักฐานตัด stale-state ออก ผิด).

### P2 — Port confusion (memory บอก 4000 จริง 3000)
QA probe: 4000 redirect ไป `/th`, 3000 = app เรา. `ps` พบ 4000 = โปรเจกต์อื่น (`12tees/web-v2`), safepay = 3000 (`next dev --turbopack`). memory/หัวข้อเก่าจำ 4000.
- **Root cause:** port ไม่ fixed + มีหลายโปรเจกต์รันพร้อมกัน. (ย้ำ `feedback_qa_domains` — probe จริงเสมอ; เพิ่ม: `ps` ระบุเจ้าของ port).

### P3 — Controller freeze contract ผิดชั้น (consumer vs producer)
freeze stats fields (`completedOrders/avgRating/...`) ไว้บน `ProfileHeaderData` (header) ทั้งที่ **consumer จริง (StatsBar) อยู่ใน tab** → developer ต้อง hack ผ่าน `as AboutOverviewData` unsafe cast + เกิด dead fields. reviewer จับได้ (rework 1 รอบ).
- **Root cause:** freeze contract โดยดูแค่ "field อะไรบ้าง" ไม่ได้ verify ว่า **component ไหนเป็นคนใช้ field นั้น**.

### P4 — Mockup เป็น full-page reference แต่ developer เก็บโครง theme (Vuexy 2-col)
รอบแรก developer build ตาม theme `profile/index.tsx` (Grid 5/7 2-คอลัมน์ + การ์ดแยก) ทั้งที่ mockup เป็น single-column Instagram card → user "ไม่เหมือน mockup เลย" ต้อง rework ใหญ่.
- **Root cause:** ตีความ Hard Rule 6 ว่า "layout ตาม theme เสมอ" — แต่เมื่อ user ให้ **full-page mockup เป็น reference ของทั้งหน้า** layout structure คือ asset/content ที่ต้องตาม (theme ใช้แค่ component primitive).

### P5 — Visual iteration แพง เพราะ browser self-QA ใช้ไม่ได้
chrome-devtools MCP หลุดกลาง phase → Controller screenshot เองไม่ได้ → ทุก visual tweak (full-bleed, centered, verify badge, back button, FAB, product grid ×3) ต้อง round-trip ให้ user ดู. รอบเยอะมาก + user เริ่มหงุดหงิด ("ยิ่งทำยิ่งเพี้ยน").
- **Root cause:** (a) ไม่มี visual feedback loop ฝั่ง Controller, (b) ไม่ได้ front-load design decisions — แก้ทีละจุดแบบ reactive.

### P6 — Thrashing บน product grid (redesign รอบ missing data)
แก้ product grid 3 รอบ: white-card → card-grid+border → Instagram. ต้นเหตุที่ user เห็น "สินค้าน้อย/ว่าง" จริง ๆ คือ **สินค้าไม่มีรูป** (imageUrl=null) → placeholder เทากลืนพื้น grid เทา. แต่ไปแก้ที่ **design ของ grid** แทนที่จะแก้ที่ **data (ใส่รูป)**.
- **Root cause:** เจอ symptom visual ("ดูว่าง") แล้ว redesign component รอบ ๆ ปัญหา แทนหา root (data ขาด). systematic-debugging Phase 4.5: 3+ design changes ที่สร้างปัญหาใหม่ = ต้องหยุดถาม root.

---

## What went right (anchor — ทำซ้ำ)
- **Independent reviewer gate จับของจริงทุกรอบ:** unsafe-cast contract flaw (P3), dead fields, stale comments, padding regression, FAB-hidden edge — ก่อน commit.
- **systematic-debugging ตัด code ออกถูกต้องใน P1:** ไม่ "แก้บั๊กที่ไม่มีจริง" — repro data layer + grep compiled + temp error.tsx boundary เป็นหลักฐานว่า code clean → recompile หาย.
- **Verify data เชิงประจักษ์กัน chase non-bug:** "8 สินค้าขึ้น 4" → query DB + นับ `<img>` ในหน้า = 8 ครบ (เป็น stale view ก่อน refresh ไม่ใช่บั๊ก).
- **Commit checkpoint (Batch1, 2-mode) ก่อน iterate ต่อ** — ไม่เสี่ยงงานหายตอน polish ยาว.
- **lock-contract-before-parallel** ทำให้ Batch 2 (T3/T4/T6) integrate ได้ (แม้ contract ออกแบบผิดชั้นใน P3 — caught by reviewer).

---

## Conventions to adopt (actionable)
1. **Freeze contract = verify consumer component ไม่ใช่แค่ field list** — ก่อน freeze type ที่ ≥2 component แชร์ ระบุชัดว่า **field ไหน component ไหน render** วางบน type ของ component ที่ใช้จริง (ไม่ใช่ producer/object ที่ส่ง). กัน unsafe-cast workaround + dead fields. (ขยาย workflow #28)
2. **Full-page mockup ที่ user ให้ = layout structure เป็น reference ด้วย** — Hard Rule 6: เมื่อ user ส่ง mockup เต็มหน้าและสั่ง "ให้เหมือน" → **โครง layout (single-column/grid/ลำดับ section) คือ asset/content ที่ต้องตาม** theme ใช้แค่ component primitive. อย่า default โครง 2-col ของ theme. ไม่ชัด → ถาม.
3. **browser QA ใช้ไม่ได้ → front-load design decisions** — ถ้า chrome-devtools MCP ไม่พร้อม Controller verify visual เองไม่ได้ → ทุก tweak = user round-trip (แพง). ให้ dispatch `safepay-ux` ทำ Design Spec ครบ (layout/spacing/placement options) **ก่อน** build รอบใหญ่ เพื่อรวบ decision ลด round-trip; นับ browser-QA-unavailable เป็น blocker ที่ปรับ process (ไม่ใช่ลุยแก้ทีละจุด).
4. **Visual "ดูว่าง/น้อย/เพี้ยน" → verify data ก่อน redesign** — symptom visual ที่อาจมาจาก data ขาด (รูป/จำนวน) ต้อง query/นับของจริงก่อน; ถ้า data ขาด → **seed/แก้ data** ไม่ใช่ redesign component รอบ ๆ. 3+ design changes บน component เดียวที่สร้างปัญหาใหม่ = หยุด ถาม root (systematic-debugging 4.5).
5. **Phantom-500 refinement:** compiled chunk มี code ใหม่ + mtime ใหม่ **ไม่ตัด** phantom-crash; เมื่อ tsc/reviewer เขียวแต่หน้า 500 → force recompile (เพิ่ม/ลบไฟล์ หรือขอ user restart) ก่อนล่า code bug. (อัปเดต memory `project_dev_db_and_paces_pitfalls`)
6. **Controller-direct edit ระหว่าง fast visual iteration = ยอมรับได้ แต่ต้องปิดด้วย independent reviewer gate ก่อน commit** — เมื่อ Controller แก้เองเยอะ (เสีย developer→reviewer separation) ต้อง dispatch `safepay-reviewer` รอบสุดท้ายก่อน commit เสมอ (รอบนี้ทำ — จับ stale comment/dead field ได้).

---

## Action items
1. [done] commit polish (`300e6c0`) + Base: line
2. [done] promote conventions #1-6 → `agent-team-workflow.md` addendum + memory update
3. [ ] **QA-debt:** seed avatar (`/images/avatars/btpremium-logo.png`) + product images (picsum) เป็น **dev DB seed เท่านั้น** — ยังไม่มี real upload flow; ถ้า prod ต้องมี product image upload (Phase 2)
4. [ ] **deferred:** end-of-phase QA เต็ม (cross-subdomain) ยังไม่ได้รัน (chrome-devtools MCP หลุด) — รันเมื่อ MCP พร้อม
5. [ ] รูป `public/images/avatars/btpremium-logo.png` เป็น test asset (untracked) — ตัดสินใจตอน prod ว่าเก็บหรือลบ
