# Design Spec: 00065 — Service Receipt Printing

> Worktree: `/Users/craftman/Projects/safepay-receipt` (read-only). ทุก path อ้างอิงจาก root นี้.

---

## 0. Context reading (ทำก่อนออกแบบ)

**Impeccable core (อ่านครบตาม HR9/HR10):**
- `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json` — อ่านครบแล้ว (ผลสรุปด้านล่าง)
- Impeccable playbook (path สด, `4.1.1` เป็นเวอร์ชันล่าสุดที่ cache): `~/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/reference/{shape,operate,craft-floor}.md` — อ่านครบทั้ง 3 ไฟล์
- `docs/system/ui-guideline/README.md` + `docs/system/ui-guideline/paces-component-reference.md` + `docs/conventions/seller-action-placement.md`

**Key facts ที่ผูกทุกการตัดสินใจในสเปกนี้:**
- Paces primary = น้ำเงิน `#236dc9` ผ่าน token เท่านั้น (ห้ามม่วง Vuexy) — HR6/HR7
- ไม่มี Paces theme file ที่ตรงกับ "ใบเสร็จ A4 2 แผ่นแบบไทย" ตรงตัว → **closest primitive = `theme/paces/Admin/TS/src/app/(admin)/apps/invoice/details/page.tsx`** (การ์ด, ตาราง, ปุ่ม print, และที่สำคัญที่สุด: **ไฟล์นี้มี precedent การใช้ Tailwind variant `print:flex`/`print:hidden` อยู่แล้ว** ยืนยันว่า `print:` เป็น first-class variant ใน build นี้ ไม่ใช่ arbitrary value) — ประกาศตาม HR1 ว่านี่คือ "ไม่พบ theme match ตรงตัว"
- เนื้อหา/เลย์เอาต์ของกระดาษ (สีเขียวเข้ม, ช่องติ๊ก, ตำแหน่งลายเซ็น, สามเหลี่ยมเลขหน้า) มาจาก **reference ของร้านจริงที่ user ส่ง → ใช้ตาม ref ตรง ๆ (HR6 asset/content)**, ส่วน chrome รอบกระดาษ (ปุ่ม, แถบเตือน, การ์ดตั้งค่า) = **ตามธีม Paces ปัจจุบัน**

---

## หน้า/ส่วนที่ออกแบบ

| # | Surface | Route |
|---|---|---|
| S1 | ปุ่มพิมพ์ใบเสร็จ ในหน้ารายละเอียดออเดอร์ | `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx` (ผ่าน `OrderDetailClient.tsx`) |
| S2 | การ์ด "ข้อมูลออกใบเสร็จ" ในหน้า `/shop` | `src/app/(paces)/seller/(dashboard)/shop/page.tsx` |
| S3 | หน้าพิมพ์ใบเสร็จ A4 | `src/app/(paces)/seller/(fullscreen)/orders/[token]/receipt/page.tsx` (ใหม่) |

### User stories ที่ครอบ
- ในฐานะร้าน `SERVICE_QUEUE` ฉันอยากพิมพ์ใบเสร็จรับเงินให้ลูกค้าหลังปิดงาน โดยไม่ต้องพิมพ์เอกสารเอง
- ในฐานะร้าน ฉันอยากตั้งข้อมูลออกใบเสร็จ (ชื่อ/ที่อยู่/เลขผู้เสียภาษี/ตราประทับ) ครั้งเดียวแล้วใช้ซ้ำทุกใบ
- ในฐานะร้าน ฉันอยากรู้ว่าออเดอร์นี้เคยออกใบเสร็จไปแล้วหรือยัง จะได้ไม่ออกเลขซ้ำ

---

## S1 — ปุ่ม "พิมพ์ใบเสร็จ" ในหน้ารายละเอียดออเดอร์

### การตัดสินใจตำแหน่ง (ตาม `seller-action-placement.md`)

**ตำแหน่ง: เมนู `⋯` (overflow) — ไม่ใช่ปุ่มรองที่หัว (ghost)**

เหตุผล:
- ไม่ใช่ action ที่ทำถี่ (แตกต่างจาก copyLink ที่กดบ่อยหลายรอบ) — ตรงเกณฑ์ zone table §1 "Row action/overflow = action ที่ไม่ต้องเห็นตลอดเวลา"
- **vertical-gated** (เฉพาะ `SERVICE_QUEUE`) — มี precedent ตรงในไฟล์เดียวกันอยู่แล้ว: `return-order` (feature 00056) ถูก inject เข้า `menu` แบบเดียวกัน ไม่ใช่ ghost/primary เพราะเหตุผลเดียวกัน (vertical-gated, ไม่ใช่ primary flow ของหน้า)
- ปุ่มหัว (primary/ghost) ของหน้านี้ผันตาม order status อยู่แล้วและแน่นอยู่แล้ว (ดู `order-action-set.ts`) — เพิ่ม ghost ตัวใหม่จะกระทบ layout บนแถบล่าง `<1024px` ที่มีที่จำกัด

**ไม่มี confirm dialog** — ตามเกณฑ์ §3.1: เป็น "ขั้นสุดท้ายของ flow ที่ผู้ขายตั้งใจเดินเข้ามาเอง" (เปิดเมนู ⋯ → กด → ไปหน้าใหม่) ไม่ใช่ action ที่ mis-tap ได้จากพื้นผิวลอย และไม่ใช่ irreversible (ดูหน้าเสร็จได้ซ้ำได้)

### เปิดแท็บใหม่หรือหน้าเดียวกัน — **หน้าเดียวกัน (router.push)**

เหตุผล:
1. **Theme precedent ตรงตัว**: `theme/.../invoice/details/page.tsx` ปุ่ม Print เรียก `window.print()` **ในหน้าเดิม** ไม่เปิดแท็บใหม่
2. **สอดคล้องกับสถาปัตยกรรมเดิมของ `(fullscreen)` ทั้งกลุ่ม** — `/orders/[token]/edit`, `/orders/new`, `/products/new` ทั้งหมดใช้ `router.push` ในแท็บเดิม + `FullscreenBackButton` history-aware พากลับ ไม่มีหน้าไหนเปิดแท็บใหม่เลย
3. **ความเสี่ยงของแท็บใหม่บน WebView**: โปรเจกต์นี้มี pattern ที่ต้องเผื่อ hybrid-app context (`useHidePayments`/`PaymentRestrictionProvider` มีอยู่แล้วในไฟล์นี้) — `target="_blank"`/`window.open()` ใน WebView มักถูกบล็อกหรือเปิดเบราว์เซอร์นอกแอปแล้วหลุด session คุกกี้ การ navigate ในแท็บเดิมไม่มีความเสี่ยงนี้เลย

### ระบุเลขใบเสร็จที่เคยออกแล้ว — **เสนอ: ใช่ แสดงเป็น badge ข้อมูล ไม่ใช่ปุ่ม**

ตามกฎ §1 ของ convention: **"Recap/Summary panel = ไม่มีปุ่ม action เด็ดขาด"** — `OrderSummary.tsx` เป็น recap panel จึงห้ามมีปุ่มคลิกได้ในนั้น เพราะฉะนั้น:
- แสดง **badge อ่านอย่างเดียว** (ไม่ใช่ `<button>`/`<a>`) ในแถวเดียวกับวันที่สร้างออเดอร์: `ใบเสร็จเลขที่ {receiptNo}` — `badge bg-success/15 text-success-ink` + icon `receipt`
- การ "ดูใบเสร็จที่ออกแล้ว" ทำผ่านเมนู `⋯` เท่านั้น (label เปลี่ยนเป็น "ดูใบเสร็จ" แทน "พิมพ์ใบเสร็จ" — ดูด้านล่าง) → แยกชัดระหว่าง "ข้อมูลสรุป" กับ "การกระทำ" ตามกฎที่เอกสารเขียนไว้เองพอดี

### พฤติกรรมเมนู ⋯

| สถานะ | label | icon | key | behavior |
|---|---|---|---|---|
| ยังไม่เคยออกใบเสร็จ, `status !== 'CANCELLED'` | "พิมพ์ใบเสร็จ" | `printer` | `print-receipt` | `POST /api/orders/[token]/receipt` (ออกเลขครั้งแรก, idempotent) → สำเร็จ → `router.push('/orders/{token}/receipt')` |
| เคยออกใบเสร็จแล้ว (ไม่ว่า status ใด รวม CANCELLED) | "ดูใบเสร็จ" | `printer` | `print-receipt` | `router.push` ตรง ๆ ไม่ยิง POST ซ้ำ |
| ยังไม่เคยออก + `status === 'CANCELLED'` | ไม่มี item นี้ในเมนูเลย | — | — | — |

### Flow การประกอบเมนู (ชี้จุดแก้ให้ developer)

```ts
// OrderDetailClient.tsx — วางต่อจาก withReturn (ตัวอย่าง return-order pattern) ก่อนรวมกับ recordPaymentAction
const receiptItem = isServiceQueue && (status !== 'CANCELLED' || receiptNo)
  ? [{
      key: 'print-receipt',
      label: receiptNo ? 'ดูใบเสร็จ' : 'พิมพ์ใบเสร็จ',
      icon: 'printer',
    }]
  : []
const withReceipt = receiptItem.length
  ? { ...withReturn, menu: [...withReturn.menu, ...receiptItem] } // แทรกก่อน cancel-order ถ้าอยากให้อ่านง่าย — ไม่กระทบสไตล์ (DESTRUCTIVE_KEYS ผูกกับ key ไม่ใช่ตำแหน่ง)
  : withReturn
```
`handleAction`: เพิ่ม `case 'print-receipt'` — ถ้า `receiptNo` มีอยู่แล้ว → `router.push` ตรง; ถ้าไม่มี → `fetch POST` แล้วค่อย push (error → `pacesToast.error('ออกใบเสร็จไม่สำเร็จ กรุณาลองใหม่')`, ไม่ navigate)

`OrderDetailClientProps` เพิ่ม: `receiptNo: string | null`

### Impeccable compliance (S1)
- **Mode: Operate** — เครื่องมือทำงาน ไม่ใช่หน้าโน้มน้าว
- One Voice: ไม่เพิ่มม่วง/สีตกแต่งใด ๆ — badge ใช้ token `success/15`+`success-ink` ที่มีอยู่แล้วในธีม
- Verified-Means-Green: badge "ใบเสร็จเลขที่ X" ใช้เขียวเพราะเป็นข้อเท็จจริงที่ **สำเร็จแล้วจริง** (เลขออกแล้ว ย้อนกลับไม่ได้) — ตรงเงื่อนไขของกฎ ไม่ใช่สถานะ "รอ"
- ไม่มี theme กับ Impeccable ขัดกันในส่วนนี้

---

## S2 — การ์ด "ข้อมูลออกใบเสร็จ" ในหน้า `/shop`

### Layout (ASCII, ทั้งมือถือ+เดสก์ท็อป: การ์ดนี้ responsive แบบเดียวกับ `ShopPayoutField.tsx` อยู่แล้ว — `grid-cols-1 md:grid-cols-3`)

```
┌ card ───────────────────────────────────────────────────────┐
│ card-header: "ข้อมูลออกใบเสร็จ"                                │
│  (คำอธิบายเล็ก text-default-400: "ข้อมูลนี้จะแสดงบนใบเสร็จ     │
│   รับเงินที่พิมพ์ให้ลูกค้า")                                     │
├ card-body ─────────────────────────────────────────────────┤
│ [ชื่อบนใบเสร็จ ______________ ] (1 คอลัมน์เต็ม, md:col-span-3)   │
│ [ที่อยู่ (textarea 3 บรรทัด) __________________________ ]      │
│ [เลขผู้เสียภาษี___] [เบอร์โทรบนใบเสร็จ___] [ (ว่าง/เผื่ออนาคต) ]  │
│  md:grid-cols-3 เหมือน ShopPayoutField                        │
│ ── ตราประทับ (ไม่บังคับ) ──                                    │
│ [เลือกไฟล์...] แนะนำ PNG พื้นใส                                 │
│  [preview 80×80, object-contain, bg-default-100, ring-1]      │
│                                     [บันทึกการเปลี่ยนแปลง] →   │
└────────────────────────────────────────────────────────────┘
```

### Section breakdown
- **ทั้งการ์ด = client component ใหม่** `ShopReceiptInfoField.tsx` — **Base: copy โครงจาก `ShopPayoutField.tsx` ทั้งไฟล์** (self-contained `PATCH` endpoint ของตัวเอง, ไม่รอปุ่มบันทึกหลักของ `ShopForm`, error handling pattern เดียวกัน, ปุ่ม "บันทึกการเปลี่ยนแปลง" คำเดียวกันเป๊ะ — sibling-surface-parity)
- **ปุ่มอัปโหลดรูปตราประทับ**: Base ส่วนนี้แยกมาจาก `ShopForm.tsx` (บรรทัด ~543–580, logo-upload block) — `<input type="file" accept="image/png,image/jpeg,image/webp" className="form-input">` → `uploadFileId(file, 'IMAGE')` จาก `@/lib/upload-client` → preview `<img src={`/api/files/${stampFileId}`}>`
- **แสดงเฉพาะร้าน `SERVICE_QUEUE`** — ใน `page.tsx` ใช้ pattern เดียวกับ `bankAccountSetup` prop (conditional `undefined` เมื่อ vertical ไม่ตรง)
- **ไม่ต้องมี live preview ของใบเสร็จ** (YAGNI ตามที่ brief เสนอเอง) — ให้แค่ hint text ใต้ header บอกว่าข้อมูลนี้ไปโผล่ที่ไหน แทนที่จะ build preview component ที่ไม่มีคนขอ ต้อง sync กับ S3 ตลอดเวลา (ความเสี่ยง drift แบบเดียวกับที่เกิดกับ canvas ของ 00035)

### Content outline (ไทย)
| Field | Label | Placeholder/hint |
|---|---|---|
| ชื่อบนใบเสร็จ | "ชื่อบนใบเสร็จ" | placeholder = `shop.shopName`; hint `text-default-400 text-sm`: "ไม่บังคับ — ถ้าไม่กรอกจะใช้ชื่อร้าน '{shopName}'" |
| ที่อยู่ | "ที่อยู่ (สำหรับใบเสร็จ)" | placeholder "เลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์" (`form-textarea`) |
| เลขผู้เสียภาษี | "เลขประจำตัวผู้เสียภาษี" + `text-default-400 text-xs` "(ไม่บังคับ)" | placeholder "0-0000-00000-00-0", `inputMode="numeric"`, error: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก" (เฉพาะเมื่อกรอกแล้วผิด) |
| เบอร์โทร | "เบอร์โทรบนใบเสร็จ" | placeholder "081-234-5678" — **⚠️ คนละฟิลด์กับเบอร์บัญชี (immutable ตาม PRODUCT.md) — นี่คือเบอร์ที่ "แสดงบนกระดาษ" เท่านั้น ต้องเขียนคอมเมนต์กันสับสนในโค้ด** |
| ตราประทับ | "ตราประทับ (ไม่บังคับ)" | hint "แนะนำไฟล์ PNG พื้นใส" |
| ปุ่ม | "บันทึกการเปลี่ยนแปลง" | toast สำเร็จ: "บันทึกข้อมูลใบเสร็จแล้ว"; ล้มเหลว: "บันทึกไม่สำเร็จ กรุณาลองใหม่" |

### Theme Source Mapping (S2)
| Section | Theme/Base file | หมายเหตุ adapt |
|---|---|---|
| การ์ดทั้งใบ (state, save flow, validation pattern) | `src/app/(paces)/seller/(dashboard)/shop/components/ShopPayoutField.tsx` | copy โครง 1:1 เปลี่ยนฟิลด์/endpoint |
| Upload รูปตราประทับ | `src/app/(paces)/seller/(dashboard)/shop/components/ShopForm.tsx` (บรรทัด ~543–580) | ตัด logic คู่ (logo+cover) เหลือฟิลด์เดียว |
| Wiring เข้า `/shop` page (conditional prop ตาม vertical) | `src/app/(paces)/seller/(dashboard)/shop/page.tsx` (prop `bankAccountSetup` เป็นแบบอย่าง) | เพิ่ม prop ใหม่ pattern เดียวกัน |
| `form-input`/`form-textarea`/`form-label`/badge lock icon | `docs/system/ui-guideline/paces-component-reference.md` §4, §6 | ใช้ token ตรง ไม่ arbitrary |

### Edge states
- **ยังไม่มี shop.receiptName ฯลฯ เลย** (ครั้งแรก): ทุกช่องว่าง, ปุ่มบันทึกทำงานปกติ ไม่มี badge "ต้องยืนยันตัวตน" (ต่างจาก payout ซึ่งเป็นข้อมูลการเงินที่ต้อง reauth — ข้อมูลใบเสร็จไม่ใช่ข้อมูลการเงินที่ไหลออก ไม่ต้อง reauth)
- **อัปโหลดรูปล้มเหลว**: reuse error message pattern ของ `ShopForm.tsx` ("uploadFileId throw เหตุผลจริง — ข้อความกลาง ๆ ทำให้ผู้ใช้ลองไฟล์เดิมซ้ำ")
- **ร้านไม่ใช่ SERVICE_QUEUE**: การ์ดไม่ render เลย (ไม่ใช่ disabled)

### Impeccable compliance (S2)
- **Mode: Operate** — settings form มาตรฐาน
- One Voice / Verified-Means-Green: ไม่แตะ ไม่มี state สีเขียว/ม่วงใหม่ในการ์ดนี้
- Sentence case: label ทุกตัวเป็นประโยคปกติ ไม่ ALL CAPS
- ไม่มี theme ขัด Impeccable

---

## S3 — หน้าพิมพ์ใบเสร็จ (ส่วนใหญ่ของงานนี้)

### Layout — จอ (ก่อนกด print)

**เดสก์ท็อป ≥1024px:**
```
┌ sticky header (print:hidden) ─────────────────────────────────────┐
│ [←] ใบเสร็จรับเงิน · เลขที่ RC-2569-0001         [🖶 พิมพ์ / บันทึก PDF]│
└────────────────────────────────────────────────────────────────────┘
[ ⚠ แถบเตือนถ้าข้อมูลร้านยังไม่ครบ (print:hidden) ]
┌──────────────── พื้นหลังเทากลาง (bg-default-100/body-bg) ────────────┐
│                                                                       │
│              ┌──────────────────────────────┐                       │
│              │        [กระดาษ A4 #1]         │  ← centered, shadow  │
│              │        ต้นฉบับ                 │                       │
│              └──────────────────────────────┘                       │
│                          (ช่องว่าง)                                   │
│              ┌──────────────────────────────┐                       │
│              │        [กระดาษ A4 #2]         │                       │
│              │        สำเนา                   │                       │
│              └──────────────────────────────┘                       │
│                                                                       │
└───────────────────────────────────────────────────────────────────┘
```

**มือถือ <640px:** header เดิมแต่ปุ่มพิมพ์อาจย่อเหลือไอคอน (title truncate) — กระดาษ **ย่อด้วย CSS `transform: scale()`** (ดูรายละเอียดด้านล่าง) ให้พอดีความกว้างจอ + เลื่อนแนวตั้งดูทั้ง 2 แผ่นได้

### ตอนพิมพ์จริง (`window.print()` / Ctrl+P)
- header, แถบเตือน, พื้นหลังเทา, scale ของมือถือ → **หายทั้งหมด**
- เหลือแค่กระดาษ A4 2 แผ่น เต็มขนาดจริง คนละหน้ากระดาษ (`page-break-after`)

### ⚠️ ปัญหาทางเทคนิคที่ต้องแก้ตั้งแต่ต้น (ไม่ใช่ nice-to-have)

**ปัญหา 1 — `(fullscreen)/layout.tsx` เป็น `fixed inset-0 ... overflow-hidden` + `<main className="overflow-y-auto">`**

นี่คือ shell เดียวกับทุกหน้า fullscreen อื่น (edit order, new product ฯลฯ) — บน**จอ**ใช้งานได้ปกติ แต่เมื่อสั่งพิมพ์ เบราว์เซอร์จะ**พิมพ์เฉพาะสิ่งที่มองเห็นในกรอบ scroll ปัจจุบัน** (bug ที่รู้จักกันดีของ `overflow:auto`/`fixed` ตอนพิมพ์) — กระดาษ A4 สูง 297mm×2 แผ่นจะถูกตัดเหลือแค่ความสูง viewport ที่เห็นตอนกดพิมพ์ **โดยไม่มี error ใด ๆ**

**แก้ที่ layout ที่ใช้ร่วม (ปลอดภัย ไม่กระทบหน้าอื่น เพราะเป็นแค่ print media):**
```
// (fullscreen)/layout.tsx — เติม Tailwind print: variant (ไม่ใช่ arbitrary value, HR7 ผ่าน)
<div className="fixed inset-0 z-50 bg-card flex flex-col overflow-hidden
  pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
  print:static print:inset-auto print:h-auto print:overflow-visible print:pt-0 print:pb-0">
  <main className="flex-1 overflow-y-auto scroll-pb-24 print:overflow-visible print:h-auto">
```
เพิ่มแค่ `print:` utility — ไม่มีผลกับหน้าอื่นบนจอเลย (มีผลเฉพาะตอนกด print ซึ่งหน้าอื่นก็ควรได้ผลลัพธ์ที่ถูกต้องขึ้นด้วยเช่นกัน ไม่ใช่แค่หน้านี้)

**ปัญหา 2 — A4 preview บนมือถือ**

ห้ามใช้ `ResizeObserver`/JS วัดความกว้างจริงแล้วคำนวณ scale (โปรเจกต์นี้โดนบั๊กคลาสนี้ซ้ำมาแล้วหลายครั้ง — "วัด DOM แล้วเปลี่ยนสิ่งที่วัด" และ "การวัดที่ตัดสินใจสิ่งที่มันวัด" เป็น anti-pattern ที่บันทึกไว้ใน CLAUDE.md) → ใช้ **CSS custom property + media query ล้วน (ไม่มี JS)**:

```css
/* receipt.module.css */
.scaleWrap {
  --scale: 1;
  width: calc(210mm * var(--scale));
  height: calc(297mm * var(--scale));
  margin: 0 auto;
}
.sheet { transform: scale(var(--scale)); transform-origin: top left; }

@media screen and (max-width: 640px) { .scaleWrap { --scale: 0.5; } }
@media screen and (max-width: 400px) { .scaleWrap { --scale: 0.42; } }
@media print { .scaleWrap { --scale: 1 !important; width: auto; height: auto; } } /* บังคับ 100% ตอนพิมพ์เสมอ แม้พิมพ์จากมือถือ */
```

### CSS Module ที่จำเป็นจริง (HR7 carve-out — ต้องแจ้ง Controller)

กระดาษ A4 เป็น**เอกสารพิมพ์จริง** ไม่ใช่ UI chrome ของแอป — ต้องใช้หน่วยกายภาพ (mm/pt) และ `@page` ซึ่งไม่มีทางแทนด้วย Tailwind utility ของ Paces ได้เลย (Paces ไม่มี token ขนาดที่อิงกระดาษ) เขียนเป็น **CSS Module** (`receipt.module.css`, ไม่ใช่ Tailwind arbitrary bracket ใน className — คนละกลไกกับสิ่งที่ HR7 grep gate ตรวจ) พร้อมคอมเมนต์กำกับหัวไฟล์:

```css
/* carve-out (HR7): เอกสารพิมพ์ A4 ต้องใช้หน่วยกายภาพ mm/pt ตาม CSS print spec
   ไม่มี Paces token ไหนครอบคลุม — ไม่ใช่ chrome ของแอป seller/admin */
@page { size: A4; margin: 0; }
.sheet {
  width: 210mm;
  min-height: 297mm;
  padding: 15mm 16mm 12mm;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg); /* token จริงของ Paces, screen เท่านั้น */
  font-family: inherit; /* สืบทอด Anuphan จาก root layout เสมอ — HR5 ห้าม override */
}
@media print {
  .sheet { box-shadow: none; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
}
/* สีเขียวเอกสาร — เฉพาะกระดาษพิมพ์เท่านั้น ห้ามหลุดไปใช้กับปุ่ม/badge ของแอป (ดู Impeccable compliance) */
.docGreen { color: #1F6B36; }
```

**ของที่ยังต้องใช้ token ของ Paces ปกติ (ไม่ใช่ arbitrary) แม้อยู่ใน CSS module:**
- เส้นประ/เส้นลายเซ็น: `border-bottom: 1px dashed var(--color-default-300)` — token เดียวกับ "The Dashed Card-Header Rule" ของ Paces (บังเอิญตรงกับลาย signature ของธีมพอดี)
- ลายน้ำ "ยกเลิก": `color: var(--color-danger)` opacity ต่ำ — **อ่าน CSS var จริงของธีม ไม่ hardcode hex ใหม่**
- ข้อความเทารอง: `var(--color-default-700)` / `var(--color-default-400)`

### ช่องติ๊ก + สามเหลี่ยมเลขหน้า (HR12-compliant, ไม่มี emoji/ไม่มีอักขระ ☐☑ ที่ไม่อยู่ใน carve-out list)

- **ช่องติ๊ก 4 ช่อง** (เงินสด/เช็ค/โอนเงิน/บัตรเครดิต): วาดด้วย CSS border จริง (`<span className={styles.checkbox}>`, `border: 1px solid var(--color-default-700); width: 9pt; height: 9pt;`) — เครื่องหมายติ๊กใช้ `✓` (อยู่ในชุด dingbat ที่ HR12 ยกเว้นให้ชัดเจน: `★☆✓✗♡▾`) render เป็น `::after` เฉพาะช่องที่ auto-check ตรง
- **สามเหลี่ยมเขียวมุมขวาบน + เลขหน้า**: CSS `clip-path: polygon(100% 0, 100% 100%, 0 0)` สี `.docGreen` + เลขหน้า (`1`/`2`) เป็น `<span>` สีขาว วางด้วย `position: absolute` — **ไม่ใช่รูปภาพ ไม่ใช่ icon font** เป็น decorative CSS ของเอกสาร (asset fidelity ตาม HR6)

### mapping วิธีชำระ → ช่องติ๊ก (เสนอ — ให้ Controller/product ยืนยัน)

| `paymentMethod`/สถานะ | ช่องที่ติ๊ก |
|---|---|
| `CASH` หรือ COD ที่ได้รับแล้ว | เงินสด |
| `TRANSFER`, `PROMPTPAY` | โอนเงิน |
| อื่น ๆ / ไม่รู้ | ไม่ติ๊กเลย |

**ช่องเส้นประ "ธนาคาร___เลขที่___วันที่___จำนวนเงิน___" ปล่อยว่างเสมอ ไม่ prefill จาก `shop.payoutBankCode`** — ค่านั้นคือบัญชี**รับเงิน**ของร้าน ส่วนบรรทัดนี้ในเอกสารจริงคือช่องกรอกด้วยมือสำหรับบันทึกว่า**ลูกค้าโอนจากธนาคารไหน** เป็นคนละข้อมูลกัน prefill ผิดจะทำให้ดูเหมือนระบบรู้ข้อมูลที่มันไม่รู้จริง

### Content outline เต็ม (ไทย, ตามลำดับบนกระดาษ)

```
[โลโก้ร้าน]                                    ใบเสร็จรับเงิน  (docGreen, 20pt bold)
{ชื่อบนใบเสร็จ}                                      ต้นฉบับ / สำเนา  (docGreen, 8pt)
{ที่อยู่}
เลขประจำตัวผู้เสียภาษี {taxId}
โทร. {phone}
───────────────────────────────────── (เส้นบาง var(--color-default-300))
เลขที่          วันที่           ผู้ขาย
{receiptNo}    {formatDate...}  {ชื่อร้าน/ผู้ขาย}
ลูกค้า
{ชื่อลูกค้า}  {เบอร์ลูกค้า}
───────────────────────────────────── (เส้นบาง)

# | รายละเอียด           | จำนวน | ราคาต่อหน่วย | ยอดรวม
1 | {ชื่อรายการ}
  | {คำอธิบาย — สีเทา}    | {n}   | {unitPrice}  | {lineTotal}
...

                                    รวมเป็นเงิน        {subtotal} บาท
                                    ส่วนลด (ถ้ามี)      -{discount} บาท
                                    ภาษีมูลค่าเพิ่ม (ถ้ามี) {vat} บาท
                                    ─────────────────────────
({ตัวเลขเป็นคำอ่าน}ถ้วน)              จำนวนเงินรวมทั้งสิ้น  {total} บาท (11pt bold)

การชำระเงินจะสมบูรณ์เมื่อร้านค้าได้รับเงินเรียบร้อยแล้ว
☐ เงินสด  ☐ เช็ค  ☐ โอนเงิน  ☐ บัตรเครดิต
ธนาคาร___________ เลขที่___________ วันที่___________ จำนวนเงิน___________

ในนาม {ชื่อลูกค้า}                              ในนาม {ชื่อร้าน}
                          [ตราประทับ ถ้ามี]

_______________________          _______________________
     ผู้จ่ายเงิน                        ผู้รับเงิน
     วันที่ ___________                วันที่ ___________
```

**หมายเหตุคำ "บริษัท" → "ร้านค้า"**: reference เขียน "จนกว่าบริษัทจะได้รับเงิน" แต่ Deep มีทั้งร้าน PERSONAL และ BUSINESS ไม่ใช่ทุกร้านเป็นบริษัทจดทะเบียน — ปรับคำเป็น "ร้านค้า" (adapt ตาม HR6 layout/integration ที่ต้องตรงกับ product ปัจจุบัน แม้เนื้อหาส่วนใหญ่ตาม ref ตรง ๆ)

### สูตรจำนวนเงิน — **ต้องเขียนฟังก์ชันใหม่ ห้ามยืมของเดิม (HR16)**

`src/lib/format-money.ts` มี 2 ฟังก์ชัน แต่**ทั้งคู่ใช้ไม่ได้กับใบเสร็จ**:
- `formatBaht` — ซ่อนทศนิยมเมื่อเป็นจำนวนเต็ม (`฿3,680` ไม่มี `.00`) — เอกสารทางการต้องมี `.00` เสมอ (`3,500.00`)
- `formatNumberNoSymbol` — คอมเมนต์หัวไฟล์เขียนห้ามตรงตัว: **"SCOPE: การ์ดยอดขาย command center + ชีตยอดขายเต็มจอ เท่านั้น — ห้ามลากไปใช้ที่ ... ตารางบิล ฯลฯ"**

→ ต้องมีฟังก์ชันใหม่ (แนะนำ `formatReceiptAmount(n)` ใน `src/lib/receipt.ts` ใหม่ หรือ export เพิ่มใน `format-money.ts` โดยตั้งชื่อ+คอมเมนต์ชัดว่าเป็นของใบเสร็จเท่านั้น): บังคับ 2 ตำแหน่งทศนิยมเสมอ ไม่มี `฿` (คำว่า "บาท" อยู่ใน template แยก)

### ตัวเลขเป็นคำอ่านไทย ("...บาทถ้วน") — dependency ที่ยังไม่มีในโค้ดเบส

grep แล้วไม่พบ util นี้ในรีโป — ไม่ใช่ business rule (เป็นสูตรคณิตศาสตร์คงที่) แต่**ต้องมีก่อน build หน้านี้ได้จริง**: แนะนำ npm package สำเร็จรูปเบา (เช่น `thai-baht-text`, ไม่มี dependency หนัก) แทนเขียนเอง — ตาม ladder rung 5 "already-installed/installable dependency" ดีกว่าเขียน algorithm แปลงตัวเลขเป็นคำเอง

### Edge states ที่ต้องออกแบบ

| สถานการณ์ | พฤติกรรม |
|---|---|
| **ไม่พบออเดอร์ / ไม่ใช่ของร้าน active / vertical ≠ SERVICE_QUEUE** | `notFound()` มาตรฐานเดียวกับหน้ารายละเอียดออเดอร์อื่น |
| **ข้อมูลออกใบเสร็จของร้านยังไม่ครบ (S2 ยังไม่ตั้ง)** | แถบเตือน `print:hidden` เหนือกระดาษ: `bg-warning/15 text-default-800` icon `alert-triangle` — "ร้านยังไม่ได้ตั้งข้อมูลออกใบเสร็จ — ใบเสร็จนี้จะไม่มีที่อยู่/เลขผู้เสียภาษี" + ลิงก์ "ไปตั้งค่าที่ร้านค้า" → `/shop` — **ยังพิมพ์ได้** (ฟิลด์ที่ขาดแค่ว่างบนกระดาษ ไม่บล็อก) |
| **ยอด ฿0** (บิลไม่มีรายการ/ยกไว้ก่อน) | แสดง `0.00 บาท`, คำอ่าน "ศูนย์บาทถ้วน" — ไม่ซ่อน field |
| **ยอดหลักล้าน** | `formatReceiptAmount` ต้องรองรับ comma-group ปกติ (`1,234,567.00`) — ทดสอบจริงก่อน ship |
| **ชื่อลูกค้า/ชื่อสินค้ายาวผิดปกติ** | ตาราง cell ต้อง wrap (ไม่ truncate) — เอกสารพิมพ์ต้องอ่านครบ ไม่ตัดทิ้งแบบ UI ทั่วไป |
| **รายการสินค้ายาวเกิน 1 หน้า A4** (edge case ที่ยอมรับได้สำหรับ MVP — SERVICE_QUEUE ปกติมี 1–5 รายการต่อบิล ไม่ใช่ pattern หลัก) | `.sheet` ใช้ `min-height: 297mm` ไม่ใช่ fixed height ตายตัว → เนื้อหาที่ล้นจะดันหน้าถัดไปตาม CSS page-break ปกติของเบราว์เซอร์ ฟุตเตอร์/ลายเซ็นไหลตามไปหน้าถัดไปด้วย — **ระบุเป็นข้อจำกัดที่รู้ตัว ไม่ใช่บั๊ก** เพราะกินเคสที่หายาก ไม่ใช่เคสที่ฟีเจอร์นี้ถูกสร้างมาแก้ (ตาม `known-limitation-vs-unfinished.md`) |
| **ใบยกเลิก (`status === 'CANCELLED'`) ที่เคยออกใบเสร็จไปแล้ว** | ลายน้ำทแยง "ยกเลิก" (`var(--color-danger)` opacity ~0.1, `rotate(-30deg)`, กลางกระดาษ) — เนื้อหาที่เหลือ**ยังแสดงครบ** (ดูของเดิมได้ ไม่ลบข้อมูล) |
| **loading (กำลังออกเลข)** | ปุ่ม ⋯ item disable ชั่วคราวระหว่าง fetch (spinner icon แทน printer) กันกดซ้ำระหว่างรอ POST |

### Theme Source Mapping (S3)

| Section | Theme/Base file path | Component | หมายเหตุ adapt |
|---|---|---|---|
| Toolbar (back+title+ปุ่มพิมพ์) | `src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx` + `FullscreenBackButton.tsx` | ใช้ `toolbarExtra` slot ใส่ปุ่มพิมพ์ แทน `saveFormId` (ไม่มีฟอร์ม) |
| Layout shell | `src/app/(paces)/seller/(fullscreen)/layout.tsx` | **ต้องแก้เพิ่ม `print:` utility** (ดูปัญหา 1 ด้านบน) — กระทบทุกหน้าในกลุ่มอย่างปลอดภัย |
| ไม่พบ theme match ตรงตัวสำหรับกระดาษใบเสร็จ | closest primitive = `theme/paces/Admin/TS/src/app/(admin)/apps/invoice/details/page.tsx` | ยก: การ์ด, `print:hidden`/`print:flex` precedent, ปุ่ม print pattern, ตาราง `table-bordered`/`table-borderless` (สำหรับส่วนสรุปยอด) — **ที่เหลือ (สี/เลย์เอาต์/ช่องติ๊ก/สามเหลี่ยม) มาจาก reference ของ user ตาม HR6** |
| ปุ่มพิมพ์ (`btn`) | `docs/system/ui-guideline/paces-component-reference.md` §1 | `btn bg-primary text-white hover:bg-primary-hover` — **สีน้ำเงิน Paces ปกติ ไม่ใช่ docGreen** (แยกสี UI ปุ่ม ออกจากสีเอกสารพิมพ์ ชัดเจน) |
| CSS module A4 (ใหม่ ไม่มี theme source) | — | `receipt.module.css` — carve-out ตาม HR7 (เหตุผลเต็มด้านบน) |

### User flow
1. Seller เปิดหน้ารายละเอียดออเดอร์ (SERVICE_QUEUE, ไม่ยกเลิก) → กด `⋯` → เห็น "พิมพ์ใบเสร็จ"
2. กด → ถ้ายังไม่เคยออกเลข: ยิง POST ออกเลข (เงียบ ไม่มี toast เพราะกำลังจะย้ายหน้า) → ไป `/orders/{token}/receipt`
3. เห็นกระดาษ A4 2 แผ่น (ต้นฉบับ/สำเนา) บนพื้นหลังเทา + ปุ่ม "พิมพ์ / บันทึก PDF" มุมขวาบน
4. กดปุ่ม → `window.print()` → ระบบ browser print dialog เปิด (เลือกพิมพ์จริงหรือ "Save as PDF")
5. กด `←` กลับไปหน้ารายละเอียดออเดอร์ — เห็น badge "ใบเสร็จเลขที่ X" ในการ์ดสรุป
6. เปิด `⋯` อีกรอบ → เห็น "ดูใบเสร็จ" (ไม่ใช่ "พิมพ์" แล้ว) → กดกลับมาหน้าเดิมได้โดยไม่ออกเลขซ้ำ

### Impeccable compliance (S3)
- **Mode: Operate** (หน้าเครื่องมือของ seller) **สำหรับ chrome รอบกระดาษ** แต่ **ตัวกระดาษเองไม่ใช่ Operate หรือ Brand ของ Deep — มันคือเอกสารทางการที่ต้องเลียนแบบธรรมเนียมใบเสร็จบัญชีไทย** (คนละ "โหมด" จาก mode ทั้ง 4 ของ Impeccable เพราะเป็นสิ่งพิมพ์ออกกระดาษจริง ไม่ใช่หน้าจอ) — ตัดสินใจ: **chrome = Operate (ปุ่ม/แถบเตือน/ปุ่มพิมพ์ ใช้ token Paces ปกติ), กระดาษ = fidelity ตาม reference (HR6)**
- One Voice: ปุ่มพิมพ์เป็นน้ำเงิน Paces ปกติ ≤10% ของจอ — ไม่มีสีตกแต่งอื่นในส่วน chrome
- **Verified-Means-Green**: ไม่เกี่ยว (ไม่มี badge เขียวในหน้านี้ — badge อยู่ที่หน้ารายละเอียดออเดอร์ S1 เท่านั้น)
- **จุดที่ theme (Paces) ขัดกับความต้องการของ ref โดยตรง — และตัดสินใจแล้ว**:
  1. **สีเขียวเอกสาร `#1F6B36`** ไม่ใช่ token ของ Paces (primary=น้ำเงิน, success=ฟ้าอมเขียว `#02bc9c`) และไม่ใช่ Verified Green ของ Vuexy (`#28C76F`, สงวนให้ buyer เท่านั้นตาม HR6 ของ Impeccable) → ตัดสินใจว่า**นี่คือ "เนื้อหา/asset" ของเอกสารที่พิมพ์ออกกระดาษ ไม่ใช่ "UI chrome"** จึงไม่อยู่ใต้กฎสีของแอป — scope สีนี้ไว้ใน CSS module เดียว ห้ามหลุดไปใช้กับปุ่ม/badge ของแอปเด็ดขาด (เขียนคอมเมนต์กำกับในไฟล์)
  2. **หน่วย mm/pt** ขัด HR7 ตรงตัว (ห้าม arbitrary value) → ตัดสินใจว่าเป็น **carve-out ที่จำเป็นจริง** เพราะเอกสารพิมพ์ A4 ไม่มีทางแทนด้วย `rem`/Tailwind scale ได้ (เครื่องพิมพ์อ่านหน่วยกายภาพเท่านั้น) → เขียนเป็น CSS Module (ไม่ใช่ Tailwind bracket) + คอมเมนต์กำกับตามที่ HR7 ต้องการ — **รายงาน Controller ให้ตัดสินใจซ้ำก่อน implement ถ้าไม่เห็นด้วยกับแนวทางนี้**
  3. **ช่องติ๊ก/สามเหลี่ยมเลขหน้า** ไม่มี Paces primitive ตรง → วาดด้วย CSS ล้วน (border/clip-path) ไม่ใช้รูปภาพ/emoji — สอดคล้อง HR12

---

## Design decisions + rationale (สรุปรวม)
1. Print-in-place (ไม่เปิดแท็บใหม่) — ตาม theme precedent + สถาปัตยกรรม fullscreen เดิมทั้งกลุ่ม + ความเสี่ยง WebView
2. ปุ่ม/เมนูอยู่ที่ `⋯` ไม่ใช่ ghost — ตามเกณฑ์ความถี่ใช้งาน + vertical-gating precedent (`return-order`)
3. เลขใบเสร็จแสดงเป็น badge อ่านอย่างเดียวในการ์ดสรุป ไม่ใช่ลิงก์ — ตามกฎ "recap panel ไม่มีปุ่ม action" ที่เขียนไว้ในเอกสารเอง
4. CSS module ใหม่สำหรับ A4/สีเอกสาร — จำเป็นจริง มี carve-out comment ครบ ไม่ปนกับ Tailwind arbitrary value
5. mobile scale ด้วย CSS custom property + media query ล้วน — เลี่ยง JS-measurement anti-pattern ที่โปรเจกต์เจอซ้ำหลายครั้ง
6. เขียนฟังก์ชัน format เงินใหม่แยกจาก `formatBaht`/`formatNumberNoSymbol` — เพราะทั้งคู่มีนโยบายที่ขัดกับเอกสารทางการ (ต้องมี .00 เสมอ) และตัวหลังห้ามใช้นอก scope ตรงตัว
7. YAGNI: ไม่สร้าง live preview ของใบเสร็จใน S2 (ลดความเสี่ยง drift และโค้ดที่ไม่มีคนขอ)

---

## Open questions (ให้ Controller/developer ตัดสิน)

1. **รูปแบบเลขที่ใบเสร็จ** (เช่น `RC-2569-0001`) — เป็น business rule ที่ agent นี้ไม่ตัดสินใจแทน (HR3) ต้องให้ `safepay-product`/Controller กำหนด running-number scheme + ยืนยันว่า **POST endpoint idempotent จริง** (เรียกซ้ำต้องคืนเลขเดิม ไม่สร้างใหม่)
2. **mapping วิธีชำระ → ช่องติ๊ก 4 ช่อง** (เสนอไว้ในตาราง S3) — ต้องมีคนยืนยัน โดยเฉพาะ PromptPay ว่าจัดเป็น "โอนเงิน" ถูกไหม
3. **`thai-baht-text` package** — ให้ developer ตรวจ license/ขนาดก่อนติดตั้ง หรือจะเขียน pure function เอง (ทั้งคู่เป็นทางเลือกที่ยอมรับได้)
4. **สี `#1F6B36`** — ถ้า Controller อยากให้ตรง ref เป๊ะกว่านี้ ต้องขอ hex จริงจากภาพ reference (ตอนนี้ใช้ค่าประมาณจากคำอธิบาย `~#1f6b1f` ในโจทย์)
5. เอกสารบัญชี — ต้องคุยกับ product ว่าฟีเจอร์นี้ต้องการ "ใบกำกับภาษี" (มี VAT breakdown บังคับ) เพิ่มจาก "ใบเสร็จรับเงิน" ธรรมดาไหม (ตอนนี้ spec นี้ทำแค่ใบเสร็จตาม brief)

---

### Anti-slop self-check

1. **เฉพาะกับ Deep**: ใช้ `Order`/`Shop.vertical==='SERVICE_QUEUE'` จริง, ผูกกับ `OrderVocab`/pattern การ์ดที่มีอยู่แล้วในโปรเจกต์ (`ShopPayoutField`, `order-action-set.ts`), แก้ปัญหาที่เกิดจาก schema จริงของโปรเจกต์นี้ (2 ฟังก์ชัน format เงินที่มีอยู่แล้วใช้ไม่ได้) — เอาไปใช้กับสินค้าอื่นไม่ได้ทันทีเพราะผูกกับ vertical/action-set contract ของ Deep ล้วน ๆ
2. **1 อย่างเด่นต่อหน้าจอ**: S1 ไม่เพิ่มลำดับชั้นใหม่ (แค่เมนูรอง+badge เล็ก) โดยตั้งใจ. S3 พระเอกคือ "กระดาษ" เอง — chrome ทั้งหมด (header/แถบเตือน) เป็น `print:hidden` และเบากว่าเนื้อหาบนกระดาษอย่างชัดเจน
3. **ตัด**: ไม่ทำ live preview ในการ์ด S2 (ข้อมูลซ้ำกับ S3, ไม่มีใครขอ) — ตัดตั้งแต่สเปก
4. **states ครบ**: empty (ข้อมูลร้านไม่ครบ), loading (กำลังออกเลข), error (POST ล้มเหลว), เนื้อหายาวผิดปกติ (ชื่อ/รายการ), ตัวเลข 0 และหลักล้าน — ระบุครบในตาราง edge states
5. **copy ตรงจริง**: ปุ่ม "พิมพ์ / บันทึก PDF" บอกสิ่งที่ browser dialog ทำได้จริง; เมนูเปลี่ยนคำ "พิมพ์"→"ดู" เมื่อออกเลขแล้ว กันความเข้าใจผิดว่าจะออกเลขซ้ำ
6. **คำเดียวกัน = ของเดียวกัน**: "ใบเสร็จ" ใช้สม่ำเสมอทั้ง 3 surface ไม่ปนกับ "invoice"/"ใบกำกับภาษี"
7. **สีถูกความหมาย**: badge เขียว = ข้อเท็จจริงที่สำเร็จแล้ว (เลขออกแล้ว, ย้อนไม่ได้) ตรงเงื่อนไข Verified-Means-Green; สีเขียวเอกสารพิมพ์ scope แยกจาก UI สีของแอปโดยสมบูรณ์ มีคอมเมนต์กำกับกันหลุด
8. **มือถือแตะได้จริง**: ปุ่มกลับ 44×44px (มีอยู่แล้วใน `FullscreenBackButton`), เมนู `⋯` item ตาม `dropdown-item` ของธีม, ปุ่มบันทึก S2 `min-h-11`
9. **จอกว้าง 1440**: S3 desktop มีพื้นที่ว่างข้างกระดาษ A4 จริง — **ระบุชัดว่านี่คือ pattern ที่ถูกต้องสำหรับหน้า "print preview"** (เทียบเท่า Word/Google Docs print preview ซึ่งเป็น convention ที่ผู้ใช้คุ้นเคย ไม่ใช่ dashboard ที่ต้องเติมข้อมูล) — ไม่ใช่คอลัมน์ว่างที่ควรมีเนื้อหาแต่ไม่มี

**ไฟล์ที่เกี่ยวข้อง (อ้างอิง ไม่ได้แก้ไข):**
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderDetailClient.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(dashboard)/orders/[token]/components/order-action-set.ts`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderOverflowMenu.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(dashboard)/shop/components/ShopPayoutField.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(dashboard)/shop/components/ShopForm.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(dashboard)/shop/page.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(fullscreen)/layout.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/app/(paces)/seller/(fullscreen)/_shared/FullscreenBackButton.tsx`
- `/Users/craftman/Projects/safepay-receipt/src/lib/format-money.ts`
- `/Users/craftman/Projects/safepay-receipt/theme/paces/Admin/TS/src/app/(admin)/apps/invoice/details/page.tsx`
- `/Users/craftman/Projects/safepay-receipt/docs/system/ui-guideline/paces-component-reference.md`
- `/Users/craftman/Projects/safepay-receipt/docs/conventions/seller-action-placement.md`
