# Retro — Seller Command Center v10 redesign build (2026-06-21)

Phase ID: `seller-command-center-v10` · branch `feat/seller-command-center-v10` · 14 commits (T1–T10 + docs) · Gate 2 = **CONDITIONAL SIGNED-OFF**

---

## Problems + Root cause

### P1 — `Base:` ชี้ไฟล์ `src/` แทน `theme/` (OrderStatusBand)
- evidence: `OrderStatusBand.tsx:4` docblock `Base: src/.../OrderStatusRow.tsx` → reviewer Batch A FAIL G1
- root cause: developer copy โครงจาก in-project component (OrderStatusRow) ที่ตัวมันเองก็ไม่มี `Base:` ชี้ theme → เลย cite in-project. **Hard Rule 3 ต้องชี้ `theme/...` เสมอ** แม้ adapt มาจากไฟล์ในโปรเจกต์ (in-project = "adapt ref" cite เพิ่มได้ แต่ Base หลัก = theme)
- fix: เปลี่ยนเป็น `theme/.../StatisticCard.tsx` + cite OrderStatusRow เป็น adapt ref

### P2 — arbitrary inline style ไม่มี comment HR7 (CompactHero star/เติมเงิน)
- evidence: `CompactHero.tsx` `style={{color:'#ffd24d'}}` (star) + `style={{fontSize:11.5,padding}}` (ปุ่มเติมเงิน) ไม่มี comment → reviewer FAIL G5/G8
- root cause: developer มอง SVG/ring เป็น arbitrary ที่ต้อง comment แต่ลืมว่า **inline style บน JSX element ปกติก็คือ arbitrary** (HR7 ครอบทุก non-token value ไม่ใช่แค่ Tailwind `[...]`)
- fix: star → comment HR7 (gold ไม่มี token); ปุ่มเติมเงิน → เปลี่ยน inline เป็น Tailwind token (`text-xs` + `btn-sm` padding) เลี่ยง arbitrary

### P3 — `Intl.DateTimeFormat` grep gate เป็น literal (จับแม้ใน calc + comment)
- evidence: `NotificationFeed.tsx:68` ใช้ Intl เพื่อ "หา Bangkok midnight" (calc ไม่ใช่ display) → reviewer FAIL G7; แก้แล้ว comment ยังมีคำว่า `Intl.DateTimeFormat` → gate ยัง !=0
- root cause: date-format.md grep gate เป็น **string match** ไม่สนใจ context (calc/comment). lib `format-date.ts` (excluded) handle TZ ไทยให้แล้ว
- fix: ใช้ `formatDate(d)` ("2569-06-07" Bangkok) เทียบวันแทน Intl + reword comment เลี่ยง literal

### P4 — chip active style ไม่สอดคล้องข้ามหน้า + spec-text คลาด mockup
- evidence: T9 ใช้ `bg-primary/15 text-primary` (ตาม baseline S-10 text) แต่ T10 + mockup `.chip.on` = solid `bg-primary text-white`
- root cause: baseline S-10 text เขียน `bg-primary/15` แต่ **mockup (visual SoT) = solid** → spec-text drift จาก mockup
- fix: align ทั้ง 2 หน้า → solid ตาม mockup; log Change Log

### P5 — scope CR-1: chip "สินค้าหมด" ไม่มี data
- evidence: `ProductRow` ไม่มี `stockQty` → developer ตัด chip เอง (reviewer flag unilateral scope reduction)
- root cause: baseline S-11 ระบุ 4 chips โดยไม่ verify data model (ProductRow มีแค่ `isActive`); สินค้า SERVICE/DIGITAL ไม่มีสต็อก
- fix: Controller decision (B) อนุมัติตัด → 3 chips + Change Log CR-1 (เลี่ยง scope creep เพิ่ม field/migration ขัด OOS-9)

### P6 — visual QA deferred ทั้ง phase (dev server ปิด)
- evidence: `curl seller.deepth.local:4000` = fail ตลอด phase → Chrome DevTools MCP QA รันไม่ได้
- root cause: ไม่ได้ยืนยัน dev server ขึ้นก่อนเริ่ม phase UI; กฎโปรเจกต์ห้าม Controller start server เอง
- fix (action): confirm server ก่อนเริ่ม UI phase; รอบนี้ใช้ code+tsc+reviewer+grep แทน, visual QA = documented carry

---

## What went right (anchor — ทำซ้ำ)
1. **Design locked ก่อน build** — iterate mockup v9→v10 หลายรอบกับ user จน sign-off + เก็บ spec/mockup เป็น reference ถาวรใน specs folder ก่อนแตะโค้ด (Documentation-First spirit) → build ไม่มี rework จาก design churn
2. **Contract freeze (T1) ก่อน parallel** — ขยาย type optional → Batch A/B 3-concurrent ไม่ชน, tsc 0 ตลอด
3. **Frozen contract ใน developer prompt** — solar icon pattern + CommandCenterData shape ฝังทุก prompt → 6 component สร้างขนานเข้ากันได้เลย
4. **Controller grep gate ก่อน reviewer** — จับ false-positive (comment-only #7367F0/component={Link}) เร็ว, reviewer โฟกัสของจริง
5. **reviewer จับของจริง 100%** — Base:src, arbitrary-no-comment, Intl-gate, chip-inconsistency, scope-CR ล้วน valid (ไม่มี noise)

---

## Conventions / learnings
- **HR7 ครอบ inline style บน JSX ปกติด้วย** (ไม่ใช่แค่ Tailwind `[...]`) — `style={{...}}` ที่ไม่ใช่ token ต้องมี comment หรือเปลี่ยนเป็น token (P2)
- **Base: = `theme/...` เสมอ** แม้ copy โครงจาก in-project component (cite in-project เป็น adapt ref เพิ่มได้) (P1)
- **date ใน component: ใช้ `formatDate`/`formatDateTime` เทียบ/แสดง — ห้ามแตะ Intl เลย แม้ calc/comment** (grep gate เป็น literal string) (P3)
- **mockup = visual SoT เหนือ spec-text** เมื่อขัดกัน (P4) — planner/baseline ควร cite mockup value ตรง ๆ
- **baseline ควร verify data model ก่อนเขียน acceptance** (เช่น chips ที่ต้องมี field รองรับ) (P5)
- **Solar Duotone = icon set ของ seller mobile CC v10** ผ่าน `@iconify/react` `solar:*-bold-duotone` (ไม่ใช่ Tabler wrapper) — ดู [[project_seller_mobile_command_center]]

## Action items
1. **เปิด dev server (`npm run dev -- -p 4000`) แล้วเก็บ visual QA mobile 360/390** 4 หน้า (/dashboard, /notifications, /orders, /products) — Gate 2 condition ที่ค้าง
2. **push branch `feat/seller-command-center-v10`** + ตัดสิน merge→main (auto-deploy prod — ต้อง user ยืนยัน)
3. **Phase 2:** dead-code cleanup 6 ไฟล์ deprecated (SellerHeader/WalletCard/ShortcutGrid/OrderStatusRow/RecentActivityFeed/NotificationTimeline + notification-data.ts) หลัง grep ยืนยันไม่มี import
4. **debt แยก:** `settings/ConnectedAccountsClient.tsx` มี react-toastify (HR9 violation pre-existing นอก phase) — เปลี่ยนเป็น pacesToast
5. **Phase 2:** real Notification model (unread persist + bell count + mark-as-read API), desktop `lg:` variant v10
