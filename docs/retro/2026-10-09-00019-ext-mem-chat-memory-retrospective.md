# Retro — 00019-ext-mem ความจำของแชท + สินค้าที่สนใจ (2026-10-09)

branch `feat/00019-chat-memory` · baseline `docs/scope/2026-10-09-00019-ext-mem-scope-baseline.md` · Gate 1 PASS · Gate 2 SIGNED-OFF-WITH-CARRY

## Problems
1. **ถาดสินค้าค้าง preselect** — แตะแถวสินค้าที่สนใจแล้วปิดถาด/เปลี่ยนห้อง ค่าที่ติ๊กไว้ติดไปห้องถัดไป (ส่งการ์ดผิดห้องได้) · reviewer = REWORK, security = Medium เดียวของรอบ · แก้ใน S-14 (`ChatThread.tsx` ล้างเมื่อ `activePanel` ไม่ใช่ product และเมื่อ `conversationId` เปลี่ยน)
2. **ตัวปิดบัง PII พลาดรูปแบบที่ลูกค้าพิมพ์จริง** — `081 - 234 - 5678`, ig/tiktok/fb handle, "ไลน์ id:" ผ่านไป Typhoon ได้ · แก้แล้ว cherry-pick ขึ้น prod ก่อนเป็น PR #130
3. **sanitize ทิ้งความจำเดิมแบบเงียบ** — scrub พัง → `payload.memory = null` → ผู้เขียนความจำเห็นเป็น "ยังไม่มีความจำ" แล้วเขียนใหม่จากศูนย์ทับของแอดมิน · พบโดย security review (Info #3) · แก้ใน commit fix ท้าย phase พร้อมเทสที่แดงเมื่อถอด guard
4. **S-17 browser E2E ไม่ได้รัน** — ทั้งฟีเจอร์ยังไม่มีหลักฐานหน้าจอจริงเลย (เหมือน 00019-ext Typhoon ที่ user ยังไม่เห็นแผงคำแนะนำบน prod)

## Root causes
1. state ของ UI ที่ "ส่งต่อให้ component อื่น" (preselect) ไม่มีเจ้าของวงจรชีวิต — ตั้งค่าแล้วไม่มีใครล้าง เพราะผู้ตั้ง (InterestedProductsSection) กับผู้ใช้ (ProductPickerPanel) อยู่คนละที่ และไม่มีเทสที่เปลี่ยนห้องระหว่างถาดเปิด
2. corpus เทสของ PII สร้างจากรูปแบบที่นักพัฒนานึกออก ไม่ใช่จากข้อความลูกค้าจริงบน prod
3. ฟังก์ชัน fail-closed ที่ "ทิ้งฟิลด์" แทนที่จะ throw — caller ตีความ null ว่า "ไม่มีข้อมูล" ไม่ใช่ "ข้อมูลถูกทิ้ง" · สองความหมายใช้ค่าเดียวกัน
4. มติ user ตรวจด้วยตาเอง + ฟีเจอร์ถูก gate ด้วย allow-list ร้านเดียว ⇒ ไม่มีใครเห็นจนกว่าจะไปเปิดในร้านนั้น

## Conventions to adopt
- **ค่าที่ถูกทิ้งเพราะความปลอดภัย ต้องแยกจาก "ไม่มีค่า" ที่ caller** — ถ้า sanitize/redact คืน null ทั้งที่ input มีค่า caller ที่จะ *เขียนทับ* ต้องหยุด (ERROR) ไม่ใช่ทำต่อแบบไม่มีข้อมูล · มีเทส mutation ยืนยัน
- **state ที่ส่งข้าม component (preselect/draft/selection) ต้องผูกกับ conversationId + การปิด panel** — ล้างใน effect ที่ฟังทั้งสองค่า
- **PII corpus เติมจากข้อความจริง** — ทุกครั้งที่เจอรูปแบบหลุดบน prod ให้เพิ่มเป็นเทสใน `pii-redact-reversible.test.ts` ก่อนแก้ regex

## What went right
- ล็อก contract (44e0ca53) ก่อนปล่อย developer ขนาน — ไม่มีชน type ระหว่าง service/API/UI
- แยก hotfix PII ขึ้น prod ก่อน (#130) แล้ว rebase ข้าม cherry-pick ได้สะอาด (tree เท่ากันทุกไบต์ ยืนยันด้วย `git diff`)
- CAS ด้วย version กันแอดมินกับ AI เขียนทับกัน (SUPERSEDED) แทนการล็อก
- งานความจำไม่แย่งคิวคำแนะนำหลัก (lowPriority + deadline สั้น)

## Action items
1. user ตรวจบน prod ร้านนำร่องตาม checklist (ด้านล่าง) — ข้อ 6/7 ไม่ผ่าน = regression ไม่ใช่ polish
2. ถ้า A-M2 ไม่ผ่าน (ความจำไม่เคยอัปเดตเอง) → ย้ายงานความจำออกจาก `after()` ไปเป็นงานแยก
3. `/impeccable critique` + `clarify` ของบล็อกความจำ/สินค้าที่สนใจ — ยังค้าง (HR8)
4. ProductPickerPanel: intersect `initialSelectedIds` กับรายการที่โหลดได้ (security Low, optional)
5. ก่อนเปิดทุกร้าน: ประกาศเก็บข้อมูลถาวร (R-M2) + user อนุมัติแยก (OOS-15)

## Checklist ตรวจบน prod (ร้านใน TYPHOON_SUGGEST_SHOP_IDS)
1. เปิดห้องแชท → แผงขวามีบล็อก "ความจำของแชทนี้" ไม่มีแท็บที่ 6
2. พิมพ์ "ใส่ไซส์ L ชอบสีครีม" บันทึก → รีเฟรชแล้วยังอยู่
3. พิมพ์เกิน 800 ตัว → ถูกปฏิเสธ
4. กด + "สินค้าที่สนใจ" เลือกสินค้า+ตัวเลือก → กด ✕ แถวหาย
5. แปะสินค้า → แตะแถว → ถาดสินค้าเปิดพร้อมติ๊ก ไม่ส่งเอง
6. ลูกค้าทดสอบถาม "ไซส์อะไรดี" 5 ครั้ง → คำแนะนำอ้าง L/ครีม ≥ 4 ครั้ง
7. ส่งข้อความต่อกัน ≥ 3 ข้อความโดยเปิดห้องไว้ รอ 1-2 นาที → ความจำอัปเดตเอง (A-M2)
8. มือถือ 390px กดง่าย ไม่ล้น · คำแนะนำไม่ช้าผิดปกติ
