# UX Design Spec — 00019-ext แสดงคำแนะนำอัตโนมัติ (Typhoon)

> ผลิตโดย safepay-ux 2026-10-09 (HR8) · Controller รับค่าตั้งต้นของ Open questions ทุกข้อตามที่ ux เสนอ

> **ดูเพิ่ม:** บล็อก "ความจำของแชทนี้" และ "สินค้าที่สนใจ" ในแผงขวา (ตรวจแล้ว ไม่กระทบแผงคำแนะนำในเอกสารนี้) อยู่ที่ `UX-Design-Spec-2026-10-09-chat-memory.md` · ข้อมูลและ contract: `EXTENSIONS-2026-10-09-chat-memory.md`

## หน้า: ห้องแชท, คำแนะนำ AI แบบอัตโนมัติ (Typhoon) (`/seller/inbox/[conversationId]`)

อ่านครบแล้ว: ส่วนขยาย 00019 รวมภาคผนวก ก, `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, Impeccable `shape` / `operate` / `craft-floor`, ui-guideline README, และโค้ดจริงของ `AiSuggestPanel.tsx` / `ChatThread.tsx` / `BotPausedBanner.tsx`. อ้างบรรทัดตามไฟล์ใน worktree `/Users/craftman/Projects/safepay-typhoon-suggest`.

ไฟล์ `.claude/skills/frontend-design/SKILL.md` หาไม่เจอในทั้งสอง worktree. ผมใช้หลักจาก Hard Rule 10 ที่ระบุไว้ในพรอมต์แทน.

---

### OQ-13: คำตอบ (ตัด FR-AIT-21 ได้)

หน้าแชทแสดง handoff อยู่แล้ว:

- `ChatThread.tsx:2421-2437` สร้างชิปสถานะ `key:'bot'` (tone warning, icon `robot-off`) เมื่อ `botCouldReply && getBotPausedSummary(...).show`.
- ชิปอยู่ในแถว `ThreadChipStrip` ใต้หัวเธรด (`:2900`). เมื่อกางจะเป็น `BotPausedBanner.tsx`.
- แบนเนอร์เขียนว่า "บอทหยุดตอบห้องนี้แล้ว — {HANDOFF_LABEL[handoffReason] ?? 'ห้องนี้ถูกส่งต่อให้คนดูแล'}" พร้อมปุ่ม "ให้บอทตอบต่อ".
- `handoffAt`/`handoffReason` ถูกส่งให้ `BotPausedBanner` ตัวเดียว.

ข้อสังเกตที่ Controller ควรรู้:

- สิ่งที่มีอยู่คือ "บอทหยุดตอบ", ไม่ใช่ "ลูกค้าต้องการคุยกับแอดมิน". ใน `SKIP_REASONS` (`auto-reply-constants.ts:96-123`) และค่าที่เขียนลง `handoffReason` ไม่มีค่าที่แปลว่า "ลูกค้าขอคุยกับคน". ข้อมูลนี้จึงไม่มีให้แสดง.
- เหตุผลอื่นที่ไม่อยู่ใน `HANDOFF_LABEL` (เช่น `GUARDRAILS_BLOCKED`, `SEND_FAILED`) ตกไปใช้ข้อความกลาง "ห้องนี้ถูกส่งต่อให้คนดูแล". ใช้งานได้ ไม่ต้องแก้ในรอบนี้.
- ชิปนี้ต้องมี `botCouldReply=true`. ร้านที่ไม่มีบอทจึงไม่เห็นอะไร ซึ่งถูกต้อง เพราะไม่มีบอทให้หยุด.

**ข้อเสนอ:** ตัด FR-AIT-21 ตามข้อเสนอของ OQ-13 ใน §15, คือไม่ทำกล่องกลางสายใหม่ และห้องที่ `handoffAt` มีค่ายังได้คำแนะนำตามปกติ (E-4). แผงใหม่ไม่ชนกับชิปนี้เลย เพราะอยู่คนละโซน (ชิปอยู่หัวเธรด, แผงอยู่เหนือช่องพิมพ์).

---

### User stories ที่ครอบ
US-AIT-01, 02, 03, 06 ในเอกสารส่วนขยาย, บวก AC-AIT-15/16 (ปุ่ม 4 อย่าง, ไม่มีปุ่มแก้, ไม่มีบรรทัดท้าย).

### วิธีแยกสองโหมด (Typhoon และ Gemini)

| | `aiSuggestMode='auto'` (Typhoon) | `'manual'` (Gemini, ค่าเริ่มต้น) |
|---|---|---|
| ใครตัดสิน | server: `page.tsx` เรียก `resolveSuggestProvider(conversation.shopId)` แล้วส่ง boolean/string ที่ serializable ลง `ChatThread` | เหมือนกัน |
| ปุ่ม sparkles แถบเครื่องมือ (`ChatThread.tsx:3413`) | เปลี่ยนหน้าที่เป็น "เรียกกลับ" และขึ้นเฉพาะตอนมีคำแนะนำที่ถูกซ่อน | `togglePanel('ai')` เหมือนเดิม |
| จุด mount (`:3222`) | `<AiSuggestInline>` mount ตลอดเมื่อ `view !== 'none'` | `aiOpen && <AiSuggestPanel>` เหมือนเดิม |
| โควตา / ชิป / disclaimer / 3 ข้อ | ไม่มีทั้งหมด | เหมือนเดิมทุกบรรทัด |

กฎของการแยก:

- **ค่าเริ่มต้นปลอดภัย:** `ChatThread` รับ prop `aiSuggestMode?: 'auto' | 'manual'` และใช้ `'manual'` เมื่อไม่ส่งมา. ลืมส่ง prop = พฤติกรรมเดิม.
- **ไม่ถาม server ฝั่ง client ว่ามีสิทธิ์ไหม:** ทางที่ผมเลือกไม่ให้ร้าน Gemini ยิง `GET/POST /auto` เพื่อรู้โหมดเลย. (ทางเลือกคือรอ `NONE/SKIPPED_NOT_ALLOWED` กลับมา ซึ่งเปลืองและกระพริบ.)
- **แยกคอมโพเนนต์ ไม่ใส่ `if (mode==='auto') return` ใน `AiSuggestPanel`:** ของใหม่เป็นไฟล์ใหม่ `AiSuggestInline.tsx`, และ `AiSuggestPanel.tsx` ไม่ถูกแตะเลย (diff = 0). เหตุผลแรกคือ "Gemini 100%" พิสูจน์ได้ด้วย diff ว่าง. เหตุผลที่สองคือ `AiSuggestPanel` มี hook ถึง 8 ตัว การแตก branch ก่อน hook คือบั๊กจอขาวที่เคยเกิดแล้ว (memory `hook_below_early_return`).
  - ข้อเสนอนี้ต่างจากข้อความ "ปรับ `AiSuggestPanel.tsx`" ในพรอมต์ ดู Open question 4.
- **`useAutoSuggest(enabled)`** ต้องเรียกไร้เงื่อนไขที่ส่วนบนของ `ChatThread` ร่วมกับ hook อื่น. เมื่อ `enabled=false` ต้องไม่มี fetch และไม่มี timer เลย.
- **กฎแสดง/ซ่อนเป็นฟังก์ชันบริสุทธิ์** ใน `src/lib/ai-suggest-view.ts` เพื่อให้เทสจับได้ (convention `ui-boolean-needs-a-testable-home`).

```
getAutoSuggestView({ mode, status, anchorIsLatestBuyer, typing, dismissedAnchorId,
                     anchorId, recalledAnchorId, activePanel, composerDisabled })
  → 'none' | 'thinking' | 'ready' | 'recall'

  mode!=='auto' | status==='none' | !anchorIsLatestBuyer
    | composerDisabled | activePanel!==null            → 'none'   (ไม่มีปุ่มเรียกกลับ)
  hidden = (typing && recalledAnchorId!==anchorId) || dismissedAnchorId===anchorId
  hidden && status==='ready'                            → 'recall'
  hidden && status!=='ready'                            → 'none'
  status==='thinking' → 'thinking' ; 'ready' → 'ready'
```

- `typing = text.trim() !== ''`.
- กดเรียกกลับ: ตั้ง `recalledAnchorId = anchorId` และล้าง `dismissedAnchorId`.
- เลือกข้อความ (pick): ล้าง `recalledAnchorId`.
- anchor เปลี่ยน: ล้างทั้งคู่.

### Layout (ASCII wireframe)

ลำดับแนวตั้งในการ์ด composer ของ `ChatThread` (เดิม): **แผง → แถวเครื่องมือ → ช่องพิมพ์**. ตำแหน่งนี้ไม่เปลี่ยน.

**มือถือ 390px**

```
S0 ไม่มี                          S1 กำลังคิด
(ไม่ render, สูง 0)               ┌───────────────────────────────────┐
                                  │ ✦ AI · กำลังคิดคำตอบ…    ↻(หมุน) ✕ │ 44px  👍👎 invisible (กันที่)
                                  │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒   │
                                  │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒                    │
                                  ├───────────────────────────────────┤
                                  │ ☺  📅  🛒                         │ แถวเครื่องมือ (✦ ไม่ขึ้น)
                                  │ ┌───────────────────────────────┐ │
                                  │ │ พิมพ์ข้อความ หรือวางไฟล์...    │ │
                                  │ └───────────────────────────────┘ │

S2 มีคำแนะนำ
┌───────────────────────────────────────────────┐
│ ✦ AI · คำตอบแนะนำ          👍  👎  ↻  ✕        │ แต่ละปุ่ม 44x44
│ ┌───────────────────────────────────────────┐ │
│ │ สวัสดีค่ะ ตอนนี้มีสีดำไซส์ M พร้อมส่งเลยค่ะ │ │ แถวข้อความกดได้ทั้งแถว (min-h 44)
│ │ ต้องการสั่งเลยไหมคะ                        │ │ hover/active: พื้น default-100 เท่านั้น
│ └───────────────────────────────────────────┘ │ ไม่มีขอบ ไม่มีการ์ด
├───────────────────────────────────────────────┤
│ ☺  📅  🛒                                     │
│ [ช่องพิมพ์]                                   │

S3 เมนูไม่ถูกใจ (เปิดขึ้นด้านบน ชิดขอบขวา)
                ┌─────────────────────────────┐
                │ ไม่ถูกใจตรงไหน (ไม่บังคับ)   │ h6
                │ ข้อมูลไม่ถูก                  │ 44px/แถว  dropdown-item
                │ ไม่ตรงกับที่ลูกค้าถาม       ✓ │ เลือกแล้ว = ✓ text-primary
                │ น้ำเสียงไม่เหมาะ              │
                │ ยาวหรือสั้นเกินไป             │
                │ ─────────────────────────── │ dropdown-divider
                │ [เหตุผลอื่น ๆ (ไม่บังคับ)  ] │ form-input maxlength 120
                │ ไม่ต้องใส่เบอร์โทรหรือที่อยู่  │ text-2xs
                │ ของลูกค้า              12/120 │
                │              [ส่งความเห็น]   │ btn-sm bg-primary
                └──────────────────────┬──────┘
✦ AI · คำตอบแนะนำ          👍  [👎●] ↻  ✕

S4 ซ่อนเพราะแอดมินเริ่มพิมพ์ (หรือกดปิด) + ปุ่มเรียกกลับ
┌───────────────────────────────────────────────┐
│ ☺  ✦  📅  🛒                                  │ ✦ = ปุ่มเรียกกลับ (ตำแหน่งเดิมของ ✦ ในแถว)
│ ┌───────────────────────────────────────────┐ │
│ │ ขอโทษค่ะ ตอนนี้ส่ง|                        │ │ ข้อความของแอดมินไม่ถูกแตะ
│ └───────────────────────────────────────────┘ │
```

**Desktop (composer กว้างประมาณ 700px)**

```
✦ AI · คำตอบแนะนำ                                        👍 👎 ↻ ✕   ปุ่ม size-7 (28px)
สวัสดีค่ะ ตอนนี้มีสีดำไซส์ M พร้อมส่งเลยค่ะ ต้องการสั่งเลยไหมคะ    ← แถวเดียวกว้างเต็ม, hover = พื้น default-100
☺ 🏷 ✦(เฉพาะตอนซ่อน) 📅
[ช่องพิมพ์ .................................................... ] [ส่ง]
```

ไม่มีคอลัมน์ว่าง เพราะแผงกว้างเท่า composer ซึ่งเป็นคอลัมน์กลางที่มีเนื้อหาอยู่แล้ว.

### Section breakdown

- **หัวแผง (บรรทัดเล็ก).** ซ้าย: icon `sparkles` + ป้าย "AI · คำตอบแนะนำ" (`role="status"`). ขวา: ปุ่ม 4 อย่างเรียง 👍 👎 ↻ ✕.
- **ข้อความคำแนะนำ.** เป็น `<button>` แถวเดียวเต็มความกว้าง. กด = ใส่ลงช่องพิมพ์ ไม่ส่งเอง.
  - ช่องว่าง: แทนที่ข้อความ.
  - ช่องมีข้อความอยู่แล้ว (กรณีกดเรียกกลับ): ต่อท้ายบรรทัดใหม่ `prev.trim() ? prev+'\n'+picked : picked`. ใช้ตรรกะเดียวกับข้อความสำเร็จรูป (`ChatThread.tsx:2093`) กันข้อความที่แอดมินพิมพ์หาย.
  - หลังเลือก: `composerRef.current?.focus()`. แผงซ่อนเองเพราะ `typing` เป็นจริง และปุ่มเรียกกลับขึ้น.
  - ข้อความยาวผิดปกติ: `max-h-36 overflow-y-auto` (เซิร์ฟเวอร์ตัดไม่เกิน 3 ประโยคอยู่แล้ว ตาม FR-AIT-06). ไม่ใช้ line-clamp เพราะแอดมินต้องอ่านครบก่อนกด.
- **สถานะกำลังคิด.** ป้ายเปลี่ยนเป็น "AI · กำลังคิดคำตอบ…", skeleton 2 บรรทัด, ปุ่ม 👍👎 ใช้ `invisible` (ยังอยู่ใน DOM) เพื่อให้ปุ่มขวาไม่ขยับและให้ Preline ผูก dropdown ไว้ก่อนผู้ใช้จะแตะ.
- **ถูกใจ.** กดครั้งเดียว บันทึก `UP` ทันที (optimistic). icon เปลี่ยนเป็น `thumb-up-filled`, `text-primary`, `aria-pressed=true`. ถ้า PATCH ล้มให้ย้อนสถานะเงียบ ๆ.
- **ไม่ถูกใจ.** คลิก = บันทึก `DOWN` ทันที (AC-AIT-15) และเปิดเมนูพร้อมกัน.
  - ตัวเมนู: `hs-dropdown` + `[--auto-close:outside]` เพื่อไม่ปิดเมื่อเลือกเหตุผล (FR-AIT-20) และปิดเมื่อแตะนอกเมนูหรือกด Esc.
  - เหตุผล: เลือกแล้ว PATCH `reason` ได้ 1 ใน 4. แตะข้อเดิมซ้ำ = ล้างเหตุผล แต่ยังเป็น `DOWN`.
  - ช่องข้อความ: ปุ่ม "ส่งความเห็น" (disabled จนกว่าจะมีข้อความและต่างจากที่บันทึกแล้ว). เมื่อสำเร็จปุ่มเป็น "บันทึกแล้ว" + `check`, ผู้ใช้แตะนอกเมนูเพื่อปิด. ผมไม่เขียนโค้ดปิดเมนูด้วย `HSDropdown` เพราะใน `src/` ไม่มีที่ใช้และไม่มี type รองรับ.
- **สร้างใหม่.** เรียก `POST /auto` แบบ `manual:true` (attempt+1). แถวข้อความเปลี่ยนเป็น skeleton. ความเห็นเดิมค้างที่ attempt เดิม ผลใหม่เริ่มไม่มีความเห็น (E-18).
- **ปิด.** ซ่อนเฉพาะ anchor นี้ (`dismissedAnchorId`). ข้อความลูกค้าใหม่ = anchor ใหม่ = แผงกลับมาเอง.
- **ปุ่มเรียกกลับ.** ปุ่ม `sparkles` เดิมใน `ChatThread.tsx:3413` ในโหมด auto. ขึ้นเมื่อ `view==='recall'` เท่านั้น ไม่งั้นไม่ render. คลาสเดิมทุกตัว เปลี่ยนแค่ `aria-label` / `title` เป็น "แสดงคำแนะนำ AI" และเอา `aria-expanded` ออก (ไม่ได้เปิดแผงแบบ toggle แล้ว).

### Theme Source Mapping

| Section | Theme / project source | Component | หมายเหตุ adapt |
|---|---|---|---|
| ปุ่มไอคอน 4 อย่าง | ของเดิม `AiSuggestPanel.tsx:243-264` (cluster `size-11 lg:size-7`) ← `theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx:520` (`btn btn-icon`) | ปุ่ม icon เปล่า | ใช้คลาสเดิมตรง ๆ, `rounded` |
| skeleton | `theme/paces/Admin/TS/src/app/(admin)/ui/placeholders/page.tsx:75-81` (`bg-default-300 block h-3.25 animate-pulse`) | placeholder | 2 แท่ง `w-full` / `w-2/3`, `aria-hidden` |
| เมนูไม่ถูกใจ (action menu แบบ toggle+เมนู, ชนิด (ข) ของ HR6) | `theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx:519-524` (dropup) และ `:905-909` (`[--auto-close:outside]`) | `hs-dropdown` / `hs-dropdown-menu` / `dropdown-item` / `dropdown-divider` | ทิศทางเปิด `[--placement:top-end]`. ถ้า placement นี้ไม่ทำงานให้ถอยเป็น `top-left` ซึ่งยืนยันว่ามีในหน้า theme (`:544`) |
| ตัวอย่างในโปรเจกต์ของเมนูที่มีฟอร์มข้างใน | `ThreadOverflowMenu.tsx:36-96` | โครง `h6` หัวเมนู + แถวฟอร์ม | หัวเมนูเลียนแบบ `<h6 className="text-default-800 px-2.75 py-2 font-semibold">` |
| ช่องเหตุผลอื่น ๆ (ฟิลด์ที่ผูกค่า, ชนิด (ก)) | `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx:21` (`form-input`) | `<input type="text" className="form-input">` | เป็น input ข้อความ ไม่ใช่ select จึงไม่ขัดกฎ select |
| ปุ่ม "ส่งความเห็น" | ของเดิม `AiSuggestPanel.tsx:296` (`btn btn-sm bg-primary text-white`) | ปุ่ม | เพิ่ม `hover:bg-primary-hover min-h-11 sm:min-h-0` ตามแพตเทิร์น `BotPausedBanner.tsx:118` |
| ปุ่มเรียกกลับ | `ChatThread.tsx:3413-3423` | ปุ่มเดิม | ไม่เปลี่ยนคลาส |
| การต่อข้อความตอน pick | `ChatThread.tsx:2093` | `setText(prev => prev.trim() ? ... )` | |
| toast สร้างใหม่ล้ม | `pacesToast.warning` (Hard Rule 9) | toast | ตำแหน่งแชท bottom-right ตาม DESIGN.md §Toast |
| ไม่พบ theme match | ปุ่มเรียกกลับแบบ "ขึ้นเฉพาะตอนซ่อน" ไม่มีใน theme | ไม่ต้องใช้ component ใหม่ | closest primitive = ปุ่ม `btn btn-icon` เดิมในแถวเดียวกัน, แค่ render แบบมีเงื่อนไข |

### User flow

1. ลูกค้าส่งข้อความ ขณะแอดมินเปิดห้องและแท็บมองเห็น → ภายในไม่กี่วินาทีเห็น S1 แล้วเป็น S2. ไม่ต้องกดอะไร.
2. กดข้อความคำแนะนำ → ข้อความเข้าช่องพิมพ์, โฟกัสช่องพิมพ์, แผงหาย, ปุ่ม ✦ ขึ้นในแถวเครื่องมือ → แอดมินแก้ในช่องพิมพ์แล้วกดส่งเอง.
3. เริ่มพิมพ์เองโดยไม่กดคำแนะนำ → แผงหาย, ✦ ขึ้น. กด ✦ → แผงกลับมา (ข้อความที่พิมพ์ไม่หาย). ลบจนช่องว่าง → แผงกลับมาเอง (ดู decision 3).
4. กด 👎 → เมนูเปิด, บันทึก `DOWN` แล้ว. เลือกเหตุผลหรือพิมพ์ต่อได้ หรือแตะนอกเมนูเพื่อจบ.
5. กด ↻ → S1 → S2 (ข้อความใหม่). ถ้าล้ม คำแนะนำเดิมยังอยู่ + toast เตือน.
6. ลูกค้าส่งข้อความใหม่ระหว่างนั้น → S1 ของ anchor ใหม่ ผลเก่าถูกทิ้ง (FR-AIT-08).

### Content outline และ i18n keys

เพิ่มใน `t.inbox` ของ `src/i18n/dictionaries/th.ts` และ `en.ts`. ต้องเพิ่มทั้งสองไฟล์ เพราะ `en: Dictionary` เป็นด่านบังคับ. วางต่อจากกลุ่ม `composer*` (`th.ts:722`).

| key | th | en |
|---|---|---|
| `aiSuggestLabel` | AI · คำตอบแนะนำ | AI · Suggested reply |
| `aiSuggestThinking` | AI · กำลังคิดคำตอบ… | AI · Thinking of a reply… |
| `aiSuggestPickHint` (sr-only) | แตะเพื่อใส่ในช่องพิมพ์ | Tap to put it in the message box |
| `aiSuggestLike` | ถูกใจคำตอบนี้ | Good reply |
| `aiSuggestDislike` | ไม่ถูกใจคำตอบนี้ | Bad reply |
| `aiSuggestRegenerate` | สร้างคำตอบใหม่ | Write a new reply |
| `aiSuggestDismiss` | ปิดคำแนะนำ | Dismiss suggestion |
| `aiSuggestRecall` | แสดงคำแนะนำ AI | Show AI suggestion |
| `aiSuggestFeedbackTitle` | ไม่ถูกใจตรงไหน (ไม่บังคับ) | What was off? (optional) |
| `aiSuggestReasonWrongInfo` | ข้อมูลไม่ถูก | Incorrect information |
| `aiSuggestReasonOffTopic` | ไม่ตรงกับที่ลูกค้าถาม | Doesn't match what the customer asked |
| `aiSuggestReasonBadTone` | น้ำเสียงไม่เหมาะ | Wrong tone |
| `aiSuggestReasonLength` | ยาวหรือสั้นเกินไป | Too long or too short |
| `aiSuggestNotePlaceholder` | เหตุผลอื่น ๆ (ไม่บังคับ) | Other reason (optional) |
| `aiSuggestNoteAria` | เหตุผลอื่น ๆ ที่ไม่ถูกใจ | Other reason you didn't like it |
| `aiSuggestNoteHint` | ไม่ต้องใส่เบอร์โทรหรือที่อยู่ของลูกค้า | No need to include the customer's phone or address |
| `aiSuggestNoteSend` | ส่งความเห็น | Send feedback |
| `aiSuggestNoteSaved` | บันทึกแล้ว | Saved |
| `aiSuggestRegenBusy` | ตอนนี้ AI ยังสร้างคำตอบใหม่ไม่ได้ ลองอีกครั้งในอีกสักครู่ | AI can't write a new reply right now. Try again in a moment. |

ตัวนับ `{n}/120` ไม่ต้องมี key (ตัวเลขล้วน). ข้อความใน `AiSuggestPanel.tsx` ที่ hardcode ไทยอยู่เดิมไม่ถูกแตะ (ไม่อยู่ในขอบเขตรอบนี้).

Icon ทั้งหมดเรียกผ่าน wrapper `Icon` เดิม (ชื่อ tabler ไม่ใส่ prefix). ตรวจแล้วมีอยู่ใน `generated-icons.css`:

| ใช้ที่ | icon |
|---|---|
| ป้ายหัวแผง / ปุ่มเรียกกลับ | `sparkles` (ตัวเดียวกับที่แผงเดิมใช้) |
| ถูกใจ | `thumb-up` / `thumb-up-filled` |
| ไม่ถูกใจ | `thumb-down` / `thumb-down-filled` |
| สร้างใหม่ | `refresh` (หมุนด้วย `animate-spin` ตอนคิด, ตามที่เดิมใช้) |
| ปิด | `x` |
| เหตุผลที่เลือก / บันทึกแล้ว | `check` |

### รายการ class

| ส่วน | class |
|---|---|
| wrapper แผง | `mb-2` (ไม่มี bg, border, shadow, margin ลบ, rounded) |
| แถวหัว | `flex items-center justify-between gap-2` |
| ป้าย | `text-default-700 flex min-w-0 items-center gap-1.5 text-xs font-medium` + `role="status"`; icon `text-sm` |
| กลุ่มปุ่ม | `flex shrink-0 items-center gap-1` |
| ปุ่มไอคอน | `text-default-700 hover:text-default-900 hover:bg-default-100 flex size-11 lg:size-7 items-center justify-center rounded`; icon `text-base` |
| ปุ่ม 👍👎 ที่เลือกแล้ว | `text-primary` (icon `-filled`) |
| ปุ่มที่ซ่อนตอนคิด | `invisible` |
| แถวข้อความ (ปุ่ม) | `text-default-800 hover:bg-default-100 focus-visible:ring-primary -mx-2 block min-h-11 w-full rounded-lg px-2 py-2 text-start text-sm focus-visible:outline-none focus-visible:ring-1 lg:min-h-0 lg:py-1.5` |
| กล่องข้อความเลื่อน | `max-h-36 overflow-y-auto` |
| skeleton | `bg-default-300 block h-3.25 animate-pulse rounded` (`w-full` / `w-2/3`), ห่อด้วย `flex flex-col gap-2 px-2 py-2.5` |
| dropdown wrapper | `hs-dropdown relative inline-flex [--auto-close:outside] [--placement:top-end]` |
| เมนู | `hs-dropdown-menu min-w-60 sm:min-w-72` + `role="menu" aria-orientation="vertical" aria-labelledby` |
| หัวเมนู | `text-default-800 px-2.75 py-2 font-semibold` (`<h6>`) |
| แถวเหตุผล | `dropdown-item min-h-11 justify-between lg:min-h-0` + `role="menuitemradio" aria-checked`; เลือกแล้ว `font-medium` + `check` `text-primary` |
| เส้นคั่น | `dropdown-divider` |
| ช่องเหตุผลอื่น ๆ | `form-input min-h-11 lg:min-h-0` + `maxLength={120}` |
| คำใบ้ / ตัวนับ | `text-default-700 text-2xs` (ตัวนับ `tabular-nums`) |
| ปุ่มส่งความเห็น | `btn btn-sm bg-primary text-white hover:bg-primary-hover min-h-11 sm:min-h-0` |

ไม่มี arbitrary value (HR7), ไม่มี hex, ไม่มี `font-mono`. ทุกค่าเป็น token / scale ปกติ.

### Edge states

| สถานะ | พฤติกรรม |
|---|---|
| ไม่มี (`NONE`, ข้าม, ทิ้งเงียบ) | ไม่ render อะไร สูง 0, ไม่มี error, ไม่มี toast (NFR-AIT-Failsoft) |
| กำลังคิดนานเกิน | หยุด poll ที่ ~10 วินาที แล้วกลับเป็น "ไม่มี" |
| สร้างใหม่ล้ม (ผู้ใช้กดเอง) | คงคำแนะนำเดิมไว้ + `pacesToast.warning(aiSuggestRegenBusy)`. ไม่ปล่อยเงียบเพราะเป็นการกระทำของผู้ใช้เอง (ดู Open question 3) |
| ส่ง PATCH ความเห็นล้ม | ย้อนสถานะปุ่มเงียบ ๆ (ข้อมูลสถิติ ไม่ใช่งานของลูกค้า) |
| ข้อความยาวผิดปกติ | เลื่อนใน `max-h-36`; แถวยังกดได้ทั้งแถว |
| `composerDisabled` (หน้าต่าง 24 ชม.ปิด / token ตาย) | ไม่แสดงแผง และไม่ขึ้นปุ่มเรียกกลับ (ข้อความที่ใส่ไปก็ส่งไม่ได้) |
| เปิดแผงสำเร็จรูป / เลือกสินค้า (`activePanel !== null`) | ซ่อนคำแนะนำชั่วคราว ไม่มีปุ่มเรียกกลับ. ปิดแผงนั้นแล้วกลับมาเอง |
| ห้อง `handoffAt` มีค่า | ยังแสดงคำแนะนำ (E-4). ชิปบอทหยุดอยู่หัวเธรดเหมือนเดิม |
| ค่าตัวเลข 0 / ล้าน | ไม่มีตัวเลขในแผงนี้ (ตัดโควตา, token, USD ออกแล้ว) |
| มือถือ + คีย์บอร์ดเปิด | แถวคำแนะนำอยู่เหนือแถวเครื่องมือ ไม่เพิ่มความสูงเกินจำเป็น (ดู Open question 6 เรื่องเมนูที่มีช่องพิมพ์) |

### Impeccable compliance

- **Mode: Operate.** หน้าแชทของผู้ขายเป็นเครื่องมือทำงานจริง. `PRODUCT.md` ระบุ default เป็น brand แต่สั่งให้ override เป็น product เมื่อทำงานบน seller console. ตามเกณฑ์ operate: familiarity และความเร็วในการสแกนชนะการแสดงออก, ตัดทุกอย่างที่ไม่ทำงาน.
- **พระเอกของหน้า:** ข้อความคำแนะนำ. เป็นตัวอักษรเดียวในแผงที่ใช้ ink เข้ม (`text-default-800`, `text-sm`) ส่วนป้ายและปุ่มเป็นชั้นรอง (`text-default-700`, `text-xs`). ไม่มีการ์ด จึงไม่มีสิ่งอื่นแย่งน้ำหนัก.
- **จุดที่ใช้ accent สีธีม (ระบุทุกจุด):** (1) ไอคอน 👍/👎 ตอนที่เลือกแล้ว `text-primary`, (2) ✓ ข้างเหตุผลที่เลือก, (3) ปุ่ม "ส่งความเห็น", (4) focus ring ของแถวข้อความ. ทั้งหมดน้อยกว่า 1% ของจอ. ไม่มีม่วง `#7367F0` (primary ของ Paces คือ `bg-primary` น้ำเงิน).
- **บทเรียนจาก critique เก่า ("ทุกอย่างจางไปหมด"):** แผงนี้เป็นเทาเป็นหลักโดยตั้งใจ แต่มีลำดับชั้นชัด (ink เทียบรอง) และ accent ตรงจุดตัดสินใจ. ผมไม่ได้พึ่ง token เทาอย่างเดียว.
- **Verified-Means-Green:** แผงใหม่ **ถอดเขียวทิ้งทั้งหมด** (เดิมมี `bg-success/5`, `text-success`, `hover:border-success`). คำแนะนำจาก AI ยังไม่ได้ตรวจ จึงไม่ควรเป็นสีเขียว. "ถูกใจ" ใช้ primary ไม่ใช่เขียว เพราะไม่ใช่ "ยืนยัน/สำเร็จ".
  - **จุดเสี่ยงที่เหลือ:** ปุ่ม ✦ เรียกกลับยังเป็น `text-success` เพราะเป็นปุ่มเดิมที่ user เคาะจาก reference (HR6, ความเห็นที่ `ChatThread.tsx:3412`, `AiSuggestPanel.tsx:11`). ผมไม่แตะ. Controller ควรพิจารณาตอน critique (Open question 5).
- **The One Voice:** ไม่เพิ่ม accent ใหม่ให้แถวเครื่องมือ (ตามคอมเมนต์ที่ `ChatThread.tsx:3428`).
- **Ink-tinted shadow:** ไม่เขียนเงาใหม่เลย. เมนูใช้ `.hs-dropdown-menu` (`shadow` ของ Paces ซึ่งผสมหมึกอยู่แล้ว, `_dropdown.css:6`).
- **Sentence-case:** ไทย/อังกฤษเป็น sentence case ไม่มี ALL CAPS. ปุ่มบอกผลลัพธ์ ("ส่งความเห็น") ไม่บอกท่าทาง.
- **น้ำเสียง:** ข้อผิดพลาดเดียว (`aiSuggestRegenBusy`) บอกสถานการณ์และทางออก ไม่ใช้ "ไม่สามารถ...ได้". ไม่มีไฮป์.
- **สิ่งที่ theme ขัดกับ Impeccable:**
  - ปุ่มกด "ไม่มีกรอบ" ไม่มีใน theme. ผมตัดสินให้ใช้แถว `button` + hover tint (Impeccable: ไม่ซ้อนการ์ด, ไม่มีขอบตกแต่ง).
  - `.dropdown-item` มี `py-1.5` (ประมาณ 33px) ต่ำกว่า 44px บนมือถือ. แก้ด้วย `min-h-11 lg:min-h-0` ซึ่งเป็นแพตเทิร์นของโปรเจกต์อยู่แล้ว.
- **ของที่ไม่ได้ผ่านเกณฑ์ HR7 แบบเงียบ ๆ:** ไม่มี.

### Design decisions + rationale

1. **ไฟล์ใหม่แทนการแก้ `AiSuggestPanel`:** ดูเหตุผลด้านบน. ได้ diff ศูนย์สำหรับ Gemini และเลี่ยงบั๊ก hook.
2. **ปุ่มเรียกกลับ = ปุ่ม ✦ เดิมที่เปลี่ยนหน้าที่:** ไม่เพิ่มปุ่มใหม่ในแถวที่แน่นอยู่แล้ว (comment `ChatThread.tsx:3457-3459` ระบุว่าแถวนี้เคยถูก user ตัดปุ่มเพราะเยอะไป). ในโหมด auto ปุ่ม toggle ไม่มีงานเหลือ.
3. **แผงกลับมาเองเมื่อช่องพิมพ์ว่าง (นอกแผนภาพ 8.2):** เพราะคำแนะนำของ anchor เดิมยังใช้ได้อยู่ และกฎแบบ derived ง่ายกว่า latch มาก (latch ต้องมี event ทุกจุดที่ `setText` ถูกเรียก: emoji, quick message, paste). ผลลัพธ์ปลายทางเหมือนเรียกกลับ แต่ไม่ต้องกด. ถ้าต้องการเคร่งตามแผนภาพจริง ๆ ต้องเพิ่ม latch.
4. **บันทึก `DOWN` ตอนเปิดเมนู ไม่รอเลือกเหตุผล:** ตรงกับ FR-AIT-20 ("กดอย่างเดียวก็นับ DOWN").
5. **ไม่มีเส้นคั่น/พื้นหลังแผง:** ตามมติ "แบบ FB ไม่มีกรอบ". ใช้ระยะห่างแยกกลุ่มแทน.
6. **เมนูอยู่ในแถวหัว ไม่ใช่ในกล่อง scroll ของข้อความ:** กันถูกตัดด้วย `overflow` ตาม `scroll-container-clips-popovers`.
7. **ไม่แสดงเฟส/เหตุผลที่คำแนะนำไม่ขึ้น:** เงียบตาม NFR. ผู้ใช้ไม่ต้องรู้ว่า Typhoon ติด rate limit.

### Open questions (Controller / developer)

1. **ปุ่มเรียกกลับหลังกด "ปิด":** ค่าเริ่มต้นที่ผมออกแบบคือขึ้นด้วย (กดพลาดแล้วเอากลับได้ในแตะเดียว). ผลต่างจากข้อความ "ขึ้นเฉพาะตอนซ่อน" ไม่มี เพราะ "ปิด" ก็คือซ่อน. ถ้าต้องการแคบกว่านั้น (เฉพาะซ่อนเพราะพิมพ์) แก้ที่เงื่อนไข `dismissedAnchorId` ในฟังก์ชัน view จุดเดียว.
2. **แผงกลับมาเองเมื่อช่องว่าง:** ตาม decision 3. ขอให้ Controller ยืนยันกับ user ว่าตกลงตามนี้หรือเอาตามแผนภาพเป๊ะ.
3. **สร้างใหม่ล้มแล้วแสดง toast:** ขัดกับ "ทิ้งเงียบ" ถ้ามองแบบกว้าง แต่ผมจำกัดเฉพาะกรณีผู้ใช้กดเอง. กรณีอัตโนมัติยังเงียบ.
4. **ไฟล์แยก `AiSuggestInline.tsx`:** พรอมต์เขียนว่าปรับ `AiSuggestPanel.tsx`. ถ้า Controller ต้องการไฟล์เดียวจริง ๆ ต้องแตก component ภายในไฟล์เป็นสองตัว ห้าม branch ก่อน hook.
5. **ปุ่ม ✦ ยังเป็นเขียว (pre-existing):** เสนอให้ `/impeccable critique` ดู. ถ้าจะแก้ ควรเป็นรอบแยก เพราะแตะทั้งโหมด Gemini.
6. **เมนูไม่ถูกใจมีช่องพิมพ์ + iOS:** overlay แบบ fixed ไม่หดตามคีย์บอร์ด (memory `ios_fixed_overlay_visual_viewport`) และเมนูอยู่ใกล้ล่างจอ. QA บนเครื่อง iOS จริงที่ 390px, ถ้าช่องถูกคีย์บอร์ดบัง ให้ตัดช่องข้อความอิสระออกจากมือถือก่อน (เหตุผล 4 ข้อยังครบ).
7. **Preline mount ทีหลัง:** `src/utils/preline.ts` re-init ด้วย MutationObserver debounce 400ms. ผมกันไว้โดยให้ dropdown mount ตั้งแต่สถานะกำลังคิด แต่กรณีเปิดห้องที่มีผลอยู่แล้ว (mount ตรง S2) ต้องทดสอบว่าแตะ 👎 ใน 1 วินาทีแรกแล้วเมนูเปิด. ถ้าไม่เปิด `onClick` ยังบันทึก `DOWN` ได้อยู่ (ข้อมูลไม่หาย).
8. **การค้นพบว่าแถวข้อความกดได้:** ไม่มีกรอบ จึงพึ่ง hover บน desktop และ `title` เท่านั้น. มือถือไม่มีตัวบอก. ถ้าทดสอบกับผู้ใช้แล้วหาไม่เจอ ให้เพิ่มคำใบ้ครั้งแรกค่อยคุย ไม่ใส่ล่วงหน้า.
9. **`resolveSuggestProvider` เป็น server-only:** ให้ `page.tsx` (RSC) เรียกแล้วส่งแค่ค่า `'auto' | 'manual'` ลง `ChatThread` ห้ามส่งผ่านฟังก์ชันหรืออ็อบเจ็กต์.
10. **ตัวเลข `12/120`:** ถ้าอยากตัดตัวนับออกให้ง่ายขึ้นก็ได้ (`maxLength` อย่างเดียว) แต่จะเป็นการตัดการพิมพ์แบบเงียบ.

### Anti-slop self-check

1. **เฉพาะ Deep ไหม:** ใช่. ผูกกับศัพท์ "ลูกค้า/แอดมิน/ห้อง", กลไก anchor (ข้อความลูกค้าล่าสุด) ที่ทำให้ผลเก่าถูกทิ้ง, ปุ่มเรียกกลับที่ใช้ช่อง ✦ เดิมของแถวเครื่องมือ, ต่อท้ายข้อความด้วยตรรกะเดียวกับข้อความสำเร็จรูป, และคำใบ้ห้ามใส่เบอร์/ที่อยู่ลูกค้า (ผูกกับข้อกำหนดเรื่อง PII ของ Typhoon). ใช้กับผลิตภัณฑ์อื่นไม่ได้โดยไม่แก้.
2. **พระเอกต่อหน้าจอ:** ข้อความคำแนะนำ (ink เข้ม, ตัวอักษรใหญ่สุดในแผง, แถวกดได้เต็มความกว้าง). ปุ่มและป้ายเป็นชั้นรองชัดเจน.
3. **ของที่ตัดทิ้ง:** ตัดชิป token/USD, ป้ายโควตา, disclaimer ท้ายแผง, ปุ่มแก้, แถบพื้นเขียว, ขอบ/เส้นประ. ไม่มีตัวเลขหรือการ์ดที่ค่าคงที่/ซ้ำ.
4. **ครบทุก state:** ไม่มี, กำลังคิด, มีคำแนะนำ, เมนูไม่ถูกใจ, ซ่อนเพราะพิมพ์/ปิด + เรียกกลับ, สร้างใหม่ล้ม, ข้อความยาว, `composerDisabled`, panel อื่นเปิดอยู่, ห้อง handoff, ความเห็นบันทึกล้ม. ตัวเลข 0/ล้านไม่เกี่ยว (ไม่มีตัวเลขในแผง). ยังไม่มีเคส "ข้อความภาษาอังกฤษล้วนในร้านที่สลับ EN" ที่ผมไม่ได้ตรวจความกว้างจริง: ป้าย EN ยาวกว่าไทยเล็กน้อย แต่เหลือที่ในแถว 358px.
5. **Copy ซื่อตรง:** ปุ่มบอกผลลัพธ์ ("ส่งความเห็น", "สร้างคำตอบใหม่"). ไม่มีข้อความแนะนำให้ทำสิ่งที่ปุ่มไม่มี (เช่น ไม่บอก "แก้ไขคำแนะนำ" ในเมื่อไม่มีปุ่มแก้ ให้แก้ในช่องพิมพ์ ซึ่งป้าย sr-only บอกชัด "ใส่ในช่องพิมพ์").
6. **ศัพท์เดียวกัน:** "คำตอบแนะนำ" = ข้อความร่างจาก AI (ตรงกับ "คำแนะนำ" ในเอกสารส่วนขยาย), "ช่องพิมพ์" = textarea composer (ตรง placeholder `composerPlaceholder`), "สร้างใหม่" = attempt+1 เสมอ.
7. **สี:** ไม่มีเขียวในแผง (ยังไม่ยืนยัน). ไม่มีแดง (ไม่ถูกใจไม่ใช่ความล้มเหลวของระบบ). ถูกใจ/ไม่ถูกใจที่เลือกแล้วเป็น primary ทั้งคู่ (สถานะเดียวกัน สีเดียวกัน). warning เฉพาะ toast ตอนสร้างใหม่ล้ม.
8. **มือถือ:** ปุ่มทุกตัว `size-11` (44px), แถวข้อความและแถวเมนู `min-h-11`, ปุ่มส่งความเห็น `min-h-11`. action หลัก (กดแถวข้อความ) อยู่ในโซนล่างของจอเหนือช่องพิมพ์ ไม่ลอยบนสุด. ยังมีความเสี่ยงเรื่องคีย์บอร์ด iOS (Open question 6).
9. **จอ 1440:** แผงกว้างเท่าคอลัมน์ composer ที่มีเนื้อหาอยู่แล้ว ไม่มีคอลัมน์ว่าง. ความสูงแผงเมื่อ "ไม่มี" = 0 จึงไม่กินที่ในกรณีที่ไม่มีอะไรให้แสดง.

**Theme Source:** `theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx` (เมนู), `.../ui/placeholders/page.tsx` (skeleton), `.../ui/buttons/page.tsx` (btn-icon), `.../form/elements/components/InputTextfieldType.tsx` (form-input)
**ป้ายถัดไป:** `stage:build`

ไฟล์ที่อ้างถึง (absolute):

- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/AiSuggestPanel.tsx` (ไม่แตะ)
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx` (จุด mount `:3222`, ปุ่ม `:3413`, onChange `:3661`)
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/BotPausedBanner.tsx` (คำตอบ OQ-13)
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx` (ส่ง `aiSuggestMode`, `:734`)
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/i18n/dictionaries/th.ts` และ `en.ts` (เพิ่ม key)
