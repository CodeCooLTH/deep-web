# ผลทดสอบ UAT กับทีม Flash — 2026-10-27

> ระบบ: prod `seller.deepthailand.app` · `OPEN_FLASH_EXPRESS=uat` (`open-api-tra.flashexpress.com`) · ร้านนำร่อง ธนภัทร์ อะไหล่มอเตอร์ไซค์ · mchId UAT `CA5833` (key ลงท้าย `385c`)
> checklist ของ Flash: ไฟล์ `Flash API UAT.xlsx` (8 หมวด ①–⑧ + สถานะ 5 เส้นทาง) · แผนฝั่งเรา: [[UAT-Plan-2026-10-27]]
> ทุกข้อด้านล่างอ้างโค้ด ณ main `b5c25335b` (หลัง PR #208 + #209) — ตรวจกับโค้ดก่อนเชื่อ

## 1. สรุปผล

| หมวด (ของ Flash) | ผล | หลักฐาน |
|---|---|---|
| ⑦ ตั้ง webhook | ✅ ผ่าน (หลังแก้ #208) | `webhookStatus=REGISTERED` 17:22:16 · audit `webhook_override` 5 ชนิด |
| ① สร้างพัสดุ COD | ✅ ผ่าน (หลังแก้ #209) | `TH0205HC6X8E0` COD 360 ฿ · ราคาประมาณ 33 ฿ |
| ① สร้างพัสดุทั่วไป | ✅ ผ่าน | `TH0205HC6Y0E0` ไม่ COD |
| ① พัสดุพิเศษขนาดใหญ่ / หลายชิ้น 1 เลข | ⛔ ไม่รองรับใน v1 | OOS-6 (scope baseline) — ต้องคุยกับ Flash ว่าบังคับไหม |
| ② แก้ไข — ก่อนรับพัสดุ | ✅ ผ่าน **ผ่านสคริปต์ ไม่ใช่ระบบ Deep** | `TH0205HC6X8E0` code 1 · tid `89cca0952eded2f983fcf4cbe225db13` |
| ② แก้ไข — หลังรับพัสดุ | ✅ ได้ error ตามคาด **ผ่านสคริปต์** | `TH0205HC6X2E0` code **1053** "พัสดุนี้ถูกรับเรียบร้อยแล้ว ไม่สามารถแก้ไขข้อมูลได้" · tid `a2bc4d759c50343b510d140995d0ce7a` |
| ③ ยกเลิก — ก่อนรับพัสดุ | ✅ ผ่าน (ปุ่มใน Deep) | `TH0205HC6Y0E0` CANCELLED 17:53:41 · `TH0205HC6X8E0` CANCELLED 18:02:51 |
| ③ ยกเลิก — หลังรับพัสดุ | ⏳ ยังไม่ได้ทดสอบ | X8E0 ยังไม่ถูกสแกนรับตอนกดยกเลิก → ยกเลิกได้ (ถูกต้อง) · ต้องเปิดใบใหม่ ให้ Flash สแกนรับ แล้วรอ webhook ก่อนกด |
| ④ ใบปะหน้า 100×180 / 100×75 | ⏳ ยังไม่ได้ทดสอบ | — |
| ⑤ เรียกรถ / ยกเลิกรถ | ⏳ ยังไม่ได้ทดสอบ | — |
| ⑥ เช็คค่าส่ง | ✅ เรียกได้ | ⚠ ดู §3.3 ป้าย "ราคาสัญญา" |
| ⑧ สถานะ 1-2-3-5 / 4 / 6 / 7 / 8 | ⏳ ยังไม่ได้ทดสอบ | webhook ขาเข้า = **0 รายการ** ณ ~18:05 (ยังไม่มีใบไหนถูกสแกนรับใน Deep) |

พัสดุ UAT ที่เกิดวันนี้:

| pno | ที่มา | outTradeNo | สถานะล่าสุด |
|---|---|---|---|
| TH0205HC6X8E0 | Deep (ออเดอร์ทดสอบ `a37b71cd…`, COD) | `Fbf00022bca704ede94aeecf66bec1a6cA1` | CANCELLED · ฝั่ง Flash ยอด COD ถูกแก้เป็น 400 ฿ (Deep ยัง 360 ฿) |
| TH0205HC6Y0E0 | Deep (ออเดอร์ทดสอบ `67b7818f…`, ไม่ COD) | `Fa699b620341f472a8f16ac49a948c0eA1` | CANCELLED |
| TH0205HC6X2E0 | สคริปต์ยิงตรง (ไม่อยู่ใน Deep) | `DEEPUAT…` | ถูกสแกนรับแล้ว (จาก 1053) — ยังไม่ยกเลิก |

## 2. บั๊กที่เจอและแก้แล้ว (ขึ้น prod วันเดียวกัน)

### 2.1 ตั้ง webhook ได้ UNKNOWN ทุกชนิด → ระบบไม่ยอมทับ — PR #208
- อาการ: `POST /api/seller/flash/webhook/sync` คืน `state: "UNKNOWN", action: "SKIPPED"` ครบ 5 ชนิด
- สาเหตุ: ตัวอ่านคำตอบ `/gw/fda/open/standard/webhook/setting/infos` เดาชื่อคีย์ไม่ครอบรูปจริงในเอกสาร (`data.webHookStatusUrl` + `webHookStatusEnabled`; ตารางเขียน snake_case `web_hook_status_url`)
- แก้: `readInfoUrls` อ่าน `webHook{Kind}Url` / `web_hook_{kind}_url` ก่อน · `Enabled=false` หรือ url=null = ว่าง (ตั้งได้)
- โค้ด: `src/services/flash.service.ts:444` (`readInfoUrls`), `:469` (ชุดคีย์) · เทส `src/services/__tests__/flash.service.test.ts` เคส "infos รูปตามเอกสาร" (mutation: โค้ดเดิมแดง)

### 2.2 สร้างพัสดุ COD ได้ 1000 "ตรวจสอบข้อมูลผิดพลาด" — PR #209
- อาการ: `/open/v3/orders` ตอบ `{"code":1000,"message":"ตรวจสอบข้อมูลผิดพลาด","data":"subItemTypes.itemWeightSizeต้องระบุ"}` (เอกสารเขียนว่า `itemWeightSize` ไม่บังคับ)
- ทีม Flash ยืนยันในกลุ่ม (16:57): `subItemTypes` ใช้เฉพาะพัสดุหลายกล่อง 1 เลข — พัสดุกล่องเดียวไม่ต้องส่ง
- ยืนยันด้วยของจริง: ยิง COD ที่ไม่มี `subItemTypes` → ได้ `TH0205HC6X2E0`
- แก้: เลิกส่ง `subItemTypes` · `codEnabled`/`codAmount` เหมือนเดิม
- โค้ด: `src/lib/flash/mapping.ts:145-147` · เทส `src/lib/flash/__tests__/mapping.test.ts` (COD) + `src/services/__tests__/flash-shipment.test.ts`
- ตรวจ payload หลังแก้: สร้างจาก `buildCreateOrderParams` ด้วยข้อมูลใบ X8E0 → ตรงกับชุดที่ Flash รับทั้ง 20 ฟิลด์ (ต่างเฉพาะ nonceStr/sign/outTradeNo)

### 2.3 รหัส 1000 แสดง "ติดต่อ Flash ไม่ได้ตอนนี้" + ชวนกดลองใหม่ — PR #209
- เดิม `mapFlashCode` แปล 0 และ 1000 เป็น `UPSTREAM_ERROR` (ux retry) → หน้าออเดอร์ขึ้น "สร้างพัสดุไม่สำเร็จ ติดต่อ Flash ไม่ได้ตอนนี้" ทั้งที่ลองกี่ครั้งก็ไม่หาย
- แก้: 1000 → `INVALID_REQUEST` (ux fix-data) ข้อความ "Flash ไม่รับข้อมูลพัสดุนี้ (ตรวจสอบข้อมูลผิดพลาด) — ตรวจที่อยู่ น้ำหนัก และยอดเก็บเงินปลายทาง แล้วลองใหม่" · log เก็บ `data` ของ Flash (ชื่อฟิลด์) ต่อท้าย
- โค้ด: `src/lib/flash/errors.ts:17` (แถว 1000), `:50` (`mapFlashCode` เหลือเฉพาะ 0), `src/lib/flash/client.ts:39` (upstreamMessage)

## 3. สิ่งที่ได้เรียนรู้ (ข้อเท็จจริงจาก UAT จริง ไม่ใช่จากเอกสาร)

1. **ลายเซ็น:** ตัวอย่างในเอกสาร (`key dd807a8e…` → `BF46380E…`) คำนวณซ้ำไม่ได้ด้วยวิธีใดเลย (และตัวอย่างถัดไปเป็นข้อความเดิมสลับตำแหน่ง) → ใช้เทียบไม่ได้ · ของจริง: verify/estimate/create/cancel/modify/setWebhook ผ่านทั้งหมด = ลายเซ็นเราถูก (`src/lib/flash/sign.ts`)
2. **ที่อยู่ผู้รับสั้น (`479`) Flash รับได้** — ไม่ใช่สาเหตุของ 1000
3. **⚠ ป้าย "ราคาสัญญา":** checklist ของ Flash เขียนว่า `estimate_rate` = ราคาหน้าเว็บ ไม่ใช่ราคาหลังส่วนลด แต่ `estimateFlashPrice` ลอง `pricingTable=1` ก่อนแล้วติดป้าย "ราคาสัญญา" เมื่อได้ราคา (`src/services/flash.service.ts:602-614`) → **ต้องถาม Flash ว่า pricingTable=1 คืนราคาสัญญาจริงไหม** ถ้าไม่ ต้องเปลี่ยนป้าย
4. **แก้ไขที่อยู่ผ่าน `/orders/modify` ต้องส่งชุดที่อยู่ผู้รับครบ** (จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ + รายละเอียด) — ส่ง `dstDetailAddress` อย่างเดียวได้ `code 0 "ที่อยู่ผู้รับไม่ถูกต้อง"` (tid `4101b605744e1932d8007cc92835dd07`)
5. **รหัส 1053** = "พัสดุนี้ถูกรับเรียบร้อยแล้ว ไม่สามารถแก้ไขข้อมูลได้" — ไม่อยู่ในตาราง response code ของเอกสาร และไม่อยู่ใน `src/lib/flash/errors.ts` (ยังไม่กระทบ เพราะ Deep ไม่มีปุ่มแก้ไข)
6. **webhook ปลายทาง:** `https://deepthailand.app/api/webhooks/flash/<secret>?k=<status|weight|price|courier|routes>` — base จาก `NEXTAUTH_URL` ของ prod (ไม่ได้ตั้ง `FLASH_WEBHOOK_BASE_URL`) · ประกอบที่ `src/services/flash.service.ts:553` · `/api/webhooks/*` ยกเว้นด่าน Origin ใน `src/proxy.ts:56` · route `src/app/api/webhooks/flash/[secret]/route.ts`
7. **ยกเลิก:** ระบบยิง `/open/v1/orders/{pno}/cancel` ทุกครั้ง (`src/lib/flash/client.ts:109`, `src/services/flash-ops.service.ts:33`) — ผลขึ้นกับสถานะฝั่ง Flash ไม่ใช่สถานะใน Deep · ถ้ารับแล้วจะได้ 1015 (`errors.ts:29`)

## 4. งานค้าง

- [ ] ⑧ สถานะ: ให้ Flash สแกนรับ/เลื่อนสถานะพัสดุที่อยู่ใน Deep แล้วยืนยันว่า webhook เข้า (`ShipmentEvent`) + หน้าออเดอร์อัปเดต + POD
- [ ] ③ ยกเลิกหลังรับพัสดุ (ใบใหม่ → สแกนรับ → รอ webhook → กดยกเลิก → ต้องได้ 1015)
- [ ] ④ ใบปะหน้า 2 ขนาด · ⑤ เรียกรถ/เรียกซ้ำ/ยกเลิกรถ
- [ ] ยกเลิก `TH0205HC6X2E0` (ใบจากสคริปต์ ถูกรับแล้ว — ให้ Flash ปิด)
- [ ] ถาม Flash: ① ใหญ่/หลายชิ้น และ ② แก้ไข ต้องทำในระบบก่อนออก key production ไหม (ตอนนี้ ② ผ่านด้วยสคริปต์)
- [ ] ถาม Flash: `pricingTable=1` = ราคาสัญญาจริงไหม (§3.3)
- [ ] โค้ด: ลบ `foldCodItems` + ข้อความ "เกิน 10 รายการ จะรวมเป็นสินค้าอื่น ๆ" (`src/components/safepay/flash/FlashCreateForm.tsx:646`, `src/lib/shipping/flash-order-ui.ts:263`) — ไม่ได้ส่งรายการให้ Flash แล้ว
- [ ] โค้ด: ถ้าทำปุ่มแก้ไข → ส่งที่อยู่ครบชุด (§3.4) + เพิ่ม 1053 ใน `errors.ts`
- [ ] อัปเดต BRD/SRS ตามข้อเท็จจริงใน §2–3 (subItemTypes, 1000, infos shape)

## 5. เครื่องมือที่ใช้ระหว่างเทส (อยู่นอก repo — `/tmp/flash84/`, ไม่มี key ในไฟล์)

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `uat.sh` | ยิง API ของ Deep บน prod ทีละข้อ ด้วย session cookie (`DEEP_SESSION`) |
| `uat-watch.sh` | ดูตาราง Flash บน prod แบบอ่านอย่างเดียว (Supabase PAT) |
| `flash-create-curl.sh` | ยิง `/open/v3/orders` ตรง พร้อมคำนวณ sign (ถาม key แบบไม่แสดงบนจอ) — ใช้หาฟิลด์ที่ผิด |
| `flash-modify.sh` | ยิง `/open/v1/orders/modify` ตรง (ข้อ ②) |
| `flash-warehouses.sh` | ดูรหัสคลังของ mchId |

payload ที่ส่งให้ Flash Engineer: `~/Downloads/flash-uat-*.txt`
