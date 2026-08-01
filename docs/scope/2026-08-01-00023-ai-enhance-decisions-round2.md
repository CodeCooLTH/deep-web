# AI Enhance — คำตอบรอบ 2 (ต่อจาก decisions.md เดิม) — 2026-08-01

> คุยกับ safepay-ux ต่อจาก `docs/scope/2026-07-31-00023-ai-enhance-decisions.md`
> session เดิมถูกปิดโดยไม่มี Write access — บันทึกด้วยมือเพื่อ resume
> ห้ามตีความใหม่ — เป็นคำตอบที่ user ตัดสินใจแล้วจริง

## คำตอบ 10 ข้อ (Q&A กับ safepay-ux, 2026-08-01)

**1. ปุ่ม "ข้าม" ในคิวคำถามที่ตอบไม่ได้ (หน้า `/settings/auto-reply/unanswered`)**
เก็บสถานะถาวร (ไม่ใช่ทางเดียว) + เพิ่มตัวกรอง/แท็บ "ข้ามแล้ว" แยกจาก "รอกรอก"
แถวที่ข้ามแล้วมีปุ่ม "ย้อนกลับมารอกรอก" (undo) แทนปุ่ม ข้าม/กรอกคำตอบ

**2. เวลา "ล่าสุด"/"ข้ามเมื่อ" ในหน้าเดียวกัน**
ใช้ `formatRelativeDayTime()` ที่มีอยู่แล้วในโค้ด (`src/lib/format-date.ts:252`,
proven ใช้จริงใน `OrderCard.tsx`) — ให้ผล "วันนี้ 16:41"/"เมื่อวาน 16:41"/"3 ก.ค. 16:41"
**ไม่ต้องสร้าง util ใหม่ ไม่มี S-id เพิ่ม**

**3. Icon "ย้ายไปกลุ่มอื่น" (`arrow-right`) และ modal เพิ่ม/แก้ไขคำถามที่ safepay-ux
เสนอเอง (ไม่มีใน mockup)**
อนุมัติตามที่ออกแบบไว้ ไม่มีการแก้ไข

**4. ป้าย DeepBot ในรายการแชท (`InboxList.tsx`)**
เลือก **inline prefix** — แทนที่ "คุณ: " เดิมด้วย icon robot + "DeepBot: "/"DeepAI: "
สีน้ำเงิน (`text-primary`) บนบรรทัด preview เดิม **ไม่ใช่ pill/badge แยก**
เหตุผล: ไม่เพิ่มพื้นที่บนจอ 360px, ไม่ชนสีเขียวกับ badge "สำเร็จ" (order stage)
ที่มีอยู่แล้วในแถวเดียวกัน, สอดคล้องสีกับ `AutoReplyTag.tsx` ที่ prod ใช้อยู่แล้ว

**5. ชื่อบอท 2 ระดับ + ตัดคำ "ทดสอบ"**
- **DeepBot** = กลุ่มที่ไม่เปิด AI Enhance (ทุกกลุ่มตอนนี้ — flag ยังไม่มีจริง)
- **DeepAI** = กลุ่มที่เปิด AI Enhance (รอ flag `aiEnhanceEnabled` ในอนาคต)
- ตัดคำ "ทดสอบ" ออกจากป้ายทั้งหมด **รวมถึง `AutoReplyTag.tsx` ที่ deploy อยู่ prod แล้ว**
  (เดิม label = `isTest ? 'DeepBot · ทดสอบ' : 'DeepBot'` → ใหม่ = `isAiEnhanced ? 'DeepAI' : 'DeepBot'`)
- ✅ **ยืนยันแล้ว 2026-08-01 (รอบถัดมา):** ย้ายข้อมูล "โหมดทดสอบ" ไปไว้ในกล่อง
  รายละเอียดที่กดดูแทน (ไม่หายไปเลย แค่ไม่โผล่บนป้ายหลัก) — แถวในกล่องรายละเอียด
  มีอยู่แล้วในโค้ด (`AutoReplyTag.tsx` ~บรรทัด 90) จึงเหลือแค่ตัดออกจาก label หลัก
- ⚠️ ผลกระทบ: แก้ไฟล์ prod จริง → ต้องมี S-id แยก (`S-20a`) รัน regression smoke ก่อน merge

**6. Backend field สำหรับป้าย DeepBot**
รวมเป็นงานเดียวกับ S-20 — เพิ่ม `lastMessageAutoReplyKind` + `lastMessageIsAiEnhanced`
(default false) เข้า `ConversationListItem`, enrich คู่กับ query ที่มีอยู่แล้ว
ของ `lastMessagePreview`/`lastSenderRole` (join ข้อความล่าสุดเดียวกัน ไม่เพิ่ม query รอบ)

> 🛑 **แก้ข้อเท็จจริง 2026-08-01 (safepay-planner ตรวจโค้ดจริง — user ยืนยันให้ทำตามแผน):**
> ข้อความข้างบนสมมติผิดว่า `lastMessagePreview`/`lastSenderRole` มาจากการ join
> ของจริงคือ **คอลัมน์ denormalize บน `Conversation` ที่เขียนตอน insert ข้อความ**
> จึง **ต้องมี migration เพิ่ม 2 คอลัมน์จริง** (`lastMessageAutoReplyKind String?`,
> `lastMessageIsAiEnhanced Boolean @default(false)`) ไม่ใช่แค่เติม field ใน type
> และต้องเขียนค่าทั้งสอง **explicit ทุกจุดที่เขียน `lastMessagePreview`** เพราะ
> Prisma `update` ไม่แตะ field ที่ไม่ระบุ — ลืมจุดใดจุดหนึ่ง = ค่าเดิมค้าง
> ป้าย DeepBot จะติดผิดข้อความ (ไม่ใช่แค่ไม่ขึ้น)
> known-gap ที่ยอมรับแล้ว: เส้นทาง race ของ echo Messenger ใน `channel-chat.service.ts`
> ที่แปะ `autoReplyKind` ย้อนหลังไม่อัปเดต snapshot ซ้ำ → ป้ายจะไม่ขึ้นในเคสนั้น
> (false negative ไม่ใช่ false positive) — ตัดสินใจไม่แก้ในรอบนี้

**7. งบเวลาที่ยอมให้ AI ใช้ก่อนถอยไปตอบคำตอบดิบ**
**8 วินาที** (อ้างอิง `gemini-2.5-flash-lite`)

**8. กฎห้ามตอบตรวจด้วยอะไร**
เรียกฟีเจอร์ว่า **"Guardrails"** — AI ตัดสิน (prompt แยกสั้น ๆ) + denylist สำรอง
ชนแล้ว = ไม่ตอบเลย ส่งต่อคน (ผูกกับ decision เดิมข้อ 6 ใน decisions.md รอบแรก)

**9. ใครตั้งค่า Guardrails**
**ร้านตั้งเอง ต่อกลุ่มคำ** + SafePay เตรียมชุดเริ่มต้น (default set) ให้ก่อน
ร้านเพิ่ม/ลบเองได้อิสระ ไม่มีอะไรบังคับห้ามปิด

**10. เพดานค่าใช้จ่าย AI + วิธีคิดเงิน**
- ร้านตั้งเพดานค่าใช้จ่าย AI **ต่อวัน** เองได้ — ถึงเพดานแล้วถอยไปตอบดิบอัตโนมัติ
  + ต้องแจ้งเตือนก่อนถึงเพดานจริง (เช่น 80%) — **ช่องทางแจ้งเตือนยังไม่ตัดสิน**
- หักเครดิตตาม **ต้นทุน token จริง** ต่อครั้ง (ไม่ใช่ ฿1/ครั้งคงที่แบบ 00019)
  ต้องเก็บ `inputTokens`/`outputTokens`/`costUsd` ต่อการตอบของ DeepAI ทุกครั้ง

## คำถามที่ยังค้างต่อ (safepay-product ควรถามต่อ)
1. แจ้งเตือนเพดานค่าใช้จ่ายผ่านช่องทางไหน (SMS มีต้นทุนเอง ฿1/ครั้ง — เหมาะไหม)
2. Guardrails ชุดเริ่มต้นควรมีกี่ข้อ/เนื้อหาอะไรบ้าง
3. เพดานค่าใช้จ่ายเริ่มต้น (ก่อนร้านมาตั้งเอง) ควรเป็นเท่าไหร่ — ต้องมี default ที่ไม่ใช่ 0/unlimited

## ขั้นต่อไปที่ต้องทำ (สำหรับ session/Controller ใหม่)
1. Write addendum v2 ต่อท้าย `docs/superpowers/specs/2026-07-31-00023-qna-ux-design-spec.md`
   ตามเนื้อหาข้อ 1-6 ข้างบน (มี code snippet ที่ safepay-ux ร่างไว้แล้วในก้อนที่ 2 ด้านล่าง)
2. Invoke `safepay-product` เขียน BR-draft-1 ถึง 4 (ข้อ 7-10) ลง PRD/BRD ของ 00023
   อย่างเป็นทางการ ก่อนแตะโค้ด AI Enhance ใด ๆ (Hard Rule 11 doc-first)
3. เปิด agent-team-phase (Hard Rule 4) สำหรับ S-00 → S-19 ของ 00023-qna เท่านั้น
   (ไม่รวม AI Enhance จนกว่า PRD ข้อ 2 จะเสร็จ)
4. แยก S-20a (แก้ `AutoReplyTag.tsx` ที่ prod) ออกจาก S-20 — รัน regression smoke ก่อน merge
5. ทุก migrate/push main ต้องขอ user ยืนยันเป็นจุด ๆ — ห้ามรันรวดจนจบเอง
   (dev DB = prod DB ตัวเดียวกัน)
