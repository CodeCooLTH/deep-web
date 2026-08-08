# Retro — feature 00038 ตอบกลับคอมเมนต์ (Comment Auto-Reply & Private Reply) (2026-08-08)

**Commits:** `9129f224..ef4a78c2` (ฟีเจอร์หลัก, 10 tasks) + `2ed8ed5f` (ถอด GET config ไม่มีใครเรียก) — บน `feature/service-system`
**เอกสาร:** `docs/20 - Features/00038 - Comment Auto-Reply/` (7/7 ครบตาม template)
**เทส:** 53 เทสเขียว (`comment-unanswered-count`, `comment-reply-status`, `comment-private-reply.service`, `comment-auto-reply.service`, `comment-auto-reply-orchestration`) · `tsc` exit 0
**Workflow:** SDD ledger เต็ม 10 task + reviewer ทุก task (ไม่ตัด reviewer ของ task ไหนเลยหลังกลับคำที่ Task 5)

---

## 1. Problems — 5 บั๊กระดับ Critical ที่ reviewer จับได้ก่อนขึ้น prod

ทั้ง 5 ตัวผ่าน `tsc` เขียว, เทสของ task ตัวเองเขียวหมด, และ grep gate ทุกตัวผ่าน — ไม่มีชั้นอัตโนมัติไหนจับได้ มีแต่ reviewer ที่อ่านโค้ดจริงเทียบกับ BRD/schema

### C1 — ด่านกันซ้ำต้นฟังก์ชันใช้คนละคีย์กับตอนเขียน log (Task 3)

`sendPrivateReplyToCommentById` เช็ค `ALREADY_SENT` ด้วย `commentId` เสมอ (ไม่ว่า `trigger` จะเป็น
`AUTO`/`MANUAL`) แต่ `upsertReplyLog()` เขียนคีย์ตาม `trigger` จริง — `AUTO` ใช้
`(shopChannelId, postId, fromExternalId)`, `MANUAL` ใช้ `(commentId)` — สองคีย์นี้คนละ partial
unique index (Task 2 ออกแบบให้แยกกันโดยตั้งใจ) คนเดิมคอมเมนต์ใบที่สองบนโพสต์เดิม **ลอดด่านต้น
ฟังก์ชันไปยิง Graph ซ้ำ** แล้ว `upsertReplyLog` เจอแถวของคอมเมนต์แรก เข้า branch `update()` โดย
payload ไม่มี `commentId` — แถวเก่ายังผูกกับคอมเมนต์แรก คอมเมนต์ที่สองไม่มีแถว log เป็นของตัวเองเลย
พังต่อเนื่องไปเรื่อย ๆ

Partial unique index ที่พิสูจน์แล้วว่าทำงานถูกที่ชั้น DB (Task 2 ทดสอบ 7 เคสใน transaction rollback)
**จับบั๊กนี้ไม่ได้เลย** เพราะโค้ดใช้ pattern find-then-update ไม่ใช่ insert ตรง ๆ — index ไม่เคยมีโอกาส
ทำงานที่จุดนี้

### C2 — ไม่มี error boundary หลัง Graph สำเร็จ (Task 3)

`prisma.$transaction(...)` ทั้งสอง path (success/failure-log) ไม่มี `try/catch` ล้อม — ถ้า
transaction ล้ม (P2002 ชนกัน, connection blip) หลังยิง Graph สำเร็จแล้ว **ข้อความไปถึงลูกค้าจริง
แต่ไม่มีแถว `CommentReplyLog` เขียนเป็น `SENT`** เรียกซ้ำครั้งถัดไปจะไม่เจอ `ALREADY_SENT` (เพราะไม่มี
บันทึกอะไรไว้) แล้วพยายามยิง Graph อีกครั้ง — สิทธิ์ once-per-comment ของ Meta ถูกใช้ไปแล้วถาวร ระบบ
ไม่รู้เลยว่าจริง ๆ ส่งไปแล้วตั้งแต่รอบแรก

### C3 — ไม่จับ P2002 + จองแถวหลังยิง Graph เสมอ (Task 3)

`upsertReplyLog()` เป็น find-then-branch (`findFirst` → `create`/`update`) ไม่ atomic ไม่มี
`try/catch` รอบ `create()` เพื่อจับ P2002 และการเขียนแถว "จอง" เกิด**หลัง**ยิง Graph เท่านั้น — สอง
คำขอที่มาพร้อมกัน (กดปุ่มซ้ำก่อน request แรกตอบ, หรือ webhook ส่งซ้ำ) ยิง Graph ได้ทั้งคู่เพราะยังไม่มี
อะไรถูกเขียนจนกว่าจะยิงเสร็จ

### C4 — การกันซ้ำสองชั้นฆ่ากันเอง (Task 4)

`processCommentAutoReply` (Task 4) จองแถว `CommentReplyLog(trigger='AUTO')` ก่อนเรียก
`sendPrivateReplyToCommentById` (Task 3) เสมอ — คีย์ที่จองคือคีย์เดียวกับที่ Task 3 ใช้
`dedupeWhere()` เช็ค `ALREADY_SENT` พอดี ผลคือ `sendPrivateReplyToCommentById` เจอแถวที่ตัวเองเพิ่ง
จองไปเมื่อครู่ (`trigger === 'AUTO'` → `ALREADY_SENT` ทันที ไม่สนสถานะ ตาม BR-CR-A6 ที่ Task 3
ออกแบบไว้เอง) → **private auto-reply ไม่มีวันยิง Graph สำเร็จเลยสักครั้ง** ไม่ว่าจะเปิดสวิตช์แบบไหน

เทส 38 ตัวของ orchestration เขียวหมดเพราะ mock `sendPrivateReplyToCommentById` ทั้งฟังก์ชัน — ไม่มี
เทสไหนให้ Task 3 กับ Task 4 ทำงานพร้อมกันจริงสักครั้ง

### C5 — `countUnansweredForShops` ขัด AC-CR-25 (Task 9)

Task 9 เติม `AND r."isAutoReply" = false` เข้า subquery `NOT EXISTS` ของ `countUnansweredForShops`
โดยเจตนาคือ "ให้บอทตอบแล้วยังนับต่อ" แต่ SQL เดิม (ก่อน Task 9) ตรงกับ AC-CR-25/FR-CR-13 อยู่แล้ว
("ไม่มีคำตอบของเพจเลย" = unanswered) — เงื่อนไขใหม่เปลี่ยนความหมายเป็น "ไม่มีคำตอบของ**คน**" ทำให้
โพสต์ที่บอทเคลียร์ครบทุกคอมเมนต์แล้ว (`postStatus === 'BOT_ANSWERED'`) **ค้างใน badge นับ unanswered
ตลอดกาล** ตัวเลขสองชุดบนจอเดียวกัน (badge กับชิป "บอทตอบแล้ว") ไม่มีวันตรงกัน ไม่เกี่ยวกับ
batch/pagination เลย — เป็นเรื่องนิยามผิดตั้งแต่ SQL

`countUnansweredForShops` ไม่มีไฟล์เทสมาก่อนเลย (แก้ไปพร้อมกับเพิ่มไฟล์เทสในรอบ fix)

---

## 2. Root causes

### RC1 (C1, C4) — 4 ใน 5 Critical มีต้นเหตุจากแผนที่ controller เขียนเอง ไม่ใช่จาก implementer

- C1: query ที่ต้นฟังก์ชันของ Task 3 (`findFirst({ where: { commentId, privateReplyStatus: 'SENT' } })`)
  ตรงกับ pseudo-code ใน brief ของ controller **คำต่อคำ** — implementer เขียน `upsertReplyLog()` ให้
  trigger-aware ถูกต้องแล้วในอีกจุดหนึ่งของไฟล์เดียวกัน แต่ brief ไม่ได้บอกให้ทำ gate ต้นฟังก์ชันให้
  สอดคล้องกัน
- C4: ลำดับ step ที่ brief กำหนด (จองแถวก่อนยิง) พา Task 4 ไปชนคีย์เดียวกับด่าน `ALREADY_SENT` ของ
  Task 3 โดยตรง — โค้ด "ตรงตาม brief เป๊ะ" ทุกจุด แต่ผลลัพธ์คือ feature หลักไม่ทำงานเลย
- implementer ทำตามแผนอย่างถูกต้องทุกครั้ง — คนที่จับได้คือ reviewer ที่เปิดโค้ดจริงเทียบกับ
  BRD/schema ไม่ใช่แค่เทียบกับ brief

**บทเรียน:** แผนที่ละเอียดมากไม่ได้แปลว่าแผนถูก มันแค่ทำให้ผิดได้เร็วขึ้น (implementer เดินตามทุก
ขั้นโดยไม่มีช่องให้สงสัย) — ความละเอียดของ brief ลดความเสี่ยงเรื่อง scope/interface ได้ดี แต่ไม่ได้
ลดความเสี่ยงเรื่อง correctness ของ logic ที่ brief เองออกแบบผิด

### RC2 (C4) — เทสที่ mock เพื่อนบ้านทิ้งทั้งตัวจะเขียวตลอด ไม่ว่าเพื่อนบ้านจะทำอะไร

Task 3 (private reply) กับ Task 4 (orchestration) ต่างฝ่ายต่างมีด่านกันซ้ำของตัวเอง แล้วไม่มีเทสไหน
ให้ทั้งคู่ทำงานพร้อมกันสักครั้ง — เทสของ Task 4 mock `sendPrivateReplyToCommentById` ทั้งฟังก์ชัน จึง
พิสูจน์ได้แค่ "ถูกเรียกด้วย argument ที่ถูกต้อง" ไม่ได้พิสูจน์ว่าเรียกแล้วสำเร็จจริงในสภาพที่มี state
ก่อนหน้าที่ orchestration เองเป็นคนสร้าง สองด่านที่ต่างคนต่างถูกต้องจึงฆ่ากันเองได้โดยไม่มีอะไรฟ้อง

### RC3 (C1) — "พิสูจน์ที่ชั้น DB แล้ว" ≠ "ชั้นแอปเรียกใช้มัน"

Task 2 พิสูจน์ partial unique index ทั้ง 2 ตัวด้วยเคสจริง 7 เคสในทรานแซกชัน rollback ว่าทำงานถูก
ต้องตามออกแบบ — แต่โค้ดของ Task 3 ใช้ find-then-update ที่ index ไม่เคยมีโอกาสทำงานเป็นตัวกันชนเลย
การพิสูจน์ที่ชั้นล่างสุดไม่ได้แปลว่าชั้นที่เรียกใช้มันจะเรียกถูกทาง

### RC4 (ทั่วไป) — `isUniqueConstraintError` เช็คด้วย string matching

ทั้งที่ error object ของ Prisma มี `.code = 'P2002'` ตรง ๆ อยู่แล้ว — ยืนยันด้วย probe กับฐานจริงว่า
ใช้ได้จริง (`isUniqueConstraintError()` จับ P2002 ได้ทั้ง 2 partial index) และตรง pattern เดิมของ
`auto-reply.service.ts` แต่เปราะกว่าที่ควร (message หลายบรรทัดเปลี่ยนได้ตาม Prisma version)

### RC5 (การทำงาน) — ตรวจสภาพเวิร์กทรีก่อนเริ่มคุ้มมาก

ก่อนเริ่ม Task 2 พบว่า branch ตามหลัง `origin/main` 37 คอมมิต และ 6 ใน 7 ไฟล์ที่จะแก้ถูกแก้ไปแล้วบน
main (feature 00037 ชนกันตรง ๆ) — ถ้าไม่ rebase ก่อนจะเขียนทับงานคนอื่น และ `countUnansweredForShops`
signature ก็เปลี่ยนไปแล้วจาก 00037 ด้วย นอกจากนี้พบว่า `npm test` ใช้ไม่ได้เพราะเวิร์กทรีไม่มี
`.env` (ต้องสลับไป `npx vitest run` ตรง ๆ)

### RC6 — การเบี่ยงจาก brief ที่ถูกต้อง 2 จุด

- Task 8: implementer เลือก Swal `text` แทน `html` เพื่อกันชื่อคนคอมเมนต์จาก Facebook
  (`comment.fromName`) ที่ไม่ได้ escape หลุดเข้า HTML — controller ไม่ได้สั่งไว้ในแผน แต่เป็นการ
  ตัดสินใจที่ถูกต้อง (reviewer ยืนยัน grep `Swal.fire` มีจุดเดียว ไม่มี `html:` แทรกค่าจาก Facebook
  เลยทั้งไฟล์)
- Task 10: implementer ไม่แก้ `PageAvatar` (`PageFilterDropdown.tsx`) ให้รองรับ `size='lg'` ตามที่
  UX spec สั่ง เพราะไฟล์นั้นอยู่นอก allow-list และมี implementer คู่ขนานทำงานในกลุ่มเมนู CHAT
  เดียวกันอยู่ — เลือกทำ `CardAvatar` local แทนเพื่อไม่เสี่ยงชนกับ agent อื่น ผลคือมี
  avatar+provider-overlay 2 ชุดในโค้ดเบสที่ทำสิ่งเดียวกันเกือบทุกกระเบียดนิ้ว (ดูหนี้ข้อ 2 ด้านล่าง)

---

## 3. Conventions to adopt

1. **แผนที่ Controller เขียนเองไม่ใช่ข้อยกเว้นจากการตรวจ — โดยเฉพาะ pseudo-code ที่ก็อปมาลงตรง ๆ**
   เมื่อ brief ให้ query/logic ที่ implementer ควร "เอาไปใช้เลย" ต้องเทียบกับทุกจุดในไฟล์เดียวกันที่
   ใช้คีย์เดียวกัน (เช่น cross-check ระหว่าง early-exit gate กับฟังก์ชันเขียนจริง) ไม่ใช่แค่เชื่อว่า
   brief คิดมาแล้ว
2. **ฟีเจอร์ที่มีด่านกันซ้ำมากกว่า 1 ชั้นจากคนละ task ต้องมีเทสอย่างน้อย 1 ตัวที่ไม่ mock เพื่อนบ้าน**
   แล้วยืนยันว่า side-effect (Graph call/DB write) เกิดขึ้นจริง — เทสที่ mock ทั้งฟังก์ชันพิสูจน์ได้แค่
   "เรียกด้วย argument ถูก" ไม่ใช่ "เรียกแล้วสำเร็จ"
3. **partial unique index ที่พิสูจน์ที่ชั้น DB แล้ว ต้องตรวจต่อว่าโค้ดที่เรียกใช้เป็น insert-that-can-
   -conflict จริงหรือ find-then-update** — find-then-update ทำให้ index ไม่มีโอกาสทำงานเป็นตัวกันชน
4. **`error.code === 'P2002'` เช็คตรง ไม่ใช่ string matching บน message** เมื่อต้อง detect unique
   constraint violation จาก Prisma
5. **ก่อนเริ่ม task แรกของ branch ที่ค้างนาน ให้เช็ค `git log HEAD..origin/main --name-only` ก่อน
   เสมอ** — ไฟล์ที่จะแก้อาจถูกแก้ไปแล้วบน main (มีอยู่ใน CLAUDE.md memory แล้วแต่ยืนยันซ้ำว่าคุ้ม)

---

## 4. What went right

1. **reviewer จับ Critical ทั้ง 5 ตัวก่อนขึ้น prod** — ไม่มีตัวไหนหลุดไปถึง user แม้ผ่าน tsc/เทส/grep
   ของ implementer เองหมดแล้ว โดยเฉพาะ C1 ที่ reviewer เปิด migration ของ Task 2 มาเทียบกับ query ของ
   Task 3 เอง (ไม่ใช่แค่รัน `git diff` อ่านผ่าน ๆ)
2. **Controller กลับคำเรื่องตัด reviewer ของ Task 5** — เกณฑ์ที่ถูกคือ blast radius (webhook route
   รับข้อความของทุกร้านทั้งระบบ) ไม่ใช่ขนาด diff — ทำให้ทุก task ผ่าน gate เดียวกันไม่มีข้อยกเว้น
3. **Task 4 fix พิสูจน์ว่าเทสใหม่จับบั๊กได้จริง** ด้วยการถอด `reservedLogId` ออกชั่วคราวแล้วดูว่าแดง
   (graphSend 0 ครั้ง) ก่อนใส่กลับ — ไม่ใช่แค่เขียนเทสแล้วเชื่อว่าเขียว
4. **Task 2 พิสูจน์พฤติกรรมกันซ้ำ 7 เคสในทรานแซกชัน rollback บนฐานจริง** ก่อนให้ Task 3/4 เริ่มเขียน
   โค้ดพึ่งพา — ฐานกลับเป็น 0 ทุกตารางหลัง rollback ไม่มีข้อมูลค้าง
5. **rebase ก่อนเริ่มจับความชนกับ 00037 ได้ตั้งแต่ต้น** ไม่ปล่อยให้ลาม
6. **Controller ตัดสินใจไม่ re-review เต็มรอบตอนแก้ Task 9 (Fix round 1)** — ย้อน 1 บรรทัดสู่สภาพเดิม
   ยืนยันด้วย grep ได้ทันที ไม่ใช่การข้ามขั้นโดยลืม แต่เป็นการตัดสินใจที่ถูกสัดส่วนกับความเสี่ยง
   (user แจ้งว่าใช้เวลานานเกินไป)

---

## 5. Action items / หนี้ที่ค้าง

1. ~~ถอด `GET /api/shops/comment-reply/config` ที่ไม่มีใครเรียก~~ **เสร็จ** `2ed8ed5f`
2. **ค้าง — `CardAvatar` ซ้ำกับ `PageAvatar`** (`CommentReplyClient.tsx:115-136` vs
   `PageFilterDropdown.tsx:48-75`) — ควรขยาย `PageAvatar` ด้วย `size='lg'` แล้วให้
   `CommentReplyClient.tsx` import แทน ลดเหลือ 1 แหล่งความจริง (ไม่รีบ ไม่ block)
3. **ค้าง — `countUnansweredForShops` เป็น batch scope (≤25 โพสต์) vs badge เป็น global scope** —
   trade-off สถาปัตยกรรมที่มีคอมเมนต์ยอมรับไว้ตั้งแต่ 2026-08-04 ไม่ใช่ Critical แต่ตัวเลข 2 ชุดบน
   จอเดียวกันยังไม่ตรงกันในเคส pagination
4. **ค้าง — impeccable critique/clarify** ยังไม่รันสำหรับหน้า `settings/comment-reply` และ UI ปุ่ม
   "ทักแชท"/แท็บกรอง 4 ตัว
5. **ค้าง — browser QA เต็มรูป** (`TestCase.md`) — ยังไม่มีใครกดจริงบน prod/dev
6. **minor (deferred, ให้ triage รอบถัดไป):**
   - `isUniqueConstraintError` ควรเช็ค `.code === 'P2002'` ตรง แทน string matching บน message
   - `docs/SRS.md` (ตำแหน่งเดิมก่อนแก้รอบนี้) เคยอ้าง "ดู TD-004" สำหรับเรื่องซ่อน `accessTokenEnc`
     แต่ TD-004 คือ partial unique index — dangling reference ที่ควรชี้ TD ที่ถูก
   - เส้นทาง `resolveChannelToken` ล้มเหลว `errorMessage` ถูกทับจาก `CHANNEL_TOKEN_UNAVAILABLE` เป็น
     `CHANNEL_INACTIVE` (เสียรายละเอียดตอนสืบ ไม่กระทบ state ที่ผู้ใช้เห็น)
   - webhook `verb=edited` ไม่คืน `null` จึง trigger `processCommentAutoReply` ซ้ำทุกครั้งที่คอมเมนต์
     ถูกแก้ — ปลอดภัยเพราะด่าน `ALREADY_HANDLED` กัน แค่เสีย DB round-trip
   - `logs/route.ts:113` `postMessage` คืนข้อความเต็ม ไม่ตัดสั้นตามตัวอย่างใน API.md (payload ใหญ่กว่า
     spec ไม่กระทบ security)
