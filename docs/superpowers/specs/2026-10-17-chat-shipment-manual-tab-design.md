# หน้าต่างพัสดุในแชท — เพิ่มทาง "ส่งเอง" (Design Spec จาก safepay-ux, 2026-10-17)

> บั๊กจาก user 2026-10-17: หน้าต่างพัสดุในแชทมีแค่ [สร้างพัสดุใหม่ | เลือกจาก iShip] ร้านที่ส่งพัสดุกับขนส่งข้างนอกเองกรอกเลขพัสดุจากแชทไม่ได้
>
> **มติ Controller ต่อ Open questions:** (1) ร้านเชื่อม iShip เริ่มที่ "สร้างพัสดุ iShip" ตามที่ UX เสนอ · (2) ข้อความแจ้งของส่งเองไม่แนบลิงก์ iShip · (3) ชื่อปุ่มบน CustomerPanel — นอกขอบเขต · (4) react-select — นอกขอบเขต · (5) แปลง `Invalid transition` เป็นข้อความไทยที่ route — ทำในรอบนี้

## หน้าต่างพัสดุในแชท: เพิ่ม "ส่งเอง" (`src/app/(paces)/seller/(chat)/_components/ShipmentDraftPanel.tsx`)

Mode: Operate. นี่คือคอนโซลผู้ขายและเป็นงานซ้ำทุกวัน ความคุ้นเคยกับหน้า order detail ชนะการแสดงออกทุกข้อ

Theme Source: `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx` (ฟอร์ม) และ `theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx` (ปุ่ม/segmented) ผ่านไฟล์พี่น้องที่ copy มาแล้ว (ตารางข้างล่าง) · ป้ายถัดไป: `stage:build`

อ่านครบตามลำดับ: PRODUCT.md, DESIGN.md, `operate.md`, `shape.md`, ShipmentDraftPanel, ShipmentEntryModal, ShipForm, order-context route, `getShipmentPanelOrReason`, `shipOrder`/`updateShipmentTracking`, DraftOrderProvider, CustomerPanel, OrderProgressBar, state-snapshots:150. ไม่ได้อ่าน `.impeccable/design.json` และ `frontend-design/SKILL.md` ซ้ำ เพราะ DESIGN.md ครอบทั้งสองส่วนที่งานนี้ใช้ (ดูหัวข้อ "ไม่ได้เช็ค" ท้ายสุด)

### สิ่งที่พบ: ไม่ใช่แค่เพิ่มแท็บ

1. **ร้านที่ยังไม่เชื่อม iShip เปิดหน้าต่างนี้แล้วเจอทางตัน**
   - `GET /api/seller/iship/order-context` ตอบ 404 `NOT_ELIGIBLE` เมื่อร้านไม่มี `ShopShippingAccount` หรือเป็น `DISCONNECTED` (`iship.service.ts:579-585`)
   - panel ตีเป็น `loadError` (`ShipmentDraftPanel.tsx:181`) แล้วโชว์กล่องแดงกับปุ่ม "ลองใหม่" ที่กดกี่ครั้งก็ไม่ผ่าน
   - ปุ่ม "สร้างพัสดุ" บน CustomerPanel (`:606`) โผล่ให้ทุกร้านที่ `fulfillmentMode !== 'NO_SHIPPING'` ร้านเหล่านี้จึงเห็นปุ่มที่พาไปหน้าผิดพลาด
   - สำหรับร้านกลุ่มนี้ "ส่งเอง" คือทั้งหน้าต่าง ไม่ใช่ทางเลือกที่สาม ซึ่งตรงกับข้อจำกัดใน PRODUCT.md ว่า "Free core ต้องทำงานได้ครบด้วยมือ"
2. **แชทไม่รู้ว่าออเดอร์ส่งเองไปแล้วหรือยัง**
   - context ไม่มี `order.status` และไม่มี `ShipmentTracking`
   - ถ้าเพิ่มแท็บเฉย ๆ ออเดอร์ที่ `SHIPPED` ส่งเองแล้วจะเปิดมาเจอฟอร์ม "สร้างพัสดุใหม่" อีกรอบ และอาจเปิดใบ iShip ซ้ำจนเสียเงิน
   - ถ้าเลือกส่งเองซ้ำ จะได้ข้อความอังกฤษดิบ `Invalid transition: SHIPPED → SHIPPED` จาก `shipOrder` ผ่าน toast ของ ShipForm
3. **กับดัก FAILED (state-snapshots:150) มีอยู่ในหน้าต่างแชทด้วย**
   - ใบ FAILED เข้าเงื่อนไข `ctx.shipment && !forceForm` (`:221`) ได้ `ShipmentStatusView` แบบอ่านอย่างเดียว
   - ถ้า error เป็นเครดิตไม่พอ ปุ่มทึบคือ "เติมเงิน" ส่วนทางไปส่งเองมีแค่ปุ่ม ghost "แก้ที่อยู่หรือขนส่ง" ซึ่งชื่อไม่บอกว่าจะพาไปแท็บส่งเอง

### Contract ที่ต้องขอจาก backend ก่อน (ให้ safepay-developer ออกแบบ type)

ขยาย `order-context` ตามนี้ ไม่ใช้ string match บน `error.message`:

- ทุกกรณีที่ออเดอร์มีอยู่และเป็นของร้านนี้ ตอบ **200** พร้อม field ใหม่ 3 ตัว:
  - `ishipState: 'READY' | 'NOT_CONNECTED' | 'DISCONNECTED'`
  - `orderStatus: string`
  - `manualShipment: { provider: string; trackingNo: string } | null`
- เมื่อ `ishipState !== 'READY'` ตัวแปรชุด `receiver/sender/items/defaults…` ไม่ต้องมี (ใช้ type แบบ union)
- 404 เหลือเฉพาะ "ไม่พบคำสั่งซื้อ" และ `SKIP_SILENT` (ไม่ต้องจัดส่ง) ซึ่งปุ่มซ่อนอยู่แล้ว
- ข้อควรระวังฝั่ง server: หน้า order page ตัดสินว่า "มีพัสดุ" ที่ `CREATED && !isDryRun` ส่วน API นี้ส่งใบ FAILED กลับมาด้วย (`status != CANCELLED`) client ต้องใช้นิยามเดียวกับ page (`orders/[token]/page.tsx:403`) ห้ามเขียนใหม่

### Layout (ASCII)

หน้าต่างแชทกว้าง `lg:w-96` = **384px** บน desktop และเต็มจอ (`inset-0`) ใต้ 1024px จึงเป็น 360px บนมือถือเล็ก. เนื้อหามี `px-4` เลยเหลือ **328px** ใช้ได้กับ 3 ปุ่ม

**A. ร้านเชื่อม iShip แล้ว, ออเดอร์ PENDING, ยังไม่มีพัสดุ**
```
┌───────────────────────────────────────┐ bg-primary (title-bar เดิม)
│ พัสดุ · คุณสมชาย            [–] [x]   │
├───────────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┐       │ px-4 pt-4, role=radiogroup
│ │  ✎      │   📦    │   🔗    │       │ (icon จริง ไม่ใช่ emoji)
│ │ ส่งเอง  │ สร้างพัสดุ │ เลือกจาก │      │ min-h-11, ซ้อน icon บน/ป้ายล่าง
│ │         │  iShip  │  iShip  │       │ ค่าเริ่มต้น = ปุ่มกลาง (ทึบ)
│ └─────────┴─────────┴─────────┘       │
│  …เนื้อแท็บ iShip เดิม (ไม่แตะ)…       │
└───────────────────────────────────────┘
```

**B. แท็บ "ส่งเอง" (ร้านเชื่อม iShip เลือกเอง หรือร้านไม่ได้เชื่อม)**
```
│ [ส่งเอง*][สร้างพัสดุ iShip][เลือกจาก iShip]│  ← ร้านไม่เชื่อม iShip: ไม่มีแถบนี้เลย
│ ส่งของกับขนส่งเอง แล้วนำเลขพัสดุมากรอก  │  text-xs text-default-700
│ ที่นี่เพื่อแจ้งผู้ซื้อ                     │
│ ขนส่ง *                                 │  form-label text-xs
│ [ -- เลือกขนส่ง --              ▾ ]     │  (ShipForm เดิม)
│ เลขพัสดุ *                              │
│ [ เช่น TH123456789               ]     │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  border-b-8 border-default-100
│ ☐ แจ้งเลขติดตามในแชทหลังบันทึก           │  checkbox เดิมจาก :325 (ปิดไว้)
│    ส่งเป็นข้อความให้ลูกค้าในห้องนี้ทันที…  │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐          │  แสดงเมื่อติ๊ก (dashed เดิม)
│   ข้อความที่ลูกค้าจะได้รับ                │
│   จัดส่งด้วย (ขนส่งที่เลือก)             │
│   เลขติดตามพัสดุ: (เลขที่กรอกด้านบน)     │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘          │
│ [🚚      ยืนยันจัดส่ง           ]        │  btn w-full bg-primary p-3 (ในกระแส)
└───────────────────────────────────────┘
```

**C. ออเดอร์ส่งเองไปแล้ว** (`manualShipment != null`, ไม่มีใบ iShip active)
```
│ ┌────┐ ┌─────────────────────────┐     │
│ │ KE │ │ TH123456789        [⧉]  │     │  เลขพัสดุ = พระเอก text-lg font-bold tabular-nums
│ └────┘ │ [ส่งเอง] Kerry Express  │     │  badge เทากลาง + ชื่อขนส่ง text-xs
│        └─────────────────────────┘     │
│ ส่งเอง ระบบจึงไม่ได้ติดตามสถานะพัสดุให้   │  text-xs text-default-700
│ [ ➤   แจ้งเลขในแชท              ]      │  btn bg-primary (ปุ่มทึบใบเดียว)
│ แก้เลขพัสดุได้ที่หน้าคำสั่งซื้อ  (ลิงก์)   │  text-xs, next/link → /orders/{token}
```

**D. ไม่ใช่ PENDING และยังไม่มีพัสดุ** (`DRAFTED`/`CONFIRMED`/`CANCELLED`) → กล่องแจ้งแบบ `bg-warning/15 text-warning-ink` (โครงเดียวกับกล่อง `loadError` ที่ `:184` แต่เปลี่ยนสี): "คำสั่งซื้อนี้อยู่สถานะ {ชื่อสถานะ} จึงแจ้งเลขพัสดุไม่ได้" ไม่มีปุ่มตัน ใช้ชื่อสถานะจาก SSOT ที่ OrderCardView ใช้อยู่ ห้ามเขียนชุดใหม่

### Theme Source Mapping

| Section | Theme/Base file | Component | หมายเหตุ adapt |
|---|---|---|---|
| segmented 3 ปุ่ม | `theme/paces/.../ui/buttons/page.tsx` (btn) → Base จริง `…/orders/[token]/components/ShipmentEntryModal.tsx:85-92, 169-192, 266-292` | `SEGMENTS`, `onSegKeyDown`, `segCls`, radiogroup | ดูข้อ "Segmented" ด้านล่าง |
| ฟอร์มส่งเอง | `theme/paces/.../form/elements/components/InputTextfieldType.tsx` → Base จริง `…/orders/[token]/components/ShipForm.tsx` | `ShipForm` (alwaysOpen + hideActions + formId) | reuse ตรง ๆ ได้ ดูข้อ "ShipForm" |
| ช่องติ๊กแจ้ง + preview | `ShipmentDraftPanel.tsx:325-353` | `extraFields` เดิม | ย้ายออกมาเป็นบล็อกของ panel เอง ใช้ state `notify` เดิม |
| ปุ่ม submit | `ShipmentCreateForm.tsx:1080-1095` | `btn inline-flex w-full … bg-primary p-3` | ไอคอน `tabler:truck-delivery`, busy = `tabler:loader-2 animate-spin` |
| มุมมอง C | `src/components/safepay/iship/ShipmentStatusView.tsx:609-649` | head block (tile `size-11`, เลข `text-lg font-bold`, chip copy `bg-primary/15 text-primary-ink size-7`) | copy โครง ตัด timeline/carrierStatus ออก, โลโก้ผ่าน `courierLogoUrl` ตัวเดิมที่ OrderProgressBar ใช้ |
| ปุ่ม "แจ้งเลขในแชท" | `ShipmentDraftPanel.tsx:235-248` | `handleNotifyNow` | generalize ให้รับ `{provider, trackingNo}` ไม่ผูกกับ `ShipmentViewJson` |
| กล่อง D | `ShipmentDraftPanel.tsx:184` | alert box | เปลี่ยน `danger` เป็น `warning` |

ไม่พบ theme match ที่ตรงกว่านี้สำหรับ "segmented" โดยตรง (`ui/buttons` มีแต่ `.btn`) closest primitive = `.btn` ต่อกันแบบเดียวกับที่ sibling สองไฟล์ทำอยู่ จึงใช้ของในโปรเจกต์เป็น Base. ไม่มี custom component ใหม่

### การตัดสินใจหลัก

**Segmented (ลำดับ/ป้าย/ไอคอนตรง modal ตาม parity)**
- ลำดับ `ส่งเอง | สร้างพัสดุ iShip | เลือกจาก iShip` ไอคอน `edit | package-export | link` (ชื่อทั้งหมดใช้อยู่แล้วในไฟล์พี่น้อง)
- ใช้ `role="radiogroup"` + roving tabindex + ลูกศร/Home/End ตาม modal. อย่าใช้ `group`/`aria-pressed` เดิมของแผงนี้ เพราะ modal เขียนไว้ว่าประกาศผิดชนิด
- **ข้อเสนอ:** ดึง `SEGMENTS` + keyboard handler ไปเป็น component ร่วมใน `src/components/safepay/iship/` ให้ modal กับแชทใช้ตัวเดียว (copy สอง ที่ = parity หลุดรอบหน้า). ถ้าไม่อยากแตะ modal ให้ copy พร้อมคอมเมนต์ชี้กลับ
- **ต่างจาก modal แค่การจัดวางภายในปุ่ม:** ไอคอนอยู่บน ป้ายอยู่ล่าง (`flex-col gap-1 px-1`) ไม่ใช่เรียงแนวนอน. เหตุผล: ปุ่มละ ~109px แต่ `.btn` มี `px-4` (`_buttons.css:6`) เหลือที่ให้ป้ายราว 53px แนวนอนแล้ว "สร้างพัสดุ iShip" จะหัก 2-3 บรรทัดไม่เท่ากัน. แบบซ้อนได้ราว 99px พอดีบรรทัดเดียว (เป็นการประมาณ ต้องเช็คด้วยจอ 360px จริง)
- ขนาดตัวอักษร `text-xs`, `min-h-11` ทุกจอ (ต่างจากปุ่มปกติที่ผ่อนบน desktop เพราะ segmented เป็นของที่นิ้วกดบ่อย)
- ห้ามใส่ `leading-*` ทับ ธีมล็อกที่ 1.5 ซึ่งไทยต้องการ
- ปิดใช้ทั้งแถบ (`disabled`) ตอน `manualSubmitting` เหมือน modal
- แถบนี้เลื่อนตามเนื้อหา (ไม่ sticky) ไม่เป็นไร เพราะแท็บส่งเองสั้น ส่วนแท็บ iShip เป็นพฤติกรรมเดิม

**ค่าเริ่มต้นของแท็บ**
- ร้านเชื่อม iShip: เริ่มที่ **สร้างพัสดุ iShip** (พฤติกรรมเดิมของแผงนี้ และชื่อปุ่ม "สร้างพัสดุ" บน CustomerPanel สัญญาไว้แบบนั้น)
- ร้านไม่เชื่อม/เชื่อมถูกยกเลิก: **ไม่มีแถบเลือก** ฟอร์มส่งเองเลย พร้อมประโยคช่วย (ตรงกับ modal ที่ `showSegmented = canUseIship && …`)
- นี่คือจุดที่ **เบี่ยงจาก modal โดยตั้งใจ**: modal เริ่มที่ "ส่งเอง" เสมอ ผมเลือกไม่เปลี่ยนค่าเริ่มต้นเดิมของร้านที่ใช้ iShip อยู่ ถ้า Controller ต้องการ parity เป๊ะ ให้เปลี่ยนเป็น "ส่งเอง" ได้ทันที
- ใบ FAILED: ใต้ `ShipmentStatusView` เพิ่มปุ่ม ghost `btn text-default-700 hover:bg-default-100` ป้าย **"ส่งเองแทน"** ไอคอน `tabler:edit` ตั้ง `forceForm=true` + แท็บ = ส่งเอง. ต้องมีทั้งเคสเครดิตไม่พอและเคสอื่น เพราะปุ่ม "แก้ที่อยู่หรือขนส่ง" ไม่บอกว่าไปส่งเองได้ (ปิดกับดัก snapshot:150 ที่ฝั่งแชท)

**ShipForm ใช้ตรง ๆ ได้ แต่ต้องแก้ 3 จุดแบบ additive** (ผู้เรียกเดิมไม่กระทบ)
- ShipForm ไม่ผูก router ถ้าส่ง `onSuccess` (`:133-140`) และไม่ผูก props เกี่ยวกับ modal เลย ใช้ `alwaysOpen hideActions formId="chat-shipment-manual-form" onSubmittingChange` ได้ทันที
- (ก) `onSuccess` ส่งค่าที่บันทึกกลับ: `onSuccess?: (saved: { provider: string; trackingNo: string }) => void` เพราะข้อความแจ้งต้องใช้ขนส่งกับเลข
- (ข) เพิ่ม `silentSuccess?: boolean` ปิด toast ของ ShipForm (`:132`) ให้ panel เป็นเจ้าของ toast เหมือนเส้น iShip ไม่งั้นได้ toast สองใบ (สำเร็จ แล้วตามด้วย warning ถ้าส่งแชทพลาด). ต่อให้ไม่ใช้ `silentSuccess` ก็แนะนำให้ toast เดิมมี `(${trackingNo})` ต่อท้ายด้วย
- (ค) ช่องเลขพัสดุเพิ่ม `enterKeyHint="done"`: iOS overlay ไม่หดตามคีย์บอร์ด (memory `feedback_ios_fixed_overlay_visual_viewport`) ปุ่มยืนยันอยู่ราว 380px จากหัวเนื้อหา มีโอกาสถูกคีย์บอร์ดบังบนจอเล็ก ให้กด Enter ส่งฟอร์มได้
- ไม่มี sticky footer เพราะฟอร์มสั้น ปุ่มอยู่ในกระแส ต่อท้ายแบบเดียวกับปุ่มสร้างพัสดุของ `ShipmentCreateForm` ที่ไม่ใช่ `hideSubmit` (สอดคล้อง "footer" ของ panel นี้ ซึ่งไม่เคยมี sticky)
- ไม่มีปุ่ม "ปิด" ในฟอร์ม (หัวหน้าต่างมี X + `requestClose` ถามยืนยันอยู่แล้ว ซึ่งเป็นพฤติกรรมเดียวกับฟอร์ม iShip)
- ตัวเลือกขนส่งยังเป็น `react-select` ของเดิม (HR6 กำหนด native `form-select`) ปล่อยไว้เพื่อ parity กับ modal เป็นหนี้ที่รู้แล้ว ดู Open questions

**หลังบันทึกสำเร็จ (ตาม user สั่ง 2026-10-12: ปิดเลย)**
- ลำดับเหมือน `handleCreated` เป๊ะ:
  1. บันทึกสำเร็จ → ถ้าติ๊กแจ้ง ส่งข้อความเข้าห้อง
  2. ส่งผ่าน → `pacesToast.success('บันทึกการจัดส่งและแจ้งเลขติดตามแล้ว')` แล้ว `onDone()`
  3. ส่งไม่ผ่าน → `pacesToast.warning('บันทึกการจัดส่งแล้ว (TH123…) แต่ส่งข้อความไม่สำเร็จ กรุณาแจ้งลูกค้าเอง')` แล้ว **ปิดเช่นกัน** (ไม่มีหน้าสถานะรอให้กดแจ้งซ้ำ ซึ่งต่างจาก iShip ที่ค้างหน้าสถานะ จึงต้องมีเลขในประโยค. ร้านแจ้งทีหลังได้จากมุมมอง C ตอนเปิดใหม่)
  4. ไม่ติ๊กแจ้ง → `pacesToast.success('บันทึกการจัดส่งแล้ว (TH123…)')` แล้ว `onDone()`
- `onDone` เดิมเรียก `router.refresh()` เมื่อเปิดห้องนั้นอยู่ (`DraftOrderProvider.tsx:659`) การ์ดออเดอร์ในแชทจึงเห็น SHIPPED เอง
- ช่องติ๊กแจ้ง **ใช้กับแท็บส่งเองด้วย**, ปิดไว้เป็นค่าตั้งต้น ด้วยเหตุผลเดิม (ส่งข้อความหาลูกค้าถอนคืนไม่ได้) ใช้ state `notify` ตัวเดียวกัน. มุมมอง C มีปุ่ม "แจ้งเลขในแชท" แทน
- **ข้อความแจ้งของส่งเอง:** `trackingMessage()` (`:55`) ต้องแยกโหมดส่งเอง:
  - ไม่ใส่บรรทัดลิงก์ `app.iship.cloud/tracking?...` เพราะยังไม่มีหลักฐานว่าหน้านั้นหาเลขที่ไม่ได้เปิดผ่าน iShip เจอ การส่งลิงก์ตายให้ลูกค้าแย่กว่าไม่ส่งลิงก์ (Open question 2)
  - ถ้าขนส่งที่เลือกคือ "อื่นๆ" ให้ตัดบรรทัด `จัดส่งด้วย …` ทิ้ง
  - preview กับข้อความจริงต้องมาจากฟังก์ชันเดียวกันตามกฎที่เขียนไว้หัวฟังก์ชัน (ตัวยึดตำแหน่ง: "(ขนส่งที่เลือก)", "(เลขที่กรอกด้านบน)")

**state matrix**

| สภาพ | แสดง |
|---|---|
| โหลด context | skeleton เดิม `:200` |
| 404 ไม่พบคำสั่งซื้อ | กล่อง error เดิม + ลองใหม่ (ลองใหม่มีความหมายแล้วเพราะไม่ใช่เคสไม่เชื่อม iShip) |
| `NOT_CONNECTED`/`DISCONNECTED` + PENDING + ไม่มี manual | B แบบไม่มีแถบเลือก |
| `READY` + `blockedBy` (ผู้ส่งไม่ครบ) | `SenderIncompleteNotice` เดิม **แต่ต้องมีทางออก** เพิ่มปุ่ม ghost "ส่งเองแทน" ให้ร้านที่ที่อยู่ผู้ส่งยังไม่ตั้งยังแจ้งเลขได้ (ทางตันแบบเดียวกับ FAILED) |
| มีใบ iShip active (`CREATED && !isDryRun`) | `ShipmentStatusView` เดิม ไม่มีแถบเลือก (ISHIP ชนะ MANUAL เหมือน `page.tsx:396`) |
| มี `manualShipment` | C |
| `orderStatus` ≠ PENDING และไม่มีพัสดุ | D |
| ชื่อขนส่ง/เลขพัสดุยาวผิดปกติ | เลข `truncate` + `aria-label` เต็ม, ชื่อขนส่ง `truncate` (flex ต้องมี `min-w-0` ทุกชั้น ดู `flex-header-truncation`) |
| POST ล้ม | toast error ข้อความจากเซิร์ฟเวอร์ ฟอร์มคงค่าไว้ ไม่ปิดหน้าต่าง |

**`onViewOnlyChange`**: มุมมอง C, D และกล่องผู้ส่งไม่ครบ = `true` (ปิดได้ไม่ถามยืนยัน). ฟอร์มส่งเอง = `false` (ถามก่อนปิดตามเดิม)

### Content outline (ไทย)

- helper (ใต้แถบเลือก): "ส่งของกับขนส่งเอง แล้วนำเลขพัสดุมากรอกที่นี่เพื่อแจ้งผู้ซื้อ" (ประโยคเดียวกับ modal)
- label: "ขนส่ง", "เลขพัสดุ", placeholder "เช่น TH123456789" (เดิมใน ShipForm)
- checkbox: "แจ้งเลขติดตามในแชทหลังบันทึก" / "ส่งเป็นข้อความให้ลูกค้าในห้องนี้ทันทีที่บันทึกเสร็จ" (แก้คำ "สร้าง/เปิดพัสดุ" ให้ตรงงาน)
- ปุ่ม: **"ยืนยันจัดส่ง"** (ตรงกับ order page เพื่อให้การกระทำเดียวกันอ่านเหมือนกัน), busy "กำลังบันทึก..."
- ปุ่มใบ FAILED / ผู้ส่งไม่ครบ: "ส่งเองแทน"
- มุมมอง C: badge "ส่งเอง", ประโยค "ส่งเอง ระบบจึงไม่ได้ติดตามสถานะพัสดุให้", ปุ่ม "แจ้งเลขในแชท", ลิงก์ "แก้เลขพัสดุได้ที่หน้าคำสั่งซื้อ"
- D: "คำสั่งซื้อนี้อยู่สถานะ{ชื่อสถานะ} จึงแจ้งเลขพัสดุไม่ได้ ตรวจสถานะได้ที่การ์ดคำสั่งซื้อ"
- toast ตามหัวข้อ "หลังบันทึกสำเร็จ"
- ห้าม emoji ทุกจุด (wireframe ด้านบนใช้สัญลักษณ์แทนไอคอนเท่านั้น)

### a11y

- แถบเลือก: `role="radiogroup" aria-label="เลือกวิธีจัดส่ง"`, ปุ่ม `role="radio" aria-checked`, tabindex เดียวทั้งกลุ่ม, ลูกศร/Home/End
- ปุ่ม copy: `aria-label="คัดลอกเลขติดตาม {เลข}"` (แบบ `ShipmentStatusView:630`) และต้องมี role รองรับ (`aria-name-requires-supporting-role`)
- error ของ ShipForm ผูก `aria-describedby`/`aria-invalid` ไว้แล้ว ห้ามทำหาย
- ปุ่ม busy ยังอยู่ที่เดิม `disabled:opacity-60` เปลี่ยนป้าย ไม่ใช่เปลี่ยนตำแหน่ง
- tap target: segmented `min-h-11`, submit `p-3` (≈45px), ช่องติ๊ก 18px แต่ทั้ง `<label>` เป็นพื้นที่กด ถ้าตรวจพบแคบกว่า 44px ให้ใส่ `min-h-11 items-center` ที่ label
- `prefers-reduced-motion`: spinner เป็นของเดิม ไม่มี animation ใหม่

### Impeccable compliance

- **Mode: Operate** ตามข้างบน ไม่มีอะไรตกแต่ง ทุกอย่างคือของพี่น้องที่ใช้อยู่แล้ว
- **One Voice / พระเอก:** accent น้ำเงิน `bg-primary` ปรากฏเฉพาะ (1) segmented ที่เลือกอยู่ (2) ปุ่ม submit หรือ "แจ้งเลขในแชท" (3) chip copy `bg-primary/15` (4) title-bar เดิมของหน้าต่าง. ที่เหลือเทากลาง. พระเอกของแท็บส่งเอง = ปุ่ม "ยืนยันจัดส่ง"; พระเอกของมุมมอง C = เลขพัสดุ `text-lg font-bold`
- **Verified-Means-Green:** ไม่ใช้เขียวกับ "ส่งเอง" เลย เพราะร้านกรอกเลขเองและไม่มีขนส่งยืนยัน badge จึงเป็นเทากลาง `bg-default-100 text-default-700`. toast สำเร็จเป็นสีมาตรฐานของ `pacesToast.success` ซึ่งหมายถึง "บันทึกสำเร็จ" ไม่ใช่ "พัสดุยืนยันแล้ว"
- **ธีมขัด Impeccable:** ไม่มีจุดที่ขัด. จุดเสี่ยงเดียวที่ Controller ควรเพ่งตอน critique: น้ำเงินทึบสามก้อนในจอเดียว (title-bar + segmented + submit). ถ้าตัดสินว่าหนัก ให้เปลี่ยน segmented ที่เลือกเป็น tonal `bg-primary/15 text-primary-ink` ทั้งสองพื้นผิวพร้อมกัน (modal ด้วย) ไม่ใช่ทีละที่
- ไม่มี arbitrary value ใหม่ ทุกคลาสเป็น Paces primitive (`text-xs`, `size-11`, `gap-1`, `px-1`, `bg-{semantic}/15`, `text-{semantic}-ink`, `min-h-11`). น้ำเสียง: ปุ่มบอกผลลัพธ์ ข้อความ D บอกเหตุกับทางต่อ ไม่มี "ไม่สามารถ…ได้" และไม่กล่าวหา. sentence case ไม่มี ALL CAPS

### Anti-slop self-check

1. **เฉพาะ Deep:** ทั้งสเปกผูกกับกับดัก FAILED ของ iShip, ShopShippingAccount, `fulfillmentMode`, order state machine ของเรา และกฎ "ส่งเอง = ไม่มีเขียวเพราะไม่มีใครยืนยัน" เอาไปใช้กับสินค้าอื่นไม่ได้
2. **พระเอก 1 อย่างต่อจอ:** ระบุแล้วต่อมุมมอง (B = ปุ่มยืนยัน, C = เลขพัสดุ)
3. **ตัดของซ้ำ/คงที่:** ไม่เพิ่มการ์ด ไม่เพิ่มปุ่ม "ปิด" ในฟอร์ม (หัวหน้าต่างมีอยู่), ไม่เพิ่ม timeline/สถานะขนส่งให้ส่งเอง (ไม่มีข้อมูล) และไม่เพิ่มลิงก์ "เชื่อม iShip" ในเคสไม่เชื่อมเพราะ modal พี่น้องไม่มี
4. **ครบทุก state:** ตาราง state matrix ครอบ loading/error/ไม่เชื่อม/ผู้ส่งไม่ครบ/FAILED/มีพัสดุ/ส่งเองแล้ว/ไม่ใช่ PENDING/ข้อความยาว. ตัวเลข 0 ไม่เกี่ยวกับงานนี้
5. **copy ตรงความจริง:** ไม่ชวนให้กดสิ่งที่ไม่มีในสถานะนั้น (D ไม่มีปุ่มตัน) และมุมมอง C บอกตรง ๆ ว่าระบบไม่ติดตามให้ ไม่ทำให้ร้านเข้าใจว่ามี tracking
6. **คำเดียวกัน = ของเดียวกัน:** "ส่งเอง", "ยืนยันจัดส่ง", "แจ้งเลขในแชท" ตรงกับ ShipmentEntryModal / ปุ่มเดิมทุกตัว
7. **สีสื่อความหมายถูก:** ตามหัวข้อ Verified-Means-Green; ไม่ใช้แดงกับ D (เป็นสถานะปกติ ใช้ warning)
8. **แตะได้บนมือถือ:** ตามหัวข้อ a11y; ความเสี่ยงคีย์บอร์ดบังปุ่มแก้ด้วย Enter-to-submit
9. **จอ 1440:** หน้าต่างกว้างคงที่ 384px ชิดขวา ไม่มีคอลัมน์ว่างให้พูดถึง

### Open questions (ให้ Controller)

1. ยืนยันค่าเริ่มต้น: ร้านเชื่อม iShip เริ่มที่ "สร้างพัสดุ iShip" (ผมเลือก) หรือ "ส่งเอง" ตาม modal?
2. หน้าติดตามสาธารณะของ iShip หาเลขที่ไม่ได้เปิดผ่าน iShip เจอไหม? ถ้าเจอ จะใส่บรรทัดลิงก์ในข้อความส่งเองได้ ตอนนี้ผมตัดทิ้งเพราะยืนยันไม่ได้. (เป็นเรื่องที่ต้องถาม product ไม่ใช่ผมกำหนด)
3. ชื่อปุ่ม "สร้างพัสดุ" บน CustomerPanel (`:615`) จะผิดความหมายสำหรับร้านที่ไม่เชื่อม iShip ซึ่งจะเปิดมาเจอ "ยืนยันจัดส่ง". ใช้ "จัดส่ง" แทนได้ไหม หรือปล่อยไว้ (นอกขอบเขตงานนี้)
4. ตัวเลือกขนส่งใน ShipForm เป็น `react-select` ขัด HR6 (ควรเป็น native `form-select` จาก `InputTextfieldType.tsx`) ปล่อยไว้เพื่อ parity กับ modal. ต้องการเก็บเป็นงานแยกไหม (menu ของ react-select ไม่ได้ portal จึงขยายความสูงที่เลื่อนในหน้าต่าง)
5. ข้อความอังกฤษดิบ `Invalid transition…` จาก `shipOrder` (`order.service.ts:63`) หลุดถึงผู้ใช้ได้เมื่อมีสองแท็บ/สองคนกดพร้อมกัน ควรแปลงเป็น error ไทยที่ route (นอกขอบเขตงาน UI แต่ผมเห็นแล้ว)

### ไม่ได้เช็ค / ความเสี่ยง

- ไม่ได้เปิดเบราว์เซอร์ ความกว้างปุ่มแท็บ (~99px ต่อ label) และการหักบรรทัดเป็นการคำนวณ ต้องวัดที่ 360px จริง
- ยังไม่ได้อ่าน `.impeccable/design.json` และ `.claude/skills/frontend-design/SKILL.md` ซ้ำ (DESIGN.md/PRODUCT.md ครอบข้อกำหนดที่งานนี้ใช้)
- ยังไม่ได้ยืนยันชื่อไอคอนใน gallery `(admin)/icons/tabler` (grep ไม่พบเพราะ gallery น่าจะสร้างรายการแบบไดนามิก) ชื่อที่ใช้ทั้งหมดมีอยู่แล้วในไฟล์พี่น้องที่ใช้งานจริง
- ไม่ได้ตรวจว่ากล่อง D ควรใช้ฟังก์ชันชื่อสถานะตัวไหนใน OrderCardView (ให้ developer หาตัวเดียวกับที่การ์ดใช้)

ไฟล์ที่เกี่ยวข้อง (path เต็ม):
- `/Users/craftman/Projects/safepay/src/app/(paces)/seller/(chat)/_components/ShipmentDraftPanel.tsx`
- `/Users/craftman/Projects/safepay/src/app/(paces)/seller/(chat)/_components/DraftOrderProvider.tsx`
- `/Users/craftman/Projects/safepay/src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShipmentEntryModal.tsx`
- `/Users/craftman/Projects/safepay/src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShipForm.tsx`
- `/Users/craftman/Projects/safepay/src/app/api/seller/iship/order-context/route.ts`
- `/Users/craftman/Projects/safepay/src/services/iship.service.ts` (`getShipmentPanelOrReason`, บรรทัด 575)
