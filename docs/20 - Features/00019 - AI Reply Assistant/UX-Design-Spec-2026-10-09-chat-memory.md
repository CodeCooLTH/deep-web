# UX Design Spec — 00019-ext-mem ความจำของแชท + สินค้าที่สนใจ

> ผลิตโดย safepay-ux 2026-10-09 (HR8) · **มติ Controller ต่อ Open questions:** (1) รับ object `ai:{provider,writes,readsMemory,readsProducts,updating,noteReadByAi}` + `memory.previousText` ใน GET (2) client ส่ง `selections:{key,value}[]` server ประกอบ `optionLabel` รูปแบบ "สี ครีม · ขนาด L" (3) ย้ายตัวแยกค่า attributes ไป `src/lib/product-attributes.ts` ใช้ร่วม + ยืนยัน `/api/products` ส่ง attributes (4) ทำ `MEMORY_POKE_EVENT` (5) ไม่มี undo ของ ✕ (6) ดินสอไอคอนล้วนตาม ref (7) `pii-redact.ts` ไม่มี server-only → เตือนสดฝั่ง client ได้ (8) ไม่มีป้ายใช้ร่วมต่อแถวสินค้า (9) เขียวของ AiSuggestPanel = งานแยก ไม่ทำรอบนี้

## หน้า: ความจำของแชท + สินค้าที่สนใจ (แผงขวาห้องแชท `/inbox/[conversationId]`, แท็บ "ข้อมูล")

อ่านครบตามลำดับ: PRODUCT.md, DESIGN.md, `.impeccable/design.json`, playbook Impeccable ที่ `~/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/reference/` (shape, operate, craft-floor, clarify), frontend-design, `docs/system/ui-guideline/README.md` และ `seller/page-sourcing.md`

เส้นทาง playbook ใน prompt (`~/.claude/skills/impeccable/`) ไม่มีอยู่จริง ผมอ่านจาก plugin cache แทน ส่วน `.claude/skills/frontend-design/SKILL.md` ไม่มีใน repo ผมอ่านจาก `~/.claude/skills/frontend-design/SKILL.md`

Mode: Operate (เหตุผลอยู่ในหัวข้อ Impeccable compliance)

### User stories ที่ครอบ
US-MEM-01..05 จากสเปก

- 01/02: เห็นและแก้ความจำ
- 03: แปะสินค้าพร้อมตัวเลือก แล้วกดส่งการ์ด
- 04: ความจำใช้ร่วมข้ามห้อง
- 05: ไม่มีเบอร์/ที่อยู่ในความจำ (UI ช่วยเตือน)

US-MEM-06 เป็นเรื่อง pacing ฝั่ง server ไม่มี UI

### ข้อค้นพบจากโค้ดจริงที่ทำให้ตำแหน่งเปลี่ยนจากที่สเปกเดา

1. **แผงขวา = `CustomerPanelBody` ตัวเดียวสองร่าง**
   - desktop ≥1280px เป็นคอลัมน์ `w-96` (`page.tsx:794`)
   - <1280px เป็น `CustomerPanelSheet` (bottom-sheet)
   - ผมออกแบบ body ตัวเดียวจึงได้ทั้งมือถือและ desktop
2. **แท็บ default = "ข้อมูล"** (`CustomerPanel.tsx:785`) ทั้งสองร่างเปิดมาที่แท็บนี้ ความจำจึงควรอยู่บนสุดของแท็บนี้
   - ไม่วางเหนือแถบแท็บ เพราะความจำยาวได้ถึง 800 ตัวอักษร จะกินที่แท็บ "คำสั่งซื้อ/ไฟล์/โน้ต/ติดตาม" ตลอดเวลา
3. **ช่องโน้ตเดิมใช้ `form-input min-h-32` ทำ textarea** (`CustomerCrmSection.tsx:254`)
   - มีเทสยืนยันแล้วว่า `form-input` ทับ `rows` เพราะ `_forms.css` ไม่ห่อ `@layer` (`appointment-message.test.ts:148`)
   - ช่องความจำต้องใช้ `form-textarea` ห้ามลอกจากช่องโน้ต
4. **`CustomerPanel.tsx:1072` เป็นคอมเมนต์โค้ด ไม่ใช่ข้อความบนจอ** ข้อความที่ผู้ใช้เห็นมี 2 จุดคือ `CustomerCrmSection.tsx:194` และ `:255`
5. **`ProductPickerPanel` ไม่ใช้ `useT` เลย** และ `PickerProduct` ยังไม่มีฟิลด์ `attributes` (`:48-60`)
6. **Escape ชนกัน** ถ้าเอา picker ไปวางใน sheet
   - sheet ฟัง Escape ที่ `document` (`CustomerPanelSheet.tsx:44-50`)
   - picker ก็ฟัง Escape ที่ `document` (`ProductPickerPanel.tsx:149-159`)
   - กด Esc ทีเดียวจะถอยหนึ่งขั้นและปิด sheet พร้อมกัน ต้องแก้ตามหัวข้อ "ProductPickerPanel"
7. **สีเขียวของ AI**: `AiSuggestPanel` ใช้ accent `success` (เขียว) แทน AI ซึ่งขัด Verified-Means-Green อยู่แล้ว (ดูหัวข้อ "จุดที่ theme ขัด")
   - บล็อกใหม่นี้ไม่ใช้เขียวกับ AI

### การตัดสินใจหลัก

| เรื่อง | ตัดสิน |
|---|---|
| ตำแหน่ง | บนสุดของแท็บ "ข้อมูล" เรียง ความจำ, สินค้าที่สนใจ, เส้นประ, CRM เดิม ไม่เพิ่มแท็บ ไม่แตะแถบแท็บ |
| ตัวเอก | **ย่อหน้าความจำ** (กล่องพื้น `bg-default-100` ข้อความ `text-sm text-default-900`) สินค้าที่สนใจเป็นรายการเรียบ ไม่มีกล่อง |
| ปุ่มแก้ | ไอคอนดินสอล้วนตาม ref (`title` + `aria-label` ครบ) ปุ่มที่มีข้อความ "แก้ไข" เหลืออันเดียวคือของ CRM เดิม |
| (i) | กางข้อความ inline ใต้หัวข้อ (`aria-expanded`) ไม่ใช้ tooltip เพราะมือถือไม่มี hover |
| 409 | callout inline ไม่ใช้ Swal textarea ยังแก้ได้ต่อ จึงรวมร่างเองแล้วกด "บันทึกทับ" ได้ |
| ยกเลิกตอนมี draft | ไม่ถาม ตาม `CustomerCrmSection` (sibling-surface-parity) |
| ✕ ลบสินค้า | ไม่ถาม ทำซ้ำได้ใน 1 ขั้น ตาม `seller-action-placement.md` §3.1 |
| picker โหมด "แปะ" | **mount ในแผงขวาเอง (inline)** ไม่ไปเปิดที่เธรด เพราะ (ก) บนมือถือไม่ต้องปิด sheet แล้วเดินกลับมา (ข) ไม่ต้องมี event ข้ามคอมโพเนนต์สำหรับโหมดนี้ |
| กดแถวสินค้า = ส่งการ์ด | ต้องไปเปิดถาด **ในเธรด** (ChatThread เป็นเจ้าของ `sendProductCards`) ผ่าน event เดียว |
| Swal | ไม่มี blocking dialog ในงานนี้ (เหตุผลในตาราง mapping) |

### Layout (ASCII wireframe)

**หมายเหตุ**
- ทุกรูปคือ "คอลัมน์เนื้อหาของแท็บ ข้อมูล" กว้างจริง 352px (desktop `w-96` หัก `p-4`) และ ~358px (มือถือ 390 ใน sheet)
- ทั้งสองร่างใช้โค้ดเดียวกัน จุดต่างระบุใต้รูป
- `[icon:xxx]` = ไอคอน tabler ชื่อนั้น (ไม่ใช่ emoji)

**W1 มุมมองปกติ ร้าน Typhoon มีความจำ + สินค้า 2 รายการ**

```
 [icon:brain] ความจำของแชทนี้ [i]            [pencil]   <- แถวหัว: ไอคอน+ชื่อ+(i)  ดินสอชิดขวา
 ┌────────────────────────────────────────┐
 │ ใส่ไซส์ L (อก 36) ชอบสีครีม ส่งที่เขต   │  bg-default-100 rounded-lg px-3 py-2.5
 │ บางขุนเทียน กทม. ถามเรื่องผ้าบ่อย       │  text-sm text-default-900 (ตัวเอก)
 └────────────────────────────────────────┘
 [icon:sparkles] AI อัปเดต · 3 นาทีที่แล้ว  [icon:refresh] อัปเดตตอนนี้
                                                          <- text-xs text-default-700

 สินค้าที่สนใจ  2/10                    [+ เพิ่ม]          <- ห่างจากบล็อกบน gap-5
 ┌─[รูป 40]─ D21 เสื้อเชิ้ตลินิน ──────────[x]
 │           สีครีม · L
 ├─[รูป 40]─ กางเกงขายาวเอวยางยืด ─────────[x]
 │           ปิดขายแล้ว · ส่งการ์ดไม่ได้
 แตะสินค้าเพื่อเลือกส่งการ์ดในแชท                           <- text-xs text-default-700
 - - - - - - - - - - - - - - - - - - - - - - - -           <- border-t border-dashed pt-4
 (CRM เดิม: [✎ แก้ไข] ชื่อจริง สถานะการขาย แท็ก ...)
```

ลำดับน้ำหนัก: ย่อหน้าความจำ (กล่องพื้น) เด่นสุด, หัวข้อ `text-sm font-semibold` ทั้งสองหัว, meta และ hint เป็น `text-xs text-default-700`

**W2 ห้องที่ใช้ความจำร่วม (cluster)**

```
 [icon:brain] ความจำของแชทนี้ [i]            [pencil]
 ┌────────────────────────────────────────┐
 │ ...ข้อความ...                            │
 └────────────────────────────────────────┘
 [icon:users] ใช้ร่วมกับห้องอื่นของลูกค้าคนนี้   <- badge bg-info/15 text-info-ink text-xs
 [icon:sparkles] AI อัปเดต · เมื่อวาน
```

**W3 ความจำยาว (>280 ตัวอักษร) ย่อ 6 บรรทัด**

```
 │ ...6 บรรทัด... (line-clamp-6)            │
 └────────────────────────────────────────┘
 ดูทั้งหมด                                      <- text-primary text-xs min-h-11 กด = กางเต็ม / "ย่อ"
```

**W4 ว่าง**

ร้าน Typhoon:
```
 [icon:brain] ความจำของแชทนี้ [i]
 ยังไม่มีความจำ — AI จะจดให้เมื่อคุยกันไปสักพัก
 หรือพิมพ์เองก็ได้
 [+ เพิ่มความจำ]                                 <- text-primary text-xs min-h-11 (ปุ่มมีข้อความ เพราะนี่คือ action เดียว)
```
ร้าน Gemini ใช้ข้อความ `emptyManual` และไม่มีแถว sparkles/อัปเดตตอนนี้

**W5 กำลังโหลด / โหลดไม่สำเร็จ** (แบบเดียวกับ `crmSlot`, `CustomerPanel.tsx:837-847`)

```
 [icon:brain] ความจำของแชทนี้                    <- หัวแสดงทันที ไม่กระพริบ
 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ h-24 animate-pulse rounded-lg
   role=status aria-label="กำลังโหลดความจำ"

 [icon:brain] ความจำของแชทนี้
 โหลดความจำไม่สำเร็จ        [icon:refresh] ลองใหม่   <- btn border-default-300 min-h-11
```
ส่วนสินค้าไม่ render ระหว่างโหลดหรือ error (GET เป็นก้อนเดียว) CRM ด้านล่างไม่ถูกกระทบ

**W6 AI กำลังอัปเดต**

```
 │ ใส่ไซส์ L ...                            │
 [icon:loader-2 animate-spin] AI กำลังอัปเดตความจำ…
    └ <span role="status" aria-live="polite"> แทนแถว "AI อัปเดต ·"
```
เมื่อเสร็จ ข้อความในกล่องเปลี่ยนเงียบ ๆ ไม่มีอนิเมชัน มี `sr-only` role=status ประกาศ "ความจำถูกอัปเดตแล้ว"

**W7 โหมดแก้ไข**

```
 [icon:brain] ความจำของแชทนี้                    <- ไม่มี (i) / ดินสอระหว่างแก้ (โหมดสื่อผ่านปุ่ม ตามคอมเมนต์ CRM :249)
 การแก้ไขมีผลกับทุกห้องของลูกค้าคนนี้            <- เฉพาะตอน shared  text-xs
 ┌────────────────────────────────────────┐
 │ ใส่ไซส์ L (อก 36) ชอบสีครีม ...          │  <textarea class="form-textarea" rows=6 maxLength=800>
 └────────────────────────────────────────┘
 [icon:history] ใช้ข้อความก่อนหน้า       123/800   <- ซ้าย: ปุ่มข้อความ (เฉพาะมี previousText)  ขวา: ตัวนับ
 ┌ [icon:alert-triangle] ดูเหมือนมีเบอร์โทรหรือที่อยู่ ... ┐ <- เฉพาะตรวจเจอ bg-warning/15 text-warning-ink
 [icon:loader-2] AI กำลังอัปเดตอยู่ ถ้าคุณบันทึกก่อน    <- เฉพาะ ai.updating  text-xs
   ฉบับของคุณจะถูกใช้
 [✓ บันทึก]  [ยกเลิก]                            <- btn bg-primary text-white min-h-11 / btn border-default-300 min-h-11
```
ตัวนับ: `text-default-700` ปกติ, `text-warning-ink` เมื่อ ≥760, ที่ 800 เปลี่ยนข้อความเป็น "ครบ 800 ตัวอักษรแล้ว"

**W8 409 ชนกัน** (draft ค้างอยู่ใน textarea เสมอ)

```
 [icon:alert-triangle] ความจำถูกอัปเดตไปแล้ว          <- callout bg-warning/15 text-warning-ink role="alert"
   AI อัปเดตเมื่อ 2 นาทีที่แล้ว                       |  หรือ "ทีมร้านบันทึกเมื่อ ..."
 ฉบับล่าสุด                                       <- form-label
 ┌ (อ่านอย่างเดียว bg-default-100 text-sm) ──┐
 └───────────────────────────────────────────┘
 ที่คุณพิมพ์ (ยังอยู่ แก้ต่อได้)
 ┌ <textarea class="form-textarea"> ─────────┐
 └───────────────────────────────────────────┘
 [ใช้ฉบับล่าสุด]            ข้อความที่คุณพิมพ์จะถูกทิ้ง     <- btn border-default-300 min-h-11 + hint text-xs
 [บันทึกทับด้วยของฉัน]      ฉบับล่าสุดจะถูกแทนที่            <- btn border-default-300 min-h-11 + hint
 ยกเลิกการแก้                                      <- ปุ่มข้อความ
```
- ไม่มีปุ่ม primary ในสถานะนี้ เพราะทั้งสองทางเสียของบางอย่าง ใช้คำบอกผลแทนสี
- มือถือ: ปุ่มเรียงเต็มกว้างทีละปุ่ม hint อยู่ใต้ปุ่มของมัน

**W9 กาง (i)** (ร้าน Typhoon)

```
 [icon:brain] ความจำของแชทนี้ [i]*           [pencil]
 ┌ bg-info/5 rounded-lg px-3 py-2 text-xs text-default-800 ─┐
 │ สรุปสั้น ๆ เกี่ยวกับลูกค้าคนนี้ เช่น ไซส์ สี ความชอบ         │
 │ AI อ่านก่อนช่วยร่างคำตอบทุกครั้ง และอัปเดตให้เมื่อคุยกัน     │
 │ ไปสักพัก ลูกค้าไม่เห็น                                      │
 │ ใช้ร่วมกันทุกห้องของลูกค้าคนเดียวกัน คุณแก้ได้ทุกเมื่อ       │
 │ AI จะต่อจากข้อความที่คุณแก้                                 │
 │ อย่าใส่เบอร์ ที่อยู่ เลขบัญชี — เก็บไว้ที่แท็บ “ข้อมูล”      │
 │ สินค้าที่สนใจ: AI เห็นชื่อ ตัวเลือก และราคา แต่ตัวเลือก     │
 │ ไม่ได้ยืนยันว่ามีของ                                       │
 └────────────────────────────────────────────────────────┘
```
ร้าน Gemini/none: บรรทัด 2 กับ 3 ใช้ `infoManual*` ("ความจำนี้พิมพ์เองเท่านั้น AI ไม่เขียนให้")

ถ้า `ai.readsMemory=false` (ร้านปิดการส่งข้อมูลลูกค้าให้ AI) ใต้กล่องความจำแสดง 1 บรรทัด `text-xs text-default-700` "ร้านนี้ปิดการส่งข้อมูลลูกค้าให้ AI ไว้ ความจำจึงยังไม่ถูกนำไปใช้" พร้อมลิงก์ "ตั้งค่า AI" ไป `/settings/ai`

**W10 สินค้า ทุกสถานะ**

```
 สินค้าที่สนใจ                          [+ เพิ่ม]   <- ว่าง: ไม่มีตัวเลข
 ยังไม่ได้แปะสินค้า — แปะสินค้าที่ลูกค้าสนใจ
 เพื่อให้ AI และทีมร้านเห็นตรงกัน

 สินค้าที่สนใจ  10/10                  [+ เพิ่ม]   <- ปุ่ม disabled (aria-disabled, opacity-50)
 ครบ 10 รายการแล้ว เอารายการเก่าออกก่อนจึงจะเพิ่มได้

 แถว ACTIVE    [รูป] D21 เสื้อเชิ้ต / สีครีม · L                       [x]
 แถว INACTIVE  [รูป] ชื่อ (text-default-700)
                     สีครีม · L  [ปิดขายแล้ว]  ส่งการ์ดไม่ได้          [x]
                     (badge bg-warning/15 text-warning-ink)
 แถว DELETED   [ไอคอน package] ชื่อ snapshot (text-default-700)
                     [สินค้าถูกลบแล้ว]  ส่งการ์ดไม่ได้                  [x]
                     (badge bg-default-100 text-default-700)
 ชื่อยาว       ชื่อสินค้ายาวมากมายมหาศาลจนต้อง…                         [x]   <- min-w-0 flex-1 truncate
```
- ร้านไม่มีสินค้าเลย (`canUseProducts=false` และไม่มีแถวค้าง): ซ่อนทั้งส่วน
- มีแถวค้างแต่ `canUseProducts=false`: แสดงรายการ ซ่อนปุ่ม + (เหลือแต่ลบได้)

**W11 picker โหมด "แปะ" (inline ในแผงขวา)**

ขั้น 1 เลือกสินค้า:
```
 สินค้าที่สนใจ  2/10                    [+ เพิ่ม]  (ปุ่มกลายเป็น "ปิด" [x] ระหว่างเปิด)
 ┌ bg-info/5 rounded-lg px-3 py-2 ─────────────────────┐
 │ [icon:package] แปะสินค้าที่สนใจ                  [x] │
 │ [icon:search] ค้นหาสินค้า                            │
 │ ┌────┐ ┌────┐ ┌────┐ →  (สไลด์เดิม w-28 ติ๊กได้)      │
 │ │รูป✓│ │รูป │ │รูป │                                  │
 │ │ชื่อ│ │ชื่อ│ │ชื่อ│                                  │
 │ │฿450│ │฿390│ │฿590│                                  │
 │ └────┘ └────┘ └────┘                                 │
 │ เลือกแล้ว 1 · เลือกได้อีก 7 รายการ     ล้างทั้งหมด     │
 │ [  ต่อไป: เลือกตัวเลือก  ]   <- ถ้ามีสินค้าที่ติ๊กและมี attributes
 │ [  แปะ 1 รายการ  ]          <- ถ้าไม่มี attributes เลย
 └──────────────────────────────────────────────────────┘
```
ขั้น 2 เลือกตัวเลือก (หน้านี้แทนสไลด์ มีลูกศรย้อนเหมือนหน้า `selected` เดิม):
```
 │ [←] ตัวเลือกของสินค้า                            [x] │
 │ ไม่เลือกก็ได้ แต่ละหัวข้อเลือกได้ 1 ค่า                │
 │ D21 เสื้อเชิ้ตลินิน                                   │
 │   สี     [ครีม✓] [ดำ]                                 │  chip min-h-11 (aria-pressed)
 │   ขนาด   [M] [L✓] [XL]                                │
 │ อีก 2 รายการไม่มีตัวเลือก                              │
 │ [  แปะ 3 รายการ  ]                                    │
```
chip เลือกแล้ว `bg-info/15 text-info-ink ring-1 ring-info-ink` ตามธีมสีของถาดเดิม (ไม่ใช่ primary) กดซ้ำ = ยกเลิกการเลือก

**W12 มือถือ: กดแถวสินค้า (FR-MEM-18)**

```
 [ชีต "ข้อมูลลูกค้า" เปิดอยู่]  --แตะแถว D21-->  ชีตปิด
                                                  ↓
 [เธรดแชท]
   ...ข้อความ...
   ┌ ถาดเลือกสินค้า (ProductPickerPanel โหมดส่ง เดิม) ┐
   │ [icon:package] เลือกสินค้า   ☑ เลือกหลายรายการ [x] │
   │ [รูป✓ D21 ...] ...                                 │
   │ [ ส่งการ์ดสินค้า 1 รายการ ]  <- ยังไม่ส่งจนกว่าจะกด  │
   └────────────────────────────────────────────────────┘
```
desktop ≥1280: แผงขวาไม่ปิด ถาดเปิดในเธรดข้าง ๆ

### Section breakdown (prose)

- **A. ความจำ (`ChatMemorySection`)**
  - 4 โหมด: ดู, แก้, ชนกัน, ว่าง
  - ใต้กล่องมีบรรทัด meta เดียว บอกว่าใครเขียน เมื่อไร และเป็นความจำร่วมหรือไม่ จำเป็นเพราะสถานะอย่าง "รอโอนเงิน" ล้าสมัยได้ (R-M7) ผู้ขายต้องรู้ว่าข้อความนี้เก่าแค่ไหน
  - ปุ่ม "อัปเดตตอนนี้" แสดงเฉพาะ `ai.writes=true` (ร้าน Typhoon) ส่วนร้าน Gemini ไม่มีปุ่มนี้ ไม่มีแถว AI และไม่มีข้อความที่บอกว่า AI จะจดให้
- **B. สินค้าที่สนใจ (`InterestedProductsSection`)**
  - แถวเรียบ ไม่มีกล่อง ไม่มีการ์ดซ้อน ใช้ `divide-y` เบา ๆ
  - ส่วนที่ผู้ขายกดบ่อยคือส่วนซ้ายของแถว (รูป+ชื่อ+ตัวเลือก) เป็นปุ่มเดียว กว้างเต็มแถวสูง ≥44px ✕ แยกเป็นปุ่มของตัวเอง 44px
- **C. picker โหมด "แปะ"**: เพิ่มโหมดให้ `ProductPickerPanel` ตามหัวข้อ props
- **D. คำใต้โน้ต CRM**: สองจุดใน `CustomerCrmSection` เปลี่ยนตาม `ai.noteReadByAi` (ดูหัวข้อ Content outline)

### Theme Source Mapping  ← prerequisite ของ developer

Theme Source (หลัก): `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx:87-93` สำหรับ textarea และ `theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx:48` สำหรับ callout

| Section | Theme file / sibling ในโปรเจกต์ที่ copy | Component / บรรทัด | หมายเหตุ adapt |
|---|---|---|---|
| จุดแทรกในแท็บ "ข้อมูล" | `CustomerPanel.tsx:970-977` | แทรก `<ChatMemorySection/>` + `<InterestedProductsSection/>` ก่อน `{crmSlot('profile')}` (:977) แล้วคั่นด้วย `border-t border-dashed border-default-300 pt-4` | wrapper `space-y-4` เดิม แต่ระหว่างสองบล็อกใหม่ใช้ `space-y-5` ที่ห่อกันเอง ของคนละเรื่องห่างกว่าของเรื่องเดียวกัน |
| หัวข้อ section | `CustomerPanel.tsx:1091` | `text-default-900 mb-0 text-sm font-semibold` | ใช้เหมือนหัว "รายการคำสั่งซื้อ" (parity) ไอคอนนำหน้า `text-default-700 text-base` |
| ปุ่มดินสอ/ปุ่มข้อความสีหลัก | `CustomerCrmSection.tsx:64-74` (`EditButton`) | `text-primary hover:bg-primary/10 rounded-lg min-h-11` | ดินสอล้วน: `size-11 flex items-center justify-center -me-2` + `title`/`aria-label` ต้อง export `EditButton` หรือคัดลอกคลาสนี้ |
| textarea + label + ตัวนับ | theme `InputTextfieldType.tsx:87-93` (`form-label` + `form-textarea rows`) | | 🛑 ต้อง `form-textarea` ไม่ใช่ `form-input` (`_forms.css:33`; เทส `appointment-message.test.ts:148`) `maxLength={800}` ตัวนับ `text-xs` ผูก `aria-describedby` |
| ปุ่มบันทึก/ยกเลิก | `CustomerCrmSection.tsx:349-356` | `btn bg-primary text-white hover:bg-primary-hover min-h-11` / `btn border-default-300 min-h-11` | ไอคอน `check` / `loader-2 animate-spin` ตามเดิม |
| skeleton + error/ลองใหม่ | `CustomerPanel.tsx:837-847` | `bg-default-100 h-24 animate-pulse rounded-lg` `role="status"` / `btn border-default-300 min-h-11` | ใช้ h-24 (scale ปกติ) |
| callout (409 / เตือนเบอร์ / ไม่อ่านความจำ) | theme `ui/alerts/page.tsx:48` (`bg-{c}/15 flex rounded px-4 py-3 role="alert"`) + in-repo `ProductPickerPanel.tsx:469-475` | | ตัวอักษรใช้ `text-warning-ink` (ไม่ใช่ `text-warning` ตามธีมดิบ) `px-3 py-2 text-xs` |
| badge "ใช้ร่วม/ปิดขาย/ถูกลบ" | theme `ui/badges/page.tsx` + `paces-component-reference.md` §6 | `badge bg-{c}/15 text-{c}-ink` | ใช้ `info` / `warning` / `default-100` ไม่มีสีเขียว ไม่มีแดง |
| แถวสินค้า | thumb: `ProductPickerPanel.tsx:429` (`ProductThumb`, `src/app/(paces)/seller/(dashboard)/orders/new/components/ProductThumb`) | `size-10 rounded-lg` | `iconClassName="size-5"` ใช้ fallback เมื่อ `imageFileId=null`/ถูกลบ รูปผ่าน `fileUrlOf` |
| ปุ่ม ✕ ลบแถว | `CustomerCrmSection.tsx:299-306` | `flex size-11 items-center justify-center rounded-full hover:bg-default-100` | ไอคอน `x` ใช้ `text-default-700 hover:text-danger` (hover เท่านั้น ตามปุ่ม "ล้างทั้งหมด" `ProductPickerPanel.tsx:482-488`) |
| chip เลือกตัวเลือก | `CustomerCrmSection.tsx:271-286` | `badge inline-flex min-h-11 items-center px-3 text-xs` `role="group"` + `aria-pressed` | ชนิด **ไม่ใช่ select** (ปุ่มสลับ 1 ค่า/หัวข้อ ยกเลิกได้) จึงไม่ต้องใช้ `form-select` หรือ `hs-dropdown` สีเลือกแล้วใช้ `bg-info/15 text-info-ink ring-1 ring-info-ink` ให้เข้าถาด |
| picker | `ProductPickerPanel.tsx` (props :73-82, หัว :226-286, สไลด์ :364-453, แถบส่ง :461-506, Escape :149-159) | เพิ่มโหมด `attach` | ดูหัวข้อ props |
| เปิดถาดจากแถว | `ChatThread.tsx:3351-3370` (`productOpen &&`) + `:2091` `handleProductPick` | รับ event แล้ว `setActivePanel('product')` + preselect | `key` ต้องมี nonce ของ preselect เพื่อ remount |
| ชีตมือถือ | `CustomerPanelSheet.tsx:37-50, 89` | ส่ง `onRequestClose={onClose}` ลง `CustomerPanelBody` | แก้ Escape ตามหัวข้อ props |
| toast | `src/lib/paces-toast.ts:111-115` | `pacesToast.chat.success/error/info/warning` | ใช้ตัวเดียวกับ CRM (bottom-right) |
| Swal / `pacesConfirm` | `plugins/sweet-alerts/components/SweetAlerts.tsx` | **ไม่ใช้ในงานนี้** | ไม่มี blocking dialog ที่จำเป็น (ยกเลิก/ลบ/409 เป็น inline ตาม operate.md "modal as first thought = laziness") ถ้า Controller เปลี่ยนใจให้ยืนยัน ✕ ให้ใช้ `pacesConfirm.danger` ของ `src/lib/paces-swal.ts` เท่านั้น |
| ข้อความ | `src/i18n/dictionaries/th.ts:853-903` และ `en.ts:683` | เพิ่ม `customerPanel.memory`, `customerPanel.interested`, `customerPanel.noteHint*`, `productPicker.attach*` | `useT()` ครบ |
| ลิงก์ "ตั้งค่า AI" | `src/app/(paces)/seller/(dashboard)/settings/ai/page.tsx` | `next/link` href `/settings/ai` (path สั้นไม่มี `/seller`) | |

**Icon (tabler ผ่าน `Icon` wrapper ชื่อเปล่า)** ทั้งหมดมีใน `src/assets/iconify-icons/generated-icons.css` หรือถูกใช้อยู่แล้วใน seller

| ใช้ที่ | icon |
|---|---|
| หัวความจำ | `brain` |
| ปุ่ม (i) | `info-circle` |
| แก้ | `pencil` |
| เพิ่ม | `plus` |
| ลบแถว / ปิด | `x` |
| แถวสินค้าไม่มีรูป / หัว picker | `package` |
| meta AI | `sparkles` |
| อัปเดตตอนนี้ / ลองใหม่ | `refresh` |
| กำลังทำ | `loader-2` |
| เตือน | `alert-triangle` |
| ใช้ร่วม | `users` |
| ข้อความก่อนหน้า | `history` |
| บันทึก | `check` |
| ย้อน | `arrow-left` |

ไม่ใช้ emoji และไม่เพิ่ม icon set

### Props / ไฟล์ใหม่ที่เสนอ

**ไฟล์ใหม่**
- `.../components/ChatMemorySection.tsx`
- `.../components/InterestedProductsSection.tsx`
- `.../components/useChatMemory.ts` (hook ยก state ขึ้น parent เหมือน `crm` เพราะ `CustomerCrmSection` ต้องรู้ `ai.noteReadByAi`)
- `src/lib/chat-memory-events.ts`
- `src/lib/chat-memory-ui.ts` (ตัดสินใจ UI เป็นฟังก์ชันบริสุทธิ์ ตาม convention `ui-boolean-needs-a-testable-home` เทส mutation ทุกฟังก์ชัน)

**`src/lib/chat-memory-events.ts`**
- `PRODUCT_TRAY_OPEN_EVENT = 'deep:product-tray-open'`, detail `{ productId: string }` (precedent `LIBRARY_CHANGED_EVENT`)
- `MEMORY_POKE_EVENT = 'deep:memory-poke'`

**`src/lib/chat-memory-ui.ts`**
- `shouldShowProductsSection({canUseProducts, rowCount})`
- `canAddMoreProducts(rowCount)`
- `productRowView(state)` คืน `{tappable, badge, hint}`
- `shouldClampMemory(text)` (เกณฑ์ตามความยาวตัวอักษร ห้ามวัด DOM เพราะ convention `measurement-must-not-decide-what-it-measures`)
- `memoryMetaKind({source, shared, updating, writes})`
- `noteHintKind(ai)` คืน `'reads' | 'ignores' | 'neutral'`

**ChatMemorySection**

```ts
{ conversationId: string
  state: ReturnType<typeof useChatMemory>   // loading|error|ready + data + reload() + applyMemory()
}
```

**InterestedProductsSection**

```ts
{ conversationId: string
  channel: string                 // ส่งต่อให้ picker
  state: ReturnType<typeof useChatMemory>
  onRequestClose?: () => void     // sheet เท่านั้น: ปิด sheet หลังยิง PRODUCT_TRAY_OPEN_EVENT
}
```

**`useChatMemory(conversationId)`**
- fetch `GET .../memory` ตอน mount, ตอนเปลี่ยนห้อง และตอน `visibilitychange` กลับมา visible
- ถ้า `ai.updating=true` ให้ poll ทุก 3 วินาที สูงสุด 6 ครั้ง
- ฟัง `MEMORY_POKE_EVENT`
- ทั้งสอง section ต้องมี `key={conversationId}` กัน draft ห้องเก่าค้าง ท่าเดียวกับ `FollowUpPanel` (`CustomerPanel.tsx:1049`)

**`CustomerPanelBody`**
- เพิ่ม `onRequestClose?: () => void` (sheet ส่ง `onClose`)
- เรียก `useChatMemory` ที่นี่
- ส่ง `aiReadsNote` ลง `CustomerCrmSection` เพิ่มพร็อพ `aiReadsNote: boolean | null` (null = ยังไม่ทราบ ให้แสดงข้อความเป็นกลางที่ไม่อ้างเรื่อง AI) และ `onGoToMemory: () => void` (สลับไปแท็บ customer แล้ว focus หัวความจำ)
- ฟังก์ชัน `startEdit` ของ CRM ไม่เปลี่ยน

**`ProductPickerPanel` เพิ่มพร็อพแบบ additive (ค่าเริ่มต้น = พฤติกรรมเดิม 100%)**

| prop | ความหมาย |
|---|---|
| `mode?: 'send' \| 'attach'` | default `'send'` |
| `inline?: boolean` | ใช้กับ attach: ถอด wrapper เดิมที่เป็นแถบเต็มกว้าง (`-mx-4 -mt-3 mb-3 border-b border-dashed ...` ที่ `:226`) เปลี่ยนเป็น `bg-info/5 rounded-lg px-3 py-2` |
| `attach?: { remaining: number; onAttach: (picks: {productId: string; selections: Record<string,string>}[]) => Promise<{ok: boolean; saved: number; skipped: number}> }` | ใช้เมื่อ `mode='attach'` |
| `initialSelectedIds?: string[]` | ใช้กับ send: `useState` เริ่มที่ `multi=true` และ `selectedIds=initialSelectedIds` (FR-MEM-18) |

พฤติกรรมของ `mode='attach'`:
- `multi` ล็อกเป็น true และซ่อนสวิตช์ "เลือกหลายรายการ"
- ซ่อนทั้งกลุ่ม ModeButton (`:288-339`) และแถบส่งการ์ดเดิม ใช้แถบ attach แทน
- `maxSelectable = attach.remaining` แทน `maxSelectableProducts(channel)`
- `PickerProduct` เพิ่ม `attributes?: Record<string,string> | null` (`serializeProduct` คืนค่านี้แล้ว `product.service.ts:145`) ต้องยืนยันว่า `GET /api/products` ส่งออกมาด้วย
- แยกค่าด้วยจุลภาคและ trim ต้องใช้ฟังก์ชันเดียวกับเซิร์ฟเวอร์ ปัจจุบันตรรกะอยู่ในฟอร์มสินค้า (`ProductAttributesCardV2.tsx:63`) ให้ย้ายเป็น `src/lib/product-attributes.ts` ใช้ร่วม
- state ใหม่ `step: 'pick' | 'options'` และ `optionPicks: Record<productId, Record<key, value>>`
- Escape: ถอย options, pick, ล้างติ๊ก, ปิด (ลำดับเดียวกับเดิม ไม่มีขั้น "ออกจากโหมดหลายรายการ")
- 🛑 **Escape ต้องไม่ชนกับ sheet**: ใน attach mode ลงทะเบียน `keydown` แบบ `{ capture: true }` และเรียก `e.stopPropagation()` เมื่อ picker เป็นฝ่ายใช้ Esc ส่วนกรณีไม่มีอะไรให้ถอย ปล่อยผ่านให้ sheet ปิดเอง
- สตริงใหม่ทั้งหมดผ่าน `useT()` (ไฟล์นี้ยังไม่เคยใช้ i18n สตริงเก่าไม่ต้องแก้ในรอบนี้)

**`ChatThread.tsx`**
- ฟัง `PRODUCT_TRAY_OPEN_EVENT` แล้ว `setActivePanel('product')` + เก็บ `preselect = {id, nonce}`
- ส่ง `initialSelectedIds` และเปลี่ยน key เป็น `${threadShopIdForPanels}:${nonce}` ที่ `:3359`
- ถ้าถาดเปิดอยู่แล้วและกดแถวอื่น ก็ remount ด้วย nonce ใหม่
- ยิง `MEMORY_POKE_EVENT` เมื่อคำแนะนำอัตโนมัติ READY (ถ้าไม่ทำ บล็อกจะรีเฟรชเฉพาะตอนโฟกัสกลับ/เปลี่ยนห้อง ผลของ AI จะมาช้ากว่าที่ผู้ใช้คาด)

**HR7: รายการคลาสทั้งหมดอยู่ใน Paces scale** ไม่มี arbitrary

- ข้อความ: `text-2xs/xs/sm`
- ขนาด: `size-5/10/11`, `min-h-11`, `h-24`
- ระยะ: `gap-1/1.5/2/2.5/5`, `px-3`, `py-2/2.5`
- อื่น ๆ: `rounded-lg/full`, `line-clamp-6`, `divide-y divide-default-200`, `truncate`, `min-w-0`, `flex-1`, `shrink-0`
- สี: `bg-default-100`, `bg-info/5`, `bg-info/15`, `text-info-ink`, `bg-warning/15`, `text-warning-ink`, `text-primary`, `bg-primary`
- ธีม: `btn`, `badge`, `form-textarea`, `form-label`
- ไม่ต้องมี carve-out

### User flow

1. เปิดห้อง (หรือกดปุ่ม "ข้อมูลลูกค้า" บนมือถือ)
   - แท็บ "ข้อมูล" แสดง skeleton ความจำ ~1 วินาที
   - แล้วเห็นย่อหน้า + meta + สินค้าที่แปะ
2. กดดินสอ
   - กล่องกลายเป็น textarea โฟกัสท้ายข้อความ
   - พิมพ์แล้วเห็นตัวนับ
   - กด "บันทึก" ได้ toast "บันทึกความจำแล้ว"
   - กลับมุมมองปกติและโฟกัสกลับที่ดินสอ
3. พิมพ์เบอร์/ที่อยู่
   - callout เหลืองโผล่ใต้ช่อง (ไม่บล็อก)
   - บันทึกได้ตามปกติ
4. เพื่อนร่วมทีมหรือ AI บันทึกก่อน
   - ตอนกดบันทึกได้ W8
   - เห็นฉบับล่าสุดคู่กับร่างของตัวเอง
   - เลือก "ใช้ฉบับล่าสุด" (ทิ้งร่าง) หรือแก้ร่างต่อแล้ว "บันทึกทับด้วยของฉัน"
   - ถ้ารีเฟรชพบว่ามีฉบับใหม่ระหว่างที่แก้อยู่ ก็ขึ้น W8 ทันที ห้ามเปลี่ยน `expectedVersion` แบบเงียบ เพราะนั่นคือการเขียนทับเงียบที่ AC-MEM-08 ห้าม
5. กด "อัปเดตตอนนี้" (Typhoon)
   - แถว meta กลายเป็น "AI กำลังอัปเดตความจำ…" และปุ่มหาย
   - เสร็จแล้วข้อความเปลี่ยนเอง
   - ถ้าตอบ `NONE` ขึ้น toast info "ยังไม่มีข้อความใหม่ให้สรุป"
   - ถ้า 429 ขึ้น toast "ระบบ AI กำลังคิวแน่น ลองใหม่ในอีกสักครู่"
6. กด "+ เพิ่ม"
   - ขั้น 1 ติ๊กสินค้า (ค้นหาได้)
   - ถ้ามีตัวเลือกกด "ต่อไป" ไปขั้น 2 แล้วเลือกสี/ไซส์ ถ้าไม่มีก็แปะได้เลย
   - กด "แปะ N รายการ" ยิงทีละรายการตามลำดับ
   - สำเร็จ: picker ปิด, รายการอัปเดต, toast "แปะสินค้าแล้ว N รายการ"
   - ซ้ำบางตัว: toast "แปะแล้ว X รายการ · Y รายการมีอยู่แล้ว"
   - ครบ 10 ระหว่างทาง: หยุด toast "ครบ 10 รายการแล้ว แปะเพิ่มไม่ได้"
7. กด ✕ ที่แถว
   - แถวหายทันที (optimistic) + toast "เอา D21 ออกแล้ว"
   - ล้มเหลว: แถวกลับมา + toast error
   - โฟกัสไป ✕ ของแถวถัดไป ถ้าไม่มีแถวแล้วไปที่ปุ่ม "เพิ่ม"
8. แตะแถวที่ ACTIVE
   - ถาดส่งการ์ดในเธรดเปิดพร้อมติ๊กสินค้านั้น
   - มือถือ: sheet ปิดก่อน
   - ยังไม่มีข้อความออกจนกว่าจะกดส่ง
   - แถว INACTIVE/DELETED แตะไม่ทำอะไร (`aria-disabled`) บรรทัดบอกเหตุผลอยู่ในแถวแล้ว
9. แท็บ "โน้ต" (ร้าน Typhoon)
   - ใต้โน้ตมีข้อความบอกว่า AI ไม่อ่าน พร้อมลิงก์ “ความจำของแชทนี้” กดแล้วสลับไปแท็บ "ข้อมูล" และโฟกัสหัวความจำ

### Content outline (ภาษาไทย) + i18n keys TH/EN

เสียงข้อความ: บอกผลลัพธ์/ทางออก ไม่ใช้รูปราชการ ไม่ไฮป์ ไม่ใช้ตัวพิมพ์ใหญ่ ไม่เรียกผู้ใช้ว่า "คุณไม่มีสิทธิ์"

คำศัพท์ที่ล็อกทั้งสเปก:
- "ความจำ" = ย่อหน้าต่อห้อง (ห้ามเรียกว่า "โน้ต")
- "โน้ต" = ช่อง CRM เดิม
- "สินค้าที่สนใจ" = รายการที่แปะ
- "ตัวเลือก" = สี/ไซส์ที่เลือก
- "แท็บ “ข้อมูล”" = ชื่อแท็บ `tabCustomer`

เพิ่มใน `th.ts`/`en.ts` ใต้ `inbox.customerPanel` (ต้องมีครบทั้งสองไฟล์ ไม่งั้น type ของ Dictionary ไม่ผ่าน)

```ts
// ── th.ts ──
memory: {
  title: 'ความจำของแชทนี้',
  infoLabel: 'ความจำของแชทนี้คืออะไร',
  infoAi1: 'สรุปสั้น ๆ เกี่ยวกับลูกค้าคนนี้ เช่น ไซส์ สี ความชอบ',
  infoAi2: 'AI อ่านก่อนช่วยร่างคำตอบทุกครั้ง และอัปเดตให้เมื่อคุยกันไปสักพัก ลูกค้าไม่เห็น',
  infoAi3: 'ใช้ร่วมกันทุกห้องของลูกค้าคนเดียวกัน คุณแก้ได้ทุกเมื่อ AI จะต่อจากข้อความที่คุณแก้',
  infoManual1: 'สิ่งที่อยากให้ AI รู้เกี่ยวกับลูกค้าคนนี้ เช่น ไซส์ สี ความชอบ',
  infoManual2: 'AI อ่านก่อนช่วยร่างคำตอบทุกครั้ง ลูกค้าไม่เห็น ความจำนี้พิมพ์เองเท่านั้น AI ไม่เขียนให้',
  infoManual3: 'ใช้ร่วมกันทุกห้องของลูกค้าคนเดียวกัน',
  infoPii: 'อย่าใส่เบอร์ ที่อยู่ เลขบัญชี — เก็บไว้ที่แท็บ “ข้อมูล”',
  infoProducts: 'สินค้าที่สนใจ: AI เห็นชื่อ ตัวเลือก และราคา แต่ตัวเลือกไม่ได้ยืนยันว่ามีของ',
  notRead: 'ร้านนี้ปิดการส่งข้อมูลลูกค้าให้ AI ไว้ ความจำจึงยังไม่ถูกนำไปใช้',
  notReadLink: 'ตั้งค่า AI',
  edit: 'แก้ความจำ',                // title + aria-label ของดินสอ
  add: 'เพิ่มความจำ',
  emptyAi: 'ยังไม่มีความจำ — AI จะจดให้เมื่อคุยกันไปสักพัก หรือพิมพ์เองก็ได้',
  emptyManual: 'ยังไม่มีความจำ — พิมพ์สิ่งที่อยากให้ AI รู้ เช่น ไซส์ สี ความชอบ',
  metaAi: 'AI อัปเดต · {time}',
  metaAdmin: 'ทีมร้านแก้ · {time}',
  sharedBadge: 'ใช้ร่วมกับห้องอื่นของลูกค้าคนนี้',
  sharedEditNote: 'การแก้ไขมีผลกับทุกห้องของลูกค้าคนนี้',
  more: 'ดูทั้งหมด',
  less: 'ย่อ',
  refresh: 'อัปเดตตอนนี้',
  refreshLabel: 'ให้ AI อัปเดตความจำจากแชทล่าสุด',
  updating: 'AI กำลังอัปเดตความจำ…',
  updatedAnnounce: 'ความจำถูกอัปเดตแล้ว',
  refreshNone: 'ยังไม่มีข้อความใหม่ให้สรุป',
  refreshBusy: 'ระบบ AI กำลังคิวแน่น ลองใหม่ในอีกสักครู่',
  textLabel: 'ความจำของแชทนี้',
  placeholder: 'เช่น ใส่ไซส์ L ชอบสีครีม ส่งที่เขตบางขุนเทียน',
  counter: '{count}/{max}',
  counterFull: 'ครบ {max} ตัวอักษรแล้ว',
  piiHintAi: 'ดูเหมือนมีเบอร์โทรหรือที่อยู่ — เก็บไว้ที่แท็บ “ข้อมูล” ดีกว่า ระบบจะปิดบังก่อนส่งให้ AI และ AI จะไม่อัปเดตความจำนี้ต่อให้',
  piiHintManual: 'ดูเหมือนมีเบอร์โทรหรือที่อยู่ — เก็บไว้ที่แท็บ “ข้อมูล” ดีกว่า ระบบจะปิดบังก่อนส่งให้ AI',
  updatingWhileEditing: 'AI กำลังอัปเดตอยู่ ถ้าคุณบันทึกก่อน ฉบับของคุณจะถูกใช้',
  restorePrev: 'ใช้ข้อความก่อนหน้า',
  restorePrevLabel: 'ใส่ข้อความก่อนหน้าลงในช่อง (ยังไม่บันทึก)',
  save: 'บันทึก',
  cancel: 'ยกเลิก',
  conflictTitle: 'ความจำถูกอัปเดตไปแล้ว',
  conflictByAi: 'AI อัปเดตเมื่อ {time}',
  conflictByAdmin: 'ทีมร้านบันทึกเมื่อ {time}',
  conflictLatest: 'ฉบับล่าสุด',
  conflictYours: 'ที่คุณพิมพ์ (ยังอยู่ แก้ต่อได้)',
  conflictUseLatest: 'ใช้ฉบับล่าสุด',
  conflictUseLatestHint: 'ข้อความที่คุณพิมพ์จะถูกทิ้ง',
  conflictOverwrite: 'บันทึกทับด้วยของฉัน',
  conflictOverwriteHint: 'ฉบับล่าสุดจะถูกแทนที่',
  conflictCancel: 'ยกเลิกการแก้',
  saved: 'บันทึกความจำแล้ว',
  saveError: 'บันทึกความจำไม่สำเร็จ ลองใหม่อีกครั้ง',
  loading: 'กำลังโหลดความจำ',
  loadError: 'โหลดความจำไม่สำเร็จ',
  retry: 'ลองใหม่',
},
interested: {
  title: 'สินค้าที่สนใจ',
  count: '{count}/{max}',
  add: 'เพิ่ม',
  addLabel: 'แปะสินค้าที่ลูกค้าสนใจ',
  full: 'ครบ {max} รายการแล้ว เอารายการเก่าออกก่อนจึงจะเพิ่มได้',
  empty: 'ยังไม่ได้แปะสินค้า — แปะสินค้าที่ลูกค้าสนใจ เพื่อให้ AI และทีมร้านเห็นตรงกัน',
  tapHint: 'แตะสินค้าเพื่อเลือกส่งการ์ดในแชท',
  rowLabel: 'เลือกส่งการ์ด {name}',
  removeLabel: 'เอา {name} ออก',
  inactive: 'ปิดขายแล้ว',
  deleted: 'สินค้าถูกลบแล้ว',
  noSend: 'ส่งการ์ดไม่ได้',
  removed: 'เอา {name} ออกแล้ว',
  removeError: 'เอาออกไม่สำเร็จ ลองใหม่อีกครั้ง',
  attached: 'แปะสินค้าแล้ว {count} รายการ',
  attachedPartial: 'แปะแล้ว {ok} รายการ · {skip} รายการมีอยู่แล้ว',
  attachFull: 'ครบ {max} รายการแล้ว แปะเพิ่มไม่ได้',
  attachError: 'แปะสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง',
},
noteHintReads: 'ลูกค้าไม่เห็นโน้ตนี้ — AI ใช้ประกอบการร่างคำตอบ',          // ร้าน Gemini = ข้อความเดิม
noteHintIgnores: 'ลูกค้าไม่เห็นโน้ตนี้ · AI ไม่อ่านโน้ตนี้ ถ้าอยากให้ AI รู้ ให้ใส่ใน {memory}', // {memory} = ปุ่มลิงก์ ใช้ memory.title
noteHintNeutral: 'ลูกค้าไม่เห็นโน้ตนี้',

// ใต้ inbox.productPicker (ใหม่ ใช้ใน ProductPickerPanel โหมด attach)
attachTitle: 'แปะสินค้าที่สนใจ',
attachSelected: 'เลือกแล้ว {count} · เลือกได้อีก {left} รายการ',
attachNext: 'ต่อไป: เลือกตัวเลือก',
attachCta: 'แปะ {count} รายการ',
attaching: 'กำลังแปะ…',
optionsTitle: 'ตัวเลือกของสินค้า',
optionsHint: 'ไม่เลือกก็ได้ แต่ละหัวข้อเลือกได้ 1 ค่า',
optionsNone: 'อีก {count} รายการไม่มีตัวเลือก',
optionsBack: 'กลับไปเลือกสินค้า',
```

```ts
// ── en.ts (คีย์เดียวกัน) ──
memory: {
  title: 'Chat memory',
  infoLabel: 'What is chat memory?',
  infoAi1: 'A short summary of this customer, such as size, color and preferences.',
  infoAi2: 'The AI reads it before drafting every reply and updates it as you keep chatting. Customers cannot see it.',
  infoAi3: 'Shared across all chats with the same customer. You can edit it any time, and the AI builds on your edits.',
  infoManual1: 'What you want the AI to know about this customer, such as size, color and preferences.',
  infoManual2: 'The AI reads it before drafting every reply. Customers cannot see it. You write it yourself; the AI does not write it for this shop.',
  infoManual3: 'Shared across all chats with the same customer.',
  infoPii: 'Do not add phone numbers, addresses or bank accounts. Keep them in the “Info” tab.',
  infoProducts: 'Products of interest: the AI sees the name, option and price. An option does not confirm the item is in stock.',
  notRead: 'This shop has turned off sharing customer info with the AI, so memory is not used yet.',
  notReadLink: 'AI settings',
  edit: 'Edit memory',
  add: 'Add memory',
  emptyAi: 'No memory yet. The AI will note things as you chat, or you can type your own.',
  emptyManual: 'No memory yet. Type what you want the AI to know, such as size, color and preferences.',
  metaAi: 'Updated by AI · {time}',
  metaAdmin: 'Edited by your team · {time}',
  sharedBadge: 'Shared with other chats of this customer',
  sharedEditNote: 'Edits apply to every chat with this customer.',
  more: 'Show all',
  less: 'Show less',
  refresh: 'Update now',
  refreshLabel: 'Ask the AI to update memory from the latest chat',
  updating: 'AI is updating the memory…',
  updatedAnnounce: 'Memory was updated',
  refreshNone: 'No new messages to summarize.',
  refreshBusy: 'The AI service is busy. Try again in a moment.',
  textLabel: 'Chat memory',
  placeholder: 'e.g. Wears size L, likes cream, ships to Bang Khun Thian',
  counter: '{count}/{max}',
  counterFull: 'Reached {max} characters',
  piiHintAi: 'This looks like a phone number or address. Better to keep it in the “Info” tab. It is masked before going to the AI, and the AI will stop updating this memory.',
  piiHintManual: 'This looks like a phone number or address. Better to keep it in the “Info” tab. It is masked before going to the AI.',
  updatingWhileEditing: 'The AI is updating right now. If you save first, your version is kept.',
  restorePrev: 'Use previous text',
  restorePrevLabel: 'Put the previous text into the field (not saved yet)',
  save: 'Save',
  cancel: 'Cancel',
  conflictTitle: 'The memory was updated meanwhile',
  conflictByAi: 'Updated by AI {time}',
  conflictByAdmin: 'Saved by your team {time}',
  conflictLatest: 'Latest version',
  conflictYours: 'What you typed (still here, keep editing)',
  conflictUseLatest: 'Use latest version',
  conflictUseLatestHint: 'What you typed will be discarded.',
  conflictOverwrite: 'Save mine instead',
  conflictOverwriteHint: 'The latest version will be replaced.',
  conflictCancel: 'Stop editing',
  saved: 'Memory saved',
  saveError: 'Could not save the memory. Try again.',
  loading: 'Loading memory',
  loadError: 'Could not load the memory',
  retry: 'Try again',
},
interested: {
  title: 'Products of interest',
  count: '{count}/{max}',
  add: 'Add',
  addLabel: 'Pin a product the customer is interested in',
  full: '{max} of {max} used. Remove one before adding another.',
  empty: 'No products pinned yet. Pin what the customer is interested in so the AI and your team see the same thing.',
  tapHint: 'Tap a product to pick it for a product card in the chat',
  rowLabel: 'Pick {name} to send as a card',
  removeLabel: 'Remove {name}',
  inactive: 'Not for sale',
  deleted: 'Product deleted',
  noSend: 'Cannot send a card',
  removed: 'Removed {name}',
  removeError: 'Could not remove it. Try again.',
  attached: 'Pinned {count} products',
  attachedPartial: 'Pinned {ok} · {skip} already pinned',
  attachFull: 'Limit of {max} reached. No more can be pinned.',
  attachError: 'Could not pin the products. Try again.',
},
noteHintReads: 'Customers cannot see this note. The AI uses it when drafting replies.',
noteHintIgnores: 'Customers cannot see this note. The AI does not read it. To let the AI know, put it in {memory}.',
noteHintNeutral: 'Customers cannot see this note.',
attachTitle: 'Pin products of interest',
attachSelected: '{count} selected · {left} more allowed',
attachNext: 'Next: choose options',
attachCta: 'Pin {count} products',
attaching: 'Pinning…',
optionsTitle: 'Product options',
optionsHint: 'Optional. Pick one value per group.',
optionsNone: '{count} more have no options',
optionsBack: 'Back to products',
```

- เลข/เวลาใช้ `relativeTimeTh` ตัวเดิม (`src/lib/relative-time-th.ts:5`) ห้ามประกอบวันที่เอง
- `{memory}` ใน `noteHintIgnores`: render โดยแยก string ที่ token ใส่ปุ่มลิงก์ตรงนั้น ห้ามต่อสตริงสามท่อน (ผู้แปลจัดลำดับคำใหม่ไม่ได้)
- ข้อความเดียวกับที่ผู้ใช้สั่ง: "AI ไม่อ่านโน้ตนี้ ถ้าอยากให้ AI รู้ ให้ใส่ใน 'ความจำของแชทนี้'" คงไว้ตรงตัวใน `noteHintIgnores`
- `CustomerCrmSection.tsx:194` และ `:255` เปลี่ยนจากข้อความฮาร์ดโค้ดเป็น `noteHintKind(ai)` เลือกคีย์ `Reads | Ignores | Neutral`
- `CustomerPanel.tsx:1072` แก้คอมเมนต์ "AI ใช้เป็นบริบทตอนช่วยร่าง" ให้ตรงความจริง ไม่ใช่ข้อความบนจอ

**ร้านที่ไม่ใช่ Typhoon (Gemini)**
- โน้ต: ข้อความเดิมทุกตัวอักษร (`noteHintReads`)
- ความจำ: ไม่มี sparkles/อัปเดตตอนนี้/ข้อความว่า AI จะจดให้ ใช้ชุด `infoManual*`, `emptyManual`, `piiHintManual`

### Edge states ที่ต้องออกแบบ

| สถานะ | พฤติกรรม |
|---|---|
| loading | skeleton `h-24` เฉพาะกล่องความจำ หัวข้อโชว์ทันที สินค้ายังไม่ render |
| error | ข้อความ + "ลองใหม่" (`min-h-11`) CRM ไม่ถูกกระทบ |
| ว่าง | W4 มี CTA เดียว ปุ่มเปลี่ยนจากไอคอนเป็นข้อความ "เพิ่มความจำ" |
| ข้อความยาวสุด 800 | `line-clamp-6` + "ดูทั้งหมด" `break-words` กัน URL ยาว ตัวนับเปลี่ยนเป็น "ครบ 800 ตัวอักษรแล้ว" |
| ชื่อสินค้ายาว / ตัวเลือกยาว | ชื่อ `truncate` ใน `min-w-0 flex-1` (`docs/conventions/flex-header-truncation.md`) ตัวเลือก+badge `flex-wrap` ขึ้นบรรทัดล่าง |
| 0 / ครบ 10 | 0 ซ่อนตัวเลข; 10 ปุ่ม disabled + ข้อความอธิบาย (ไม่ซ่อนปุ่มเงียบ ๆ) |
| 409 | W8 ทั้งจากการกดบันทึกและจากรีเฟรชระหว่างแก้ ร่างไม่หาย |
| บันทึกล้มเหลว (เครือข่าย/5xx) | toast error + ยังอยู่โหมดแก้ ร่างอยู่ครบ |
| สินค้า INACTIVE / DELETED | ตาม W10 แตะไม่เปิดถาด (`aria-disabled` + ข้อความเหตุผลในแถว ไม่ใช้ `disabled` ลอย ๆ) |
| ร้านไม่มีสินค้า | ซ่อนส่วนสินค้า ความจำใช้ได้ปกติ (E-M7) |
| ห้อง DEEP | ไม่มี badge "ใช้ร่วม" (cluster = ตัวเอง) ความจำเป็นที่เดียวที่ห้อง DEEP จด เพราะโน้ต CRM ใช้ไม่ได้ ทำให้ข้อความ `externalOnlyNotice` ของ CRM ยังจริงอยู่ |
| ร้านปิดสวิตช์บริบทลูกค้า | แสดงบรรทัด `notRead` + ลิงก์ ไม่โกหกว่า AI ใช้ |
| ไม่มีกุญแจ Typhoon (E-M9) | เหมือน `notRead`: ไม่มี sparkles/อัปเดตตอนนี้ |
| แท็บซ่อน | ทั้งสอง section mount ค้าง (ซ่อนด้วย `hidden` เหมือนแท็บอื่น) draft จึงรอดข้ามแท็บ แต่เปลี่ยนห้อง = key เปลี่ยน = draft ห้องเก่าหาย (ตั้งใจ) |
| iOS | textarea ใน sheet fixed: เรียก `scrollIntoView({block:'center'})` ตอนโฟกัส QA ที่ iOS จริง (ตรงกับกับดักที่บันทึกไว้เรื่อง fixed overlay + คีย์บอร์ด) |
| ไม่มีสิทธิ์/ห้องไม่ใช่ของร้าน (404) | ใช้ `loadError` + ลองใหม่ ไม่มีคำพูดราชการ |

### Impeccable compliance

- **Mode: Operate**
  - เป็นแผงทำงานของผู้ขาย (`(paces)/seller`) ผู้ใช้อยู่กลางงานตอบลูกค้า
  - DESIGN.md/PRODUCT.md ระบุให้ override register เป็น product ฝั่ง seller
  - เกณฑ์คือ scanability, consistency กับพี่น้อง (`CustomerCrmSection`, `ProductPickerPanel`), tap target
  - ไม่มี choreography ตอนโหลด
- **One Voice**
  - accent `text-primary`/`bg-primary` ปรากฏ 3 จุดเท่านั้น: ดินสอ/ปุ่มข้อความ, "บันทึก", "ดูทั้งหมด"
  - ที่เหลือเป็นหมึกเทา (`text-default-*`) และ tint เบา (`bg-info/5` ใน picker ตามธีมเดิม)
  - พื้นที่สี primary ไม่ถึง 2% ของจอ
  - พระเอกของหน้า = ย่อหน้าความจำ ไม่ใช่สี
- **Verified-Means-Green**
  - ไม่มีเขียนเลยในงานนี้
  - "ใช้ร่วม" = info
  - "ปิดขายแล้ว" = warning (ไม่ใช่ความล้มเหลว)
  - "ถูกลบแล้ว" = เทา
  - ร่างกำลังชน = warning
  - แดงเฉพาะ hover ของ ✕ และ toast error
  - AI ไม่ถูกแทนด้วยเขียน
- **Sentence-case**: ภาษาไทยล้วน ไม่มี ALL CAPS ปุ่มเป็น กริยา+กรรม ("บันทึก", "ใช้ฉบับล่าสุด", "แปะ 3 รายการ")
- **เงาผสมหมึก**: ไม่เพิ่มเงาใหม่เลย (ไม่มี shadow ในงานนี้ แบน ตาม Flat-At-Rest)
- **anti-slop**
  - ไม่มี gradient, hero-metric, eyebrow, การ์ดซ้อนการ์ด, border แต่งเกิน 1px
  - แถวสินค้าไม่มีกรอบ
  - ตัวนับ 3/10 เป็นข้อมูลจริง ไม่ใช่การ์ดตัวเลข
- **น้ำเสียงข้อความ**: บอกเหตุและทางออก (เช่น "เก็บไว้ที่แท็บ “ข้อมูล” ดีกว่า", "เอารายการเก่าออกก่อนจึงจะเพิ่มได้") ไม่ไฮป์ ไม่กล่าวหาลูกค้า
- **ผ่าน playbook**
  - clarify: ทุกข้อความระบุผลที่ระบบทำจริง (อิง `ai.*` จาก API ไม่ใช่เดา)
  - operate.md: modal เป็นสิ่งสุดท้าย
  - craft-floor: ทุกสถานะครบ, ไม่ใช้ unicode แทนไอคอน

**จุดที่ theme/พี่น้องขัดกับ Impeccable และการตัดสิน**
1. **ธีม alert ใช้ `text-{c}` ดิบ** (`ui/alerts/page.tsx:48`) ตัดสิน: ใช้ `text-{c}-ink` ตาม DESIGN.md §Colors (token มีในธีม ไม่ใช่ arbitrary)
2. **`AiSuggestPanel` ใช้เขียวแทน AI** (ขัด Verified-Means-Green) ตัดสิน: ไม่ลอก ไม่แก้ในรอบนี้ แนะนำให้ Controller เปิดงานแยก
3. **DESIGN.md ให้ tap 44px เฉพาะมือถือบน Paces** แต่พี่น้องในแผงนี้ใช้ `min-h-11` ทุกจอ ตัดสิน: ตามพี่น้อง (ความสม่ำเสมอในแผงเดียว) ไม่แตก `xl:min-h-0`
4. **frontend-design เรียกร้อง "เสี่ยงทางสุนทรียะ 1 จุด"** ภายใต้ Operate+Paces primitive ตัดสิน: ความกล้าอยู่ที่โครงข้อมูล (บรรทัด meta "ใครเขียน/เมื่อไร", กล่องความจำเป็นตัวเอก, 409 แบบเทียบสองฉบับ) ไม่ใช่การตกแต่ง
5. **spec ให้ปุ่มดินสอ** ขัดกับคำแนะนำของพี่น้องที่ใช้ปุ่มมีข้อความ ตัดสิน: ตาม ref ผู้ใช้ (ไอคอนล้วนแต่มี `title`+`aria-label`+พื้นที่แตะ 44px) และใช้ปุ่มข้อความในสถานะว่างที่ต้องการให้ค้นพบ action

ไม่มีค่าดิบ ไม่มี hex ไม่มีฟอนต์นอก Anuphan ไม่ใช้ม่วง `#7367F0`

**ให้ Controller เพ่งตอนรัน `/impeccable critique`**
- ป้าย "แก้ไข" ของ CRM กับดินสอของความจำอยู่ในแท็บเดียวกัน ดูว่าสับสนไหม
- ความหนาแน่นด้านบนของแท็บ "ข้อมูล" บน 390px (กล่องความจำ + meta + สินค้าก่อนถึงข้อมูล CRM)
- ความต่างน้ำหนักระหว่างหัวข้อสองส่วน (ตั้งใจให้ความจำเด่นกว่าด้วยกล่อง)
- Esc ใน sheet

### Design decisions + rationale

1. **ความจำอยู่บนสุดของแท็บ "ข้อมูล" ไม่ใช่เหนือแถบแท็บ**
   - ข้อมูลที่ AI และแอดมินใช้ทุกครั้งที่ตอบ อยู่ที่แรกที่ตามอง
   - แต่ไม่ลดพื้นที่ของอีก 4 แท็บ
   - ทั้ง desktop และ sheet เปิดมาที่แท็บนี้อยู่แล้ว
2. **picker "แปะ" ใน inline ในแผงขวา**
   - บนมือถือไม่ต้องปิด sheet แล้วค่อยเปิดกลับ
   - ไม่ต้องมี event ข้ามคอมโพเนนต์สำหรับโหมดนี้
   - ราคาที่จ่าย: Esc ชนกับ sheet (แก้ด้วย capture) และต้องเพิ่ม prop 4 ตัว
   - ทางเลือกที่ปฏิเสธ: เปิดใน ChatThread ซึ่งต้องปิด sheet บนมือถือและทำให้ผู้ใช้หลงว่าอะไรอยู่ตรงไหน
3. **กดแถว = ส่งการ์ดต้องข้ามคอมโพเนนต์** เพราะ `sendProductCards` อยู่ใน ChatThread จึงใช้ CustomEvent เหมือน `LIBRARY_CHANGED_EVENT`
4. **ยก fetch ความจำขึ้น parent** เพราะโน้ต CRM ต้องรู้ว่า AI อ่านโน้ตหรือไม่ ไม่งั้นข้อความใต้โน้ตจะโกหก
5. **chip เลือกตัวเลือก ไม่ใช่ select**: ค่าไม่ใช่ field ที่ผูกฟอร์ม และมือถือกดชิปเร็วกว่าเปิด OS picker ทีละหัวข้อ ตรงกับ pattern `salesStatus` ที่มีอยู่ (Hard Rule 6 ของ agent ไม่ถูกละเมิด เพราะไม่ได้ใช้ทั้ง `form-select` และ `hs-dropdown`)
6. **ไม่มี Swal**: ยกเลิกร่าง, ลบแถว, ชนกัน ทั้งหมดแก้ย้อนได้ในไม่กี่แตะ การยืนยันทุกครั้งคือแรงเสียดทานสำหรับร้านที่ทำงานเร็ว
7. **สีของข้อความเตือนเบอร์/ที่อยู่เป็น warning ไม่ใช่ danger** เพราะ OQ-M4 ตัดสินให้ "อนุญาต + เตือนอ่อน"

### Anti-slop self-check

1. **เฉพาะกับ Deep ไหม**: ใช่ มี 4 อย่างที่ไม่มีสินค้าอื่นมี
   - ความจำร่วมข้ามช่องทางของลูกค้าคนเดียวกัน (badge "ใช้ร่วม")
   - meta บอกว่า AI หรือทีมร้านเขียน และเมื่อไร
   - การชนกันของผู้เขียนสองฝ่าย (AI และแอดมิน)
   - ตัวเลือกที่ "ไม่ได้ยืนยันว่ามีของ" (ระบบไม่มี variant)
2. **เด่นสุดอย่างเดียว**: ย่อหน้าความจำ (กล่องพื้น, ขนาด `text-sm`, อยู่บนสุด) หัวข้อสินค้าไม่มีกล่อง และ CRM ถูกคั่นด้วยเส้นประ ไม่ใช่ทุกส่วนน้ำหนักเท่ากัน
3. **ตัดของซ้ำ/คงที่**: ไม่มีการ์ดสรุปจำนวน (ตัวนับ N/10 เป็นข้อความหัวข้อ), ไม่มี badge "AI" ในแถวสินค้า, ไม่มีหัวข้อซ้ำชื่อแท็บ, ซ่อนส่วนสินค้าทั้งส่วนเมื่อร้านไม่มีสินค้า, hint "แตะสินค้า..." ปรากฏเมื่อมีแถวเท่านั้น, ไม่มีปุ่ม "อัปเดตตอนนี้" ในร้าน Gemini
4. **ครบทุกสถานะ**: loading/error/ว่าง/ยาวสุด 800/ชื่อยาว/0 รายการ/10 รายการ/ปิดขาย/ลบ/ชนกัน/AI กำลังอัปเดต/ร้านปิดบริบท/ไม่มีกุญแจ/ห้อง DEEP (ตัวเลขหลักล้านไม่เกี่ยว ไม่มีเงิน/ยอดในบล็อกนี้)
5. **copy ตรงความจริง**: ทุกประโยคเรื่อง AI ผูกกับ `ai.writes/readsMemory/noteReadByAi` ที่มาจากเซิร์ฟเวอร์, ปุ่มบอกผล ("ใช้ฉบับล่าสุด" พร้อมผลข้างเคียงใต้ปุ่ม), ไม่มีข้อความแนะนำสิ่งที่ปุ่มในสถานะนั้นไม่มี (เช่น ร้านปิดบริบทไม่บอกให้ "รออัปเดต")
6. **คำเดียวกันหมายถึงของเดียวกัน**: "ความจำ" ≠ "โน้ต" ≠ แท็บ “ข้อมูล” ล็อกไว้ในส่วน Content outline, "ตัวเลือก" ตรงกับศัพท์ที่โปรเจกต์ใช้ใน spec (optionLabel) และ attributes
7. **สีถูกความหมาย**: ไม่มีเขียนเลย, warning = ยังไม่ปกติแต่ไม่ล้มเหลว (ปิดขาย/ชน/เบอร์), info = ข้อมูล (ใช้ร่วม), แดงเฉพาะล้มเหลวจริง (toast error) และ hover ลบ
8. **มือถือแตะได้**: ดินสอ/(i)/✕ = `size-11` (44px), ชิปตัวเลือก `min-h-11`, แถวสินค้า `min-h-11` ทั้งแถว, ปุ่มบันทึก/ยกเลิก `min-h-11`, action หลัก (บันทึก) อยู่ท้ายฟอร์มในโซนนิ้วโป้งของ bottom-sheet
9. **จอ 1440**: แผงเป็นคอลัมน์คงที่ `w-96` ข้างเธรดที่ยืดได้ ไม่มีคอลัมน์ว่าง; เนื้อหาจริงอยู่ในคอลัมน์ที่มีข้อมูล และกล่องความจำไม่ใช่พื้นที่ว่างเพราะอยู่ในแท็บที่เลื่อนได้

### Open questions (ให้ Controller / developer)

1. **ชุดฟิลด์ที่ UI ต้องการจาก `GET .../memory`** เกินสัญญา §10 ของสเปก ขอรวมเป็น object เดียวแทน `aiWrites`:
   ```ts
   ai: { provider: 'typhoon'|'gemini'|'none'; writes: boolean; readsMemory: boolean; readsProducts: boolean; updating: boolean; noteReadByAi: boolean }
   ```
   และ `memory.previousText: string | null`
   - เหตุผล: ถ้าไม่มี `noteReadByAi` ข้อความใต้โน้ตจะผิดอีกรอบ
   - ถ้าไม่มี `updating` สถานะ W6 ทำไม่ได้
   - ถ้าไม่มี `readsMemory` เราจะบอกผู้ขายว่า "AI อ่านทุกครั้ง" ทั้งที่ร้านปิดสวิตช์ไว้ (BR-MEM-10)
2. **รูปแบบ `optionLabel`**: สเปกยก "สีครีม · L" แต่กฎ FR-MEM-14 ตรวจเทียบ attributes
   - ถ้าประกอบเป็น "คีย์+ค่า" ผสมกัน server ต้อง parse กลับ ซึ่งกำกวม ("ขนาด L" กับ "L")
   - เสนอให้ client ส่ง `selections: {key, value}[]` แล้ว server ประกอบ label เอง
   - ขอ Controller/product เคาะรูปแบบ: เสนอ "สี ครีม · ขนาด L" (มีคีย์ทุกหัวข้อ AI อ่านไม่กำกวม)
3. **`GET /api/products` ส่ง `attributes` ออกมาไหม** (serialize ส่งออกที่ service แต่ route ยังไม่ได้ยืนยัน) และต้องย้าย parser จุลภาคไป `src/lib/product-attributes.ts`
4. **`MEMORY_POKE_EVENT`** ต้องแตะ `ChatThread` (ที่ผู้ใช้เห็น READY) ถ้าไม่ทำ ความจำที่ AI เขียนหลังตอบจะไม่ขึ้นจนกว่าโฟกัสกลับหรือเปลี่ยนห้อง
5. **`pacesToast` ไม่มี action "เลิกทำ"** ✕ จึงไม่มี undo ถ้าต้องการ undo ต้องขยาย toast หรือเก็บแถวที่เพิ่งลบไว้ชั่วคราว
6. **ปุ่มดินสอไอคอนล้วน vs ปุ่มมีข้อความ** ผมตามภาพ ref ถ้า critique ชี้ว่า digital-literacy ต่ำไม่เข้าใจ ให้เปลี่ยนเป็น `EditButton` แบบมีข้อความ (แก้ที่เดียว)
7. **`redactPii` ใช้ฝั่ง client ได้ไหม** สำหรับ callout เตือนเบอร์/ที่อยู่แบบสด (ต้องไม่ import อะไรที่เป็น server-only) ถ้าไม่ได้ ให้ PUT ตอบ `warnings: ['PII']` แล้วแสดงหลังบันทึก (เตือนช้ากว่าแต่ปลอดภัย)
8. **ป้าย "ใช้ร่วม" บนสินค้า**: รายการสินค้าก็เป็น union ของ cluster (FR-MEM-16) ผมไม่ใส่ป้ายต่อแถว เพราะข้อความ (i) บอกแล้วว่าความจำใช้ร่วม ถ้าต้องการให้บอกที่สินค้าด้วยให้เพิ่มบรรทัดเดียวใต้หัวข้อ
9. **pre-existing**: `AiSuggestPanel` ใช้เขียว = AI ควรเปิดงานแยกเมื่อสะดวก

ไฟล์ที่ผมอ่านและอ้างบรรทัด:
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanel.tsx`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerCrmSection.tsx`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ProductPickerPanel.tsx`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanelSheet.tsx`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/i18n/dictionaries/th.ts`
- `/Users/craftman/Projects/safepay-typhoon-suggest/src/lib/paces-swal.ts`
