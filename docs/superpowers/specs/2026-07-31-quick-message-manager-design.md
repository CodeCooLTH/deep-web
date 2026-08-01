# Design Spec — Redesign โมดัล "จัดการข้อความสำเร็จรูป" (QuickMessageManager)

- **วันที่:** 2026-07-31
- **Feature:** 00018 (omnichannel inbox) — composer improvement #2
- **Surface:** `(paces)/**` seller chat → Paces (Preline 4 + Tailwind 4, ไม่มี MUI), primary น้ำเงิน `#236dc9`
- **Mockup:** `2026-07-31-quick-message-manager-mockup.html` (Mobile / Tablet / Desktop)
- **สถานะ:** รอ user review ก่อน implement
- **ผู้ออกแบบ:** `safepay-ux` (Hard Rule 8 gate) — Controller verify theme path + สรุป

---

## 1) ปัญหาปัจจุบัน (ยืนยันจากโค้ดจริง)

ไฟล์: `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/QuickMessageManager.tsx` (344 บรรทัด)
Parent: `QuickMessageBar.tsx` (335 บรรทัด)

| # | ปัญหา | หลักฐาน |
|---|---|---|
| 1 | `overflow-y-auto` ตัวเดียวครอบ **ทั้งฟอร์มและ list** → ฟอร์มเพิ่มกางค้างตลอดเวลา กินพื้นที่ก่อนถึง list ทุกครั้ง แม้ผู้ใช้แค่มาหา/ลบ | `:193` (scroll container), `:195-288` (ฟอร์ม) |
| 2 | 🛑 **bug หลัก** — `startEdit` เติมค่าลงฟอร์มบนสุด **แต่ไม่ scroll ไปหาฟอร์ม** ผู้ใช้ที่เลื่อนลงไปหารายการที่ 20 แล้วกดดินสอ จะเห็นว่า "ไม่มีอะไรเกิดขึ้น" เพราะฟอร์มอยู่นอกจอด้านบน | `:73-80` |
| 3 | ไม่มีค้นหา/กรองหมวดในโมดัล ทั้งที่ parent bar มีค้นหาแล้ว — ไม่สอดคล้องกัน และ 34 รายการต้องกวาดตาหาเอง | modal ไม่มี; `bar:42,71-77` มี |
| 4 | ไม่มีจัดลำดับในโมดัล ต้องปิดออกไปทำที่แถบล่าง ทั้งที่ mechanic + API พร้อมแล้ว | `bar:79-129,229-259`; `PATCH /api/chat/quick-messages` |
| 5 | `sm:max-w-lg` → desktop กว้างแค่ 512px ไม่ได้ใช้พื้นที่จอเลย | `:181` |
| 6 | ปุ่มแก้ไข/ลบ = `btn-sm btn-icon` ≈ 30px ต่ำกว่า tap target 44px | `:324-334` |
| 7 | (นอกสโคปเดิม — user สั่งแก้พร้อมกัน) fetch ล้มเหลว `catch {}` เงียบ ไม่ตั้ง error state → โมดัลขึ้น "ยังไม่มีข้อความสำเร็จรูป" ทั้งที่จริงคือโหลดพัง ผู้ใช้เข้าใจผิดว่าข้อมูลหาย | `bar:51-53` |

### สิ่งที่ทำถูกอยู่แล้ว — คงไว้ ห้ามแตะ

- `pacesConfirm.danger` confirm ก่อนลบ (`:154-156`)
- `pacesToast` ทุกจุด (Hard Rule 9 ผ่านแล้ว)
- badge หมวดในการ์ด (`:319`) — ทำงานถูกแล้ว ที่ไม่เห็นในภาพเพราะรายการนั้นไม่ได้กรอกหมวด
- thumbnail + ป้าย `+N` (`:304-313`)
- ESC ปิด / คลิก backdrop ปิด (`:54-60`, `:177-179`)
- ฟอร์ม fields + upload logic (`:84-120`), validation (title 80 / category 40 / body 2000 / รูป 5 — ยืนยัน `validations.ts:776`)

---

## 2) โครงใหม่ + เหตุผล

**หลักการ: แยก "โหมดดู/จัดการ" (list = พระเอก) ออกจาก "โหมดฟอร์ม" เด็ดขาด แทนที่จะพึ่ง scroll**

ทางเลือกที่พิจารณาแล้วไม่เลือก — **(A) patch เดิม**: แยก scroll container + `scrollIntoView` ตอนกดแก้ไข
ไม่เลือกเพราะยังเป็น "การเลื่อนจอ" ที่ผู้ใช้กลุ่ม digital-literacy ต่ำ (ตาม `PRODUCT.md`) อาจไม่ทันสังเกต โดยเฉพาะเมื่อเปิด `prefers-reduced-motion` → แก้อาการ ไม่ได้แก้ต้นเหตุ

**(B) [เลือก] แยก view state ชัดเจน**

> 🛑 **v3 (2026-07-31 หลัง user เห็นของจริงบน prod): เลิก 2-pane เปลี่ยนเป็น "ตาราง + เปลี่ยนทั้งหน้าเมื่อกด"**
> ตารางด้านล่างเก็บไว้เป็นบันทึกทางเลือกที่เคยใช้ — ของจริงดูหัวข้อ **"แก้ทิศทางรอบ 3"**

| Breakpoint | โครง (v2 — เลิกใช้แล้ว) |
|---|---|
| **Desktop ≥1024** | **2-pane ถาวรในโมดัลเดียว** — ซ้าย list pane (`lg:w-80` 320px, toolbar sticky + scroll ตัวเอง) / ขวา form pane (ยืดเต็มที่เหลือ) โมดัล `lg:max-w-5xl`. ฟอร์มอยู่คนละคอลัมน์กับ list → **ไม่มีทางหลุดนอกจอ = แก้ปัญหา #2 ที่ต้นเหตุ** |
| **Tablet 768–1023** | single-column สลับ view เต็มจอเหมือน mobile แต่การ์ดกว้าง/สูงขึ้น และฟอร์ม `หัวข้อ`+`หมวด` วางคู่กันได้ที่ `sm:` |
| **Mobile <640** | single-column สลับ view เต็มจอ list ↔ form ด้วย **back arrow navigation** (ไม่ผูกกับ scroll) |

**ทำไม tablet ไม่ทำ 2-pane:** 768px หัก padding โมดัล + list 320px แล้ว ฟอร์มจะเหลือแคบเกินใช้งานสบาย (ปุ่มแนบรูป/textarea ถูกบีบ) ความเสี่ยงสูงกว่าประโยชน์

**Breakpoint แยกโหมด = `lg` (1024)** — Tailwind default ที่ Paces ใช้จริง (ไม่ remap เหมือน Vuexy) และตรงกับ `seller-mobile:1024` ที่ทั้งแอปใช้แบ่ง sidebar/mobile-shell อยู่แล้ว ไม่ใช่ตัวเลขที่ตั้งใหม่

### ผลตัดสินจาก user (2026-07-31)

1. **ยกจัดลำดับเข้ามาในโมดัลด้วย** ใช้ API เดิม `PATCH {orderedIds}` ไม่มี backend เพิ่ม
2. **แก้บั๊ก `bar:51-53` (fetch ล้มเหลวเงียบ) ไปพร้อมกัน** — เพิ่ม error state + ปุ่มลองใหม่ แยกจาก empty state จริง

### แก้ทิศทางรอบ 2 หลัง user เห็นของจริงบน prod (2026-07-31)

| เดิม (v1) | ใหม่ (v2) | เหตุผล |
|---|---|---|
| แถวจัดลำดับมีปุ่มลูกศรขึ้น/ลง 44px เป็นกลไกหลัก | **ตัดปุ่มลูกศรออก เหลือไอคอน grip อย่างเดียว** | user สั่งให้ minimal — แถวโล่งอ่านง่ายกว่า |
| แถบ hint "กดลูกศรเพื่อสลับลำดับ..." | **ตัดทิ้ง** | user สั่ง |
| ปุ่ม "เสร็จสิ้น" เต็มความกว้างท้ายลิสต์ | **ตัดทิ้ง** — ออกจากโหมดด้วยปุ่ม toggle บน toolbar (icon เปลี่ยนเป็น `check` + พื้น primary) | user สั่ง; ใช้ pattern เดียวกับ `bar:141-155` ที่มีอยู่แล้ว |
| — | **แยกกลไกตามอุปกรณ์: ≥lg ลากที่ grip / <lg ปุ่มลูกศรขึ้น-ลง 44px** (`lg:hidden` กับ `hidden lg:block`) | HTML5 `draggable` ไม่ยิง event บนจอสัมผัส ถ้าโชว์ grip บนมือถือคือโชว์ affordance ที่กดแล้วไม่มีอะไรเกิดขึ้น — แต่ละอุปกรณ์เห็นเฉพาะกลไกที่ใช้ได้จริง จึง minimal ทั้งคู่ (เคยลองเขียน touch-drag เองแล้วถอดออก: ซับซ้อนกว่าและ QA บนมือถือจริงไม่ได้) |
| — | คีย์บอร์ด: ลูกศรขึ้น/ลงเมื่อโฟกัสที่แถว (`tabIndex={0}`) | ปุ่มหายไปแต่ต้องไม่ตัดคนใช้คีย์บอร์ดทิ้ง |
| แถบล่าง (`QuickMessageBar`) ไม่มีตัวกรองหมวด และการ์ดไม่โชว์หมวด | **เพิ่มตัวกรองหมวดข้างช่องค้นหา + badge หมวดบนการ์ด** (บรรทัดจองพื้นที่ตายตัวเพื่อให้การ์ดสูงเท่ากัน) | user แจ้งว่าหาไม่เจอเพราะไม่มีทั้งสองอย่าง — ให้เท่ากับในโมดัล |

### แก้ทิศทางรอบ 3 — โครงที่ใช้จริง (2026-07-31)

**user ตัดสิน: "เปลี่ยนเป็น table ดีกว่า และถ้ากดแล้วก็ให้ render component ทั้งหน้าแทน เข้าใจง่ายกว่า"**

| | v2 (2-pane) | **v3 (ใช้จริง)** |
|---|---|---|
| หน้ารายการ | การ์ดในคอลัมน์ซ้าย 320px | **ตาราง Paces เต็มโมดัล** — `หัวข้อ` / `หมวด` / `ข้อความ` / `จัดการ` |
| กดแถว | ฟอร์มโผล่ที่ pane ขวา (เห็นสองอย่างพร้อมกัน) | **เปลี่ยนทั้งโมดัลเป็นหน้าฟอร์ม** + ลูกศรย้อนกลับที่ header |
| Responsive | สลับ pane ที่ `lg` | ไม่มีการสลับโครงเลย — ต่างแค่ซ่อนคอลัมน์: `<sm` ซ่อนหมวด, `<lg` ซ่อนข้อความ (ยกตัวอย่างเนื้อหาไปไว้ใต้หัวข้อแทน) |
| ปุ่มเพิ่ม | อยู่ในฟอร์มขวาที่กางค้าง | ปุ่ม `+ เพิ่มข้อความ` บน toolbar → เข้าหน้าฟอร์มเปล่า |

**เหตุผล:** การ์ดในคอลัมน์แคบต้องตัดข้อความทิ้งเยอะจนแยกไม่ออกว่าอันไหนคืออันไหน และมีสองอย่างให้มองพร้อมกัน — ตารางให้ข้อมูลต่อแถวมากกว่าในพื้นที่เท่ากัน ส่วน "กดแล้วเปลี่ยนทั้งหน้า" เป็น mental model ที่ตรงกว่า. ทั้ง v2 และ v3 แก้ bug #2 (กดแก้ไขแล้วไม่เห็นอะไรเกิดขึ้น) ได้เหมือนกัน เพราะฟอร์มไม่ได้อยู่ใต้ scroll ของ list อีกต่อไป

**bug ที่เจอตอนเปลี่ยน:** การ์ด v2 ใส่ `line-clamp-2 block` — `block` ทับ `display:-webkit-box` ที่ `line-clamp` ต้องใช้ ข้อความจึงไม่ถูกตัดจริง (เห็นได้จาก screenshot ของ user) v3 ตัด `block` ออกแล้ว

### แก้ทิศทางรอบ 4 — แผงในแชท + ผลตรวจ Impeccable/Paces (2026-07-31)

**แผง `QuickMessageBar` (แถบเรียกใช้ในหน้าแชท)**

| เดิม | ใหม่ | เหตุผล |
|---|---|---|
| แถบเตี้ยเหนือช่องพิมพ์ การ์ดสไลด์แนวนอนใบเล็ก `w-32` | **วางทับพื้นที่ข้อความทั้งช่อง** (`absolute inset-0` ใน wrapper `relative` ที่เพิ่มใน `ChatThread`) การ์ดเป็น grid 2–5 คอลัมน์ | user สั่ง "เต็มช่องแชทไปเลย" — การ์ดใบเล็กในแถวเดียวอ่านไม่ออกว่าอันไหนคืออันไหน. วางทับแทนการดันเลย์เอาต์ เพราะลิสต์ข้อความยัง mount อยู่ ตำแหน่ง scroll จึงไม่รีเซ็ตตอนปิดแผง |
| เรียงเรียบเป็นชุดเดียว | **แบ่งกลุ่มตามหมวด** มีหัวข้อกลุ่ม + จำนวน; "ไม่มีหมวดหมู่" มาก่อนเสมอ | user วางโครงมาเอง; โหมดจัดลำดับไม่แบ่งกลุ่ม เพราะลำดับที่บันทึกเป็นลำดับเดียวทั้งชุด ถ้าแยกกลุ่มเลข `#N` จะไม่ตรงลำดับจริง |
| การ์ดมี badge หมวด | ตัดออก | หัวข้อกลุ่มบอกอยู่แล้ว — ตัดบรรทัดจองพื้นที่ที่เคยต้องมีไปด้วย |

**โมดัลจัดการ — แก้ตามที่ user ติ**

| อาการ | สาเหตุจริง (วัดจาก CSS ธีม) | แก้ |
|---|---|---|
| "ขนาดปุ่มไม่เท่ากัน" | `.form-input` = `h-9.25` (**37px**) แต่ `.btn` = `py-1.75` + `text-sm` + border ≈ **36px** — ต่างกัน 1px เห็นชัดเมื่อวางเรียงกัน | ตั้ง `h-11` (44px) ให้ทุกตัวใน toolbar เท่ากันหมด ได้ tap target ตาม `PRODUCT.md` ไปในตัว |
| "กด edit แล้ว header เปลี่ยนไปแปลกๆ" | header สลับเป็น `[ลูกศรย้อนกลับ + ชื่อฟอร์ม]` ไอคอนหายและหัวข้อเลื่อนตำแหน่ง | header คงที่ทุก view; ย้ายทางกลับ + ชื่อรายการที่กำลังแก้ ไปแถบรองใต้ header |
| "UI ไม่ทันสมัย" | (ก) กล่องเทา placeholder ในคอลัมน์รูป อ่านเป็น "รูปเสีย" ทั้งคอลัมน์ (ข) ปุ่มแก้ไข/ลบมีกรอบทุกใบ คอลัมน์จัดการกลายเป็นตารางกล่องเล็ก ๆ รก | (ก) เว้นว่างจริง ความสูงแถวมาจากปุ่ม 44px อยู่แล้ว (ข) ปุ่มเป็น ghost โชว์พื้นตอน hover — พื้นที่กดยัง 44px |

**ผล `/impeccable clarify` (ตรวจ copy)**

- `"ไม่พบข้อความที่ตรงกับคำค้น"` แสดงแม้ผู้ใช้กรองด้วย**หมวดอย่างเดียว** ไม่ได้พิมพ์คำค้นเลย → บอกผิด ผู้ใช้จะไปนั่งแก้คำค้นที่ไม่มีอยู่ **แก้:** แยกข้อความตามตัวกรองที่ใช้จริง (`ไม่พบข้อความที่ตรงกับ "X"` / `ไม่มีข้อความในหมวด "Y"`) ทำทั้งโมดัลและแถบ
- confirm ลบเดิม `ลบข้อความสำเร็จรูป / ต้องการลบ "X" หรือไม่?` ปุ่ม `ลบ` — ไม่บอกผลที่ตามมา ทั้งที่ข้อความ**ผูกระดับร้าน** **แก้:** `ลบ "X"` + `ทุกคนในร้านจะไม่เห็นข้อความนี้อีก และกู้คืนไม่ได้` ปุ่ม `ลบข้อความนี้`
- toast `"ลบแล้ว"` → `ลบ "X" แล้ว` (บอกว่าลบอันไหนไป เผื่อกดผิดแถว)

**ผล detector (`detect.mjs`)** — 0 findings ทั้ง `QuickMessageManager.tsx` และ `QuickMessageBar.tsx`

---

## 3) Wireframe

ดู `2026-07-31-quick-message-manager-mockup.html` (Mobile 340 / Tablet 470 / Desktop 760 + ทุก state)
ASCII ย่อ:

**Mobile — list view (ค่าเริ่มต้นเสมอ)**
```
┌──────────────────────────────────┐
│ [msg] จัดการข้อความสำเร็จรูป [34] ✕│
├──────────────────────────────────┤
│ [search] ค้นหาข้อความสำเร็จรูป    │
│ [tag] หมวด ▾        [sort] จัดลำดับ│
├──────────────────────────────────┤
│ [img] ทักทายลูกค้าใหม่ [ทักทาย]   │ scroll
│       สวัสดีค่ะ ยินดีต้อนรับ...    │ (list = พระเอก)
│                    [pencil][trash]│ ปุ่ม 44px
│ ──────────────────────────────── │
│ ... 34 แถว                        │
├──────────────────────────────────┤
│ [      + เพิ่มข้อความ (w-full)   ]│ sticky footer
└──────────────────────────────────┘
```

**Mobile — form view (หลังกดแถว/ดินสอ/เพิ่ม)**
```
┌──────────────────────────────────┐
│ [←44] แก้ไขข้อความ             ✕ │
├──────────────────────────────────┤
│ หัวข้อ    [__________________]   │ ฟอร์ม scroll เอง
│ หมวด      [__________________]   │
│ ข้อความ   [__________________]   │
│                          120/2000│
│ รูปแนบ (สูงสุด 5)                 │
│ [img][img][+ เพิ่มรูป]            │
│ [trash] ลบข้อความนี้              │
├──────────────────────────────────┤
│ [   ✓ บันทึกการแก้ไข (w-full)  ] │ sticky footer
└──────────────────────────────────┘
```

**Desktop ≥1024 — 2-pane ถาวร (คลิกแถวซ้าย → ฟอร์มขวาสลับเป็นแก้ไขทันที)**
```
┌────────────────────────────────────────────────────────────┐
│ [msg] จัดการข้อความสำเร็จรูป  [34 รายการ]                ✕│
├──────────────────────────┬─────────────────────────────────┤
│ [search][tag หมวด▾][sort]│ แก้ไข: ทักทายลูกค้าใหม่ [ยกเลิก]│
├──────────────────────────┤─────────────────────────────────│
│▶[img] ทักทายลูกค้าใหม่ ◀ │ หัวข้อ   [ทักทายลูกค้าใหม่___]  │
│  border-primary          │ หมวด     [ทักทาย____________]  │
│ ──────────────────────── │ ข้อความ  [สวัสดีค่ะ ยินดี...]  │
│  แจ้งเลขพัสดุ [จัดส่ง]    │                       120/2000  │
│  เลขพัสดุของคุณ [✎][🗑]  │ รูปแนบ (สูงสุด 5)               │
│ ──────────────────────── │ [img ✕][+ เพิ่มรูป]             │
│  ... scroll แยกจากฟอร์ม  │                                 │
│  พบ 34 จาก 34 รายการ     │ [ลบข้อความนี้]  [ยกเลิก][✓บันทึก]│
└──────────────────────────┴─────────────────────────────────┘
```

**โหมดจัดลำดับ (v2 — ค้นหา/กรองซ่อนไป เหลือปุ่ม toggle ที่เป็นทางออกจากโหมดด้วย)**
```
│                        [✓ toggle]  │ ← พื้น primary = อยู่ในโหมดจัดลำดับ, กดซ้ำ = ออก
│ 1  ทักทายลูกค้าใหม่              ⠿ │ ← ลากที่ grip (mouse + touch)
│ 2  แจ้งเลขพัสดุ                  ⠿ │
│ 3  วิธีชำระเงิน                  ⠿ │
```
ไม่มีแถบ hint และไม่มีปุ่มท้ายลิสต์

---

## 4) Theme Source Mapping

> Controller verify ทุก path แล้วว่ามีอยู่จริง (2026-07-31)

| # | Section | Theme source | Class/Component | ปรับอะไร |
|---|---|---|---|---|
| 1 | Modal shell + responsive sizing | `theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx` — block "Full Screen Below lg" (บรรทัด **645-671**) | มิติ: fullscreen ใต้ `lg` → centered card ที่ `lg` ขึ้นไป | เอาเฉพาะ **class มิติ** (`h-full max-h-full` → `lg:mx-auto lg:h-auto lg:max-w-5xl lg:rounded-xl`). **คงกลไก show/hide เดิม** (React `fixed inset-0 flex` + ESC + click-outside `:172-180`) **ไม่สลับไปใช้ Preline `hs-overlay`** เพราะ modal คุมด้วย React state จาก parent (`bar` `managerOpen`) — จะขัดกัน และเสี่ยงปัญหาเดียวกับที่ `paces-component-reference.md` §3 เตือนเรื่อง `hs-dropdown` กับ re-render |
| 2 | Header + count badge | `QuickMessageManager.tsx:183-191` (เดิม) + `paces-component-reference.md` §6 | `.card-header` + `badge bg-primary/15 text-primary` | เพิ่ม badge นับจำนวนเข้า header, **ตัดพารากราฟ "ทั้งหมด N รายการ" (`:291-293`) ทิ้ง** |
| 3 | ช่องค้นหา | `theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:20-24` (ใช้แล้วใน `bar:188-198`) | `.input-icon-group` + `.form-input` | copy pattern เดียวกับ bar; state ค้นหาแยก instance (คนละ lifecycle) |
| 4 | กรองหมวด | `src/components/safepay/FilterDropdown.tsx` (Base: `theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx`) | `<FilterDropdown icon="tag" defaultLabel="หมวด" resetValue="All" />` | 🛑 **บังคับใช้ตัวนี้ ไม่ใช่ `<select>` ไม่ใช่ `hs-dropdown` ดิบ** — toolbar อยู่ใน list ที่ re-render บ่อย (`paces-component-reference.md` §3) |
| 5 | ปุ่ม toggle จัดลำดับ | `QuickMessageBar.tsx:141-155` (เดิม) | icon-button `arrows-sort` / `check`, active = `bg-primary text-white` | copy pattern เป๊ะ |
| 6 | แถว list | `QuickMessageManager.tsx:298-336` (เดิม) + card variant `border-primary` (`paces-component-reference.md` §7) | `<li>` row | คงโครงเดิม + (ก) `min-h-11 min-w-11` บนปุ่มแก้ไข/ลบ (ข) selected state `border-primary bg-primary/5` (เฉพาะ desktop) (ค) คลิกทั้งแถว = เลือกแก้ไข |
| 7 | ปุ่ม toggle จัดลำดับ (เป็นทางออกจากโหมดด้วย) | `QuickMessageBar.tsx:141-155` (เดิม) | `btn` + icon `arrows-sort` ↔ `check`, active = `bg-primary text-white` | v2 ตัดปุ่มลูกศรต่อแถวและปุ่ม "เสร็จสิ้น" ท้ายลิสต์ออกตามคำสั่ง user |
| 8 | จัดลำดับแถว — ≥lg drag | `QuickMessageBar.tsx:229-259` (เดิม) | HTML5 `draggable` + keyboard arrow | ปรับจากการ์ดแนวนอน → `<li>` แนวตั้ง; grip แสดงเฉพาะ `lg:block` |
| 8b | จัดลำดับแถว — <lg ปุ่มลูกศร | `theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx` | `.btn.btn-icon` + `chevron-up`/`chevron-down` `min-h-11 min-w-11` | แสดงเฉพาะ `lg:hidden` — เป็นกลไกเดียวที่ใช้ได้จริงบนจอสัมผัส |
| 9 | ฟอร์ม fields | `QuickMessageManager.tsx:200-270` (เดิม) | `.form-label` / `.form-input` | **ไม่แตะ logic** — ย้ายที่อยู่ไป pane/view ใหม่เท่านั้น |
| 10 | Character counter (ใหม่) | ไม่มีไฟล์ theme ตรง — ประกอบจาก token `text-2xs` (`paces-component-reference.md` §8) | `<span className="text-2xs text-default-400">` | > 1800 ตัวอักษร เปลี่ยนเป็น `text-warning` |
| 11 | Confirm ลบ | `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx` ผ่าน `src/lib/paces-swal.ts` | `pacesConfirm.danger` | ไม่แตะ — เรียกซ้ำจากตำแหน่งใหม่ (form pane) ด้วย |
| 12 | Empty state | `QuickMessageBar.tsx:213-220` (เดิม) | icon + copy + ปุ่ม | ย้ายมาใช้ในโมดัล (แยก 0 รายการ / ค้นหาไม่พบ / โหลดพัง) |
| 13 | Loading skeleton | `QuickMessageBar.tsx:207-212` (เดิม) | `bg-default-100 animate-pulse` | ปรับ `h-36 w-32` → `h-16 rounded-lg` × 4 |
| 14 | Sticky action bar (mobile/tablet) | `paces-component-reference.md` §7 | `.card-footer` + ปุ่ม `w-full` | primitive มาตรฐานสำหรับพื้นที่ action ท้าย card |

---

## 5) Interaction Spec

**เปิดโมดัล** — จาก bar กด icon settings (`bar:158-164`, ไม่แตะ) → ≥1024 render 2-pane ทันที (list ซ้าย + form โหมดเพิ่มขวา); <1024 render **list view เป็นค่าเริ่มต้นเสมอ** เพื่อให้ list เป็นสิ่งแรกที่เห็น

**ค้นหา** — filter `title`+`body` case-insensitive (logic เดิม `bar:71-77`) realtime ไม่ debounce (34 รายการ in-memory พอ) → **ซ่อนอัตโนมัติเมื่อ `sortMode=true`** (เหตุผลเดียวกับ `bar:180-181`: ลากบนผลค้นหาจะเขียนลำดับผิด เพราะ `orderedIds` จะมีแค่ตัวที่ตรงคำค้น)

**กรองหมวด** — `FilterDropdown` → AND กับคำค้น; **ซ่อน dropdown ทั้งอันถ้าไม่มีรายการไหนตั้งหมวดเลย**

**เพิ่ม** — ≥1024 form pane เป็นโหมดนี้เป็น default อยู่แล้ว / <1024 กดปุ่ม "+ เพิ่มข้อความ" (sticky footer) → form view ว่าง → `POST /api/chat/quick-messages` → สำเร็จ: `pacesToast.success` (**top-right**) + `resetForm()` + `onChanged()` + <1024 กลับ list view อัตโนมัติเพื่อเห็นรายการที่เพิ่งเพิ่ม

**แก้ไข** — คลิกทั้งแถว หรือปุ่มดินสอ 44px → `startEdit(qm)` (เดิม `:73-80`) + **≥1024 form pane สลับเป็นโหมดแก้ไขทันที (เห็นอยู่แล้วในคอลัมน์ขวา ไม่ต้อง scroll — แก้ bug #2 ตรง ๆ)** / <1024 `setViewMode('form')` (header เป็นลูกศรย้อนกลับ + "แก้ไขข้อความ") → `PATCH /api/chat/quick-messages/[id]` → สำเร็จ: toast top-right + reset + `onChanged()` + <1024 กลับ list view, ≥1024 form pane กลับโหมดเพิ่ม (deselect แถว)

**ยกเลิกแก้ไข** — ≥1024 ปุ่มลิงก์ "ยกเลิกการแก้ไข" มุมขวาบน form pane → `resetForm()` / <1024 กดลูกศรย้อนกลับ → ถ้าฟอร์ม dirty ยืนยันด้วย `pacesConfirm.question('ยกเลิกการแก้ไข?', 'การเปลี่ยนแปลงจะไม่ถูกบันทึก')`; ไม่ dirty → ย้อนกลับทันที (ไม่รบกวนโดยไม่จำเป็น)

**ลบ** — ปุ่มถังขยะ 44px (มีทั้งในแถว list และในโหมดแก้ไขของ form pane) → `pacesConfirm.danger` (เดิม `:154-156`) → `DELETE /api/chat/quick-messages/[id]` → toast top-right + ถ้ากำลังแก้ไขรายการนี้อยู่ให้ reset ฟอร์ม + `onChanged()`

**แนบรูป** — ไม่เปลี่ยนพฤติกรรม logic เดิมทั้งหมด (`:84-120`) ย้ายที่อยู่เท่านั้น

**จัดลำดับ (v2)** — ปุ่ม toggle (แสดงเมื่อ `items.length > 1` เหมือน bar) → `sortMode=true` → ซ่อนค้นหา/กรอง, list แสดงทั้งชุดเสมอ (ไม่ filter), แต่ละแถว = เลขลำดับ + ชื่อ + ไอคอน grip เท่านั้น สลับลำดับด้วยการลาก (mouse ผ่าน HTML5 `draggable`, touch ผ่าน handler ที่เขียนเอง, คีย์บอร์ดผ่านลูกศรขึ้น/ลงเมื่อโฟกัสแถว) → ทุกการสลับเรียก `persistOrder()` optimistic แล้วยิง `PATCH {orderedIds}` ทันที (เหมือน `bar:105-118`) → ล้มเหลว: `pacesToast.error('บันทึกลำดับไม่สำเร็จ')` + sync กลับจาก `onChanged()` → **ออกจากโหมดด้วยปุ่ม toggle เดิม** (ไม่มีปุ่ม "เสร็จสิ้น" ท้ายลิสต์แล้ว)

**ปิดโมดัล** — X / ESC / backdrop (เดิม) — ฟอร์ม dirty **ไม่** confirm พิเศษ (ปิดทั้งใบต่างจากย้อน view, ผู้ใช้ตั้งใจออกอยู่แล้ว ไม่เพิ่ม friction)

**Toast placement** — ทุก action ในหน้านี้ (save/upload/delete/reorder) = `pacesToast.*` **top-right** (ไม่ใช่ `pacesToast.chat.*` bottom-right เพราะเป็น action บนโมดัลจัดการ ไม่ใช่ chat message flow)

### State พิเศษ

| State | หน้าตา |
|---|---|
| **Empty (0 รายการ)** | icon `message-plus` + "ยังไม่มีข้อความสำเร็จรูป" + "เพิ่มข้อความที่ใช้บ่อย เช่น ทักทายลูกค้าใหม่ หรือแจ้งเลขพัสดุ จะได้พิมพ์ครั้งเดียวใช้ได้ทุกแชท" + ปุ่ม "+ เพิ่มข้อความแรก" |
| **ค้นหา/กรองไม่พบ** | "ไม่พบข้อความที่ตรงกับคำค้น" + ปุ่ม "ล้างตัวกรอง" (เคลียร์ทั้ง `q` และ `categoryFilter`) |
| **Loading** | skeleton แถว 4 อัน (ไม่ใช่ spinner กลางจอ) — ต้องมี prop `loading` ใหม่ |
| **โหลดพัง (ใหม่ — แก้บั๊ก `bar:51-53`)** | icon `alert-triangle` + "โหลดข้อความสำเร็จรูปไม่สำเร็จ" + ปุ่ม "ลองใหม่" → เรียก `load()` ซ้ำ **ห้ามแสดง empty state** |
| **ข้อความยาวผิดปกติ** | list: `truncate` (title) + `line-clamp-2` (body) เดิม; ฟอร์ม: character counter มุมขวาล่าง |

---

## 6) State / Props / API

```ts
type Props = {
  items: QuickMessage[]
  loading?: boolean          // ใหม่ — จาก bar กัน empty-state หลอกตาก่อน fetch แรกเสร็จ
  error?: boolean            // ใหม่ — จาก bar (แก้บั๊ก catch เงียบ)
  onRetry?: () => void       // ใหม่ — ปุ่ม "ลองใหม่"
  onClose: () => void        // เดิม
  onChanged: () => void      // เดิม — parent refetch
}
```

**state ใหม่ในตัว Manager**

| State | ค่า | หมายเหตุ |
|---|---|---|
| `viewMode` | `'list' \| 'form'` | มีผลเฉพาะ <`lg` (ที่ ≥`lg` render ทั้งคู่พร้อมกันด้วย responsive class) |
| `q` | `string` | แยกจาก bar — reset ทุกครั้งที่เปิดโมดัลใหม่ |
| `categoryFilter` | `string` | default `'All'` |
| `sortMode` | `boolean` | logic แบบเดียวกับ bar |
| `dragFrom` / `dragOver` | ref + state | เหมือน bar |

`editingId`, `title`, `category`, `body`, `imageFileIds`, `saving`, `uploading` — **เดิมทั้งหมด ไม่เปลี่ยน**

**derived (`useMemo`)**
```ts
categories   = unique(items.map(i => i.category).filter(Boolean)).sort()
visibleItems = sortMode ? items : items.filter(matchQuery(q) && matchCategory(categoryFilter))
```

**function เปลี่ยน/เพิ่ม**
- `startEdit(qm)` — เดิม `:73-80` + `setViewMode('form')`
- `handleSave()` success path — เดิม + `setViewMode('list')` (no-op ที่ ≥`lg`)
- `clearFilters()` — ใหม่: `setQ(''); setCategoryFilter('All')`
- `move(from,to)` + `persistOrder(next)` — copy จาก `bar:105-129`; optimistic local mirror sync จาก prop `items` ผ่าน `useEffect` ยกเว้นระหว่าง active-drag

**API — ทั้งหมดมีอยู่แล้ว ไม่มีตัวใหม่**

| Method | Path | ใช้ทำอะไร |
|---|---|---|
| GET | `/api/chat/quick-messages` | โหลดรายการ → `{items}` |
| POST | `/api/chat/quick-messages` | สร้าง |
| PATCH | `/api/chat/quick-messages` | จัดลำดับทั้งชุด `{orderedIds}` |
| PATCH | `/api/chat/quick-messages/[id]` | แก้รายตัว |
| DELETE | `/api/chat/quick-messages/[id]` | ลบรายตัว |
| POST | `/api/upload` | อัปโหลดรูป → `{fileId}` |
| GET | `/api/files/{fileId}` | แสดงรูป |

---

## 7) Impeccable compliance

**Mode: Operate** — หน้าจัดการ CRUD งานหลังบ้าน ไม่ใช่หน้าโน้มน้าว → เกณฑ์ `operate.md`: earned familiarity, consistent affordances, ทน density สูง (34+ รายการ), ห้าม decorative motion. โมดัลถูกต้องแล้วในบริบทนี้ (งาน "จัดการทั้งชุด" แยกจาก composer หลักโดยเจตนา ตรงกับ pattern `AddRoleModal`/`TaskDetailModal` ที่ theme เองก็ใช้)

**พระเอกของหน้า = list pane/view** ชัดเจนทั้ง 3 breakpoint (desktop ให้พื้นที่มากกว่าและอยู่ลำดับแรก, mobile/tablet เป็น view เริ่มต้นเสมอ; ฟอร์มเป็น "เครื่องมือ" ที่โผล่เมื่อจำเป็น ไม่แย่งพื้นที่ค้างตลอดแบบเดิม)

**สี (One Voice — ความหายากคือพลัง)** — primary น้ำเงินใช้เฉพาะจุด action/selected: focus ring ช่องค้นหา, ปุ่ม Save/Add, badge นับจำนวน (`bg-primary/15`), toggle จัดลำดับตอน active, แถวที่เลือก (`border-primary bg-primary/5`) ที่เหลือเป็น neutral `text-default-*`/`border-default-*` — ไม่ทาน้ำเงินทั้งจอ
*theme ชนะเรื่อง color token (Paces blue `#236dc9` ไม่ใช่ Vuexy violet), Impeccable ชนะเรื่องสัดส่วนการใช้สี*

**Verified-Means-Green** — ไม่ใช้เขียวถาวรเลยในหน้านี้ (ไม่มีสถานะ "ยืนยันแล้ว"); เขียวมีแค่ transient `pacesToast.success` ที่เด้งแล้วหายเอง ปุ่ม Add/Save = primary blue ไม่ใช่เขียว

**Ink-tinted shadow** — ใช้ Paces shadow token (`rgba(130,143,163,.15)`) ซึ่งเป็นโทนหมึก-สเลทของ Paces เอง ไม่ใช่ Ink Plum ของ Vuexy — `DESIGN.md` §1 ระบุ dual-skin ไว้ชัดว่า surface ปฏิบัติการมี neutral/primary ของตัวเอง

**Tap target ≥44px** — สเปกนี้แก้ gap เดิมโดยตรง: ปุ่มแก้ไข/ลบ/ลูกศร/back-arrow ยกเป็น `min-h-11 min-w-11` จากเดิม 30px; action หลักอยู่ sticky footer = โซนนิ้วโป้ง

**ไม่มี emoji (Hard Rule 12)** — icon tabler ผ่าน `Icon` wrapper ทุกจุด: `message-2-bolt`, `x`, `pencil`, `trash`, `photo-plus`, `loader-2`, `check`, `plus`, `search`, `tag`, `arrows-sort`, `chevron-up`, `chevron-down`, `grip-vertical`, `info-circle`, `arrow-left`, `message-plus`, `alert-triangle`
*(ASCII wireframe ในเอกสารนี้ใช้สัญลักษณ์แทนภาพเท่านั้น — โค้ดจริงต้องเป็น icon component)*

### Anti-slop self-check

1. **เฉพาะ Deep จริงไหม** — ใช่: empty-state ยกตัวอย่างผูกโดเมนจริง ("แจ้งเลขพัสดุ" ผูก iShip feat 00022, "ทักทายลูกค้าใหม่" ผูกบริบทแชทผู้ขาย-ผู้ซื้อ), ข้อความผูกระดับร้าน (docstring `:13`)
2. **พระเอก 1 อย่าง** — list pane/view
3. **ตัดของซ้ำ** — ตัดพารากราฟ "ทั้งหมด N รายการ" (`:291-293`) รวมเข้า header badge; ตัดปุ่ม "ยกเลิก" ที่ซ้ำกับลูกศรย้อนกลับบนมือถือ
4. **State ครบ** — empty / ค้นหาไม่พบ / loading / โหลดพัง / error toast / ข้อความยาว / รูป 0–5
5. **copy ตรงกับสิ่งที่ทำได้จริง** — ปุ่มบอก action ตรง, error เดิมชี้ทางแก้ "ลองใหม่อีกครั้ง"
6. **คำเดียวกัน = สิ่งเดียวกัน** — "จัดลำดับ" ใช้เหมือนกันทั้ง bar + modal; "หมวด" ใช้ชื่อเดียวตลอด
7. **สีถูกความหมาย** — ไม่มีเขียวถาวร, primary เฉพาะ action/selected, แดงเฉพาะลบ
8. **แตะได้จริงบนมือถือ** — ปุ่มทั้งหมด 44px หรือ `w-full` sticky footer
9. **1440px ไม่มีคอลัมน์ว่างเปล่า** — โมดัล `lg:max-w-5xl` กึ่งกลาง เหลือ backdrop `bg-black/50` ทั้งสองข้าง = พฤติกรรมปกติของโมดัล

---

## 8) หมายเหตุสำหรับ implementation

- **Hard Rule 7** — ห้าม arbitrary value; ทุกอย่างประกอบจาก Paces primitive (`min-h-11`/`lg:w-80`/`lg:max-w-5xl` เป็น Tailwind scale มาตรฐาน ไม่ใช่ arbitrary)
- **Hard Rule 3** — commit ต้องมี `Base:` ชี้ `theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx` (บรรทัด 645-671) เป็นอย่างน้อย
- **Hard Rule 9** — toast ผ่าน `pacesToast` เท่านั้น; reviewer grep `react-toastify` ใน `src/app/(paces)/` ต้องได้ 0
- **Hard Rule 12** — grep emoji บนไฟล์ที่แตะต้องได้ 0
- หลัง build เสร็จ Controller ต้องรัน `/impeccable critique` + `/impeccable clarify` เป็น gate ก่อน mark complete
