# 00097 Event ที่ส่งให้ Meta รายแชทและรายออเดอร์ — คู่มือม็อกอัพ

ไฟล์ม็อกอัพ: `2026-11-16-00097-capi-event-log-mockup.html` (Mobile 390 / Tablet 834 / Desktop 1440 · ปุ่มสลับ light/dark · แท็บ 1 ในห้องแชท / 2 หน้าออเดอร์ / 3 หน้าบันทึกการส่ง · กรอบเส้นประน้ำเงิน = ส่วนที่เพิ่มใหม่ ไม่ใช่ของจริง)
สกิน: Paces (`(paces)/**`) · primary น้ำเงิน `#236dc9` ผ่าน token · ไม่มีม่วง `#7367F0`
สิทธิ์: เห็นเฉพาะคนที่มี capability **X9** (ตอนนี้ = เจ้าของร้านเท่านั้น) — ไม่มีสิทธิ์ = ไม่ render อะไรเลยทั้ง section/การ์ด (ไม่ใช่การ์ด "ไม่มีสิทธิ์")

## หลักการออกแบบ

1. **คำถามเดียว: "Meta ได้รับ event นี้ไหม"** — ทุกแถวตอบด้วยป้าย/ไอคอน + คำ (ไม่ใช่สีอย่างเดียว) และเหตุผลภาษาคนเมื่อไม่สำเร็จ
2. **ภาษาชุดเดียวกับหน้าบันทึกการส่ง (00089)** — คำสถานะ `t.conversionsApi.logStatus` (รอ / สำเร็จ / ล้มเหลว / ข้าม) · เหตุผล `t.conversionsApi.logReason` · ชื่อเหตุการณ์ `t.conversionsApi.events[key].label` + ชื่อ Meta (`CAPI_EVENTS[].metaName`) · ไม่สร้างคำใหม่ (HR16)
3. **รวมตามเหตุการณ์ธุรกิจ** ในแชทและออเดอร์ (1 แถว = 1 `dedupeKey` รวมทุกชุดข้อมูล ≤3) · หน้าบันทึกคง 1 แถว = 1 ชุดข้อมูลตามที่อนุมัติแล้ว
4. **อ่านอย่างเดียว** — ไม่มีปุ่มส่งซ้ำ (กัน Purchase ซ้ำ ตามมติ 00089) · ไม่โชว์ psid / request / response ดิบ
5. **สั้น** — หัวข้อบรรทัดเดียว ไม่มีย่อหน้าอธิบาย · ไม่มีคำว่า "Deep"
6. **แอป Native ลอกได้** — ในห้องแชทเป็นบรรทัดเดียว + กล่องกาง ไม่มี popover / tooltip / hover

## กฎรวมกลุ่ม (ย้ายไป `src/lib/meta-capi/ui.ts` ให้เทสจับ — conventions/ui-boolean-needs-a-testable-home)

`capiGroupSummary(rows)` รับแถวทุกชุดข้อมูลของ `dedupeKey` เดียว:

| กรณี | ไอคอนนำ | บรรทัดสถานะ | ใต้แถว |
|---|---|---|---|
| ทุกชุดสถานะเดียวกัน, 1 ชุด | ของสถานะนั้น | `สำเร็จ · 16 พ.ย. 11:20` | เหตุผล (ถ้ามี) |
| ทุกชุดสถานะเดียวกัน, ≥2 ชุด | ของสถานะนั้น | `สำเร็จ · 16 พ.ย. 11:18 · 2 ชุดข้อมูล` | เหตุผลของแถวแรก |
| ผลไม่เท่ากัน | ของสถานะที่แย่สุด (ล้มเหลว > รอ > ข้าม > สำเร็จ) | `สำเร็จ 1 จาก 2 ชุดข้อมูล` | แตกรายชุด: ไอคอน + ชื่อชุดข้อมูล · สถานะ — เหตุผล |

เวลาของกลุ่ม = `createdAt` ที่เก่าสุดของกลุ่ม · มูลค่า = `payload.value` (ทุกชุดเท่ากัน)

## สถานะ → ป้าย/ไอคอน/สี

| สถานะ | คำ (logStatus) | ไอคอน Tabler | ป้าย (soft) | สีตัวอักษร |
|---|---|---|---|---|
| SENT | สำเร็จ | `circle-check-filled` | `bg-success/15 text-success-ink` | `text-success-ink` #065f46 (6.70:1) |
| PENDING | รอ | `clock` | `bg-warning/15 text-warning-ink` | `text-warning-ink` #92400e (6.57:1) |
| FAILED | ล้มเหลว | `circle-x` | `bg-danger/15 text-danger-ink` | `text-danger-ink` #7f1d1d (8.47:1) |
| SKIPPED | ข้าม | `player-skip-forward` | `bg-default-100 text-default-800` | `text-default-700` |

เหตุผล (`capiReasonKey` เดิม): queued "รอส่งภายใน 1–2 นาที" · retrying "ลองใหม่ครั้งที่ {n} จาก 3" · waitToken "รอเชื่อมเพจใหม่หรือเปลี่ยน token แล้วจะส่งต่อให้เอง" · maxAttempts "Meta ไม่รับเหตุการณ์นี้ ลองใหม่ครบ 3 ครั้งแล้ว" · rejected "Meta ไม่บันทึกเหตุการณ์นี้ ระบบจะไม่ลองส่งซ้ำ" · tooOld "เก่ากว่า 7 วัน Meta ไม่รับ"

## จอ 1 — ในห้องแชท: บรรทัด event กลางห้อง (มติ user 2026-11-16 แทน section ในแผงลูกค้า)

> "ไม่อยากให้ไปอยู่ side bar อยากให้อยู่ตรงกลาง chat เลย เหมือนเป็น 1 ใน chat message แค่ไม่ส่งเข้า facebook — ตัวเทา ๆ ตรงกลางจอ ว่าเราส่งอะไรไปบ้าง"
> แผงลูกค้า (`CustomerPanel.tsx`) **ไม่เปลี่ยน** — ไม่มี section ใหม่

ตำแหน่ง: `ThreadMessageList.tsx` แทรกเป็นรายการระดับเดียวกับข้อความ เรียงตามเวลา (`createdAt` ของกลุ่ม) ปนกับฟอง · Desktop = ห้องกลางของ 3 คอลัมน์ · Tablet/Mobile = ห้องเต็มจอ
Base: theme `apps/chat/components/ChatPage.tsx` (แถว `my-5`) ผ่านพี่น้อง `ThreadMessageList.tsx` systemNotice ของ `META_NOTICE` + `FollowBotNoteLine.tsx` (00095) · ส่วนที่กาง = กล่องท่า theme `ui/collapse/page.tsx`

Anatomy (หุบ):
1. ห่อ `div.my-5.px-4.text-center` (เท่ากับ META_NOTICE ทุกตัวอักษร) — **ไม่ใช่ฟอง**: ไม่มีพื้น ไม่มีรูปโปรไฟล์ ไม่มีปุ่มคัดลอก/ตอบกลับ ไม่ชิดซ้าย/ขวา
2. `button[aria-expanded]` `inline-flex flex-wrap justify-center gap-x-1 rounded px-2 text-xs text-default-600 hover:bg-default-100 min-h-11 lg:min-h-8`
3. เนื้อ: ไอคอน `brand-meta` 14px · ส่ง “{events[key].label}” ให้ Meta · มูลค่า (ถ้ามี, `tabular-nums`) · เวลา `formatTimeHM` (วันอยู่ที่ตัวคั่นวันของห้องอยู่แล้ว) · **ผล** = ไอคอน + คำ (`font-medium text-{tone}-ink`) · เหตุผลสั้น · `chevron-down/up`
4. ล้มเหลวยังเป็นบรรทัดเทา — เฉพาะไอคอน/คำผล/เหตุผลสั้นเป็น `text-danger-ink`

ผลแบบสั้น:
| กรณี | ผล | เหตุผลสั้น (ใหม่ — ตัวเต็มยังเป็น `logReason`) |
|---|---|---|
| ทุกชุดสำเร็จ | `circle-check-filled` สำเร็จ | – |
| ผลไม่เท่ากัน | ไอคอนตัวแย่สุด + สำเร็จ {ok} จาก {n} | – |
| ล้มเหลว (rejected) | `circle-x` ล้มเหลว | Meta ไม่บันทึก |
| ล้มเหลว (maxAttempts) | `circle-x` ล้มเหลว | ลองครบ 3 ครั้งแล้ว |
| รอ (retrying) | `clock` รอ | ลองใหม่ครั้งที่ {n} จาก 3 |
| รอ (waitToken) | `clock` รอ | รอเชื่อมเพจใหม่ |
| ข้าม (tooOld) | `player-skip-forward` ข้าม | เก่ากว่า 7 วัน |
| **รอ (queued = ยังไม่เคยยิง)** | ไม่มีผล — บรรทัด `p[role=status] text-default-500` + `loader-2` หมุน (`motion-reduce:animate-none`) "กำลังส่ง “{label}” ให้ Meta…" ไม่มีปุ่มกาง | – |

**อัปเดตสด:** บรรทัด "กำลังส่ง…" ต้องกลายเป็นผลเองเมื่อ worker ส่งเสร็จ (ปกติ 1–2 นาที) โดยไม่ต้องรีโหลด — ใช้ช่องทางเดียวกับที่ห้องรับ delta ข้อความ (ห้ามใช้ `router.refresh()` ใน `(chat)/**` ตาม 00082) · ถ้ายังไม่มีช่องทางสด ให้ refetch เฉพาะรายการ event ของห้องเป็นระยะขณะยังมีบรรทัด "กำลังส่ง" (หยุดเมื่อไม่มี)

กาง (กดบรรทัด): กล่อง `mx-auto mt-2 max-w-sm rounded-lg border border-dashed border-default-300 bg-card p-3 text-start text-xs` (มีขอบเส้นประ — ฟองไม่มีขอบ จึงไม่ถูกอ่านว่าเป็นข้อความ):
- รายชุดข้อมูล: ไอคอน + ชื่อชุด · สถานะ · "Meta รับเมื่อ {formatDayMonthTimeTH(sentAt)}" หรือเหตุผลเต็ม (`logReason`)
- ลิงก์ "ดูในบันทึกการส่ง" + `chevron-right` (`min-h-11` มือถือ) → `/settings/capis/{shopChannelId}/log?conversation={conversationId}`
- กางได้ทีละหลายบรรทัด · สถานะกาง/หุบไม่จำข้ามการเปิดห้อง

ใครเห็น / เมื่อไหร่ไม่มีบรรทัด:
- เห็นเฉพาะ X9 (ตอนนี้ = เจ้าของร้าน) — คนอื่น **ไม่มีบรรทัดเลย** และ server ห้ามส่งข้อมูลนี้ลงมาให้ (ตัดที่ต้นทาง ไม่ใช่ซ่อนฝั่ง client)
- ห้องไม่ใช่ Messenger (LINE / Instagram / อื่น ๆ) · ฟีเจอร์ปิด (`isMetaCapiEnabled`) · เพจไม่เคยเปิด = ไม่มี event = ไม่มีบรรทัด
- ไม่มีสถานะ ว่าง / กำลังโหลด / ผิดพลาด ของตัวเอง — บรรทัดมากับรายการข้อความ (ถ้าดึงแยกแล้วล้ม = ไม่แสดงบรรทัด ไม่บล็อกห้อง)
- ลูกค้าไม่เห็นเด็ดขาด — ไม่ใช่ `Message` ที่ส่งออก (แนะนำอ่านจาก `MetaCapiEvent` แล้ว merge ตามเวลา ไม่เขียนแถวลงตารางข้อความ — ดูคำถามข้อ 1)

ลำดับในม็อกอัพ (ไหลไปกับบทสนทนา): การ์ดสินค้า → ดูสินค้า · ลูกค้าตกลง → สร้างคำสั่งซื้อ · การ์ดคำสั่งซื้อ → ส่งลิงก์คำสั่งซื้อ (รอ · ลองใหม่) · สลิป → แนบสลิป · ร้านยืนยัน → ซื้อ (สำเร็จ 1 จาก 2 — กางใน Mobile/Desktop) · แจ้งจัดส่ง → กำลังส่ง “จัดส่งแล้ว”…

หมายเหตุ Native: บรรทัดเดียว + กล่องกาง ลอกได้ตรง ๆ · ลิงก์ "ดูในบันทึกการส่ง" ในแอปเปิดหน้าเว็บ

## จอ 2 — หน้าออเดอร์: การ์ด "Event ที่ส่งให้ Meta"

ตำแหน่ง: คอลัมน์ซ้าย (`lg:col-span-3`) ใต้การ์ด "ประวัติออเดอร์" (`shippingActivity` slot) · <1024px เรียงต่อกันคอลัมน์เดียว
Base: theme `apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx` ผ่าน `orders/[token]/components/ShippingActivity.tsx`

Anatomy: `.card` > `.card-header` (`card-title` "Event ที่ส่งให้ Meta" + `btn btn-sm border` "ดูในบันทึกการส่ง" → `/settings/capis/{channelId}/log?order={publicToken}`) > `.card-body p-5 md:p-7.5` timeline:
- คอลัมน์วันเวลา `w-18 md:w-25` ชิดขวา (`formatDayMonthShortYearTH` มือถือ / `formatDateTH` md+ / `formatTimeHM`)
- วงกลม `size-9 rounded-full` พื้นป้ายสถานะ + ไอคอน · เส้นประ element จริง `w-px flex-1 border-e border-dashed border-default-300`
- หัว `h5 min-h-9 text-sm font-medium` ชื่อเหตุการณ์ + มูลค่าชิดขวา · บรรทัดสถานะ `text-xs` + **"Meta รับเมื่อ {sentAt}"** เมื่อสำเร็จทุกชุด · เหตุผล / รายชุดข้อมูลตามกฎรวมกลุ่ม

ข้อมูล: ทุกแถว `MetaCapiEvent` ที่ `shopId` = ร้าน และ `payload.orderId` = ออเดอร์นี้ เรียงใหม่ → เก่า (ไม่จำกัด 5)

สถานะ: มีรายการ · ว่าง (`send-off` + "ยังไม่มีการส่ง event" ไม่มีคำอธิบาย) · เพจยังไม่ได้เปิด (แถบเทา "เพจ {ชื่อเพจ} ยังไม่ได้เปิด Conversions API" + "ไปตั้งค่า") · กำลังโหลด (skeleton 3 แถวรูปทรง timeline — ถ้าการ์ดสตรีมด้วย Suspense) · ผิดพลาด (ข้อความ + "ลองใหม่")
ไม่แสดงการ์ด: ออเดอร์ที่ไม่มี `conversationId` หรือห้องไม่ใช่ Messenger · ไม่มี X9 · ฟีเจอร์ปิด

## จอ 3 — หน้าบันทึกการส่ง `/settings/capis/{channelId}/log`

คงตารางที่ขึ้นแล้ว (`LogClient.tsx` 6 คอลัมน์: เวลา · ลูกค้า · เหตุการณ์ (+ชุดข้อมูล +ลิงก์ออเดอร์) · โฆษณา · มูลค่า · สถานะ (+เหตุผล)) · <lg = mobileCard

เพิ่ม:
1. **ตัวกรองใหม่ใน query string** `?conversation={id}` / `?order={publicToken}` (ผสมกับ `status`/`event` เดิมได้) · ค่าไม่รู้จัก/ไม่ใช่ของร้าน = ไม่กรอง (ท่าเดียวกับ status/event เดิม)
2. **แถวชิปในหัวการ์ด** (`w-full flex flex-wrap gap-2` ใต้ตัวกรอง): pill `rounded-full border-primary bg-primary/10 text-primary-ink text-xs` "แชท: {ชื่อลูกค้า}" / "ออเดอร์ #{orderNo}" + ปุ่ม × (`size-11` มือถือ / `size-8` desktop · `aria-label` "ล้างตัวกรองแชท"/"ล้างตัวกรองออเดอร์") — กด × ลบเฉพาะตัวนั้น
3. **"Meta รับเมื่อ {sentAt}"** ใต้ป้าย "สำเร็จ" (ต้อง select `sentAt` เพิ่มใน `listCapiLog`)
4. ป้ายสถานะมีไอคอนนำหน้า (ไม่ใช้สีอย่างเดียว) — คำเดิม
5. ไม่ตรงตัวกรอง: `SellerEmptyState` เดิม "ไม่พบรายการที่ตรงกับตัวกรอง" + "ล้างตัวกรอง" (ล้างทุกตัวรวมชิป) · โหลด/ผิดพลาด ใช้ `loading.tsx` + `SellerErrorState` เดิม
6. คำเก็บรักษาคงเดิม "เก็บไว้ทั้งหมด ไม่มีหมดอายุ" (PR #230 ถอด purge แล้ว — แถวหายเฉพาะตอนลบ dataset / ถอดการเชื่อมเพจ)

## ตารางคำ (copy)

| จุด | ข้อความ | คีย์ |
|---|---|---|
| บรรทัดในห้อง | ส่ง “{label}” ให้ Meta | ใหม่ `conversionsApi.chatLine` |
| บรรทัดกำลังส่ง | กำลังส่ง “{label}” ให้ Meta… | ใหม่ `conversionsApi.chatLineSending` |
| เหตุผลสั้น | Meta ไม่บันทึก · ลองครบ 3 ครั้งแล้ว · ลองใหม่ครั้งที่ {n} จาก 3 · รอเชื่อมเพจใหม่ · เก่ากว่า 7 วัน | ใหม่ `conversionsApi.logReasonShort.*` |
| หัวการ์ดออเดอร์ | Event ที่ส่งให้ Meta | ใหม่ `conversionsApi.orderCardTitle` |
| ลิงก์ (กล่องกางในแชท + การ์ดออเดอร์) | ดูในบันทึกการส่ง | ใหม่ `conversionsApi.openLog` |
| ว่าง (การ์ดออเดอร์) | ยังไม่มีการส่ง event | ใหม่ `conversionsApi.orderCardEmpty` |
| เพจยังไม่เปิด (ออเดอร์) | เพจ {name} ยังไม่ได้เปิด Conversions API | ใหม่ |
| ปุ่มตั้งค่า | ไปตั้งค่า | ใหม่ |
| ผิดพลาด (การ์ดออเดอร์) | โหลด event ไม่สำเร็จ · ลองใหม่ | ใหม่ |
| ผลไม่เท่ากัน | สำเร็จ {ok} จาก {n} ชุดข้อมูล (การ์ดออเดอร์) · สำเร็จ {ok} จาก {n} (บรรทัดแชท) | ใหม่ |
| หลายชุดผลเท่ากัน | {n} ชุดข้อมูล | ใหม่ |
| เวลารับ | Meta รับเมื่อ {date} | ใหม่ |
| ชิป | แชท: {name} · ออเดอร์ #{orderNo} | ใหม่ (ไม่มีชื่อ = `logNoName`) |
| ปุ่ม × ชิป | ล้างตัวกรองแชท · ล้างตัวกรองออเดอร์ | ใหม่ (aria) |
| สถานะ / เหตุผล / ชื่อเหตุการณ์ / เก็บรักษา | ของเดิม | `logStatus` · `logReason` · `events` · `logRetention` |

คีย์ใหม่ทุกตัวต้องมีทั้ง `th.ts` และ `en.ts` (00047)

## Token mapping (cross-check `DESIGN.md` + `.impeccable/design.json`)

| ใช้ | Paces token | ค่า |
|---|---|---|
| ปุ่มหลัก "ล้างตัวกรอง" / ชิป | `bg-primary` · `bg-primary/10` · `text-primary-ink` · `border-primary` | #236dc9 · #1e3a8a |
| สถานะ | `bg-{success,warning,danger}/15` + `text-{…}-ink` · `bg-default-100 text-default-800` | ดูตารางสถานะ |
| ตัวอักษร | `text-default-900` (หัว) · `-800` · `-700` (รอง ≥4.5:1) — ห้าม `-400/-500` กับข้อความ | |
| เส้น | `border-default-300 border-dashed` (หัวการ์ด/section/timeline) · `border-default-200` (คั่นแถว) | 1px |
| มุม | `.card` 4px (`rounded`) · แถบเทา/skeleton `rounded-lg` · ชิป `rounded-full` · วงกลม `rounded-full` | ไม่มี `rounded-[Npx]` |
| ระยะ | การ์ด `p-5` / timeline `md:p-7.5` · section `pt-4 space-y-2` · แถว `py-2.5 gap-2` | |
| ขนาดตัวอักษร | `text-sm` (14) หัว/ชื่อ · `text-xs` (13) รอง · `text-2xs` (11) ป้าย | Anuphan |
| เป้ากด | `min-h-11` <1024 · `lg:min-h-8` desktop (กฎ seller DESIGN.md §44px) | |

ไม่มี arbitrary value ใน `(paces)/**` (HR7) · ไม่มี emoji (HR12) · ไอคอน Tabler ทั้งหมด

## ข้อมูลที่ต้องมีจาก backend (ส่งต่อ PRD/SRS)

- กรองตามแชท: `conversationId` มี index อยู่แล้ว (`@@index([conversationId, eventKey, createdAt])`)
- กรองตามออเดอร์: orderId อยู่ใน `payload.orderId` (JSON) **ไม่มีคอลัมน์/ไม่มี index** — กรองด้วย JSON path ได้ (scope ด้วย shopId+channel ก่อน) หรือเพิ่มคอลัมน์ `orderId` + index (= migration, HR15)
- รวมกลุ่มต้อง select `dedupeKey` + `sentAt` (ปัจจุบัน `listCapiLog` ไม่ select ทั้งสอง)
- ห้องแชท: ดึง event ของห้อง (`conversationId` + ช่วงเวลาเดียวกับหน้าข้อความที่โหลดอยู่) รวมกลุ่มฝั่ง server แล้ว merge ตามเวลากับรายการข้อความ · โหลดข้อความเก่าเพิ่ม = ดึง event ช่วงนั้นเพิ่ม · ไม่ส่งให้ผู้ไม่มี X9
- ชื่อลูกค้าในชิป: `ExternalContact.name` ของห้อง · เลขออเดอร์: `orderNo ?? publicToken.slice(0,8)` (เหมือน `orderLink` เดิม)

## คำถามที่ยังเปิด

1. **เก็บเป็นข้อความในตาราง `Message` หรือ merge จาก `MetaCapiEvent` ตอนอ่าน?** แนะนำ merge ตอนอ่าน (ไม่ต้องกันไม่ให้ส่งออก/นับเป็นข้อความ/โผล่ในรายการแชทและพรีวิวล่าสุด · สถานะเปลี่ยนได้หลังสร้าง) — ต้องยืนยันใน SRS
1a. **ห้องที่มี event เยอะ** (หลายออเดอร์ × 9 เหตุการณ์) บรรทัดเทาจะดันข้อความจริงห่างกัน — ต้องการสวิตช์ "ซ่อนบรรทัด Meta" ในห้องไหม หรือยุบ event ที่ติดกันเป็นบรรทัดเดียว ("ส่ง 3 event ให้ Meta · สำเร็จ")
1b. คำ "ส่ง “ซื้อ” ให้ Meta" ใช้ชื่อเหตุการณ์ไทยใส่เครื่องหมายคำพูด — โอเคไหม หรือใช้ "ส่ง event ซื้อ (Purchase) ให้ Meta"
2. **คำ "สำเร็จ" ในแชท** อาจอ่านว่า "ปิดการขายสำเร็จ" ข้างชื่อเหตุการณ์ "ซื้อ" — ยอมรับได้ไหม หรือควรเปลี่ยนทั้งระบบเป็น "Meta รับแล้ว" (กระทบหน้าบันทึกที่อนุมัติแล้ว)
3. **ตำแหน่งการ์ดออเดอร์** ใต้ "ประวัติออเดอร์" (คอลัมน์กว้าง) — หรือย้ายไปคอลัมน์ขวาคู่การ์ดกำไร (เจ้าของเท่านั้นเหมือนกัน แต่แคบ ~280px ต้องตัดคอลัมน์วันเวลา)
4. **กรองออเดอร์: JSON path หรือเพิ่มคอลัมน์ `orderId`** (migration) — ตัดสินใน SRS
5. ตอนกรองตามแชท คอลัมน์ "ลูกค้า" ซ้ำกันทุกแถว — ซ่อนไหม (ม็อกอัพคงไว้เพื่อความเรียบ)
6. เพจ "หยุดทุกชุด" (`capiPageStatus = stopped`) — บรรทัดจะขึ้น "รอ · รอเชื่อมเพจใหม่" ซ้ำทุก event ในห้อง พอไหม หรือควรมีบรรทัดเดียวบอกครั้งเดียว
