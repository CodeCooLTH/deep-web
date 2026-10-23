# งานวิจัย: Flash Express Open API — เชื่อมตรงแทน/คู่กับ iShip

> **วันที่:** 2026-10-22
> **บริบท:** branch `integrate/flash-express` — ประเมินว่าถ้า Deep เชื่อม Flash Express ตรง (ไม่ผ่าน iShip) ต้องทำอะไร และใช้ของเดิมของ feature 00022 ได้แค่ไหน
> **แหล่งหลัก:** https://open-docs.flashexpress.com/ (หน้า Slate HTML ไฟล์เดียว — ดึงด้วย curl แล้วแปลงเป็นข้อความ อ่านครบทุกหัวข้อ) + ไฟล์ที่หน้าเอกสารลิงก์ไว้: `download/status.pdf`, `download/python_order_demo.py.zip`
> **ไม่ได้ทำ:** ไม่ได้ยิง API จริงทั้ง production และ training · ไม่ได้แตะโค้ด/DB
> **รูปแบบอ้างอิง:** `[FD#anchor]` = `https://open-docs.flashexpress.com/#anchor` · `[REPO path:line]` = ไฟล์ใน repo นี้

---

## 1. สรุปสั้น

- **ได้อะไรบ้าง:** API ของ Flash ครอบงานหลักของพัสดุได้ครบ คือ สร้างพัสดุ (v3), แก้ไข, ยกเลิก, ติดตามรายใบและหลายใบ, หลักฐานการส่ง (ผู้เซ็นรับ รูป และพิกัด), พิมพ์ใบปะหน้า PDF 2 ขนาด, ประเมินค่าส่ง, เรียกรถเข้ารับ, ยกเลิกรถ, ดูรายการเรียกรถรายวัน, ตั้ง webhook 5 ชนิด, คลังผู้ส่ง (warehouse) และสร้าง sub-account ได้ [FD#api-reference]
- **Auth:** ไม่มี token หรือ OAuth ใช้ `mchId` (รหัสร้านค้า) + `key` ลับ ลงลายเซ็น **SHA256 (ไม่ใช่ HMAC)** ของพารามิเตอร์ทุกตัวที่เรียงตามชื่อ ต่อท้ายด้วย `&key=...` แล้วแปลงเป็นตัวพิมพ์ใหญ่ ทุกคำขอเป็น `POST` แบบ `application/x-www-form-urlencoded` ส่วนคำตอบเป็น JSON [FD#the-basic-standard] [FD#signature-algorithm]
- **Env:** production `https://open-api.flashexpress.com` · training `https://open-api-tra.flashexpress.com` [FD#api-environment] (ในตัวอย่างบางจุดยังมี `Host: api-sandbox.flashexpress.com` ค้างอยู่ ซึ่งยืนยันไม่ได้ว่ายังใช้ได้)
- **หน่วย:** น้ำหนักเป็น **กรัม** และเงินเป็น **สตางค์ ("cent", 1 บาท = 100)** ทุกช่อง [FD#notices] ขณะที่ iShip และ DB ของเราเก็บเป็น **กิโลกรัมและบาท** จึงต้องแปลงทั้งขาไปและขากลับ
- **ที่อยู่ 3 ชั้น:** `ProvinceName` / `CityName` (= อำเภอ/เขต) / `DistrictName` (= ตำบล/แขวง, ไม่บังคับ) + `PostalCode` [FD#create-order-orders] ชื่อชั้นต้องสลับ เช่นเดียวกับกับดัก BR-ISHIP-31 ของ iShip
- **สร้างพัสดุ ≠ เรียกรถ:** สร้างพัสดุแล้ว Flash ยังไม่ส่งรถมารับ ต้องเรียก `/notify` แยก ที่อยู่เดียวกันเรียกครั้งเดียวพอ และเรียกซ้ำไม่ได้ระหว่างที่งานเดิมยังค้าง [FD#notify-api-2]
- **Webhook ลงนามแค่ `mchId`+`nonceStr` ไม่ครอบ `data`** [FD#web-hook-status] ลายเซ็นจึงพิสูจน์แค่ว่ารู้ key แต่ไม่ได้กันการปลอมหรือแก้เนื้อหา `data` และกัน replay ไม่ได้ ต้องเสริมด้วย secret ใน path และ/หรือดึงสถานะจริงด้วย `/routes` ก่อนเชื่อค่า
- **ช่องโหว่ใหญ่สุด: COD** เอกสารไม่มี endpoint หรือ webhook ที่บอกว่า "โอนเงิน COD ให้ร้านแล้ว" เลย สถานะพัสดุมี 9 ค่าและไม่มีค่าที่เทียบกับ `payment_success` ของ iShip [FD#web-hook-status] ฟีเจอร์ปิดงาน COD อัตโนมัติ (`codSettledAt`) จึงยังไม่มีแหล่งข้อมูลจาก Flash (ยืนยันไม่ได้ว่ามีช่องทางอื่น)
- **ไม่ได้ระบุไว้ในเอกสาร:** rate limit, IP allowlist, retry/backoff ของ webhook (บอกแค่ว่า "ส่งซ้ำจนกว่าจะได้ success"), วิธีขอบัญชี training และราคาหรือสัญญา COD
- **เอกสารขัดกันเองหลายจุด** (ดู §5.4) ตัวอย่างลายเซ็นในเอกสาร**คำนวณซ้ำไม่ได้** ต้องยึดโค้ด demo Python ของ Flash เป็นหลัก และทดสอบกับ training ก่อน

---

## 2. Auth และการลงลายเซ็น

### 2.1 รูปแบบคำขอ
- HTTPS, `POST` ทุก endpoint, body เป็น `application/x-www-form-urlencoded` UTF-8 คำตอบเป็น JSON (ยกเว้น label ที่คืนเป็น PDF stream) [FD#the-basic-standard]
- envelope ของคำตอบคือ `{ code, message, data }` โดย `code: 1` = สำเร็จ (บาง endpoint มี `tid` ติดมาด้วย) [FD#the-basic-response-data-format] [FD#create-order-orders]
- ส่ง header `Accept-Language: th|en|zh-CN|lo` เพื่อเลือกภาษาของข้อความได้ [FD#internationalization-reference]
- ทุกคำขอต้องมี `mchId` (string 32), `nonceStr` (string 32, สุ่ม) และ `sign` (string 64) [FD#getallwarehouses-getallwarehouses-warehouses]
- **path variable (`{pno}`, `{id}`) ไม่นำมาคิดลายเซ็น** [FD#cancel-order-orders-pno-cancel]

### 2.2 อัลกอริทึม (เนื้อความใน [FD#signature-algorithm] + โค้ด demo)
1. รวมพารามิเตอร์ทั้งหมดที่จะส่ง **ยกเว้น `sign`**
2. ตัดตัวที่ค่าว่างออก โดยนิยามของ "ว่าง" คือ string ที่เป็น whitespace ล้วน ได้แก่ `\t \n \v \f \r` และ `\u001C–\u001F` ตัวที่ตัดออกยังส่งไปได้ แค่ไม่นำมาคิดลายเซ็น [FD#notice]
3. เรียงชื่อพารามิเตอร์ตาม ASCII **จากน้อยไปมาก** (case-sensitive) แล้วต่อกันเป็น `k1=v1&k2=v2...` โดย**ใช้ค่าดิบที่ยังไม่ urlencode**
4. ต่อท้ายด้วย `&key=<secret key>` แล้วคำนวณ `SHA256` → hex → **ตัวพิมพ์ใหญ่**
5. ใส่ค่าที่ได้ใน `sign` แล้วจึง urlencode ทุกค่าตอนส่ง เพราะฝั่ง server จะ urldecode ก่อนตรวจ [FD#notice]
6. ต้องรองรับฟิลด์ที่ Flash อาจเพิ่มในอนาคต ห้าม whitelist ชื่อฟิลด์ตอนตรวจลายเซ็น [FD#signature-algorithm]
- ฟิลด์ที่เป็น JSON string (`subItemTypes`, `subParcel`) ก็นำมาคิดลายเซ็นในรูป string ที่ส่งจริง (อนุมานจากข้อ 1 ยังยืนยันไม่ได้ ต้องทดสอบกับ training)
- `key` ได้จากเจ้าหน้าที่ Flash เท่านั้น ("Please contact the official support staff to obtain or reset") [FD#signature-algorithm]

```ts
// ร่าง — อ้างอิงพฤติกรรมจาก python_order_demo.py ของ Flash (ไม่ใช่โค้ดจริงใน repo)
import { createHash } from "crypto";
const BLANK = /^[\t\n\v\f\r\u001C-\u001F ]*$/;
export function flashSign(params: Record<string, string | number>, key: string): string {
  const s = Object.keys(params)
    .filter((k) => k !== "sign" && !BLANK.test(String(params[k])))
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha256").update(`${s}&key=${key}`, "utf8").digest("hex").toUpperCase();
}
```

### 2.3 ข้อควรระวังเรื่องลายเซ็น
- ข้อ b ในเอกสารเขียนว่า "sort by ... **DESC**" แต่ทั้งตัวอย่าง `stringA="body=test&mchId=...&nonceStr=..."` และย่อหน้าถัดไป ("from small to large") ระบุว่าเรียง**จากน้อยไปมาก** โค้ด demo ก็ใช้ `list.sort()` แบบจากน้อยไปมาก ให้ยึดแบบจากน้อยไปมาก [FD#signature-algorithm] + `download/python_order_demo.py.zip`
- **ลายเซ็นตัวอย่างในเอกสาร (`BF46380E...4B67`) คำนวณซ้ำไม่ได้** ลองแล้วทั้งแบบมี `&` และไม่มีก่อน `key=` รวมทั้งเรียงกลับด้าน ได้ค่าอื่นทุกแบบ (เช่น `AA075587...4EED`) เลยใช้ตัวอย่างนี้เป็น test vector ไม่ได้ ต้องหา test vector จาก training env แทน
- demo Python ตัดเฉพาะค่า `""` ไม่ได้ตัด whitespace ล้วนตามที่เอกสารนิยาม ฝั่งเราควรทำตามเอกสาร (ตัด whitespace ล้วนด้วย) แล้วทดสอบยืนยัน
- demo Python มี `mchId` และ key ของ training ฝังอยู่ (`BA0971` / key 64 ตัว, URL `open-api-tra`) **ยังไม่ได้ลองยิงจึงยืนยันไม่ได้ว่ายังใช้ได้** และไม่ควรใส่ลงโค้ดหรือเทสของเรา เพราะเป็น credential ของคนอื่น

### 2.4 การตรวจ webhook ขาเข้า
- body ของ webhook มี `mchId`, `nonceStr`, `sign`, `data` และเอกสารระบุว่า "**Only (mchId, nonceStr) is involved in signing**" [FD#web-hook-status] [FD#web-hook-routes] [FD#web-hook-weight] [FD#web-hook-price] [FD#web-hook-courier] ดังนั้นการตรวจคือ `sign == SHA256("mchId=<m>&nonceStr=<n>&key=<key>").toUpperCase()`
- webhook price มีช่อง `dataSign` และ `dataJson` เพิ่มมาด้วย ซึ่ง**ไม่มีคำอธิบาย** [FD#web-hook-price] เดาได้ว่า `dataSign` ลงนามเนื้อหา แต่ยืนยันไม่ได้
- ข้อสรุป: `sign` ของ webhook ไม่ได้ป้องกันการแก้ `data` และ `nonceStr` ที่เป็น timestamp ก็ไม่ได้กัน replay ควรทำเหมือน iShip คือฝัง secret ใน path ด้วย [REPO src/app/api/webhooks/iship/[secret]/route.ts:29-46] และสำหรับเหตุการณ์ที่กระทบเงิน (ปิดงาน/COD) ต้องยิง `/orders/{pno}/routes` ยืนยันซ้ำก่อนเขียนค่า

---

## 3. Endpoint ทั้งหมด

ทุกตัวเป็น `POST` ทุกตัวต้องมี `mchId`, `nonceStr`, `sign` · ราคาเป็นสตางค์ · น้ำหนักเป็นกรัม · ขนาดเป็นซม.

| # | Path | ใช้ทำอะไร | ฟิลด์บังคับที่สำคัญ (นอกจาก 3 ตัวหลัก) | ที่มา |
|---|---|---|---|---|
| 1 | `/open/v1/warehouses` | ดูคลังผู้ส่งที่ผูกกับร้าน | — | [FD#getallwarehouses-getallwarehouses-warehouses] |
| 2 | `/gw/fda/open/standard/address_core/url/query` | ขอ URL ไฟล์ต้นไม้ที่อยู่มาตรฐานของ Flash | — | [FD#retrieve-flash-standard-location-tree-address_core] |
| 3 | `/open/v1/new_sub_account` | สร้าง sub-account | `accountName`, `name`, `mobile`, `email` | [FD#create-sub-account-new_sub_account] |
| 4 | `/open/v3/orders` | **สร้างพัสดุ** → ได้ `pno` | `outTradeNo`, `expressCategory`, `src*` (หรือ `warehouseNo`), `dstName/Phone/ProvinceName/CityName/PostalCode/DetailAddress`, `articleCategory`, `weight`, `insured`, `codEnabled` | [FD#create-order-orders] |
| 5 | `/open/v1/orders/modify` | แก้ข้อมูลพัสดุ | `pno` (ที่เหลือ optional) | [FD#modify-order-orders-modify] |
| 6 | `/open/v1/orders/{pno}/cancel` | ยกเลิกพัสดุ | — | [FD#cancel-order-orders-pno-cancel] |
| 7 | `/open/v1/orders/{pno}/routes` | ติดตามรายใบ | — | [FD#tracking-order-orders-pno-routes] |
| 8 | `/open/v1/orders/routesBatch` | ติดตามหลายใบ | `pnos` (คั่นด้วย comma, ≤500 ตัวอักษร) | [FD#tracking-order-batch-orders-routesbatch] |
| 9 | `/open/v1/orders/{pno}/deliveredInfo` | หลักฐานการส่ง (ผู้เซ็นรับ รูป และพิกัด) | — | [FD#getparceldeliveredinfo-orders-pno-deliveredinfo] |
| 10 | `/open/v1/orders/{pno}/pre_print` | ใบปะหน้า 100×180 มม. (PDF) | — | [FD#print-big-label-100-180-mm-orders-pno-pre_print] |
| 11 | `/open/v1/orders/{pno}/small/pre_print` | ใบปะหน้า 100×75 มม. (PDF) | — | [FD#print-small-label-100-75-mm-orders-pno-small-pre_print] |
| 12 | `/open/v3/ordersByMchPno` | สร้างพัสดุด้วยเลข tracking ของร้านเอง | `mchPno` + ชุดเดียวกับ #4 | [FD#create-order-by-merchant-tracking-number-ordersbymchpno] |
| 13 | `/open/v1/orders/estimate_rate` | ประเมินค่าส่ง | `srcProvinceName/CityName/PostalCode`, `dstProvinceName/CityName/PostalCode`, `weight` | [FD#freight-inquiry-orders-estimate_rate] |
| 14 | `/open/v1/notifications` | รายการเรียกรถของวันที่ระบุ | `date` (YYYY-MM-DD) | [FD#getallnotificationsindate-notifications] |
| 15 | `/open/v1/notify` | **เรียกรถเข้ารับ** | `src*` (หรือ `warehouseNo`), `estimateParcelNumber` | [FD#notify-courier-notify] |
| 16 | `/open/v1/notify/{id}/cancel` | ยกเลิกการเรียกรถ | — | [FD#cancel-notification-notify-id-cancel] |
| 17 | `/open/v1/setting/web_hook_service` | เปิด/ปิด webhook ทีละชนิด | `serviceCategory` (0 ปิด/1 ตั้ง), `webhookApiCode` (0–4), `url` | [FD#web-hook-service-web_hook_service] |
| 18 | `/gw/fda/open/standard/webhook/setting/infos` | ดูค่า webhook ที่ตั้งไว้ | — | [FD#request-web-hook-infos-webhook-setting-infos] |

### 3.1 หมายเหตุราย endpoint

**#4 Create order (`/open/v3/orders`)** [FD#create-order-orders]
- ผู้ส่งระบุได้ 2 แบบ: (1) ส่ง `srcName, srcPhone, srcProvinceName, srcCityName, srcPostalCode, srcDetailAddress` **ให้ครบทุกตัว** หรือ (2) ไม่ส่งชุดนี้เลยแล้วส่ง `warehouseNo` แทน (ตัวเลขต้องมาจาก #1) ถ้าไม่ส่งทั้งสองแบบจะได้ error 1018 [FD#response_code]
- `outTradeNo` (≤64) คือเลขอ้างอิงของเรา ถ้าซ้ำจะได้ error **1003 "Order is exists"** [FD#response_code] ใช้แทน `custom_order_id` ของ iShip ได้ แต่เอกสาร**ไม่ได้บอกว่า**ส่งซ้ำแล้วจะคืน `pno` เดิมหรือไม่ (ยืนยันไม่ได้) ถ้าไม่คืน การ retry หลัง response หายต้องตามหา `pno` เอง ซึ่งไม่มี endpoint ให้ค้นด้วย `outTradeNo` → ดู §7 คำถามเปิด
- `dstPhone` ≤20, `dstHomePhone` = เบอร์สำรอง, `dstDetailAddress` ≤300, `remark` ≤200
- ส่ง `width/length/height` ได้ (ไม่บังคับ) · `insured` (Flash Care) ต้องใช้คู่กับ `insureDeclareValue` · `opdInsureEnabled` คือ Box Shield
- **COD:** ต้องส่ง `codEnabled` ทุกครั้ง ถ้าเป็น 1 ต้องมี `codAmount` (สตางค์) **และ `subItemTypes`** (JSON string, 1–10 รายการ, `itemQuantity` 1–999) ถ้าร้านไม่ได้เปิดบริการ COD กับ Flash จะได้ error **1008** [FD#response_code]
- `settlementType` 1 = ผู้ส่งจ่าย / 2 = ผู้รับจ่าย (ไม่บังคับ) [FD#create-order-orders] ส่วน Settlement Category 1 = เงินสด / 2 = เครดิต [FD#settlement_category] ทั้งสองค่านี้สัมพันธ์กันอย่างไรเอกสารไม่ได้อธิบาย
- พัสดุหลายกล่อง: `subParcelQuantity` 2–99 + `subParcel` JSON (มี `outTradeNo` รายกล่อง ≤20)
- response: `pno` (เลข tracking), `sortCode`, `dstStoreName`, `sortingLineCode`, `earlyFlightEnabled`, `packEnabled`, `upcountryCharge`, `notice` · ในตัวอย่างมี `lineCode`, `upcountry`, `upcountryAmount`, `sameProvince`, `srcPostalCode`, `dstPostalCode`, `subPno` ด้วย แต่ไม่อยู่ในตาราง
- FAQ: พัสดุที่สร้างแล้ว**ไม่มีวันหมดอายุ** [FD#order-api-2]

**#5 Modify** — แก้ได้เกือบทุกฟิลด์รวม COD ส่วน response คือ `data` ว่าง [FD#modify-order-orders-modify] เอกสารไม่ได้บอกว่าหลังรับพัสดุแล้วยังแก้ได้หรือไม่ (ยืนยันไม่ได้) แต่ในตัวอย่าง routes มี `CHANGE_PARCEL_INFO` ที่เปลี่ยน COD หลัง `RECEIVED` แล้ว [FD#tracking-order-batch-orders-routesbatch]

**#6 Cancel** — ถ้ารับพัสดุไปแล้วจะได้ error **1015 "Parcel is picked up, not allowed to cancel"** [FD#response_code] การยกเลิกพัสดุกับการยกเลิกรถเป็นคนละคำสั่งกัน [FD#notify-api-2]

**#7/#8 Routes** [FD#tracking-order-orders-pno-routes]
- คืน `state` (1–9), `stateText` (ภาษาตาม Accept-Language), `stateChangeAt` (epoch วินาที, ในตัวอย่าง batch เป็นทศนิยม), `routes[]` = `{routedAt, routeAction, message, state}` เรียงใหม่→เก่า, `returnedPno`, `customaryPno`
- ชื่อฟิลด์ในตารางเขียนว่า `routes.routedAction` แต่ตัวอย่างใช้ `routeAction` ต้องรองรับทั้งสองชื่อ
- FAQ: route จะว่างจนกว่าคนขับจะรับพัสดุ [FD#order-api-2]

**#9 deliveredInfo** — คืน `signer`, `signerTypeText`, `pod` (รูปลายเซ็น), `photo.photo1/2`, `ticketDeliveryStaffLat/Lng`, `stateDate` [FD#getparceldeliveredinfo-orders-pno-deliveredinfo] ใช้กับหลักฐานข้อพิพาทของ 00055 (`ShipmentEvidence`) ได้ดีกว่าของ iShip

**#10/#11 Label** — ส่ง `Accept: application/pdf` แล้วได้ PDF กลับมา**ทีละ pno** (ไม่มี bulk) [FD#print-big-label-100-180-mm-orders-pno-pre_print] ถ้าต้องพิมพ์หลายใบต้องรวม PDF เอง ส่วน FAQ ระบุว่าใส่โลโก้หรือชื่อสินค้าลงใบปะหน้าของ API ไม่ได้ ถ้าจะทำใบปะหน้าเองต้องมีอย่างน้อย pno+barcode, `sortCode`, `dstStoreName`, `sortingLineCode` [FD#order-api-2] (มีแม่แบบ PDF ให้ที่ `ali-static-open.flashexpress.com/fle/web/220629/print-100-180.pdf` และ `print-100-75.pdf`)

**#12 ordersByMchPno** — ใช้เลข tracking ที่ร้านกำหนดเอง (`mchPno`) ต้องได้รับสิทธิ์หรือช่วงเลขจาก Flash ก่อน (ยืนยันไม่ได้ เอกสารไม่ได้อธิบาย) Deep ไม่จำเป็นต้องใช้

**#13 estimate_rate** [FD#freight-inquiry-orders-estimate_rate]
- response: `estimatePrice` (สตางค์, **ตัวอย่างเป็น string** `"12740"`), `pricePolicy` (1 = ตามน้ำหนัก, 2 = ตามขนาด), `upCountry`/`upCountryAmount`, `valueInsuranceFee`, `speedFee`, `codTransferFee`, `opdInsureFee`
- `pricingTable` 0 = ราคามาตรฐาน / 1 = ราคาสัญญาของลูกค้า
- เอกสารระบุชัดว่าเป็น "estimated cost, final price is subject to specific billing" ซึ่งเป็นบทเรียนเดียวกับ `estimatedPrice` vs `carrierPrice` ใน [REPO prisma/schema.prisma:2795-2803]
- ราคาที่ได้มีของ **Flash เจ้าเดียว** จึงใช้ทำ "เทียบราคาหลายขนส่ง" แบบ iShip ไม่ได้

**#14–16 Notify (เรียกรถ)** [FD#notify-courier-notify]
- `/notify` คืน `ticketPickupId`, ข้อมูลคนขับ (`staffInfoId/Name/Phone`), `timeoutAtText` (ข้อความ เช่น "พรุ่งนี้ 12:00 ~ 14:00"), `ticketMessage`, `upCountryNote`
- ถ้าที่อยู่เดิมยังมีงานรับที่ค้างอยู่จะได้ error **1010** ต้องยกเลิกงานเดิมหรือรอให้เสร็จก่อน [FD#notify-api-2]
- `ticketPickupId` **เปลี่ยนได้**ถ้างานถูกโอนให้คนขับคนอื่น ถ้าใช้ id เก่าไปยกเลิกจะได้ error 1011 ต้องใช้ `currentTicketPickupId` จาก webhook courier [FD#notify-api-2] [FD#web-hook-courier]
- `/notify/{id}/cancel`: ตัวอย่างในเอกสารพิมพ์ path ผิดเป็น `/orders/TH4714A27/cancel` แต่หัวข้อเขียน `/open/v1/notify/{id}/cancel` ให้ยึดตามหัวข้อ

**#17/#18 Webhook settings** — **ตั้ง URL ผ่าน API ได้เอง** ไม่ต้องให้ร้านไปกรอกในหลังบ้านเหมือน iShip [FD#web-hook-service-web_hook_service] ค่าที่ตั้งได้คือ 1 URL ต่อ 1 ชนิด ต่อ 1 `mchId` · response ของ #18 ในตัวอย่างใช้ชื่อ camelCase (`webHookStatusEnabled`) แต่ตารางใช้ snake_case (`web_hook_status`) ต้องรองรับทั้งคู่

---

## 4. สถานะพัสดุ, webhook payload และการตรวจ

### 4.1 สถานะพัสดุ (`state`) [FD#web-hook-status] + `download/status.pdf`
| state | ความหมาย (Flash) | เทียบ carrierStatus ของ iShip ในระบบเรา [REPO src/lib/iship/status.ts:29-63] |
|---|---|---|
| — (ยังไม่มี route) | สร้างแล้วแต่ยังไม่ได้รับพัสดุ | `order_success` |
| 1 | Picked up | `picked_up` |
| 2 | In transit | `in_transit` / `with_branch` |
| 3 | On Delivery | `progress` |
| 4 | Detained (ติดต่อผู้รับไม่ได้ ค้างที่สาขา) | `issue` (ใกล้เคียงที่สุด) |
| 5 | Delivered | `delivered` |
| 6 | Problematic Processing | `issue` |
| 7 | Returned | `return` (ตีกลับและได้**เลขใหม่** `returnedPno`) |
| 8 | Closed (ปิดโดยข้อยกเว้น เช่น เคลมแต่ไม่คืนของ) | `close` |
| 9 | Cancelled | `cancelled` |

- ตาม status.pdf ถ้าตีกลับ (7) จะได้เลข tracking ใหม่ที่เริ่มนับ 1→2→3→5 ใหม่ ส่วนข้อมูลการตีกลับอยู่ใน `returned`, `returnedPno`, `customaryPno` ของ webhook และ routes
- **ไม่มีสถานะที่เทียบกับ `return_success`, `payment_success`, `cod_refund`, `is_expired`** ได้ตรง ๆ "ตีกลับถึงร้านแล้ว" น่าจะเป็นเลขใหม่ที่ไปถึง state 5 (อนุมานจาก status.pdf ยังยืนยันไม่ได้)
- `markerCategory` (สาเหตุที่ค้างหรือมีปัญหา): 14 ผู้รับเลื่อนวันรับ · 40 ไม่อยู่หรือไม่รับสาย · 17 ปฏิเสธรับ · 23 ที่อยู่ผิด · 25 เบอร์ผิด · 26 ยอด COD ไม่ถูก · 29 เบอร์ไม่มีอยู่จริง [FD#web-hook-status]
- `routeAction` 23 ค่า เช่น `RECEIVED`, `ARRIVAL_WAREHOUSE_SCAN`, `DELIVERY_TICKET_CREATION_SCAN`, `DETAIN_WAREHOUSE`, `DELIVERY_CONFIRM`, `DIFFICULTY_HANDOVER`, `CANCEL_PARCEL`, `CHANGE_PARCEL_*`, `SYSTEM_AUTO_RETURN` ฯลฯ [FD#route_action] ข้อดีคือแยกขั้นตอนได้จากรหัส ไม่ต้องจับคำในข้อความแบบ `RETURN_DISPATCH_PHRASE` ของ iShip [REPO src/lib/iship/status.ts:160]

### 4.2 Webhook 5 ชนิด (`webhookApiCode`) [FD#web-hook-service-web_hook_service]
| code | ชนิด | ข้อมูลสำคัญใน `data` | ใช้กับคอลัมน์ไหนของเรา |
|---|---|---|---|
| 0 | status | `pno`, `outTradeNo`, `recentPno`, `state`, `stateText`, `stateDate`, `returned`, `returnedPno`, `customaryPno`, `codRefunded`, `codRefundedPno`, `markerCategory`, `staffInfoId/Phone` (เฉพาะ state 3), `eSignature`, `photo`, `ticketDeliveryStaffLat/Lng` [FD#web-hook-status] | `carrierStatus*`, `deliveredAt`, `problemAt`, `returnStartedAt` |
| 4 | routes | ทุกอย่างใน status + `routedAction`, `message`, `routedAt`, `currentProvince`, `origPno` [FD#web-hook-routes] | `ShipmentEvent` (หนึ่ง route = หนึ่งแถว) |
| 1 | weight | `length/width/height` (ซม.), `weight` (กรัม), `price` (สตางค์), `weightTime` — นับราย**กล่องย่อย** [FD#web-hook-weight] | `actualWeight`, `isOverWeight/isOverSize` |
| 2 | price | `freightPrice`, `codAmount`, `codFee`, `valueInsuranceFee`, `remoteAreaFee`, `packagingFee`, `labelFee`, `speedFee`, `chargable*`, `pricePolicy`, `priceAt` [FD#web-hook-price] | `carrierPrice`, `codFee` |
| 3 | courier | `ticketPickupId`, `currentTicketPickupId`, `state` 0–4 (รอมอบหมาย/รอรับ/รับแล้ว/โอนงาน/ยกเลิก), `cancelReasonCode` (80, 82, 83, 85–88, 6), คนขับ [FD#web-hook-courier] | `ShipmentPickup` |

- **การตอบกลับ:** ต้องตอบ HTTP 2xx และ body `{"errorCode":"1","state":"success"}` ถ้าไม่ตอบแบบนี้ Flash จะยิงซ้ำ "until it receives success status" [FD#web-hook-status] ซึ่ง**ต่างจาก iShip** ที่ route เดิมตอบ `{ ok: true }` [REPO src/app/api/webhooks/iship/[secret]/route.ts:69] route ของ Flash ต้องตอบ body ตามรูปของ Flash เป๊ะ ไม่อย่างนั้นจะโดนยิงซ้ำไม่จบ
- **ค่าใน `data` เป็น string ทั้งหมด** (`"state":"1"`, `"updateAt":"1612762153"`) ยกเว้นบางตัวที่เป็น boolean (`"returned": false` ใน routes) และ `updateAt` ของ courier ในตัวอย่างเป็น `"2021-02-08 03:46:34"` ต้อง parse ให้ทนทุกรูป (บทเรียน [REPO src/lib/iship/status.ts:769] `parseCarrierTimestamp`)
- ตัวอย่าง price มี `pricePolicy: "6"` ซึ่งไม่อยู่ในชุด 1/2 ที่เอกสารประกาศ และมี `opdInsureFee`, `freightInsurance`, `settlementType` ที่ไม่มีในตาราง จึงเก็บ payload ดิบไว้ก่อน (convention external-payload-schema)
- FAQ: **webhook ส่งย้อนหลังไม่ได้** ถ้าข้อมูลหายต้องไปดูใน Flash Printer [FD#web-hook-api-2] ดังนั้นต้องมีรอบ poll `routesBatch` ไว้ซ่อมข้อมูลที่หาย เหมือน cron ของ iShip [REPO src/app/api/cron/iship-status-sync/route.ts:6-28]
- dedupe: ใช้ `dedupeKey = "<routedAction>:<routedAt>"` สำหรับ routes และ `"<state>:<stateDate>"` สำหรับ status ซึ่งเข้ากับ `@@unique([shipmentId, dedupeKey])` เดิม [REPO prisma/schema.prisma:2869-2888]
- **การตรวจ:** ดู §2.4 (ลงนามเฉพาะ `mchId`+`nonceStr`)

---

## 5. Error, rate limit, sandbox

### 5.1 Response code [FD#response_code]
`1` สำเร็จ · `0` internal error · `1000` ส่งไม่สำเร็จ (body/URL ผิดรูป [FD#basic-information]) · `1001` ไม่พบลูกค้า (mchId ผิด) · `1002` **ลายเซ็นผิด** · `1003` พัสดุซ้ำ (outTradeNo ซ้ำ) · `1004` ที่อยู่ผู้ส่งไม่ตรงระบบ · `1005` ที่อยู่ผู้รับไม่ตรงระบบ · `1006` ไม่พบพัสดุ · `1007` ไม่พบคลัง · `1008` ยังไม่ได้สมัคร COD · `1009` ยอด COD ติดลบ · `1010` มีงานรับค้างอยู่แล้ว · `1011` ยกเลิกการเรียกรถนี้ไม่ได้ · `1015` รับพัสดุแล้ว ยกเลิกไม่ได้ · `1018` ต้องส่งที่อยู่ผู้ส่งหรือ warehouseNo · `1019` pno ไม่ใช่ของ mchId นี้ · `1020` มูลค่าประกันติดลบ · `1021` รหัสไปรษณีย์ต้องมี 5 หลัก · `1022` ที่อยู่ผู้ส่งอยู่นอกพื้นที่ให้บริการ

แมปเข้าหมวด error เดิมของ iShip ได้ตรง ๆ [REPO src/lib/iship/errors.ts] คือ 1002/1001 → token หรือ credential ผิด · 1004/1005/1021/1022 → ADDRESS_INVALID · 1008 → ยังไม่เปิด COD

### 5.2 Rate limit
**ยืนยันไม่ได้** — ทั้งหน้าเอกสารไม่มีคำว่า rate limit, QPS หรือ throttle เลย (ค้นแล้ว) ต้องถามเจ้าหน้าที่ Flash ส่วนฝั่งเราให้ใช้ throttle 15 นาทีต่อร้านแบบเดิม และใช้ `routesBatch` แทนการยิงรายใบ

### 5.3 Sandbox / training
- training env: `https://open-api-tra.flashexpress.com` [FD#api-environment]
- วิธีขอ mchId/key ของ training เอกสารไม่ได้ระบุ บอกแค่ "contact the official support staff" [FD#signature-algorithm]
- demo Python มี credential training ฝังอยู่ (§2.3) ซึ่งยังยืนยันไม่ได้
- ไม่มีโหมด dry-run ฝั่ง Flash ต้องใช้ `isDryRun` แบบเดิม [REPO src/lib/iship/client.ts:37-39] หรือชี้ไป training

### 5.4 จุดที่เอกสารขัดกันเอง
1. ทิศการเรียงในลายเซ็น (DESC vs ascending) — §2.3
2. ตัวอย่าง sign คำนวณซ้ำไม่ได้ — §2.3
3. `routeAction` vs `routedAction` — §3.1
4. ตัวอย่าง cancel notification ใช้ path ผิด — §3.1
5. ชื่อฟิลด์ของ webhook infos (camelCase vs snake_case) — §3.1
6. FAQ บอกว่า webhook มี 4 ชนิด (0–3) แต่ API มี 5 (เพิ่ม 4 = routes) [FD#web-hook-api-2]
7. Host `api-sandbox.flashexpress.com` ในตัวอย่าง label กับ ordersByMchPno ไม่ตรงกับ env ที่ประกาศไว้
8. FAQ เรื่องประกันยกตัวอย่างเป็นเงิน **RM** (ริงกิต) [FD#order-api-2] แปลว่าเอกสารใช้ร่วมกันหลายประเทศ (มีหน้า /my /ph /la ด้วย)

---

## 6. เทียบกับ iShip ที่มีอยู่ใน repo

### 6.1 ข้อสังเกตสำคัญ: iShip ส่งต่อข้อมูลของ Flash อยู่แล้ว
- หมวดสินค้าของ iShip (0–11, 99) ตรงกับ Article Category ของ Flash ทุกค่า [REPO src/lib/iship/mapping.ts:26-40] เทียบกับ [FD#article_category]
- ผลลัพธ์ create_order ของ iShip มี `sortCode`, `sortingLineCode`, `dstStoreName` [REPO src/lib/iship/client.ts:76-83] และผลเรียกรถมี `ticketPickupId`, `staffInfoName`, `timeoutAtText`, `ticketMessage` [REPO src/lib/iship/client.ts:93-99] ซึ่งเป็นชื่อฟิลด์ของ Flash ทั้งหมด
- ตัวเลือก `on_time`/`box_shield`/`is_insured` ของ iShip [REPO src/lib/iship/client.ts:126-130] ตรงกับ `expressCategory=2`/`opdInsureEnabled`/`insured` ของ Flash
- ร้านที่ส่ง Flash ผ่าน iShip อยู่แล้วจึง**ได้ฟีเจอร์ส่วนใหญ่ไปแล้ว** สิ่งที่ได้เพิ่มจากการเชื่อมตรงคือ ไม่ต้องผ่านคนกลาง, webhook ตั้งเองได้, มีหลักฐานการส่ง (POD) และพิกัด, route action แยกขั้นตอนได้ชัด และใช้ราคาสัญญาของร้านเองได้ (`pricingTable=1`)

### 6.2 ตารางจับคู่
| แนวคิด | iShip ในระบบเรา | Flash ตรง | ใช้ของเดิม / ทำใหม่ |
|---|---|---|---|
| ข้อมูลเชื่อมต่อของร้าน | `ShopShippingAccount` 1:1 Shop, `accessTokenEnc` (AES-GCM), `provider @default("ISHIP")` [REPO prisma/schema.prisma:2561-2620] | `mchId` + `key` (+ อาจมี `warehouseNo`) | **ทำใหม่บางส่วน** — `shopId @unique` ทำให้ร้านหนึ่งมีได้แค่ 1 provider ถ้าต้องมีทั้ง iShip และ Flash ต้องเปลี่ยน unique เป็น `(shopId, provider)` |
| ลงลายเซ็น | Bearer token [REPO src/lib/iship/client.ts:214] | SHA256 sign + form-urlencoded | **ทำใหม่** `lib/flash/client.ts` |
| สร้างพัสดุ | `createShipment` [REPO src/services/iship.service.ts:869] → `/api/create_order` | `/open/v3/orders` | ใช้ flow, snapshot และ idempotency เดิม แต่ต้องเขียน payload builder ใหม่ |
| idempotency | `idempotencyKey` → `custom_order_id` [REPO prisma/schema.prisma:2687-2690] | `outTradeNo` (ซ้ำได้ error 1003) | ใช้เดิมได้ แต่ retry หลัง response หายยังตามหา `pno` ไม่ได้ (§7 Q5) |
| ที่อยู่ | ตำบล → `src_district`, อำเภอ → `src_amphure` (BR-ISHIP-31) [REPO src/lib/iship/mapping.ts:4, 252-264] | อำเภอ → `srcCityName`, ตำบล → `srcDistrictName` | **กับดักซ้ำ** — `senderDistrict`(อำเภอ) → `srcCityName` และ `senderSubdistrict`(ตำบล) → `srcDistrictName` ต้องมี unit test เป็น blocker เหมือนเดิม |
| ชื่อจังหวัด | `normalizeProvince` แปลง "กรุงเทพ" → "กรุงเทพมหานคร" [REPO src/lib/iship/mapping.ts:126-129] | ตัวอย่าง Flash ใช้ **"กรุงเทพ"** [FD#getallwarehouses-getallwarehouses-warehouses] [FD#web-hook-courier] | **ห้ามใช้ normalizeProvince เดิม** — ต้องเทียบกับต้นไม้ที่อยู่จาก `address_core` (error 1004/1005 ถ้าไม่ตรง) · FAQ บอกว่าขอใช้ตารางที่อยู่ของลูกค้าเองได้ถ้าติดต่อทีม Product [FD#order-api-2] |
| หน่วย | weight กก. `Decimal(6,2)`, เงินเป็นบาท [REPO prisma/schema.prisma:2591, 2693] | กรัม, สตางค์ (int) | แปลงที่ขอบ client ที่จุดเดียว |
| ราคา | `checkPrice` + เทียบหลายขนส่ง [REPO src/services/iship.service.ts:2679, 2742] | `estimate_rate` เจ้าเดียว | ใช้ `estimatedPrice` เดิม แต่เทียบราคาได้แค่ "iShip ทุกเจ้า + Flash ตรง" |
| ราคาจริง | `carrierPrice` จาก `discount_price` ของ query_orders [REPO prisma/schema.prisma:2777-2788] | webhook price `freightPrice` (+ค่าธรรมเนียมอื่น) | ใช้คอลัมน์เดิม แต่ต้องตัดสินว่า "ต้นทุน" = `freightPrice` อย่างเดียวหรือรวม `remoteAreaFee/speedFee/valueInsuranceFee/opdInsureFee/labelFee` (HR16: นิยามต้นทุนต้องเดียวทั้งระบบ) |
| ค่า COD fee | `codFee` [REPO prisma/schema.prisma:2804-2809] | webhook price `codFee` | ใช้เดิม |
| น้ำหนักจริง | `actualWeight`, `isOverWeight/Size` [REPO prisma/schema.prisma:2776-2794] | webhook weight | ใช้เดิม (หาร 1000) |
| สถานะ | `carrierStatus` string ชุด iShip [REPO src/lib/iship/status.ts:29-63] | `state` 1–9 | **ทำใหม่** — แปลง Flash state เป็นรหัสชุดเดิม (§4.1) เพื่อให้ helper ทุกตัว (`isDeliveredCarrierStatus`, `PROBLEM_*`, `RETURNED_*`) ใช้ได้ต่อ หรือจะแยก namespace ตาม provider ก็ได้ |
| ไทม์ไลน์ | `ShipmentEvent` + `dedupeKey` [REPO prisma/schema.prisma:2869-2888] | webhook routes / `routes[]` | ใช้เดิม |
| webhook ขาเข้า | `/api/webhooks/iship/[secret]` ตอบ `{ok:true}` เสมอ [REPO src/app/api/webhooks/iship/[secret]/route.ts:36-70] | ต้องตอบ `{"errorCode":"1","state":"success"}` + ตรวจ sign | **ทำ route ใหม่** `/api/webhooks/flash/[secret]` |
| poll สำรอง | cron `iship-status-sync` ทุก 5 นาที [REPO src/app/api/cron/iship-status-sync/route.ts] | `routesBatch` | เพิ่มสาขาของ Flash ใน cron (หรือแยก cron) |
| เรียกรถ | `ShipmentPickup` + `requestPickup` [REPO prisma/schema.prisma:3050-3075] [REPO src/services/iship.service.ts:1872] | `/notify`, webhook courier | ใช้ตารางเดิม แต่ต้องเก็บ `currentTicketPickupId` เพิ่ม (id เปลี่ยนเมื่องานถูกโอน) |
| ใบปะหน้า | `downloadLabel(tracks[])` หลายใบใน PDF เดียว [REPO src/lib/iship/client.ts:433-470] | PDF ทีละ pno, 2 ขนาด | ต้องรวม PDF เอง (ต้องเพิ่ม lib) หรือพิมพ์ทีละใบ · ตรวจ magic bytes `%PDF` แบบเดิมได้ |
| ยกเลิก | `cancelShipment` [REPO src/services/iship.service.ts:1441] | `/orders/{pno}/cancel` (error 1015 ถ้ารับพัสดุแล้ว) | ใช้ flow เดิม |
| ผูกพัสดุที่มีอยู่ | `listUnlinkedParcels`/`linkShipment` จาก query_orders [REPO src/services/iship.service.ts:2874-3212] | **ไม่มี endpoint list พัสดุ** ทำได้แค่ `routes` ของ pno ที่รู้เลขแล้ว | ผูกได้เฉพาะกรณีร้านพิมพ์เลขเอง (ตรวจด้วย `routes` + error 1019 ถ้า pno ไม่ใช่ของ mchId นั้น) · นำเข้าแบบรวดเดียวทำไม่ได้ |
| **COD โอนเข้าร้าน** | `codSettledAt` จาก `settlement_at` + status 12 [REPO prisma/schema.prisma:2767-2775] [REPO src/lib/iship/status.ts:885-897] | **ไม่มีในเอกสาร** | **gap** — ปิดงาน COD อัตโนมัติจาก Flash ไม่ได้ จนกว่าจะได้ช่องทางจาก Flash (§7 Q3) |
| COD กลับทิศ | `resolvePaymentSync` [REPO src/lib/iship/payment-sync.ts:40] | `codRefunded`/`codRefundedPno` | ใช้เดิมได้ แต่ความหมายของ "COD refunded parcel" ยังคลุมเครือ (ยืนยันไม่ได้) |
| หลักฐานการส่ง | `ShipmentEvidence` (00055) | `deliveredInfo` (POD, รูป 2 ใบ, lat/lng) | ได้ข้อมูลมากขึ้น |
| โลโก้/แบรนด์ | `COURIER_BRANDS.FLASH` [REPO src/lib/iship/courier.ts:49] | — | ใช้เดิม |

### 6.3 ความต่างเชิงโครงสร้าง
- **คนกลาง vs ขนส่งตรง:** iShip รวมหลายขนส่ง ให้ token ร้านละ 1 ตัว และหักเงินจากเครดิตที่เติมไว้กับ iShip ส่วน Flash เป็นสัญญาตรงระหว่างร้านกับ Flash ใช้ mchId + key ที่ Flash ออกให้ และเรียกเก็บแบบเงินสดหรือเครดิต [FD#settlement_category] ร้านจึงต้อง**มีบัญชีร้านค้า Flash (KA/Open API) ก่อน** ซึ่งไม่ใช่สิ่งที่ร้านกดสมัครเองในแอปได้ (ยืนยันไม่ได้ว่าขั้นตอนยากง่ายแค่ไหน)
- **sub-account:** ถ้า Deep ถือ mchId หลักใบเดียวแล้วสร้าง sub-account ให้แต่ละร้าน [FD#create-sub-account-new_sub_account] ก็จะไม่ต้องให้ร้านไปขอ key เอง แต่เอกสาร**ไม่ได้บอก**ว่าจะสร้างพัสดุในนาม sub-account ได้อย่างไร (ไม่มีพารามิเตอร์ subAccountId ใน create order) และใครเป็นผู้จ่ายหรือรับเงิน COD ทั้งหมดนี้ยืนยันไม่ได้
- **webhook ผูกกับ mchId:** ถ้าแต่ละร้านมี mchId ของตัวเอง ต้องใช้ key ของร้านนั้นตรวจ sign จึงต้องหาร้านจาก `mchId` ใน body ก่อนแล้วค่อยตรวจ หรือฝัง shopId หรือ secret ไว้ใน path ตอนตั้ง URL ผ่าน #17

---

## 7. ร่างแผนการเชื่อมต่อ (ข้อเสนอเท่านั้น)

> ตาม HR11 ต้องมี PRD+BRD ที่ user อนุมัติก่อนเขียนโค้ด ส่วนนี้เป็นวัตถุดิบสำหรับเอกสารเหล่านั้น ไม่ใช่สเปก

### 7.1 Phase
- **P0 — พิสูจน์กับ training (ไม่แตะ DB):** ขอ mchId/key training → สคริปต์ลงลายเซ็นพร้อมเทสที่ใช้ test vector จริง → ลองยิง `warehouses`, `estimate_rate`, `orders` (ทั้ง COD และไม่ COD), `routes`, `pre_print`, `cancel`, `notify` → ตั้ง webhook ไปที่ URL ทดสอบแล้ว**เก็บ payload ดิบ**ไว้เทียบกับเอกสาร (convention external-payload-schema) → ทดสอบเคส `outTradeNo` ซ้ำ (Q5) → ดาวน์โหลดต้นไม้ `address_core` มาเทียบกับชุดที่อยู่ที่ Deep ใช้
- **P1 — เชื่อมต่อ + สร้างพัสดุ + ใบปะหน้า + ยกเลิก:** `lib/flash/{client,sign,mapping,errors}.ts`, เชื่อมบัญชีที่หน้าตั้งค่า, ปุ่มสร้างพัสดุ (provider = FLASH) ที่เดียวกับ iShip, พิมพ์ใบปะหน้า
- **P2 — สถานะ:** route webhook ใหม่ + ตั้ง URL อัตโนมัติด้วย #17 + สาขา Flash ใน cron poll `routesBatch` + map state เป็นรหัสชุดเดิม + stamp `deliveredAt/problemAt/return*`
- **P3 — ต้นทุน/น้ำหนัก/เรียกรถ:** webhook price/weight → `carrierPrice/codFee/actualWeight` (นิยามต้นทุนต้องเคาะก่อน HR16) · `/notify` + webhook courier → `ShipmentPickup`
- **P4 — COD settlement:** ทำได้ก็ต่อเมื่อ Flash ให้ช่องทางมา (Q3)

### 7.2 ข้อมูลที่อาจต้องเพิ่ม (ข้อเสนอ, ยังไม่ได้ออกแบบกับ safepay-database)
- `ShopShippingAccount`: เปลี่ยน unique `shopId` → `@@unique([shopId, provider])` (ถ้าต้องใช้ iShip และ Flash พร้อมกัน ซึ่ง**เป็นการเปลี่ยน constraint ที่กระทบโค้ดที่หา account ด้วย `findUnique({shopId})` ทุกจุด**) · `merchantId String?` (mchId) · `secretKeyEnc` (ใช้ `accessTokenEnc` เดิมเก็บ key ได้) · `warehouseNo String?` · `labelSize String?` ("BIG"/"SMALL") · `webhookConfiguredAt DateTime?`
- `OrderShipment`: `provider = "FLASH"` ใช้ของเดิม · `trackingNo` = `pno` · `externalId` = `orderId` ของ Flash (มากับ webhook) · `refCode` อาจไม่ใช้ · เพิ่ม `sortCode/dstStoreName/sortingLineCode` (ต้องใช้ถ้าทำใบปะหน้าเอง หรือเก็บไว้ใน `optionsSnapshot` ก็พอ) · `returnedPno String?` (ตีกลับได้**เลขใหม่** ต้องจับ webhook ของเลขใหม่กลับมาที่แถวเดิม)
- `ShipmentPickup`: `currentTicketPickupId String?`
- **ไม่ต้องเพิ่ม:** `carrierPrice`, `codFee`, `actualWeight`, `estimatedPrice`, `ShipmentEvent` ใช้ของเดิมได้หมด
- ต้อง sync `docs/SRS.md` (HR11) และบอก user เรื่อง migration ตาม HR15

### 7.3 คำถามเปิดสำหรับ user
1. **บัญชี Flash:** Deep มีหรือจะทำสัญญา mchId หลักเองไหม (แล้วสร้าง sub-account ให้ร้าน) หรือให้แต่ละร้านเอา mchId/key ของตัวเองมาใส่? ตอนนี้มีร้านไหนมีบัญชี KA/Open API กับ Flash แล้วบ้าง?
2. **ใครจ่ายค่าส่ง:** ถ้าใช้ mchId ของ Deep แปลว่า Deep รับบิลจาก Flash แล้วไปเก็บกับร้าน ซึ่งขัดกับหลัก BR-ISHIP-53 ที่ไม่ให้ Deep ถือเงินของความสัมพันธ์ร้านกับขนส่ง [REPO prisma/schema.prisma:2617-2618] จะรับข้อนี้ได้ไหม?
3. **COD:** ร้านเปิดบริการ COD กับ Flash แล้วหรือยัง (ไม่อย่างนั้นได้ error 1008) และ Flash โอนเงิน COD ให้ใคร รอบไหน มีรายงานหรือ API ไหม? ถ้าไม่มี ฟีเจอร์ "ปิดงาน COD อัตโนมัติ" จะใช้กับพัสดุ Flash ตรงไม่ได้
4. **ทำไมต้องเชื่อมตรง:** iShip ส่ง Flash ได้อยู่แล้ว เป้าหมายคือ ค่าส่งสัญญาถูกกว่า, ร้านมีบัญชี Flash อยู่แล้ว, webhook ของ iShip ไม่เคยยิง (64% ไม่มี event [REPO prisma/schema.prisma:2729-2731]) หรือเหตุผลอื่น? คำตอบจะเป็นตัวกำหนดว่า P2 (สถานะ) หรือ P1 (สร้าง) สำคัญกว่า
5. **retry ที่ปลอดภัย:** ถ้าส่ง `outTradeNo` ซ้ำแล้ว Flash คืนแค่ 1003 โดยไม่บอก `pno` เดิม ร้านจะยอมให้ "ค้างเป็น FAILED แล้วตรวจมือใน Flash Printer" ได้ไหม (ต้องถามเจ้าหน้าที่ Flash ด้วยว่ามีวิธีค้นด้วย outTradeNo หรือไม่)
6. **ขนาดใบปะหน้า:** ร้านใช้กระดาษ 100×180 หรือ 100×75? (iShip เดิมใช้ A6)
7. **ร้านหนึ่งใช้ทั้ง iShip และ Flash ตรงพร้อมกันไหม?** ถ้าใช่ ต้องเปลี่ยน unique ของ `ShopShippingAccount` (กระทบหลายไฟล์) ถ้าไม่ใช่ ใช้ `provider` เดิมได้เลย
8. **คำถามถึง Flash:** rate limit, IP allowlist, test vector ของลายเซ็น, ความหมายของ `dataSign/dataJson` และ `codRefunded`, นโยบาย retry ของ webhook (ถี่แค่ไหน นานแค่ไหน)

---

## 8. แหล่งอ้างอิง

**แหล่งหลัก (Flash, อ่านครบทุกส่วน 2026-10-22)**
- https://open-docs.flashexpress.com/#open-api-reference — หน้าเอกสารทั้งหมด (anchor ที่อ้างใน §1–5: `api-environment`, `the-basic-standard`, `the-basic-response-data-format`, `internationalization-reference`, `notices`, `signature-algorithm`, `notice`, `getallwarehouses-getallwarehouses-warehouses`, `retrieve-flash-standard-location-tree-address_core`, `create-sub-account-new_sub_account`, `create-order-orders`, `modify-order-orders-modify`, `cancel-order-orders-pno-cancel`, `tracking-order-orders-pno-routes`, `tracking-order-batch-orders-routesbatch`, `getparceldeliveredinfo-orders-pno-deliveredinfo`, `print-big-label-100-180-mm-orders-pno-pre_print`, `print-small-label-100-75-mm-orders-pno-small-pre_print`, `create-order-by-merchant-tracking-number-ordersbymchpno`, `freight-inquiry-orders-estimate_rate`, `getallnotificationsindate-notifications`, `notify-courier-notify`, `cancel-notification-notify-id-cancel`, `web-hook-service-web_hook_service`, `request-web-hook-infos-webhook-setting-infos`, `web-hook-status`, `web-hook-routes`, `web-hook-weight`, `web-hook-price`, `web-hook-courier`, `response_code`, `express_category`, `article_category`, `notification_state`, `settlement_category`, `route_action`, `basic-information`, `order-api-2`, `notify-api-2`, `web-hook-api-2`)
- https://open-docs.flashexpress.com/download/status.pdf — Flash Status Flow
- https://open-docs.flashexpress.com/download/python_order_demo.py.zip — โค้ด demo การลงลายเซ็น (อ่านอย่างเดียว ไม่ได้รัน)
- https://open-docs.flashexpress.com/th.html — ฉบับภาษาไทย (ตรวจแล้วว่า URL ของ env ตรงกัน)

**ไม่ได้ใช้แหล่งรอง** — ทุกข้อในเอกสารนี้มาจากแหล่งหลักข้างบนหรือจากโค้ดใน repo

**โค้ดใน repo (อ่าน ณ commit `0e64ce0ef`)**
- `prisma/schema.prisma:2549-2620` (ShopShippingAccount), `:2671-2865` (OrderShipment), `:2869-2888` (ShipmentEvent), `:3050-3075` (ShipmentPickup)
- `src/lib/iship/client.ts`, `src/lib/iship/mapping.ts`, `src/lib/iship/status.ts`, `src/lib/iship/courier.ts`, `src/lib/iship/payment-sync.ts`, `src/lib/iship/errors.ts`
- `src/services/iship.service.ts` (createShipment :869, cancelShipment :1441, requestPickup :1872, handleStatusWebhook :2031, handlePickupWebhook :2114, syncShipmentStatuses :2457, estimateShippingPrice :2679, listUnlinkedParcels :2874)
- `src/app/api/webhooks/iship/[secret]/route.ts`, `src/app/api/cron/iship-status-sync/route.ts`, `.env.example:123-136`
