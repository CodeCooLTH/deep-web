# Scope Baseline — `00023-ai-enhance` · ให้ AI เรียบเรียงคำตอบของ DeepBot

สถานะ: **ACTIVE** — user สั่งเริ่ม 2026-08-01 หลังปิด phase `00023-qna`
Phase ID: `00023-ai-enhance` · Branch: `feature/auto-reply` · Baseline สร้างจาก HEAD `01839eca` (== `origin/main`)
วันที่: 2026-08-01

อ้างอิง (เรียงตามอำนาจ)
1. **`docs/20 - Features/00023 - Deep Chat-Bot Assistant/PRD.md` §3.9** — BR-AR-31..36 (ผ่าน user review แล้ว)
2. **`docs/20 - Features/00023 - Deep Chat-Bot Assistant/BRD.md` §2.8** — FR-025..028 + AC 26 ข้อ
3. `docs/scope/2026-08-01-00023-ai-enhance-decisions-round2.md` + `docs/scope/2026-07-31-00023-ai-enhance-decisions.md` — มติ user · **ห้ามตีความใหม่**
4. โค้ดจริง: `src/lib/gemini.ts`, `src/lib/ai-pricing.ts`, `src/services/wallet.service.ts`, `src/services/auto-reply.service.ts`

---

## Goal

ร้านเปิดสวิตช์ทีละกลุ่มคำแล้วคำตอบสำเร็จรูปที่ตัวเองพิมพ์ไว้ **ออกไปหาลูกค้าด้วยถ้อยคำที่ลื่นขึ้น** โดยที่ร้านยัง
ควบคุมได้ครบสามอย่าง: ลูกค้าไม่ต้องรอนาน, AI ไม่พูดเกินสิ่งที่ร้านอนุญาต, และบิลไม่บานปลายข้ามคืน

ความสำเร็จ = ร้านกล้าเปิดทิ้งไว้ตอนหลับ เพราะรู้ว่าอย่างแย่ที่สุดลูกค้าก็ได้คำตอบเดิมที่ตัวเองเขียน ไม่ใช่คำที่ AI แต่งเอง

---

## Non-goals

1. **ไม่แตะกลไกจับคู่** — keyword matching, `matchQna`, คลังคำถาม-คำตอบ ทำงานเหมือนเดิมทุกอย่าง
   AI Enhance เสียบ **หลัง** ได้คำตอบดิบแล้วเท่านั้น
2. **ไม่เปลี่ยนพฤติกรรม gate 0-7** — รวม cooldown, ตารางเวลา, สถานะกลุ่มคำ, handoff
3. **ไม่แตะ feature 00019** (ผู้ช่วยร่างคำตอบที่คนกดส่ง / `/settings/ai`) — คนละเส้นทาง คนละงบ คนละการคิดเงิน
   ใช้ร่วมกันแค่ตาราง `AiSuggestUsageEvent` และ `lib/gemini.ts`
4. ไม่ทำ pgvector / embedding / semantic matching (ยังเป็น Non-goal เดิมจาก `00023-qna`)
5. ไม่ทำระบบเติมเงินใหม่ — ใช้ `SellerWallet` เดิมที่ใช้ร่วมกับ SMS
6. ไม่ทำ dashboard ต้นทุน AI ฝั่งแอดมิน (ข้อมูลถูกเก็บครบแล้ว เอาไปทำทีหลังได้)
7. ไม่ทำ A/B หรือการวัดผลว่าคำที่ AI เรียบเรียงขายดีกว่าไหม

---

## มติที่ล็อกแล้ว (ห้ามตีความใหม่)

| # | เรื่อง | ค่าที่ล็อก |
|---|---|---|
| 1 | งบเวลา | **8 วินาที** ทั้ง pipeline · เกินแล้วส่งคำตอบดิบ · **ไม่ไล่โมเดลสำรองเมื่อ timeout** |
| 2 | ลำดับตรวจ | denylist → AI เรียบเรียง → **AI judge ตรวจข้อความที่เรียบเรียงแล้ว** |
| 3 | ชนกฎจริง | ไม่ส่งอะไรเลย + ส่งต่อคน |
| 4 | ตัวตรวจเองล่ม | **ถอยไปคำตอบดิบ** (ไม่ใช่ส่งต่อคน) |
| 5 | Guardrails | รายกลุ่มคำ · ร้านแก้/ลบได้ทุกข้อ · ชุดเริ่มต้น **6 ข้อ** copy-by-value ตอนเปิดครั้งแรก · ไม่ apply ย้อนหลัง · ไม่เติมกลับสิ่งที่ร้านลบ |
| 6 | เพดาน | **฿50/วัน** default · ระดับร้าน · ตัดรอบเวลาไทย · Subscription ไม่มีเพดาน |
| 7 | แจ้งเตือน 80% | banner ในแอป (default) + SMS opt-in (**default ปิด**) |
| 8 | การคิดเงิน | ตามต้นทุน token จริง · **สะสมเศษ ครบ ฿1 ค่อยหัก** (user เคาะ 2026-08-01) |
| 9 | เรต USD→บาท | **ค่าคงที่ตั้งเผื่อไว้ ปรับด้วยมือ** ไม่ผูก API ภายนอก (user เคาะ 2026-08-01) |

---

## S-id

| ID | รายการ | Pri | Dep | สถานะ |
|----|--------|-----|-----|-------|
| **A-00** | **doc-first (Hard Rule 11)** — SRS (TFR ของ AI Enhance) + SDS + DATABASE + API + TestCase **ก่อนเขียนโค้ด** | P0 | — | TODO |
| A-01 | migration additive: `AutoReplyKeyword.aiEnhanceEnabled` · ตาราง `AutoReplyGuardrail` (รายกลุ่มคำ + `isFromDefaultSet`) · `AutoReplyConfig.aiDailyCapBaht`/`aiCapAlertSmsOptIn`/`aiCapAlertedDay` · `SellerWallet.pendingAiCostBaht` (Decimal) | P0 | A-00 | TODO |
| A-02 | ค่าคงที่: `AI_ENHANCE_TIMEOUT_MS=8000` (**แยกจาก `REQUEST_TIMEOUT_MS` 15s ของ 00019**), `USD_TO_THB_RATE`, `DEFAULT_AI_DAILY_CAP_BAHT=50`, ชุด Guardrails เริ่มต้น 6 ข้อ, reason code (`GUARDRAILS_BLOCKED`/`GUARDRAILS_CHECK_FAILED`/`AI_ENHANCE_TIMEOUT`/`DAILY_CAP_REACHED`/`INSUFFICIENT_CREDIT`) | P0 | A-01 | TODO |
| A-03 | `src/lib/ai-enhance-denylist.ts` — ฟังก์ชันบริสุทธิ์ตรวจ denylist + unit test | P0 | A-02 | TODO |
| A-04 | `src/services/ai-enhance.service.ts` — เรียบเรียง + AI judge ภายใต้งบ 8 วิรวม (`AbortSignal.timeout`) · **ห้าม throw ออกนอก** ทุกกรณี คืน `{ text, reason }` เสมอ | P0 | A-02 | TODO |
| A-05 | Guardrails service — CRUD รายกลุ่มคำ + copy ชุดเริ่มต้นตอนเปิดสวิตช์ครั้งแรก (copy-by-value) | P0 | A-01 | TODO |
| A-06 | การคิดเงิน: บันทึก `AiSuggestUsageEvent` (`kind='AUTO_REPLY_AI_ENHANCE'`) + สะสม `pendingAiCostBaht` + หักผ่าน `deductCredit` เมื่อครบ ฿1 (ทรานแซกชันเดียว) | P0 | A-01 | TODO |
| A-07 | เพดานต่อวัน: อ่านยอดวันนี้จาก `AiSuggestUsageEvent` (`businessDay` + `todayThaiIsoDate()`) · gate ก่อนเรียก AI · Subscription bypass | P0 | A-06 | TODO |
| A-08 | เสียบเข้า `processJob` — **หลัง** resolve คำตอบดิบ **ก่อน** `sendAutoReply` · ไม่เรียกเลยเมื่อไม่มีคำตอบดิบ | P0 | A-04, A-05, A-07 | TODO |
| A-09 | บันทึกเหตุผลลง `AutoReplyLog` — แยก 5 reason code ให้ debug ได้ว่าทำไมไม่เรียบเรียง | P0 | A-08 | TODO |
| **A-10** | **`safepay-ux` Design Spec** ของ 3 จุด UI (Hard Rule 8 — gate ก่อนแตะ frontend) | P0 | — | TODO |
| A-11 | UI สวิตช์ AI Enhance + Guardrails รายกลุ่มคำ (`KeywordEditorClient.tsx` — **ไฟล์ 1,441 บรรทัด ความเสี่ยงสูง ดู §ความเสี่ยง**) | P0 | A-10, A-05 | TODO |
| A-12 | UI ตั้งเพดานต่อวัน + สวิตช์ SMS opt-in (ระดับร้าน) | P0 | A-10, A-07 | TODO |
| A-13 | Banner แจ้งเตือน 80% (Base: `AdvanceWarningBanner.tsx`) + ส่ง SMS เมื่อ opt-in | P1 | A-10, A-07 | TODO |
| A-14 | ป้าย **DeepAI** — เปลี่ยน `lastMessageIsAiEnhanced` จาก hardcode `false` เป็นค่าจริง (`InboxList.tsx` + `AutoReplyTag.tsx`) | P1 | A-08 | TODO |
| A-15 | API: Guardrails CRUD + toggle + ตั้งเพดาน + Valibot + ERROR_MAP | P0 | A-05, A-07 | TODO |
| A-16 | เทส: unit (denylist, การปัดเศษ/สะสม, gate เพดาน) + integration (ลำดับ 3 ชั้น, fail-closed, timeout) | P0 | A-08 | TODO |
| A-17 | doc sync + `phase-retro` | P1 | A-16 | TODO |

---

## Acceptance ของ phase

1. กลุ่มคำที่ **ไม่ได้เปิด** AI Enhance ต้องมีพฤติกรรมเหมือนเดิมทุกประการ — ไม่มี latency เพิ่ม ไม่มีการเรียก AI ไม่มีการหักเงิน
2. เปิดแล้ว AI ล่ม/ช้าเกิน 8 วิ → ลูกค้าได้ **คำตอบดิบ** เสมอ ไม่มีเคสที่ลูกค้าไม่ได้อะไรเลยเพราะ AI พัง
3. ชน Guardrails → ไม่ส่งข้อความใด ๆ + ส่งต่อคน · ตัวตรวจเองล่ม → ถอยคำตอบดิบ · **สองเคสนี้แยกกันใน log**
4. ยอดที่หักจริงสะสมต่างจากผลรวมต้นทุนจริงไม่เกิน ฿1 ไม่ว่าทำงานกี่ครั้ง
5. ถึงเพดานแล้วไม่มีการเรียก AI อีกเลยจนขึ้นวันใหม่ (ตรวจจากจำนวน `AiSuggestUsageEvent` ของวันนั้น)
6. ร้านลบ Guardrails ข้อไหนก็ได้ และของที่ลบแล้วไม่กลับมาเองแม้อัปเดตชุดเริ่มต้น
7. `git diff --name-only` ก่อน merge ต้องไม่มีไฟล์ของ `00023-qna` ที่ไม่เกี่ยวข้องถูกแตะ

---

## ความเสี่ยง

| # | ความเสี่ยง | การรับมือ |
|---|---|---|
| 1 | **อยู่ใน hot path ของการตอบลูกค้าจริง** — พังแล้วกระทบทุกร้านที่เปิดบอท | A-04 ห้าม throw ออกนอกเด็ดขาด · A-08 ต้องมี early-return เมื่อสวิตช์ปิด (ค่าเริ่มต้นของทุกกลุ่มคือปิด) |
| 2 | **แตะเงินจริงในกระเป๋าที่ใช้ร่วมกับ SMS** — หักผิดแปลว่าร้านส่ง SMS ไม่ได้ | A-06 หักในทรานแซกชันเดียวกับการสะสม · เทสข้อ 4 ของ Acceptance เป็น BLOCKER |
| 3 | `KeywordEditorClient.tsx` **1,441 บรรทัด** และเพิ่งถูกแก้โดยงาน `00023-v3` หลายรอบ | A-11 ต้องอ่าน git log ของไฟล์ก่อนแตะ · แยก commit ของตัวเอง · ห้ามจัดระเบียบโค้ดเดิมไปด้วย |
| 4 | เรตแปลง USD→บาทเป็นค่าคงที่ที่ไม่มีใครเตือนให้อัปเดต | A-02 ต้องมี comment กำกับวันที่ตรวจล่าสุด + ตั้งสูงกว่าตลาด (หลักเดียวกับ `FALLBACK_RATE`) |
| 5 | AI judge เพิ่มการเรียก AI อีกหนึ่งรอบต่อข้อความ = ต้นทุนสองเท่าที่ยังไม่มีใครประเมิน | A-04 ต้องบันทึกต้นทุนของทั้งสองรอบแยกกัน เพื่อให้เห็นสัดส่วนจริงก่อนตัดสินว่าคุ้มไหม |
| 6 | dispatch subagent ใช้ไม่ได้ (`tmux: terminal_handle_stale`) | A-10 (ux gate) ทำไม่ได้จนกว่าจะกู้ได้ — งาน UI ทั้งหมด (A-11..A-14) จึงถูกบล็อกไว้ก่อน |

---

## Assumptions (เคาะแล้ว ไม่ใช่ข้อสงสัยอีกต่อไป)

- **การเก็บเศษ:** สะสม `pendingAiCostBaht` ต่อร้าน ครบ ฿1 หักจำนวนเต็ม เหลือเศษสะสมต่อ
  ผลข้างเคียงที่ยอมรับ: ร้านเลิกใช้ก่อนสะสมครบ ฿1 → เศษค้างไม่ถูกหัก (มูลค่าระดับสตางค์)
- **เรต USD→บาท:** ค่าคงที่ในโค้ด ตั้งสูงกว่าตลาดเล็กน้อยเป็น margin ปรับด้วยมือ มี comment กำกับวันที่ตรวจ

---

## สิ่งที่ยังไม่ตัดสิน (ต้องถามก่อนถึง S-id ที่เกี่ยว)

1. **prompt ของการเรียบเรียงและของ AI judge** — ยังไม่มีใครร่าง ต้องให้ user เห็นและเคาะก่อน A-04
   (นี่คือสิ่งที่กำหนดว่า AI จะพูดยังไง — สำคัญกว่าโค้ดที่ห่อมัน)
2. **ข้อความ SMS แจ้งเตือน 80%** — ต้องสั้นและมีต้นทุน ฿1/ครั้ง
3. **ร้านเห็นเหตุผลที่ไม่เรียบเรียงตรงไหน** — ในป้าย DeepBot ที่กดดู หรือในหน้าบันทึกการทำงาน
