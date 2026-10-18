# Design Spec — 00080 ขั้นตอนจัดส่งแบบส่งเอง (safepay-ux gate · HR8)

> ที่มา: safepay-ux 2026-10-18 · Controller ตัดสินคำถามเปิดแล้ว (ท้ายไฟล์) · Mode: Operate
> 🛑 worktree ไม่มี `theme/` — เปิดไฟล์ theme ที่ `~/Projects/safepay/theme/...` · path ที่ถูกคือ `form/elements` (ไม่ใช่ `forms/`)

## 1. หน้าออเดอร์ `/orders/[token]`

ปุ่ม "จัดส่งแล้ว"/"ส่งสำเร็จ" อยู่ใน **action-bar เท่านั้น** (hero ≥1024 · แถบล่าง fixed <1024) — ShippingCard เป็น recap ห้ามมีปุ่ม (`docs/conventions/seller-action-placement.md`) · primary 1 ปุ่มต่อสถานะ

```
1440 รอจัดส่ง : [✎ แก้ไขเลขพัสดุ]  [truck-delivery จัดส่งแล้ว ■PRIMARY]         [⋮]
390  รอจัดส่ง : [✎ แก้ไขเลขพัสดุ] [จัดส่งแล้ว ■] [⋮]        (ปุ่มสูง ≥44px มี label)
กำลังจัดส่ง  : [✎ แก้ไขเลขพัสดุ] [circle-check ส่งสำเร็จ ■] [⋮]
กำลังจัดส่ง+COD ยังไม่รับเงิน : [ได้รับเงินปลายทางแล้ว] [ส่งสำเร็จ ■] [⋮]
```

### ตาราง `getOrderActionSet` (เฉพาะ `fulfillmentMode==='SHIPPED'` · ISHIP/CONFIRMED/CANCELLED ไม่เปลี่ยนทุกตัวอักษร)

| สถานะ + แหล่ง | primary | ghosts | menu (บน→ล่าง · อันตรายล่างสุด) |
|---|---|---|---|
| PENDING + MANUAL (รอจัดส่ง) | **จัดส่งแล้ว** `mark-dispatched` · icon `truck-delivery` | แก้ไขเลขพัสดุ | คัดลอกเลขพัสดุ · ส่งลิงก์ SMS · คัดลอกลิงก์ · คัดลอกที่อยู่ · แก้ไข{noun} · ยกเลิก{noun} |
| SHIPPED + MANUAL | **ส่งสำเร็จ** `mark-delivered` · icon `circle-check` | แก้ไขเลขพัสดุ | คัดลอกลิงก์ · คัดลอกเลขพัสดุ · คัดลอกที่อยู่ · ยกเลิก{noun} |
| SHIPPED + MANUAL + `isCodUnpaid` | **ส่งสำเร็จ** | ได้รับเงินปลายทางแล้ว | แก้ไขเลขพัสดุ · คัดลอกลิงก์ · คัดลอกเลขพัสดุ · คัดลอกที่อยู่ · ยกเลิก{noun} |

- "แจ้งเลขพัสดุ" หายใน PENDING+MANUAL (เดิมกดแล้ว P2002)
- "คัดลอกลิงก์" ลงเมนูใน SHIPPED+MANUAL (กัน 3 ปุ่ม label บน 390) — แก้เทสที่ตรึง ghosts ใน `order-action-set.test.ts`
- COD: "ส่งสำเร็จ" ชนะเป็น primary (หลัง CONFIRMED โค้ดเดิม `order-action-set.ts:~260` ยกปุ่มรับเงินเป็น primary เอง)
- flag ใหม่ `canMarkDispatched`/`canMarkDelivered` ให้ caller คำนวณจาก `src/lib/manual-shipment.ts` (เหมือน `isCodUnpaid`) · ต้องผ่าน `action-set-flags-wired.test.ts`
- `handleAction` เพิ่ม case `mark-dispatched`, `mark-delivered`
- ระหว่างยิง: icon `loader-2 animate-spin` · disabled ทั้ง primary+ghost · `aria-busy` · ความกว้างไม่ขยับ

### ShippingCard (manual prop เพิ่ม `status`, `recordedAtISO`, `dispatchedAtISO`) — ไม่มีปุ่ม · ไม่เพิ่ม chip ซ้ำ · `<p class="text-default-700 text-xs">` สองบรรทัด

| สถานะ | บรรทัด 1 | บรรทัด 2 |
|---|---|---|
| PENDING | ยังไม่ได้ส่งออก ระบบติดตามสถานะกับขนส่งให้ไม่ได้ เพราะเลขนี้ร้านกรอกเอง | บันทึกเลขเมื่อ {formatDateTimeTH(recordedAt)} |
| SHIPPED/CONFIRMED | เลขพัสดุนี้ร้านกรอกเอง ระบบจึงติดตามสถานะกับขนส่งให้ไม่ได้ | แจ้งจัดส่งเมื่อ {formatDateTimeTH(dispatchedAt ?? recordedAt)} |

- PENDING + `actionSet.primary?.key==='mark-dispatched'` เท่านั้น: เพิ่ม "กด "จัดส่งแล้ว" เมื่อนำพัสดุไปส่ง"

## 2. Swal + toast (คำเรียก "{noun}" = `resolveOrderVocab(vertical).noun`)

### "ส่งสำเร็จ" — `pacesConfirmAsync` (`src/lib/paces-swal.ts`) · `run()` **return** `{changed, alreadyClosed}` ไม่ throw เมื่อ alreadyClosed

| ฟิลด์ | ปกติ | COD ยังไม่บันทึกรับเงิน |
|---|---|---|
| icon | `question` | `warning` |
| title | ยืนยันว่าส่งถึงลูกค้าแล้ว? | ปิดงานทั้งที่ยังไม่ได้บันทึกรับเงินปลายทาง? |
| text | {noun}นี้จะเป็น "สำเร็จ" และนับเป็นยอดขาย คะแนนความน่าเชื่อถือ และเหรียญของร้านเหมือนลูกค้ายืนยันเอง ย้อนกลับไม่ได้ | ถ้าลูกค้าได้รับของแล้ว ปิดงานได้เลย แล้วกด "ได้รับเงินปลายทางแล้ว" ทีหลังเมื่อเงินเข้า การปิดงานย้อนกลับไม่ได้ |
| confirm / cancel | ส่งสำเร็จ / ยังไม่ปิดงาน | เหมือนกัน |
| confirmSemantic | `primary` | `primary` (🛑 ห้าม `warning` — ขาวบนเหลือง ~1.7:1) |
| errorText | ส่งคำขอไม่สำเร็จ ลองกดยืนยันอีกครั้ง | เหมือนกัน |

### "จัดส่งแล้ว" — **ไม่มี confirm** (มติ Controller)

### Toast — `pacesToast` (ใน `(chat)` ใช้ `pacesToast.chat.*`)

| เหตุการณ์ | ชนิด | ข้อความ |
|---|---|---|
| จัดส่งแล้ว สำเร็จ | success | บันทึกว่าจัดส่งแล้ว |
| จัดส่งแล้ว `changed:false` | info | {noun}นี้จัดส่งแล้ว หน้านี้อัปเดตให้แล้ว |
| ส่งสำเร็จ สำเร็จ | success | ปิดงานแล้ว {noun}นี้สำเร็จ |
| ส่งสำเร็จ `alreadyClosed` | info | {noun}นี้ปิดเป็น "สำเร็จ" ไปแล้ว ไม่ต้องกดซ้ำ |
| 409 | error | (ข้อความจาก server) แล้ว `router.refresh()` |
| 403 | error | บัญชีนี้ยังไม่ได้รับสิทธิ์ดูแลการจัดส่ง ให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน |
| เน็ตหลุด/500 | error | บันทึกไม่สำเร็จ ลองกดอีกครั้ง ถ้ายังไม่ได้ให้รีเฟรชหน้า |

### ข้อความ 409 จาก server (ไทย ไม่ใช่ 500)
- dispatch จาก CONFIRMED: `{noun}นี้ปิดเป็น "สำเร็จ" ไปแล้ว จึงกด "จัดส่งแล้ว" ไม่ได้`
- dispatch จาก CANCELLED: `{noun}นี้ถูกยกเลิกแล้ว จึงกด "จัดส่งแล้ว" ไม่ได้`
- dispatch ไม่มีเลข: `ยังไม่มีเลขพัสดุ บันทึกเลขก่อนแล้วกด "จัดส่งแล้ว"`
- dispatch/deliver ใบ iShip: `พัสดุนี้เปิดผ่าน iShip สถานะจะอัปเดตตามขนส่งเอง`
- deliver จาก PENDING: `ยังไม่ได้กด "จัดส่งแล้ว" จึงกด "ส่งสำเร็จ" ไม่ได้`
- deliver จาก CANCELLED: `{noun}นี้ถูกยกเลิกแล้ว จึงกด "ส่งสำเร็จ" ไม่ได้`
- (server ไม่รู้ vertical ก็ใช้ "คำสั่งซื้อ" ได้ — แต่ถ้ามี shop.vertical ในมือ ให้ใช้ resolveOrderVocab)

### copy เดิมที่ต้องแก้รอบเดียวกัน (HR16)
- toast บันทึกเลข ("บันทึกการจัดส่งแล้ว (…)" ใน ShipForm/ShipmentDraftPanel) → `บันทึกเลขพัสดุแล้ว ({no}) สถานะ "รอจัดส่ง"` (ใช้เฉพาะเมื่อออเดอร์ยัง PENDING — PATCH ตอน SHIPPED คงข้อความแก้ไขเดิม)
- `ShipmentEntryModal` edit helper → `แก้ไขขนส่งหรือเลขพัสดุ เลขใหม่จะแจ้งลูกค้าตามจังหวะที่ตั้งไว้`
- create helper → `ส่งของกับขนส่งเอง แล้วกรอกเลขพัสดุที่นี่ ออเดอร์จะอยู่ที่ "รอจัดส่ง" จนกว่าจะกด "จัดส่งแล้ว"`
- ปุ่ม submit ของ ShipForm create "ยืนยันจัดส่ง" → `บันทึกเลขพัสดุ` (ไม่ได้จัดส่งตอนกดนี้แล้ว)

## 3. แผงพัสดุในแชท `MANUAL_DONE` (กว้าง 328px)

```
PENDING                                   SHIPPED
(โลโก้) KEX123456789 [⧉]                   (โลโก้) KEX123456789 [⧉]
 [ส่งเอง][รอจัดส่ง] Kerry                   [ส่งเอง][กำลังจัดส่ง] Kerry
ยังไม่ได้ส่งออก กด "จัดส่งแล้ว"เมื่อนำพัสดุไปส่ง   ส่งออกแล้ว กด "ส่งสำเร็จ" เมื่อลูกค้าได้รับของ
· ระบบไม่ได้ติดตามสถานะกับขนส่งให้           · ระบบไม่ได้ติดตามสถานะกับขนส่งให้
[จัดส่งแล้ว ■ w-full ≥48]                   [ส่งสำเร็จ ■ w-full ≥48]
[แจ้งเลขในแชท ghost ≥44]                   [แจ้งเลขในแชท ghost ≥44]
แก้เลขพัสดุได้ที่หน้าคำสั่งซื้อ (min-h-11)        แก้เลขพัสดุได้ที่หน้าคำสั่งซื้อ
CONFIRMED: chip "สำเร็จ" ไม่มีปุ่ม dispatch/deliver · CANCELLED: พฤติกรรมเดิม (ไม่มีปุ่มใหม่)
```
- ปุ่มหลัก `btn bg-primary text-white p-3` (เดิมของไฟล์) · "แจ้งเลขในแชท" ลดเป็น `ghostBtn`
- chip สถานะ: `resolveOrderStatusBadge(ctx.orderStatus, stage)` (PENDING→`AWAITING_DISPATCH` · SHIPPED→`SHIPPING`) ห้ามประกอบ class เอง · chip "ส่งเอง" คงไว้
- ประโยคเดิม "ส่งเอง ระบบจึงไม่ได้ติดตามสถานะพัสดุให้" รวมเข้าประโยคใหม่ ไม่ซ้ำ
- สำเร็จ: toast → `onDone()` · error: แผงไม่ปิด · "ส่งสำเร็จ" ใช้ Swal ข้อ 2
- state `busy` ตัวเดียวร่วม `sending`
- ShipForm ในแชท: checkbox "แจ้งเลขติดตามในแชทหลังบันทึก" — ถ้า `ctx.trackingNoticeTiming==='ON_DISPATCH'` ค่าเริ่มต้น **ไม่ติ๊ก** + helper "ร้านตั้งให้ส่งเลขตอนกด "จัดส่งแล้ว"" (order-context ต้องส่ง `trackingNoticeTiming`)

## 4. ป้าย "รอจัดส่ง" (`AWAITING_DISPATCH`)

| ที่ | ค่า |
|---|---|
| `ORDER_STAGE_META.AWAITING_DISPATCH` | `{ label:'รอจัดส่ง', cls:'bg-warning/15 text-warning-ink', icon:'package-export' }` |
| `STAGE_BADGE_OVERRIDE.AWAITING_DISPATCH` | label จาก `SHIPPING_STAGE_LABEL` · cls เดียวกัน · icon `package-export` · tone `warning` |
| `SHIPPING_STAGE_LABEL.AWAITING_DISPATCH` | `'รอจัดส่ง'` |
| ชิปตัวกรอง (`OrdersList.tsx:63`, `OrdersTable.tsx:106`) | ต่อจาก `AWAITING_PARCEL` ก่อน `AWAITING_PICKUP` |
| `STAGE_BADGE_CLS` (`OrdersTable.tsx:118`) | `bg-warning/15 text-warning-ink` |
| ไทล์ `OrderStatusBand` | ช่องต่อจาก `AWAITING_PARCEL` · `iconClass:'text-warning'` · icon `solar:box-minimalistic-bold-duotone` (ยืนยันใน gallery `~/Projects/safepay/theme/paces/.../icons/` ถ้าไม่มีให้รายงาน Controller ห้ามเดา) · เป็น 0 ทำเหมือน `AWAITING_PARCEL` |
| `SHIPMENT_STAGE_DOT_INDEX.AWAITING_DISPATCH` | `null` |

ห้ามใช้คำอื่น ("รอส่ง"/"รอแพ็ค") · `-ink` เท่านั้น (คอนทราสต์)

## 5. ตั้งค่า — แถว TRACKING (`AutoNotifyRow.tsx`)

```
(truck)  เมื่อมีเลขพัสดุ                                (●━ สวิตช์)
         ส่งเลขพัสดุให้ลูกค้าตอนไหน  มีผลกับการส่งเองเท่านั้น
         ◉ ตอนบันทึกเลขพัสดุ
            ลูกค้าได้เลขทันที แม้ของยังไม่ได้ส่งออก
         ○ ตอนกดจัดส่งแล้ว
            ลูกค้าได้เลขหลังกด "จัดส่งแล้ว"
         (บรรทัดเดิมของแถว) ...
```
- `<fieldset>` + `<legend>` "ส่งเลขพัสดุให้ลูกค้าตอนไหน" (`text-default-800 text-xs font-medium`) + span `text-default-700 text-xs` "มีผลกับการส่งเองเท่านั้น"
- ตัวเลือก `<label class="flex min-h-11 items-start gap-3">` + `<input type="radio" class="form-radio mt-0.5" name="an-timing-TRACKING">` · บรรทัดอธิบาย `text-default-600 text-xs` · ตัวที่เลือก `font-medium`
- แสดงเฉพาะเมื่อสวิตช์เปิด · `!canEdit` = disabled + `aria-describedby="an-ro"` · ระหว่างบันทึก disabled+`aria-busy`
- optimistic + revert + `pacesToast`: สำเร็จ "บันทึกจังหวะการส่งเลขพัสดุแล้ว" · ล้ม `t.toastFailed`
- i18n th/en (EN: "When to send the tracking number" · "Applies to self-shipped parcels only" · "When the number is saved" · "When marked as shipped")
- 834/1440 โครงเดียวกัน

## Theme Source Mapping

| Section | Base | หมายเหตุ |
|---|---|---|
| action-bar | `src/components/safepay/OrderActionBar.tsx` (ไม่แก้ markup) | ข้อมูลผ่าน `getOrderActionSet` |
| ShippingCard | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx` | ข้อความเท่านั้น |
| Swal | `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx` | ผ่าน `pacesConfirmAsync` |
| radio | `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx` | `form-radio` |
| แผงแชท | โครงเดิม `ShipmentDraftPanel.tsx` | |
| chip | `ORDER_STAGE_META`/`resolveOrderStatusBadge` | |

## มติ Controller ต่อคำถามเปิด (2026-10-18)
1. `/dispatch` ไม่คืน `notice` — toast กลาง "บันทึกว่าจัดส่งแล้ว"
2. "จัดส่งแล้ว" ไม่มี confirm
3. "คัดลอกลิงก์" ลงเมนูใน SHIPPED+MANUAL — แก้เทสที่ตรึงไว้
4. "สำเร็จ" คงเขียว · ที่มาดูจาก history (`SELLER_DELIVERED` = "ร้านยืนยันส่งสำเร็จ")
5. ไอคอนยืนยันกับ gallery ก่อนใช้ (`circle-check` tabler · `solar:box-minimalistic-bold-duotone`)
6. 834 แถบล่างยืดเต็ม = พฤติกรรมเดิม ไม่แตะ
7. order-context ส่ง `trackingNoticeTiming` · checkbox แชทตาม §3
8. CANCELLED+manual ในแชท = พฤติกรรมเดิม
9. `CONFIRM_BTN.warning` คอนทราสต์ = นอกขอบเขต (จดไว้เป็นหนี้)
