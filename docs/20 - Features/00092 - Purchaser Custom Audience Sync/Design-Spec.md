---
title: "Design-Spec — 00092 การ์ดกลุ่มเป้าหมายลูกค้าที่ซื้อแล้ว"
owner: shinobu22
status: approved
created: 2026-11-14
tags: [feature, design-spec, meta, custom-audience]
---

> ผลิตโดย safepay-ux (HR8) 2026-11-14

## หน้า: การ์ด "กลุ่มเป้าหมายลูกค้าที่ซื้อแล้ว" บนหน้า Conversions API (`/settings/conversions-api`, 00092 FR-002/003/008)

### User stories ที่ครอบ
- เจ้าของร้าน (X9) เชื่อมบัญชีโฆษณาได้ 2 ทาง: ผ่าน Facebook (เฉพาะบัญชีใน role) หรือกรอก Ad Account ID + System User token
- เปิดและปิดการส่งรายชื่อลูกค้าที่ซื้อแล้วเข้า Custom Audience ได้เอง
- เห็นว่ากลุ่มชื่ออะไร มีกี่คน ส่งล่าสุดเมื่อไร และเปิดดูใน Ads Manager ได้
- เมื่อหยุดส่ง (token เสีย, ยังไม่ยอมรับข้อตกลง) รู้เหตุผลและรู้ว่าต้องกดอะไรต่อ

### การตัดสินใจเรื่องตำแหน่ง
- วางการ์ดเดียว เต็มความกว้าง **ใต้** ตารางเพจ ใน `page.tsx` (หลัง `<PagesClient/>`)
- ตารางเพจเป็นงานหลักของหน้านี้ (สวิตช์รายเพจ) ส่วน audience เป็นระดับร้าน ใช้ครั้งเดียวแล้วนาน ๆ กลับมาดู จึงไม่ควรแย่งจอแรก
- ข้อยกเว้น: ถ้ามี `?audience=` ใน URL (กลับจาก OAuth) ให้ scroll ไปที่การ์ด (`id="audience"`)
- แสดงการ์ดแม้ร้านไม่มีเพจ (`rows.length===0`) เพราะทางเบอร์โทรไม่ต้องมีเพจ วางใต้ empty state
- มีสิทธิ์เห็นการ์ดนี้ต่อเมื่อ `isMetaAudienceEnabled(shopId)` เปิด ถ้าปิดให้ไม่ render การ์ดเลย ไม่ใช่ `notFound()` เพราะหน้า CAPI ยังเปิดอยู่

### Layout (ASCII)

Desktop (1440, การ์ดเต็มความกว้าง เนื้อหาไม่ซ้อนสองคอลัมน์ว่าง ๆ)
```
[ ตารางเพจ Messenger ... (เดิม) ]

┌ กลุ่มเป้าหมายลูกค้าที่ซื้อแล้ว  [กำลังอัปเดต]            [ ●━ สวิตช์ ] ┐
├ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┤  (เส้นประ)
│ ส่งรายชื่อลูกค้าที่ซื้อแล้วเข้า Custom Audience ในบัญชีโฆษณาของคุณ    │
│ บัญชีโฆษณา        ร้านเสื้อ A · act 111222333                         │
│ กลุ่มเป้าหมาย     Deep · ลูกค้าที่ซื้อแล้ว · ร้าน A   เปิดใน Ads Manager ↗│
│ ในกลุ่ม 1,240 คน    รอส่ง 12 คน    ส่งล่าสุด 14 พ.ย. 2569 10:05       │
│ ┌ i  Meta ต้องมีคนที่จับคู่ได้อย่างน้อย 100 คนจึงใช้ยิงแอดได้ ...   ┐ │
│ └────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────┤
│ [ตัดการเชื่อมบัญชีโฆษณา]  (ปุ่มรอง ชิดซ้าย)                          │
└────────────────────────────────────────────────────────────────────┘
```
`dl` ใช้ `grid md:grid-cols-[10rem_1fr]` ป้ายซ้ายกว้างคงที่ ค่าขวา flex-1 ไม่มีคอลัมน์ว่าง

Tablet (768–1023): เหมือน desktop แต่ตัวเลข 3 ค่าเรียงแบบ `flex-wrap gap-x-6`

Mobile (<640)
```
┌ กลุ่มเป้าหมายลูกค้าที่ซื้อแล้ว ┐
│ [กำลังอัปเดต]        ●━ สวิตช์ │   (header wrap 2 บรรทัด)
├ - - - - - - - - - - - - - - - ┤
│ บัญชีโฆษณา                    │
│ ร้านเสื้อ A · 111222333       │
│ กลุ่มเป้าหมาย                 │
│ Deep · ลูกค้าที่ซื้อ…         │
│ [ เปิดใน Ads Manager ↗ ]      │   (btn เต็มกว้าง min-h-11)
│ ในกลุ่ม 1,240 · รอส่ง 12      │
│ ส่งล่าสุด 14 พ.ย. 10:05       │
│ (callout 100 คน)              │
│ [ ตัดการเชื่อมบัญชีโฆษณา ]    │   (เต็มกว้าง min-h-11)
└───────────────────────────────┘
```
- ไม่มี sticky/FAB ปุ่มหลักอยู่ในการ์ด
- ปุ่มเต็มกว้างทุกตัว (`min-h-11 w-full sm:w-auto lg:min-h-0`) เหมือน PagesClient

### Section breakdown (state ของการ์ด)

พระเอกของการ์ดคือ "สถานะ + สิ่งที่ต้องกดต่อ" ซึ่งต่างกันตาม state

| # | State | เงื่อนไข | เนื้อหาในการ์ด |
|---|---|---|---|
| S0 | ยังไม่เชื่อม | `connection=null` | header ไม่มีสวิตช์ · ปุ่มหลัก "เชื่อมบัญชีโฆษณาผ่าน Facebook" (เฉพาะ `oauthAvailable`) · ปุ่มรอง/ลิงก์ "กรอก Ad Account ID และ token เอง" กางฟอร์ม |
| S1 | เลือกบัญชีหลัง OAuth | `?audience=choose_account` | `form-select` รายการจาก `/accounts` + ปุ่ม "ใช้บัญชีนี้" |
| S2 | เชื่อมแล้ว ปิดอยู่ | `ACTIVE`, `enabled=false` | badge "ปิดอยู่" (neutral) · สวิตช์ปิด · `dl` บัญชี · ถ้ายังไม่มี audience ให้ซ่อนแถวกลุ่ม |
| S3 | เปิดแล้ว กำลังเติม | `enabled`, `backfilledAt=null` | badge "กำลังอัปเดต" (primary-ink) + บรรทัด loader "กำลังเติมลูกค้าเดิมเข้ากลุ่ม · รอบถัดไปภายใน 5 นาที" |
| S4 | เปิดแล้ว ปกติ | `enabled`, `backfilledAt` มีค่า | `dl` เต็ม + ตัวเลข + callout 100 คน |
| S5 | ยังไม่ยอมรับข้อตกลง | `STOPPED` + `TERMS_NOT_ACCEPTED` | badge warning · alert warning + ลิงก์ `termsUrl` · ปุ่ม "ตรวจใหม่" (ดูหมายเหตุ) |
| S6 | หยุดเพราะ token | `STOPPED` + `TOKEN_OR_PERMISSION` | badge danger · alert danger · ปุ่มหลัก "เชื่อมบัญชีโฆษณาใหม่" (ทาง S0 ตาม `tokenSource`) · สวิตช์ disabled แสดงปิด |
| S7 | token ใกล้หมด | `OAUTH` + `tokenExpiresAt` < 7 วัน | alert warning เหนือ `dl` + ปุ่มเชื่อมใหม่ · badge ไม่เปลี่ยน |
| S8 | ตัดการเชื่อม | ปุ่มท้ายการ์ด | Swal danger → `DELETE` → กลับ S0 |

เหตุผลที่ผูกหมายเหตุกับ S5 และ S7

- **S5:** API ไม่มี endpoint "ตรวจใหม่" โดยเฉพาะ ปุ่มที่ทำได้จริงคือ POST `/connect` ซ้ำ (MANUAL ต้องกรอก token ใหม่ ส่วน OAUTH ต้องผ่าน Facebook ใหม่)
  - ใช้ปุ่ม "เชื่อมบัญชีโฆษณาอีกครั้ง" แทน ห้ามเขียนว่า "ตรวจใหม่" เพราะไม่มีของให้กดตรวจ
  - ถ้า Controller อยากได้ปุ่มตรวจใหม่ต้องเพิ่ม backend
- **S7:** `tokenExpiresAt` มีเฉพาะ OAUTH (MANUAL = null ไม่เตือน)

ฟอร์ม MANUAL (S0 และ S6 ของ MANUAL)
- ช่อง "รหัสบัญชีโฆษณา" (`inputMode=numeric`, รับ `act_` นำหน้าได้) กับช่อง "System User token" (`type=password`, `autoComplete=off`) ท่าเดียวกับ AddPanel ใน DatasetsCard
- ปุ่ม "เชื่อมบัญชี" มี spinner ระหว่างรอ เพราะ API ตรวจกับ Meta ก่อนเก็บ
- ห้ามแสดง token กลับในทุกกรณี

### Theme Source Mapping

| Section | Theme file (`theme/paces/Admin/TS/src/app/(admin)/`) | Component / หมายเหตุ |
|---|---|---|
| กรอบการ์ด + header เส้นประ + footer | `ui/cards/page.tsx` | `.card > .card-header(.card-title) + .card-body + .card-footer` (ตามที่ DatasetsCard ใช้) ห้ามการ์ดซ้อนการ์ด |
| สวิตช์เปิด/ปิด | `form/elements/components/ChecksRadioSwitches.tsx` | `form-switch` ท่า optimistic + revert ของ PagesClient `toggle()` (src: `settings/conversions-api/components/PagesClient.tsx`) |
| เลือกบัญชีโฆษณา (S1) | `form/elements/components/InputTextfieldType.tsx` | native `<select class="form-select">` ผูกค่า (กฎ 6a) ห้าม hs-dropdown |
| ช่องกรอก MANUAL | `apps/users/account-settings/page.tsx` | `form-label` / `form-input`; ลอกจาก AddPanel ใน `DatasetsCard.tsx` (RHF + Yup เช่นกัน) |
| badge สถานะ | `ui/badges/page.tsx` | `badge bg-{c}/15 text-{c}-ink` ขยาย `shared.tsx` StatusBadge หรือทำ `AudienceBadge` โครงเดียวกัน |
| callout 100 คน / alert S5 S6 S7 | `ui/alerts/page.tsx` | ในโปรเจกต์ใช้ `bg-{semantic}/15 text-{semantic}-ink rounded-lg px-3 py-2.5` + `Icon` (ท่า TestResult ใน DatasetsCard) ใช้ท่านั้น |
| confirm เปิดครั้งแรก / ตัดการเชื่อม | `plugins/sweet-alerts/components/SweetAlerts.tsx` | ผ่าน `pacesConfirm.question` / `.danger` (`@/lib/paces-swal`) |
| ผลลัพธ์สั้น ๆ | — | `pacesToast.success/error` เท่านั้น |
| ปุ่มเชื่อม Facebook | — (ท่า `ReconnectLink` ใน `shared.tsx`) | `<a href="/api/meta-audience/connect">` ธรรมดา เพราะ endpoint ตอบ 302 ห้ามใช้ `next/link` |
| icon | `icons/tabler/page.tsx` | ดูตารางด้านล่าง |

ต้องเพิ่มใหม่: `audienceApi()` ใน `shared.tsx` ชี้ `/api/shops/meta-audience` เพราะ `capiApi` ผูก prefix `meta-capi` ไว้

ไฟล์ใหม่: `components/AudienceCard.tsx` (client) ไม่ต้อง copy theme เพิ่ม ประกอบจาก primitive ข้างบน
- `page.tsx` เรียก `getAudienceStatus(shopId)` ตรง (RSC) แล้วส่ง `initial`
- ถ้า `getAudienceStatus` พัง ให้ catch แล้วแสดงการ์ด error เล็กในที่เดียว ไม่ทำให้ตารางเพจหายไปด้วย

Icon (tabler ผ่าน `Icon` wrapper ชื่อไม่มี prefix ตามที่โค้ดเดิมทำ)

| ที่ใช้ | ชื่อ |
|---|---|
| ปุ่มเชื่อม Facebook | `brand-facebook` |
| ลิงก์ Ads Manager | `external-link` |
| ตัดการเชื่อม | `plug-connected-x` |
| ช่อง token | `lock` |
| alert เตือน/ผิดพลาด | `alert-triangle` · `circle-x` |
| callout ข้อมูล | `info-circle` |
| กำลังเติม | `loader-2` |
| ลูกค้าในกลุ่ม | `users` |

ข้อเสนอแนะ: icon ทุกตัวข้างบนอยู่ในชุด tabler ที่ Paces มี แต่ผมยังไม่ได้เปิด gallery `icons/tabler/page.tsx` ตรวจทีละชื่อ ให้ developer เปิดยืนยันก่อนใช้ ตัวที่เสี่ยงที่สุดคือ `plug-connected-x`

### User flow

1. S0 กด "เชื่อมบัญชีโฆษณาผ่าน Facebook" ไป Facebook (ขอ `ads_management`) กลับมา `/settings/conversions-api?audience=choose_account#audience`
   - การ์ดโหลด `GET /accounts` (skeleton 1 บรรทัด) แล้วแสดง `form-select` กดเลือกและกด "ใช้บัญชีนี้" เรียก `POST /connect {mode:OAUTH}`
   - ได้ S2 (ปิดอยู่) + toast สำเร็จ
   - ลบ `?audience=` ออกจาก URL ด้วย `router.replace(pathname + '#audience', {scroll:false})` เพื่อไม่ให้ refresh แล้วขึ้นซ้ำ
2. S0 กด "กรอกเอง" กางฟอร์ม กรอกแล้วกด "เชื่อมบัญชี" เรียก `POST /connect {mode:MANUAL}` ได้ S2
3. S2 เปิดสวิตช์
   - ครั้งแรก (`enabledAt===null`) ขึ้น Swal question ถ้ากดยืนยันจึง `PUT {enabled:true}` (optimistic, ผิดพลาดแล้ว revert + toast)
   - ได้ S3 ซึ่ง cron เติมย้อนหลังรอบถัดไป ≤5 นาที
   - เปิดครั้งหลัง ๆ ไม่ถามซ้ำ
4. ปิดสวิตช์ ไม่มี confirm (ย้อนได้ทันที, BR-CA-04) ไป `PUT {enabled:false}` + toast
5. S6/S5 สวิตช์ disabled กดปุ่มเชื่อมใหม่ในการ์ด แล้วกลับสู่ S2
6. ตัดการเชื่อม ท้ายการ์ด Swal danger ถ้ากดยืนยันเรียก `DELETE` ได้ S0
7. ไม่มี polling ตัวเลขอัปเดตเมื่อ `router.refresh()` หรือเข้าหน้าใหม่ (ถ้าอยากเห็นความคืบหน้าตอนเติมย้อนหลังให้ Controller ตัดสินว่าควรมีปุ่มรีเฟรชหรือไม่ ดู Open questions)

### Content outline (ไทย / EN)

คีย์ใหม่ใต้ `conversionsApi.audience*` ใน `th.ts` และ `en.ts` ตามธรรมเนียมเดิม

| key | ไทย | EN |
|---|---|---|
| title | กลุ่มเป้าหมายลูกค้าที่ซื้อแล้ว | Purchaser audience |
| desc | ส่งรายชื่อลูกค้าที่ซื้อแล้วเข้า Custom Audience ในบัญชีโฆษณาของคุณ เพื่อยิงแอดซ้ำหรือหาคนคล้ายลูกค้าเดิม | Send customers who bought to a Custom Audience in your ad account, to retarget or find lookalikes |
| badgeOff / On / Warn / Stop | ปิดอยู่ / กำลังอัปเดต / ต้องยอมรับข้อตกลง / หยุดส่ง | Off / Updating / Terms needed / Stopped |
| connectFb | เชื่อมบัญชีโฆษณาผ่าน Facebook | Connect ad account with Facebook |
| connectManualToggle | กรอก Ad Account ID และ token เอง | Enter Ad Account ID and token |
| connectHint | ใช้ได้กับบัญชีโฆษณาที่คุณเป็นแอดมิน Deep เก็บ token แบบเข้ารหัส และไม่แสดงกลับ | Works with ad accounts you administer. Deep stores the token encrypted and never shows it again |
| fieldAdAccount / Token | รหัสบัญชีโฆษณา (ตัวเลข) / System User token | Ad account ID (digits) / System User token |
| connectSave | เชื่อมบัญชี | Connect account |
| chooseTitle | เลือกบัญชีโฆษณา | Choose an ad account |
| chooseOk | ใช้บัญชีนี้ | Use this account |
| chooseDisabledSuffix | (ปิดใช้งาน) | (disabled) |
| rowAccount / Audience | บัญชีโฆษณา / กลุ่มเป้าหมาย | Ad account / Audience |
| openAdsManager | เปิดใน Ads Manager | Open in Ads Manager |
| statSynced / Pending / Last | ในกลุ่ม {n} คน / รอส่ง {n} คน / ส่งล่าสุด | In audience {n} / Pending {n} / Last sent |
| lastNever | ยังไม่เคยส่ง | Never sent |
| backfilling | กำลังเติมลูกค้าเดิมเข้ากลุ่ม รอบถัดไปภายใน 5 นาที | Adding past customers now. Next batch within 5 minutes |
| note100 | Meta ต้องมีอย่างน้อย 100 คนที่จับคู่ได้ถึงจะใช้ยิงแอดได้ · อัปเดตอาจใช้เวลาถึง 24 ชม. | Meta needs at least 100 matched people before you can run ads on it. Updates can take up to 24 hours |
| swalFirstTitle | เปิดส่งรายชื่อลูกค้าให้ Meta? | Start sending customers to Meta? |
| swalFirstText | Deep จะส่งรหัสลูกค้าในแชทและเบอร์โทรแบบเข้ารหัสไปให้ Meta และเติมลูกค้าที่ซื้อแล้วทั้งหมดของร้านย้อนหลัง ข้อมูลอื่น เช่น ชื่อ ที่อยู่ ยอดซื้อ จะไม่ถูกส่ง ลูกค้าที่ยกเลิกหรือคืนครบจะถูกถอดออกจากกลุ่มเอง | Deep will send chat customer IDs and encrypted phone numbers to Meta, and add all past purchasers. Names, addresses and amounts are never sent. Customers whose orders are cancelled or fully refunded are removed automatically |
| swalFirstOk / Cancel | เปิดส่งให้ Meta / ยังไม่เปิด | Start sending / Not now |
| toastOn | เปิดส่งรายชื่อลูกค้าให้ Meta แล้ว | Sending customers to Meta |
| toastOff | หยุดส่งแล้ว กลุ่มเป้าหมายใน Ads Manager ยังอยู่ | Stopped. The audience in Ads Manager is kept |
| toastConnected | เชื่อมบัญชีโฆษณาแล้ว | Ad account connected |
| toastSwitchFailed | เปลี่ยนสถานะไม่สำเร็จ ลองอีกครั้ง | Could not change this. Try again |
| stopTokenTitle | หยุดส่งเพราะ token ใช้ไม่ได้ | Stopped because the token no longer works |
| stopTokenBody | ลูกค้าใหม่จะเข้ากลุ่มหลังเชื่อมบัญชีโฆษณาอีกครั้ง ข้อมูลที่ส่งไปแล้วยังอยู่ | New customers will be added once you reconnect. What was already sent stays |
| stopTermsTitle | ต้องยอมรับข้อตกลง Custom Audience ก่อน | Accept the Custom Audience terms first |
| stopTermsBody | Meta ยังไม่ให้สร้างกลุ่มเป้าหมายจนกว่าบัญชีโฆษณานี้จะยอมรับข้อตกลง กดลิงก์ไปยอมรับ แล้วกลับมาเชื่อมบัญชีอีกครั้ง | Meta will not create the audience until this ad account accepts the terms. Open the link, accept, then reconnect here |
| termsLink | ไปยอมรับข้อตกลง | Accept the terms |
| reconnectAudience | เชื่อมบัญชีโฆษณาอีกครั้ง | Reconnect ad account |
| expiringTitle | การเชื่อมผ่าน Facebook จะหมดอายุใน {n} วัน | The Facebook connection expires in {n} days |
| expiringBody | เชื่อมอีกครั้งก่อนหมดอายุ เพื่อให้ส่งรายชื่อต่อเนื่อง | Reconnect before then so sending continues |
| disconnect | ตัดการเชื่อมบัญชีโฆษณา | Disconnect ad account |
| disTitle | ตัดการเชื่อมบัญชีโฆษณา? | Disconnect the ad account? |
| disText | Deep จะหยุดส่งรายชื่อและลบ token ที่เก็บไว้ กลุ่มเป้าหมายที่สร้างไว้ใน Ads Manager จะยังอยู่ ลบเองได้ที่นั่น | Deep stops sending and deletes the stored token. The audience in Ads Manager stays. You can delete it there |
| disOk / Cancel | ตัดการเชื่อม / ไม่ตัด | Disconnect / Keep |
| toastDisconnected | ตัดการเชื่อมแล้ว | Disconnected |

ข้อความผลกลับจาก OAuth (`?audience=`) แสดงเป็น alert ในการ์ด (ไม่ใช่ toast เพราะต้องอ่านและมีทางออก)

| ค่า | ไทย |
|---|---|
| cancelled | ยกเลิกการเชื่อมแล้ว กดเชื่อมอีกครั้งเมื่อพร้อม |
| state_mismatch | การเชื่อมหมดเวลาหรือถูกเปิดซ้ำ กดเชื่อมใหม่อีกครั้ง |
| no_code | Facebook ไม่ได้ส่งสิทธิ์กลับมา กดเชื่อมใหม่อีกครั้ง |
| no_ad_account | ไม่พบบัญชีโฆษณาในบัญชี Facebook นี้ สร้างบัญชีโฆษณาก่อน หรือใช้ทางกรอก token เอง |
| error | เชื่อมไม่สำเร็จ ลองอีกครั้ง ถ้ายังไม่ได้ ใช้ทางกรอก token เอง |

ข้อผิดพลาดจาก `POST /connect`

| code | ไทย |
|---|---|
| TOKEN_INVALID | token นี้ใช้ไม่ได้หรือไม่มีสิทธิ์จัดการโฆษณา ตรวจว่าคัดลอกครบ |
| AD_ACCOUNT_INVALID | ไม่พบบัญชีโฆษณานี้ หรือ token นี้เข้าถึงบัญชีนี้ไม่ได้ |
| PENDING_EXPIRED | หมดเวลาเลือกบัญชี (10 นาที) กด "เชื่อมผ่าน Facebook" ใหม่ |
| INVALID_INPUT | รหัสบัญชีโฆษณาต้องเป็นตัวเลข |
| อื่น ๆ | เชื่อมไม่สำเร็จ ลองอีกครั้ง |

`NOT_ROLE_USER` ไม่ต้องแปล เพราะ UI ไม่แสดงปุ่ม Facebook ถ้าไม่มี role (ดู Open question ข้อ 1)

### Edge states
- **Loading**
  - `getAudienceStatus` มากับ RSC จึงไม่มี skeleton ของการ์ดเอง
  - `loading.tsx` เดิมของหน้าไม่ต้องแก้
  - ใน S1 ตอนรอ `/accounts` แสดงแถบ skeleton 1 บรรทัด + `aria-busy`
  - ตอนสวิตช์ busy ให้ `disabled` + `aria-busy` เหมือน PagesClient
- **Empty**
  - S0 คือ empty state ของการ์ด ใช้คำอธิบาย 1 ประโยค (`connectHint`) ไม่ใช้ `SellerEmptyState` ใหญ่
  - `/accounts` ได้รายการว่าง: ไม่ควรเกิด เพราะ callback กรองไว้แล้ว ถ้าเกิดให้ใช้ข้อความ `no_ad_account`
- **Error**
  - โหลดสถานะไม่ได้: การ์ดเล็กพร้อมปุ่ม "ลองโหลดใหม่" ตารางเพจไม่กระทบ
  - toast error สำหรับ `PUT` ล้มเหลว (revert สวิตช์)
  - 404 ให้ `router.refresh()` เหมือน PagesClient
  - 409 `NOT_CONNECTED` / `CONNECTION_STOPPED` ให้ refresh แล้วแสดง state จริง + toast "สถานะการเชื่อมเปลี่ยนไป ดูการ์ดอีกครั้ง"
- **No-permission**: ทั้งหน้าถูกกั้นด้วย `gatePage(session,'X9')` อยู่แล้ว การ์ดจึงไม่ต้องมี state ไม่มีสิทธิ์
- **ข้อความยาว**
  - ชื่อกลุ่มและชื่อบัญชี: `truncate` + `title` (ต้องมาเป็นชุด `min-w-0 truncate` ตาม convention flex-header-truncation)
  - ตัวเลขใช้ `tabular-nums` + `Intl.NumberFormat('en-US')` เหมือน PagesClient
  - 0 ให้แสดง "0 คน" ได้ตรง ๆ ไม่ซ่อน (ในกลุ่ม 0 หลังเปิดแล้วคือข้อมูลจริง)
  - หลักล้านไม่ล้นเพราะบรรทัดตัวเลข `flex-wrap`

### Impeccable compliance
- **Mode:** Operate (seller console (paces) งานตั้งค่าที่ทำครั้งเดียว) ลำดับความสำคัญคืออ่านสถานะได้ทันที และปุ่มถัดไปชัด ไม่ใช่การแสดงออก
- **One Voice:** accent น้ำเงิน `bg-primary` อยู่ 3 จุดเท่านั้น คือสวิตช์ตอนเปิด ปุ่มหลักของ step ปัจจุบัน (เชื่อมผ่าน Facebook / เชื่อมบัญชี / ใช้บัญชีนี้ / เปิดส่งให้ Meta ใน Swal) และลิงก์ `text-primary-ink` "เปิดใน Ads Manager" ที่เหลือเป็นเทาและ semantic
- **Verified-Means-Green:** ไม่ใช้เขียวเลย
  - "กำลังอัปเดต" ใช้ primary (เหมือน "ส่งอยู่" ของ 00089) เพราะ Meta ยังไม่ได้ยืนยันว่าจับคู่ได้ ผลลัพธ์ใช้งานได้ยังไม่ถูกยืนยัน
  - "ปิดอยู่" = neutral, S5 และ S7 = warning, S6 = danger (ล้มเหลวจริง)
  - สถานะเดียวกันสีเดียวกับในตารางเพจ (stopped = danger, problem = warning)
- **Sentence case / ไม่มี ALL CAPS:** ผ่าน คำอังกฤษที่เป็นชื่อเฉพาะ (Custom Audience, Ads Manager, Meta, System User token) คงตามต้นฉบับ
- **เงา:** ใช้ `.card` ค่า default ของธีม ไม่เพิ่มเงาเอง
- **Anti-slop:**
  - ไม่ใช้ hero-metric card: ตัวเลข 3 ค่าเป็นบรรทัดข้อความใน `dl` ไม่ใช่การ์ดใหญ่ (ตัดทิ้งเพราะ StatsRow อยู่ใกล้กันแล้ว และ synced ≠ จับคู่ได้)
  - ไม่มี gradient ไม่มี eyebrow ไม่มีการ์ดซ้อน
  - callout เป็นกล่องในการ์ด (12/10px ตาม DESIGN.md) ไม่ใช่การ์ด
- **น้ำเสียง:** บอกทางออกทุก error (ไป Ads Manager ยอมรับข้อตกลง / เชื่อมใหม่ / ใช้ทาง token เอง) ไม่ใช้ "ไม่สามารถ...ได้" ไม่ไฮป์
- **จุดที่ theme ขัด Impeccable:** ไม่พบ ทุก primitive มาจาก class ที่ DatasetsCard ใช้แล้ว (ไม่มี arbitrary value) ยกเว้นข้อ "ค่าที่ต้องให้ Controller ตัดสิน": ไม่มี
- **จุดที่ควรเพ่งตอน critique**
  - ลำดับชั้นของ S5/S6/S7 (alert ต้องเด่นกว่า `dl`)
  - tap target บนมือถือ (สวิตช์ 44px ผ่านการยกที่ `safepay-overrides.css` อยู่แล้ว)
  - ความสม่ำเสมอของ badge กับตารางเพจ

### Anti-slop self-check
1. **เฉพาะ Deep:** ใช่ ยึด 00092 (ครอบทั้งร้านไม่ใช่รายเพจ, ผู้ซื้อ = PSID + เบอร์แฮช, S5 ยอมรับข้อตกลง, S6 ปิดไม่ลบ audience, โหมด role-user ของ Facebook) ถ้าเอาไปใช้กับสินค้าอื่นต้องแก้เกือบทุกบรรทัด
2. **เด่นสุด 1 อย่าง:** ใช่ สถานะ + ปุ่มถัดไปของ state ปัจจุบัน (header badge + ปุ่ม primary เดียวต่อ state) ที่เหลือเป็นเทา
3. **ตัดของซ้ำ/คงที่:** ตัดการ์ดตัวเลขทิ้ง (ซ้ำกับ StatsRow และ synced ไม่ใช่ matched), ตัด progress bar (ไม่มีค่า target), ไม่แสดงบรรทัด "ส่งอะไรให้ Meta" ตลอดเวลา (ข้อความนี้อยู่แค่ใน Swal ครั้งแรก)
4. **State ครบ:** S0-S8 + loading/empty/error/ข้อความยาว/0 และหลักล้านอยู่ในหัวข้อ Edge states
5. **Copy ตรงกับสิ่งที่ระบบทำ:** ปุ่มบอกผลลัพธ์ ("เชื่อมบัญชี", "เปิดส่งให้ Meta", "ตัดการเชื่อม") ไม่ใช้ "ตรวจใหม่" เพราะไม่มี endpoint รองรับ (ใช้ "เชื่อมบัญชีโฆษณาอีกครั้ง") และ S6 ไม่แนะนำให้กดสวิตช์เพราะ disabled อยู่
6. **ศัพท์:** "กลุ่มเป้าหมาย" = Custom Audience / "ในกลุ่ม" = `counts.synced` / "รอส่ง" = `counts.pending` / "บัญชีโฆษณา" = Ad account ตรงกับ BRD, API.md และ copy ของ 00089
7. **สี:** ตรวจแล้วในหัวข้อ Impeccable (ไม่มีเขียว, แดงเฉพาะ STOPPED ที่ล้มเหลวจริง, warning สำหรับสิ่งที่ผู้ใช้ทำต่อได้)
8. **มือถือ:** ปุ่มทุกตัว `min-h-11 w-full`, สวิตช์ยกเป็น 44px จากธีมของโปรเจกต์ (`safepay-overrides.css`), ปุ่มหลักอยู่ในการ์ดไม่ลอย
9. **จอ 1440:** `dl` ป้าย 10rem + ค่า 1fr ไม่มีคอลัมน์ว่าง ความกว้างเต็มการ์ดเหมือนตารางเพจเหนือมัน (ไม่ใช้ 70/30)

### Design decisions + rationale
- **การ์ดเดียว ไม่แยกหน้า:** ตามที่ BRD FR-008 กำหนด และตั้งค่าครั้งเดียวไม่ต้องมีหน้าย่อย
- **ปิดสวิตช์ไม่ถาม แต่เปิดครั้งแรกถาม:** ปิดย้อนกลับได้และ BR-CA-04 ไม่ลบ audience ส่วนการเปิดครั้งแรกส่ง PII ที่เข้ารหัสออกไปและเติมย้อนหลังทั้งร้าน
- **S5 ใช้ warning ไม่ใช่ danger:** ผู้ใช้แก้เองได้นอกระบบเรา ไม่ใช่ token เสีย
- **ใช้ alert ในการ์ดแทน toast สำหรับผลกลับจาก OAuth:** ต้องอ่านและมีทางต่อ
- **`pacesConfirm.question/.danger` ผ่านไฟล์ `plugins/sweet-alerts/.../SweetAlerts.tsx`:** ตามกฎข้อ 8

### Open questions (ให้ Controller / developer)
1. **ต้องรู้ว่า "ใช้ปุ่ม Facebook ได้ไหม" ฝั่ง UI** ตอนนี้ไม่มี field นี้ใน API: `GET /connect` ตอบ 403 `NOT_ROLE_USER` เป็น JSON ซึ่งถ้าเป็น anchor จะเปิดหน้า JSON ดิบ
   - เสนอให้ `page.tsx` คำนวณ `oauthAvailable = audienceScopeFor(sessionUserId(session)) !== null` แล้วส่งเป็น prop (ไม่ต้องแก้ API) ถ้า false ซ่อนปุ่ม Facebook และกางฟอร์ม MANUAL เลย
2. **ปุ่มตรวจข้อตกลงใหม่ (S5):** ถ้าอยากให้ไม่ต้องกรอก token ใหม่ ต้องมี endpoint ใหม่ที่ retry การสร้าง audience ตอนนี้ spec ใช้ "เชื่อมบัญชีโฆษณาอีกครั้ง"
3. **ลิงก์คู่มือสร้าง System User token:** ไม่พบ URL ในเอกสาร จึงใส่เฉพาะ `connectHint` ถ้ามีคู่มือภายในให้ใส่ลิงก์ที่ฟอร์ม MANUAL
4. **ปุ่มรีเฟรชตัวเลขระหว่างเติมย้อนหลัง (S3):** ไม่ใส่ในรอบนี้ ถ้าร้านมีลูกค้าเยอะ ตัวเลขจะนิ่งนานถึงรอบ cron ถัดไป
5. **ยืนยันกับเอกสาร:** `FB_CHAT_ROLE_USER_IDS` มีผลต่อ "ใครเห็นปุ่ม Facebook" ซึ่งเป็นรายชื่อใน env ไม่ใช่สิทธิ์ใน DB การเปลี่ยนรายชื่อจึงต้อง redeploy (เป็นของ backend ที่มีอยู่แล้ว)

### Theme Source และป้ายถัดไป
- **Theme Source:** `theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx` · `form/elements/components/ChecksRadioSwitches.tsx` · `form/elements/components/InputTextfieldType.tsx` · `ui/badges/page.tsx` · `ui/alerts/page.tsx` · `plugins/sweet-alerts/components/SweetAlerts.tsx` (ทุกอันอยู่ใต้ `theme/paces/Admin/TS/src/app/(admin)/`)
- **ป้ายถัดไป:** `stage:build`

ที่ยังไม่ได้ทำ/ความเสี่ยง
- ผมยังไม่ได้เปิดไฟล์ `.impeccable/design.json`, `frontend-design/SKILL.md`, playbook ของ Impeccable (`shape/operate/craft-floor/clarify`), `docs/system/ui-guideline/*`, `command-center-agent-protocol.md` และ `PRD.md` ตัวเต็ม ใช้ `DESIGN.md` + `PRODUCT.md` + โค้ดของหน้า Conversions API เป็นฐาน
- ยังไม่ได้เปิด gallery icons ของ tabler ทีละชื่อ
- บล็อก `=== DEEP-HANDOFF ===` ไม่ได้ใส่ เพราะไม่ได้อ่านโครงในเอกสารโปรโตคอล Controller ต้องเติมเอง

ไฟล์ที่เกี่ยวข้อง
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/settings/conversions-api/page.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/settings/conversions-api/components/PagesClient.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/settings/conversions-api/components/shared.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/(paces)/seller/(dashboard)/settings/conversions-api/components/DatasetsCard.tsx`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/api/shops/meta-audience/route.ts`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/api/meta-audience/connect/route.ts`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/src/app/api/meta-audience/callback/route.ts`
- `/Users/craftman/orca/workspaces/safepay/Conversion-API/docs/20 - Features/00092 - Purchaser Custom Audience Sync/API.md`

---

## คำตัดสินของ Controller (2026-11-14)

| # | คำตัดสิน |
|---|---|
| 1 | `page.tsx` คำนวณ `oauthAvailable` (ผู้ใช้อยู่ใน FB_CHAT_ROLE_USER_IDS) ส่งเป็น prop · false = ซ่อนปุ่ม Facebook กางฟอร์มกรอกเองเลย |
| 2 | ไม่เพิ่ม endpoint ตรวจข้อตกลงใหม่ — ใช้ "เชื่อมบัญชีโฆษณาอีกครั้ง" |
| 3 | ไม่มีลิงก์คู่มือ System User token รอบนี้ |
| 4 | ไม่มีปุ่มรีเฟรชระหว่างเติมย้อนหลัง |
| — | 🛑 HR7: `md:grid-cols-[10rem_1fr]` ในสเปกเป็น arbitrary value — ใช้ utility มาตรฐาน (เช่น `md:w-40` ที่ป้าย) แทน |
