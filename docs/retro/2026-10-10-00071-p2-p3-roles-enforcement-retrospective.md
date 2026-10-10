# Retro — 00071 P2 (โมเดลบทบาท) + P3 (บังคับรายบทบาท) · 2026-10-10

branch `feat/00071-p2-roles` · P2 SIGNED-OFF + P3 SIGNED-OFF (มีเงื่อนไขก่อน push) · P1 = PR #148 ยังไม่ merge
ขอบเขต: 5 บทบาท (เจ้าของ/ผู้ดูแล/ตอบแชท/เปิดบิล/ฝ่ายช่าง) ถือหลายบทบาทได้ · ทะเบียน capability ทุก route + inventory scanner default-deny · ระดับเงิน FULL/PER_ORDER/NONE ตัดที่ข้อมูล · Prisma global omit ต้นทุน · เมนูเดสก์ท็อป/มือถือจากกฎเดียว

## Problems
1. **ด่านพารามิเตอร์สิทธิ์ default เปิด** — helper หลายตัวรับ `canSeeX = true` เป็นค่าตั้งต้น caller ที่ลืมส่ง = รั่ว (เจอใน review T7/T9: POST/PATCH/list คืน `items.cost`) → แก้เป็น default ปิด + `stripOrderItemCost` · บันทึกเป็น convention `permission-gate-follows-the-row.md`
2. **T9 ย้าย `resolveExpenseAccess` ขึ้นก่อน early-return ของช่าง** → เทส technician-no-money แดง (faf99778 แก้ด้วย `isNoMoney`) — ลำดับ guard ในหน้าเดียวกันเปลี่ยนแล้วผลเปลี่ยน
3. **reviewer จับเทสที่ถูกทำให้อ่อนลง 2 ครั้ง** (regex ai-suggest ใน wallet-owner-gate · `toMatchObject` ของ route.cost) — developer "แก้เทสให้เขียว" แทนแก้โค้ด
4. **หน้า admin 9 หน้าพึ่ง layout `isAdmin` อย่างเดียว** (ช่องเดิมก่อน 00071) — scanner ของเราเองเขียนให้ "layout ancestor = ผ่าน" จึงรับรองช่องนี้แทนที่จะจับ (แก้ c8fb3102)
5. **KPI "ผู้ดูแลเดิมเสียสิทธิ์งาน = 0" ไม่มีใครวัดจนถึง Gate 1** — audit เทียบ base พบ 4 แถว ⚠ (ดูแผนตรวจสอบ · แนบเอกสารตรวจ · ตารางสมาชิกหน้าคำเชิญ · แพ็กเกจธุรกิจผูกร้าน active) → มติ C-13..C-15 (6f530ebe)
6. **มติ C-4 เขียนขัดกับมติ user C-2** (/settings = T3 vs iShip = S2) โค้ดตามมติ user แต่ BRD ตามตัวอักษร C-4 — เจอตอน docs sync
7. **ขั้นตอน:** `git add -A src` ระหว่าง agent ยังรัน (เกือบพางานครึ่งทางเข้า commit) · zsh ไม่ word-split ตัวแปร path · macOS `sed -i -E` ทิ้งไฟล์ `-E` · mutation ครั้งหนึ่งเขียวเพราะ string ไม่ match (python assert จับได้)
8. **เทสแดงที่ไม่เกี่ยว:** `tests/integration/signup-achievement.test.ts` แดงบน base เช่นกัน (media-asset-dedup ×6 ที่เคยแดงรอบ P1 ผ่านแล้วรอบนี้)

## Root causes
1. ค่าตั้งต้นถูกเลือกเพื่อ "ไม่ทำของเดิมพัง" แทน "ไม่รั่ว" — ทำไม: refactor ทีละ caller ไม่อยากแตะทุกจุดพร้อมกัน → ราคาคือทุก caller ที่ลืม
2. guard ในหน้าเรียงตามลำดับเวลาที่เพิ่ม ไม่ใช่ตามลำดับความเสี่ยง — ไม่มีเทสที่ตรึงลำดับ
3. developer เห็นเทสแดงเป็น "สิ่งกีดขวาง" — prompt ไม่ได้ห้ามแก้ assertion ชัดพอ
4. scanner ถูกออกแบบให้ "ผ่านของเดิมทั้งหมด" ในรอบแรก → กฎยกเว้นกลายเป็นการรับรองช่องโหว่ · Next App Router partial rendering ทำให้ layout ไม่ใช่ด่าน
5. KPI อยู่ใน PRD แต่ไม่ได้ map เป็น task/เทสใด — "เขียนไว้" ≠ "บังคับ"
6. มติ Controller เขียนจากตารางโดยไม่เปิดหน้าจริงว่ามีอะไร (หน้า /settings = iShip ล้วน)

## Conventions to adopt
- **ด่าน admin/สิทธิ์ต้องอยู่ในไฟล์ page/route เอง** — layout ไม่นับเป็นด่าน (scanner บังคับแล้ว: `requireAdmin(` ก่อน `prisma.`/`await` แรก)
- **KPI ที่เป็นตัวเลข "= 0" ต้องมี audit/เทสเป็น task ตั้งแต่แผน** ไม่ใช่รอ Gate 2 — ฟีเจอร์ที่ "ลดสิทธิ์" ต้องทำ entitlement diff เทียบ base ก่อนปิด batch แรก
- **prompt developer ต้องมีบรรทัด "ห้ามแก้ assertion ให้อ่อนลง — เทสแดง = รายงาน"** เมื่อแก้โค้ดที่มีเทสเดิมคุม
- **มติ Controller ที่อ้างหน้า/route ต้องเปิดไฟล์นั้นก่อนเขียน** (ต่อจาก `feedback_docs_claimed_constraint_verify_in_code`)
- stage ไฟล์ด้วยรายการ path ชัด (array ใน zsh) เท่านั้น ขณะมี agent รันอยู่

## What went right
- ทะเบียน `route-capabilities.ts` + inventory default-deny: route ใหม่ที่ไม่ประกาศ = เทสแดง · PENDING = 0 ก่อนปิด
- Prisma global omit ต้นทุน + contract test 35 route × 5 บทบาท ระดับฟิลด์ — จับรั่วที่ source-scan มองไม่เห็น
- spike Prisma omit บนฐาน localhost ก่อนตัดสิน (include/$transaction สืบทอด omit จริง)
- mutation ทุกจุดด้วย python + `git diff --stat` พิสูจน์ไฟล์เปลี่ยน — จับ mutation เขียวหลอก 1 ครั้งได้ทันที
- security review ปลาย phase ครอบ "ช่องเดิม" ด้วย ไม่ใช่แค่ diff ของเรา → เจอหน้า admin

## Action items
1. ก่อน push: full test localhost บน HEAD · HR15 + R-3 แจ้ง user · ตรวจ `STORAGE_DRIVER=s3` บน prod · push P2+P3 พร้อมกัน (P1 PR #148 ต้องไปก่อนหรือพร้อมกัน)
2. browser QA (user): หน้าไม่มีสิทธิ์ + ปุ่มกลับ 8 หน้า · ป้ายบทบาทในตัวสลับร้าน · ฝ่ายช่างเห็นข้อความขอเลื่อนนัด · /inspection ผู้ดูแลปุ่มปิด · เมนูมือถือแต่ละบทบาท
3. ตัดสินหนี้ (a) soldCount PER_ORDER · (c) หน้าร้านร่างเห็นทุกสมาชิก · (g) Valibot `PATCH /api/shops/[id]` · (j) สลิปเติมเงินผู้ดูแลเปิดไม่ได้
4. ขออนุมัติลบ: คีย์ `accountSwitcher.roleAdmin` · shim `ChatNoPermission.tsx` · (Phase 2) คอลัมน์ `staffCanViewFinance`
5. i18n ข้อความใหม่ (no-permission-copy / billing / ชื่อบทบาท) → รอบ 00047
6. เพิ่มเทส route ระดับผู้ถือ `[CHAT, TECHNICIAN]` (TC-017 gap)
