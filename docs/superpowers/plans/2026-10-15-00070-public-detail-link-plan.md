# แผน 00070 ส่วนขยาย "หน้าสรุปรายละเอียดสาธารณะ" (`/lr/[token]`)

อ่านจาก worktree `/Users/craftman/Projects/safepay-linefix` อย่างเดียว ไม่ได้แก้ไฟล์ ไม่มี Bash ในชุดเครื่องมือของฉัน จึงรันเทส ตรวจ docker และ `ls` ไม่ได้ ข้อที่เสี่ยงขึ้นกับตรงนี้ระบุไว้ท้ายแผน

**ต้องผ่านขั้น UX:** ใช่ (HR8) ใช้ตัดสินจาก path เหล่านี้:
- `src/app/(paces)/seller/lr/[token]/**` (ใหม่)
- `src/app/(paces)/seller/(fullscreen)/business/line-reports/[groupId]/template/**` (CanvasList, TemplateBuilderClient, lib/confirm-detail-link)
- `src/proxy.ts` (หน้า 429 ที่ proxy ตอบเอง ถ้อยคำผ่าน UX)

## 1. ผลยืนยันกับโค้ดจริง

| หัวข้อ | ผล (file:line) |
|---|---|
| **A-9 ป้ายสถานะ** | ร้านทั่วไป/ที่พัก: `ORDER_STATUS_META` (`src/lib/order-display.ts:356-384`) ผ่าน `resolveOrderStatusBadge(status)` (`src/lib/order-stage.ts:445`) ไม่ส่ง shippingStage ก็ได้ป้ายฐาน<br>ร้านบริการ: `resolveServiceStatusBadge({status, appointmentStatus, hasAppointment: serviceStart!=null, serviceClosedAt}, 'seller')` (`src/lib/service-status.ts:118`) ไม่ส่ง `outstanding` ป้ายจะเป็น "ปิดงานแล้ว" ไม่อ้างว่าชำระครบ (`:113`)<br>**แก้เอกสาร AC-04-5:** ป้าย RETURNED ไม่ใช่ "คืนของ" ร้านบริการ = "คืนเงินทั้งใบ" (`service-status.ts:61`) ร้านทั่วไป = "คืนของแล้ว" (`order-display.ts:383`)<br>ต้องใช้ SSOT ห้ามพิมพ์ป้ายเอง เพราะ `order-status-label-ssot.test.ts` สแกนทั้ง `src` |
| **A-10** | `usesServiceFinanceRules` (`src/lib/finance-rules.ts:25-27`) = `resolveShopVertical(v)==='SERVICE_QUEUE'` เท่านั้น ที่พัก/ขายของ = กติกาทั่วไป ยืนยันตามที่เอกสารสมมติ |
| **อายุ reply token** | `LINE-API-Facts.md:42` ใช้ได้ครั้งเดียวใน 1 นาที (redelivery ไม่เกิน 20 นาทีจาก event)<br>โค้ดตั้งหน้าต่างไว้ 50 วินาทีจาก `event.timestamp`: `REPLY_WINDOW_MS=50_000` ที่ `line-report-command.service.ts:37` เช็คที่ `:56` (ส่วน `lib/line/constants.ts:15` = 60_000 เป็นของ channel-chat)<br>webhook `maxDuration=60` (`webhook/route.ts:15`) งานรันใน `after()`<br>**งบเวลา:** snapshot ต้องใช้ `min(5000, baseMs+50_000 − now − 5000)` ms ถ้าเหลือไม่ถึง ~5 วินาทีให้ข้ามไปใช้ปุ่มเดิมเลย |
| **ที่ตั้ง security headers** | `next.config.ts:14-21` มี `headers()` แต่มีเฉพาะ AASA ไม่มี security header ที่ไหนเลย<br>**เสนอตั้งใน `proxy.ts`** ไม่ใช่ `next.config`: เทสได้ด้วยแบบเดิม (`src/__tests__/line-report-proxy.test.ts` เรียก `proxy()` ตรง) และ header ของ proxy ติดทุกสถานะแม้ RSC stream |
| **status 404/410/429 ใน Next 16.1.1** | `forbidden()/unauthorized()` ใช้ไม่ได้: `authInterrupts:false` (`node_modules/next/dist/server/config-shared.js:186`)<br>`notFound()` ใช้ได้ (ใช้อยู่ 47 ไฟล์) ไม่มี 410 built-in `node_modules/next/dist/docs` ไม่มีใน 16.1.1 จึงตัดสินจากซอร์ส<br>**ความเสี่ยงที่ไม่ได้ verify:** `(paces)/seller/loading.tsx` ครอบทุกหน้าใต้ seller ถ้า shell flush ก่อน `notFound()` จะได้ 200 ไม่ใช่ 404 ต้อง spike ด้วย `curl -sI` ก่อนเขียนเทส status |
| **ข้อเสนอสถานะ** | **429:** ทำใน proxy ได้ status จริง<br>**404:** `notFound()` ที่หน้า แล้วเทสที่เนื้อหา ไม่ผูกกับ status<br>**หมดอายุ:** render หน้า "ลิงก์หมดอายุ" ด้วย 200 + noindex ไม่ทำ route handler แยก ต้องแก้ AC-05-2/06-2 จาก "410" เป็น "หน้าหมดอายุ ไม่ส่ง payload" ถ้า spike พบว่า 404 ได้จริง ค่อยพิจารณาใหม่ |
| **เทสของ proxy** | `src/__tests__/line-report-proxy.test.ts` (mock `getToken` เรียก `proxy(NextRequest)`) ใช้เป็นแบบ<br>เทส iOS shell: `src/lib/__tests__/signup-hidden-in-ios-app.test.ts` |
| **robots** | ไม่มี `public/robots.txt` และไม่มี `src/app/robots.*` regex `.txt` ใน proxy (`proxy.ts:156`) ปล่อยผ่านอยู่แล้ว<br>ไฟล์ใหม่จะเป็น robots ของทั้งโดเมน (รวม buyer) ต้องมีแค่ `User-agent: *` กับ `Disallow: /lr/` และแจ้ง user |
| **rate limit** | แบบอย่างใน RSC: `seller/i/[slug]/page.tsx:36-38` (`headers()` + `checkApiRateLimit`)<br>**แนะนำให้ทำใน proxy** ใช้ `checkApiRateLimit`/`clientIp` ที่ `proxy.ts:5` import อยู่แล้ว (`lib/api-rate-limit.ts:13,27`) ได้ 429 จริง ไม่ต้องมี `detail-rl.ts` ใหม่<br>key `lr:${ip}` 30/15 นาที นับทุก request |

## 2. `getSalesSeries` (ไม่ส่ง vertical) ใช้ where อะไร

`summary.service.ts:112` เรียก `getSalesSeries(shop.id,'daily',{year,month},false)` ไม่มี arg ที่ 5 จึง `newRules=false` และ `isServiceShop=false` (`dashboard.service.ts:250,255`)

- **where** (`:305-311`): `{ shopId, ...withoutDrafted('CANCELLED'), createdAt:{gte:prevGte, lt} }` → `status notIn ['DRAFTED','CANCELLED']` (`lib/order-visibility.ts:24`) ตัดวันด้วย `createdAt` ตามเวลาไทย
- **ยอดต่อใบ** (`:447-449`): `Number(totalAmount)` เพราะ returnAdj เป็น Map ว่าง และไม่ใช่ noShow
- **ก้อน** (`:452`): `countsAsRevenue(order)` (`order-revenue.ts:64`) ต้องมี `shipments{status,isDryRun,direction,carrierStatus}` ใบ RETURNED จึงตกเป็น "รอยืนยัน"
- **หน้าต่าง:** `createdAt ∈ [thaiMidnightUtc(start), thaiMidnightUtc(end+1วัน))` (`date-range.ts:121`)

**Helper ที่เสนอ** (`src/services/line-report-detail.service.ts`):
```ts
export const cardOrderSetWhere = (shopId: string, w: { startIso: string; endIso: string }) =>
  ({ shopId, ...withoutDrafted('CANCELLED'), createdAt: { gte: <thaiMidnightUtc start>, lt: <thaiMidnightUtc (shiftIsoDate(end,+1))> } })
```

- **Query A (แคบ):** `findMany(cardOrderSetWhere)` select `{id, createdAt, status, totalAmount, serviceClosedAt}` ร้านทั่วไปเพิ่ม `shipments{status,isDryRun,direction,carrierStatus}`
  - ใช้รวมก้อนและนับจาก A ทั้งชุด
  - classify: ร้านบริการ `serviceClosedAt!=null ? 0 : 1` ส่วนร้านทั่วไป `countsAsRevenue(o) ? 0 : 1`
  - ห้ามใช้ `countsAsServiceRevenue` ห้ามใช้ `serviceUnclosedOrderWhere` เพราะตัด RETURNED
- **Query B (รายละเอียด):** เรียง A ตาม `createdAt desc` เอา ≤150 id แล้ว `findMany({id in, shopId})` select buyerName, buyerContact, status, appointmentStatus, serviceStart, serviceClosedAt, `room:{select:{name}}`, `items:{select:{name,qty}}` แถวเป็นสับเซตของ A เสมอ ไม่แข่งกันเอง
- **Parity:** Σ A เทียบ `ShopSummary` (`confirmed+unconfirmed`, `orders`) ถ้าไม่เท่าให้ query A ซ้ำ 1 ครั้ง ยังไม่เท่าให้ตั้ง `parity:'MISMATCH'`
- **Guard:** ไม่แก้ `dashboard.service.ts` (OOS-13) ใช้เทส parity ฐานจริงเป็นด่านแทน ถ้า user อยากให้ใช้ where เดียวกันตามโครงสร้าง ต้อง extract helper ใน SSOT ซึ่งเป็นการตัดสินของ Controller

## 3. แผน task

S-id อ้าง `docs/scope/2026-10-14-00070-public-detail-link-scope-baseline.md`
- ราก repo = `/Users/craftman/Projects/safepay-linefix`
- ตัวย่อ `LR` = `…/src/lib/line-report` และ `SV` = `…/src/services`
- ทุกไฟล์เทสอยู่ใต้ `__tests__/` ของโฟลเดอร์นั้น

| # | target path | theme source | scope | atomic-commit unit |
|---|---|---|---|---|
| 1 | `LR/detail-snapshot.ts` (type `DetailSnapshotV1` + Valibot `strictObject` + `parseSnapshot` + caps + `fitToBudget`) · `LR/detail-snapshot-rows.ts` (`toOrderRow`, `classifyBucket`, ชื่อ/เบอร์/ชื่องาน/ป้ายสถานะ) · เทส `detail-snapshot.test.ts`, `detail-snapshot-rows.test.ts` | N/A (no UI) | S-2: PII ตัดที่จุดเขียน `maskPhoneForGuest` ทางเดียวไม่มีฟิลด์ buyerContact ดิบ ป้ายใช้ SSOT ตาม A-9 ป้ายก้อนร้านทั่วไปใช้ `GENERIC_SALES_LEGEND` ร้านบริการ "ปิดงานแล้ว/รอปิดงาน" (ค่าใหม่ตาม user) | U1 |
| 2 | `LR/detail-token.ts` · `LR/detail-expiry.ts` · เพิ่ม `detailLinkUrl(token)` ใน `LR/config.ts` (ฟังก์ชันใหม่ ไม่แตะ `sellerDashboardUrl`) · เทส `detail-token.test.ts`, `detail-expiry.test.ts` | N/A | S-2: token `randomBytes(16)` base64url + sha256 hex · `expiresAt = thaiMidnightUtc(shiftIsoDate(todayThaiIsoDate(createdAt), +2))` ใช้ helper `date-range.ts:121,136,147` ห้ามเขียน `+543`/offset เอง (`date-format-single-source.test.ts` จับ) · ไม่ https = `null` ไม่ใส่ `openExternalBrowser` | U2 |
| 3 | `LR/template.ts` (`button.target?`, `needsDetailLinkConfirm`, `detailLinkBlocked`) · `LR/validations.ts:126` (picklist `target`; เพิ่ม `BUTTON_TARGET` ใน `TemplateRule` `:65` และ `KNOWN_RULES` `:141`) · `LR/errors.ts` (+`DETAIL_LINK_CONFIRM_REQUIRED` ในทั้ง 3 Record, +rule `DETAIL_NEEDS_METRIC` `:97-101`) · เทส `template.test.ts`, `template-schema.test.ts` | N/A | S-7 ส่วน lib: `deriveFlags` ห้ามเพิ่ม key (มีเทส keys) `defaultTemplateFromFlags` ไม่ปล่อย `target` | U3 |
| 4 | `prisma/schema.prisma` (model `LineReportSnapshot` + back-relation ที่ `LineReportGroup`/`LineReportDelivery`) · `prisma/migrations/20261015090000_line_report_detail_snapshot/migration.sql` | N/A | S-3: **dispatch `safepay-database` ก่อน** ตารางใหม่ล้วน (CREATE TABLE/INDEX/FK, `DROP|TRUNCATE`=0) + CHECK เขียนมือ `LineReportSnapshot_payload_size_chk` (≤524288) และ `LineReportSnapshot_expiry_chk` ตามแบบ `20261005200000_line_report_template` (คอมเมนต์ unmanaged SQL ห้าม db pull/migrate dev) · เทส `SV/__tests__/line-report-snapshot-constraints.db.test.ts` (INSERT เกิน → 23514) | U4 |
| 5 | `SV/line-report-summary.service.ts` (ยก `pnlFor` ออกจาก closure เป็น `loadPnl` ระดับ module + เก็บ expenses ดิบไว้ใน memo ภายใน ไม่ใส่ใน `ShopSummary`) · `SV/line-report-detail.service.ts` (`cardOrderSetWhere`, `buildDetailSnapshot`, `expenseDetailRows`) · เทส `line-report-detail.parity.test.ts` (db), `line-report-detail.test.ts` | N/A | S-4+S-5: ตามหัวข้อ 2 · `expenseDetailRows` แยกจาก `expenseItems` (ห้ามแก้ตัวเดิม ห้ามอ่านโน้ตในตัวเดิม) รวมบรรทัดค่าส่งระบบ Σ rows = `ShopFinance.expense` · ส่วนที่ `exposure` ปิดต้องไม่อยู่ใน payload | U5 (**ต้องรอ U1, U2, U4**) |
| 6 | `src/lib/line/flex-summary-report.ts` (`SummaryReportInput.detailUrl?` + **`monthlyDetailUrl?`**, `renderBubble` เลือก `detailUrl ?? sellerDashboardUrl()`, `export titleOf`) · เทส `src/lib/line/__tests__/flex-summary-report.detail-url.test.ts` | N/A (golden `…/__tests__/flex-summary-report.golden.test.ts` + `__golden__/` ห้ามแตะ) | S-6: ต้องมี `monthlyDetailUrl` เพราะ `:181` สร้างข้อความที่ 2 (รายเดือน) จาก input เดียว ไม่ใส่ = ทั้งสองใบได้ URL เดียวกันผิด · เทส footer.uri ที่ level 0-4 ของ `fitToLimits` | U6 |
| 7 | `src/proxy.ts` (branch ใหม่ `subdomain==='seller' && pathname.startsWith('/lr/')` ไว้**ก่อน `getToken`** ทำ rate limit 30/15 นาที → 429 HTML กลาง · rewrite → `/seller/lr/…` · ใส่ `Cache-Control:no-store`, `X-Robots-Tag:noindex,nofollow`, `Referrer-Policy:no-referrer`) · `public/robots.txt` · เทส `src/__tests__/lr-proxy.test.ts` | N/A (หน้า 429 ถ้อยคำผ่าน UX) | S-8 ส่วน proxy: branch เดียวแทนแก้ `isExempt`+ด่าน iOS สองจุด · เทส 4 สถานะ (guest / authed / `needsOnboarding` / app shell iOS) ยืนยัน rewrite ไม่ redirect และ `getToken` ไม่ถูกเรียก · mutation: ถอด branch → authed+`needsOnboarding` ถูก redirect เทสแดง | U7 |
| 8a | `SV/line-report-snapshot.service.ts` (`createDetailSnapshot`, `getSnapshotView`) · เทส `line-report-snapshot.db.test.ts` | N/A | S-6/S-8: `getSnapshotView(token, now): Promise<{kind:'OK',snapshot}\|{kind:'NOT_FOUND'}\|{kind:'EXPIRED'}>` ไม่ throw ตามโดเมน · hash ทุกครั้งแม้รูปแบบผิด · join `group.status` สด (REMOVED → NOT_FOUND) · `now<expiresAt` เท่านั้นที่ส่ง payload · `parseSnapshot` ตอนอ่าน · `createDetailSnapshot` คืน `{url}\|null` (null = ไม่ DETAIL/ไม่ https) | U8 (รอ U5, U6) |
| 8b | `SV/line-report-sweep.service.ts` (`runCleanup` `:182` เรียก `purgeExpiredSnapshots(now)` ล้าง payload → `Prisma.DbNull` + `purgedAt`, ลบแถวโครงเปล่า `expiresAt<now−30วัน`; ผลคืน +`snapshotsPurged`, `snapshotsDeleted`) · ต่อยอด `line-report-send-sweep.db.test.ts` | N/A | S-11: scope ด้วย group id ที่เทสสร้าง (HR13) | U9 |
| 9 | `SV/line-report-group.service.ts` (`updateTemplate` `:253-283`) · `src/app/api/line-report/groups/[id]/template/route.ts:12-17` (เพิ่ม `confirmDetailLink: v.optional(v.boolean())` ใน `strictObject` ถ้าลืม ทุก PUT ที่มี field นี้ได้ VALIDATION 400) · ต่อยอด `SV/__tests__/line-report-template-service.db.test.ts` (**ไม่ใช่** `line-report-services.db.test.ts` ที่เอกสารอ้าง) | N/A | S-7 ส่วน service: 4 เคส null→DETAIL / confirm / คงอยู่ / reset · `DETAIL_NEEDS_METRIC` · เทียบกับ prev ใน tx เดียวกับล็อก | U10 (รอ U3) |
| 10 | `SV/line-report-send.service.ts` (`runSlot` ก่อน `:175`, `sendTest` ก่อน `:304`) · `SV/line-report-command.service.ts` (`composeAndReply` `:134`) · ต่อยอด `line-report-send-sweep.db.test.ts`, `line-report-command.test.ts` | N/A | S-6: สร้าง snapshot หลังกรอง `live` และก่อน build/`savePendingPayload` · D+M = 2 snapshot 2 URL · try/catch ภายในจุดเรียกแล้วใช้ปุ่มเดิม (log เฉพาะ `errTag`) ใน `sendTest` ต้องอยู่ใน try ชั้นใน เพราะ catch ชั้นนอก `:314` แปลงทุกอย่างเป็น INTERNAL · FINAL_NOTICE/`show:false` ไม่สร้าง · command: ครอบด้วย timeout ตามงบข้อ 1 | U11 (รอ U8, U6, U3) |
| 11 | `…/src/app/(paces)/seller/lr/[token]/{page,loading,error,not-found}.tsx` + `components/*` · เทส `…/lr/[token]/__tests__/*.test.tsx` | **ต้อง Explore (ที่ UX gate):** เสนอ `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` (ยอดรวม) · `…/apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx` + `ShippingActivity.tsx` (รายการ/ไทม์ไลน์) · `theme/paces/Admin/TS/src/app/auth/(basic)/success-mail/page.tsx` (หมดอายุ/ไม่พบ) ชื่อ icon เลือกที่ UX gate | S-8/S-9: โฟลเดอร์ตรงใต้ `seller/` ตามแบบ `i/[slug]` (ไม่ต้องมี `(public)`) มี `loading.tsx`/`layout.tsx` ของตัวเอง ไม่ให้ได้ splash `BrandLoading` จาก `seller/loading.tsx` · `export const metadata.robots={index:false,follow:false}` · วันที่ใช้ `formatDate/formatDateTime` เท่านั้น · ไม่มี `fetch(`/`dangerouslySetInnerHTML`/`react-toastify` · commit ต้องมี `Base: theme/...` | U12 (รอ U8, U7, ux-spec) |
| 12 | `…/template/components/CanvasList.tsx:338-371` (สวิตช์ `target`) · `…/template/lib/reducer.ts` (`setButton` รับ `target`) · `…/template/lib/confirm-detail-link.ts` ใหม่ · `…/template/TemplateBuilderClient.tsx` (`SaveBody` `:56` + `confirmDetailLink` + branch error `:249`) · เทส `template/lib/__tests__/confirm-detail-link.test.ts`, `reducer.test.ts`, `preview-data.test.ts` | **ต้อง Explore:** คัดจาก `confirm-expense.ts` เดิมใน repo (Swal `pacesConfirm.warning`) · ตำแหน่งสวิตช์ที่ UX gate | S-10: พรีวิว (`preview-data.ts:77`) ไม่ส่ง `detailUrl` · ปิด (disabled) เมื่อ `detailLinkBlocked` | U13 (รอ U10, ux-spec) |
| 13 | `docs/20 - Features/00070 …/{PRD,BRD,SRS,SDS,DATABASE,API,TestCase,LINE-API-Facts}.md` + `docs/SRS.md` | N/A | S-1/T7: ตามหัวข้อ 12 ของเอกสาร + แก้ข้อผิดในหัวข้อ 5 ด้านล่าง | U14 (ขนานกับ 11, 12) |
| 14 | `safepay-ux`: spec HTML+md 3 จอ ใต้ `docs/superpowers/specs/2026-10-15-00070-public-detail-*.{html,md}` | อ่านตามข้อ 11, 12 | S-9/S-10 (ไม่ใช่โค้ด) เริ่มได้ทันทีขนานกับ batch 1-3 | — |

**Cross-file error-mapping** (บังคับ enumerate):

| Error ใหม่ | throw ที่ | route catch → status | ที่ต้องแก้ครบ |
|---|---|---|---|
| `LineReportError('DETAIL_LINK_CONFIRM_REQUIRED')` | `updateTemplate` (U10) | `handle()` `_shared.ts:64` → `toErrorResponse :19` → `LINE_REPORT_ERROR_STATUS` = **400** | `errors.ts` ทั้ง 3 Record (U3) · `PutSchema` ของ route (U10) · branch ฝั่ง client `TemplateBuilderClient.tsx:249` (U13) |
| `INVALID_SETTINGS{rule:'DETAIL_NEEDS_METRIC'}` | `updateTemplate` ผ่าน `invalid()` `group.service.ts:178` | เดียวกัน → **400** | `InvalidSettingsRule` + `INVALID_SETTINGS_RULE_MESSAGE` (U3) · UI ของ template แสดงข้อความ (U13) |
| snapshot สร้างล้ม | `createDetailSnapshot` | ไม่มี route: จับที่ 3 จุดเรียก (U11) → ปุ่มเดิม | ไม่ต้องสร้าง error class ใหม่ |
| `getSnapshotView` | คืน union ไม่ throw | infra error → `error.tsx` | — |
| 429 ของหน้า | proxy คืน response เอง | 429 | — |

**ลำดับและ batch (≤3 ตัว, ไฟล์ไม่ทับกัน):**

- **Pre-flight (Controller):** T1 รัน golden + เทส 00070 เดิมบนฐาน 5434 บันทึกผล
- **ขนานตั้งแต่ต้น:** #14 ux-spec
- **Batch 1 (3 dev):** U1 ∥ (U2 แล้ว U3 ในตัว dev เดียว คนละ commit) ∥ U4 (safepay-database รีวิวก่อน)
  - ปิด batch: `prisma generate` + tsc เต็มก่อน (กฎ schema change ในเอกสาร workflow ข้อ 3)
- **Batch 2 (3 dev):** U5 ∥ U6 ∥ U7 (ไม่แชร์ไฟล์ U5 แตะ `summary.service` เท่านั้น)
- **Batch 3 (2-3 dev):** U8 (แล้ว U9 คนเดียวกัน) ∥ U10
- **Batch 4 (3 dev):** U11 ∥ U12 ∥ U13 (U12 รอ ux-spec)
- **ตามมา:** #13 docs → `safepay-security` → QA → Gate 2 → retro

**dispatch เฉพาะทาง:**
- `safepay-database`: U4
- `safepay-security` mandatory: ต้องตรวจ U7 (headers/rate limit/proxy) U8a (อ่านด้วย hash, group REMOVED) U1 (PII) U12 (XSS ชื่อ/โน้ต) ก่อน commit U12 ไม่ใช่รอปลายทาง
- `safepay-ux`: #14 ก่อน U12/U13

## 4. คำสั่งที่ใช้ได้จริง

```
cd /Users/craftman/Projects/safepay-linefix
N=/opt/homebrew/bin/node; DB=postgresql://safepay:safepay@localhost:5434/safepay
$N node_modules/typescript/lib/tsc.js --noEmit
DATABASE_URL=$DB DIRECT_URL=$DB $N node_modules/vitest/vitest.mjs run <ไฟล์>
DATABASE_URL=$DB DIRECT_URL=$DB $N node_modules/prisma/build/index.js migrate deploy   # หลัง U4
$N node_modules/prisma/build/index.js generate
```

- **ตั้ง `DATABASE_URL` ทุกครั้ง แม้เทส pure** เพราะ Prisma อาจโหลด `.env` ที่ชี้ prod (HR13/14)
- **docker DB 5434 ต้องรัน** `docker-compose.yml` ใน worktree เปิดแค่ 5432 ส่วน 5434 มาจากที่อื่น Controller ต้องตรวจ `pg_isready -h localhost -p 5434` ก่อนทุกรอบที่มีเทส DB
- เทส DB ใช้ `describe.skipIf(!isLocal)` ถ้า env ผิดจะ **SKIP เงียบ ดูเหมือนเขียว** ต้องดูจำนวน skipped = 0 ทุกครั้ง
- ถ้า `node_modules` เป็น symlink ไป repo หลัก `prisma generate` จะเปลี่ยน client ของ repo หลักด้วย ให้ `ls -ld node_modules` ก่อน

## 5. ความเสี่ยงจากโค้ดจริงที่เอกสารพลาด

1. **ข้อความรายเดือนใน push เดียวกัน** ใช้ `detailUrl` ตัวเดียวกับใบรายวัน เพราะ `flex-summary-report.ts:181` สร้างจาก input เดียว (แก้ด้วย `monthlyDetailUrl`, U6)
2. **เทส parity เดิมน่าจะแดงอยู่แล้วที่ SERVICE_QUEUE** `line-report-summary.parity.test.ts:44` ส่ง `vertical` เข้า `getSalesSeries` แต่ production ไม่ส่ง (`summary.service.ts:112`) ฟิกซ์เจอร์มี RETURNED ที่ฝั่งตรงตัด แต่ฝั่ง production นับ ยังไม่ได้รันยืนยัน ให้ T1 ตัดสิน และ parity ใหม่ (U5) **ต้องเรียก `getSalesSeries` แบบไม่ส่ง vertical** ห้าม copy `direct()` เดิม
3. **cleanup มีหน้าต่างแค่ 03:00-03:30** (`sweep.service.ts:20-22,167`) ไม่ใช่ "tick แรกหลัง 03:00" ถ้ารอบนั้นพลาด PII ค้างราว 27 ชม. R-10 อ่อนกว่าที่เขียน (หน้ายังไม่ส่ง payload หลังหมดอายุอยู่ดี) ถ้าต้องการเข้มกว่านี้ให้เรียก `purgeExpiredSnapshots` ทุก tick ของ sweep ต้องให้ user รับทราบ เพราะต่างจากที่อนุมัติ (Q-4)
4. **`<Analytics />` และ `<SpeedInsights />` ติดทุกหน้าใต้ `(paces)`** (`(paces)/layout.tsx:108-109`) ขัด NFR-LNK-2 และส่ง path ที่มี token ไป Vercel ต้องให้ `safepay-security` ตัดสิน (redact ผ่าน `beforeSend` ต้องแก้ root layout ซึ่งใช้ร่วมกัน)
5. **root layout ตั้ง `userScalable:false, maximumScale:1`** ผู้อ่านไม่ซูมได้ ควร override `viewport` ของหน้า `/lr` (เรื่อง UX gate)
6. **เปิดค่าใช้จ่ายทีหลังขณะ DETAIL เปิดอยู่** ทำให้ค่าใช้จ่ายพร้อมโน้ตขึ้นหน้าสาธารณะ โดยด่านยืนยันเดิมไม่ได้บอก เสนอ `needsDetailLinkConfirm` ให้เป็น true ด้วยเมื่อ DETAIL เปิดอยู่และ expense เพิ่งถูกเปิดเพิ่ม (U3/U10/U13) ต้อง Controller ยืนยัน
7. **`buyerName` มักถูกพิมพ์เบอร์/อีเมลปนมา** `maskPhoneForGuest` ไม่ครอบชื่อ เสนอให้ `toOrderRow` ทิ้งชื่อที่มีตัวเลข ≥7 หลัก หรือ `@` (ตั้ง `null`)
8. **การ `Promise.race` ของงบเวลาทางคำสั่ง** ทิ้งแถว snapshot กำพร้า (มีลิงก์ไม่ได้ใช้) ไม่เป็นอันตรายเพราะหมดอายุและถูกล้าง แต่ต้องรับทราบ
9. **ลบกลุ่ม/บัญชี:** กลุ่มไม่ถูก hard delete (`Delivery.group = Restrict`, `removeGroup :316`, `account-deletion :224-241` ตั้ง REMOVED) AC-08-4 "cascade" เทสได้แค่ด้วยการลบ fixture เองเท่านั้น ลิงก์ตายทันทีแต่ PII ค้างใน payload จนถึงรอบ purge ถ้าอยากล้างทันทีต้องเพิ่ม `updateMany` ใน `removeGroup` และ account-deletion ซึ่งเป็นการลบ ต้องถาม user ก่อน
10. **ชื่องานรายใบ "item แรก"** ไม่มีฟิลด์เรียงใน `OrderItem` (`schema.prisma:1151-1180`) ลำดับไม่ deterministic ยอมรับได้ ควรจดเป็น shortcut ในโค้ด
11. **scanner `route-capability-inventory.test.ts`** สแกน `(paces)/seller/**/page.tsx` ถ้าหน้า `/lr` เรียก resolver ร้านหรือมี `prisma.shop.find*` จะถูกบังคับลงทะเบียน ให้เก็บทุกการอ่านไว้ใน service
12. **ผล QA เชิง prod:** push `main` = `prisma migrate deploy` (HR15) ต้องแจ้ง user 3 ข้อก่อน และ `public/robots.txt` มีผลทั้งโดเมน

**ที่ยังไม่ได้เช็ค/ความเสี่ยงของแผนนี้:**
- เรื่อง status code ของ `notFound()` ใต้ `loading.tsx` ยังไม่ verify (ไม่มี docs ใน `node_modules/next` และรัน curl ไม่ได้)
- ไม่ได้รันเทสใดเลย ข้อ 2 (parity เดิมแดง) เป็นข้อสันนิษฐานจากโค้ด
- ไม่ได้ตรวจว่า docker 5434 รันอยู่ ไม่ได้ตรวจ symlink ของ `node_modules`
- เทียบกับเอกสาร: ใช้ `GENERIC_SALES_LEGEND`, `maskPhoneForGuest` ตามที่ระบุ ที่ต่างคือ rate limit กับ headers ย้ายมาอยู่ proxy ซึ่ง Controller ควรยืนยันก่อน dispatch

## มติ Controller (2026-10-15) ต่อข้อเสนอ/ความเสี่ยงข้างบน
- headers + rate limit ทำใน `proxy.ts` (ข้อเสนอ planner) · ไม่มี `detail-rl.ts`
- 404 = `notFound()` · หมดอายุ = render หน้า "ลิงก์หมดอายุ" status 200 + noindex ไม่ส่ง payload (แทน 410 ใน AC-05-2/06-2)
- §5 ข้อ 3: `purgeExpiredSnapshots` เรียกทุก tick ของ sweep (ไม่ผูกหน้าต่าง 03:00) และล้าง payload ของ snapshot ที่กลุ่มเป็น REMOVED ด้วย · ลบแถวโครงเปล่า >30 วันหลังหมดอายุ
- §5 ข้อ 6: `needsDetailLinkConfirm` = true เมื่อ DETAIL เปิดใหม่ หรือ DETAIL เปิดอยู่แล้วและ expense exposure เพิ่งเปิด
- §5 ข้อ 7: `customerName` = null เมื่อมีตัวเลข ≥7 หลักรวม หรือมี `@`
- §5 ข้อ 2: แก้เทส parity เดิมแล้ว (commit แยก)
- §5 ข้อ 4/5 (Analytics + viewport): ตัดสินหลังได้ UX spec
- ป้ายก้อนร้านบริการ: "ปิดงานแล้ว" / "รอปิดงาน" · RETURNED ใช้ป้าย SSOT ("คืนเงินทั้งใบ"/"คืนของแล้ว")
