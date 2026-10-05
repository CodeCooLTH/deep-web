# Design Spec addendum: 00068 LINE Group Summary Report, UI phase E1/E2/E3/E4

ผู้ออก: `safepay-ux` · 2026-10-05 · เสริมต่อจาก `docs/superpowers/specs/2026-10-05-line-group-summary-report-design.md` ("base spec")
เมื่อขัดกัน **addendum นี้ชนะ base spec** ในจุดที่ระบุ ส่วนที่ไม่ได้พูดถึงให้ยึด base spec และ mockup ตามเดิม

**อ่านแล้วก่อนเขียน:**
- PRODUCT.md, DESIGN.md
- impeccable `shape.md`, `operate.md`, `craft-floor.md` (พบที่ `~/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/reference/`)
- `API.md` ของ 00068, `presenter.ts`, `flex-summary-report.ts`, `bind-code.ts`, `config.ts`, `types.ts`
- `line-report-access.service.ts`, `line-report-group.service.ts`, `line-report-shop.service.ts`
- `ShopQuickLinks.tsx`, `SellerBottomNav.tsx`, `(dashboard)/layout.tsx`, `shop/page.tsx`, `business/page.tsx`, `QuotaUsageCard.tsx`, `LockedStateBanner.tsx`
- `OrderAgentClient.tsx`, `FinanceVisibilityToggle.tsx`, `CopyLinkButton.tsx`, `app-shell-server.ts`, `paces-toast.ts`, `paces-swal.ts`
- mockup (โครงขั้นผูกกลุ่มและกล่องโค้ด)

> `.claude/skills/frontend-design/SKILL.md` ยังไม่มีใน worktree (ตามหมายเหตุสภาพแวดล้อมของ base spec) จึงยึดหลักจาก brief เดิม

---

## 0. สรุปการ reconcile ทั้ง 8 ข้อ

| # | เรื่อง | ผลต่อสเปก | ที่อยู่ในเอกสารนี้ |
|---|---|---|---|
| 1 | โค้ด 8 ตัว Crockford `XXXX-XXXX` | ออกแบบกล่องโค้ดใหม่ ค่าที่คัดลอก = `ผูก K7M2-XQ4P` ทั้งประโยค และอย่า import `formatBindCode` เพราะ API ส่งรูปมีขีดมาแล้วและไฟล์นั้นใช้ node `crypto` | §3.2, §4.1 |
| 2 | ขั้นเลือกร้าน, ติ๊กรับทราบ, PENDING เปิดซ้ำดูโค้ดเดิมไม่ได้, บรรทัด OA | ขั้น 2 รวม "เลือกร้านและสร้างโค้ด" เป็นขั้นเดียว (ยังคง 3 ขั้น) | §3.1, §3.3 |
| 3 | bottom nav ไม่มีแท็บ "ธุรกิจ" | จุดแจ้งเตือนอยู่ที่ "ร้านค้า" และแถวทางเข้าอยู่ใน `ShopQuickLinks` | §5 |
| 4 | `/business` เด้งออกในแอป | แถวใต้ `QuotaUsageCard` เป็น web-only ทางเข้าบนมือถือคือ `ShopQuickLinks` | §5.3 |
| 5 | คำว่า "ออเดอร์" | ห้ามพิมพ์ตายตัว ใช้ `reportOrderWord` (ต้องแก้ type param นิดเดียว ดู §9) | §6 |
| 6 | presenter | ทุกป้าย/แบนเนอร์/CTA/ปุ่มทดสอบมาจาก presenter | §4.3 |
| 7 | API contract จริง | ตาราง control → request/field, autosave debounce, poll 3 วิ | §4.2, §4.4 |
| 8 | พรีวิว Flex | ใช้ `buildSummaryReportFlex` จริง + renderer เล็ก ๆ ถ้า Controller ไม่เห็นชอบ ใช้ fallback แบบ static | §4.5, §9 |

**จุดที่ base spec และ mockup ล้าสมัยและต้องแก้ตามรอบเดียวกัน** (ฉันแก้ HTML ไม่ได้ Controller หรือ developer ต้องแก้):
- mockup หน้า A และ V "ทางเข้าจากหน้าร้าน" ยังมีแท็บ "ธุรกิจ"
- mockup หน้า C ยังไม่มีรายการเลือกร้านและบรรทัด OA
- mockup หน้า C ยังไม่มีสถานะ "เปิดซ้ำ PENDING"

---

## 1. File list ต่อ task

โฟลเดอร์ราก = `src/app/(paces)/seller/(dashboard)/business/line-reports/` (ย่อ `LR/`) · `lib/` = `src/lib/line-report/`

### E1: list / empty / locked + loading
| ไฟล์ | ชนิด | หน้าที่ |
|---|---|---|
| `LR/page.tsx` | RSC | guard `resolveReportAccess` (ANON → redirect sign-in, NOT_OWNER → `notFound()`, LOCKED → E1 ถ้าไม่มีกลุ่ม หรือ E2 ถ้ามีกลุ่ม, PAID → list) · เรียก `listGroups(ownerId)` ตรง ๆ (DTO เดียวกับ GET /groups) · `getAppShell()` |
| `LR/loading.tsx` | RSC | skeleton สูงเท่าจริง (ต้นแบบ `shop/loading.tsx`) |
| `LR/_components/ReportGroupList.tsx` | RSC | การ์ด header + แถว + ปุ่ม "เพิ่มกลุ่ม" + บรรทัดอธิบายเมื่อสร้างไม่ได้ |
| `LR/_components/ReportGroupRow.tsx` | RSC | แถวเดียว (anchor ทั้งแถว + ปุ่ม "ผูกใหม่" แยกเป็นพี่น้อง ไม่ซ้อน anchor) |
| `LR/_components/GroupStatusBadge.tsx` | RSC | รับ `GroupBadge` จาก presenter แล้ว render |
| `LR/_components/CodeCountdown.tsx` | client | นับถอยหลัง `mm:ss` จาก `expiresAt` ใช้ร่วมกับ E2 |
| `LR/_components/ReportEmptyState.tsx` | RSC | หน้าว่าง |
| `LR/_components/ReportLockedState.tsx` | RSC | E1 (การ์ดเดียว + ตัวอย่าง) · E2 ใช้แบนเนอร์จาก presenter เหนือ list |
| `LR/_components/FlexBubbleView.tsx` | RSC (ไม่มี state) | render Flex JSON เป็น markup (ดู §4.5) ใช้ร่วมกับ empty, locked, detail |
| `lib/list-view.ts` + `__tests__/list-view.test.ts` | pure | `sortGroups()` (มีปัญหา → รอผูก → ปกติ → เวลาส่งถัดไป) · `createBlockedReason(meta)` · `lastDeliveryView(lastDelivery)` |

### E2: bind wizard (new + PENDING resume + rebind)
| ไฟล์ | ชนิด | หน้าที่ |
|---|---|---|
| `LR/new/page.tsx` | RSC | guard เหมือน list + `listReportableShops(ownerId)` + `addFriendUrl()` (server-only) ส่งลงเป็น prop · ถ้า `!meta.canCreate` ให้ redirect กลับ list พร้อมเหตุผลตาม `createBlockedReason` |
| `LR/_components/BindWizard.tsx` | client | `<ol>` 3 ขั้น · prop `mode: 'create' \| 'resume' \| 'rebind'` · state: `groupId`, `code`, `expiresAt`, `phase` · poll |
| `LR/_components/ShopPicker.tsx` | client | รายการ checkbox 1..10 ร้าน |
| `LR/_components/BindCodeBox.tsx` | client | กล่องโค้ด + `CopyLinkButton` + `CodeCountdown` |
| `LR/[groupId]/page.tsx` | RSC | แตกสาขาตาม `group.status` (PENDING → `BindWizard mode="resume"`) ใช้ไฟล์เดียวกับ E3 |
| `lib/bind-wizard-rules.ts` + test | pure | `canCreateCode({selectedIds, acknowledged, busy, available})` · `formatCountdown(msLeft)` · `isExpired(expiresAt, now)` |

### E3: detail (settings + preview + history + menu)
| ไฟล์ | ชนิด | หน้าที่ |
|---|---|---|
| `LR/[groupId]/GroupDetailClient.tsx` | client | state ก้อนเดียวของ `GroupDetailDto` · เรียก `useAutosave` · สลับ view `settings` ↔ `rebind` |
| `LR/_components/detail/DetailActionBar.tsx` | client | `‹` + ป้ายสถานะ · ปุ่ม "ส่งทดสอบ" (primary) + `⋯` |
| `LR/_components/detail/GroupBanner.tsx` | client | render `GroupBanner` จาก `bannerFor` |
| `LR/_components/detail/ShopsCard.tsx` | client | checkbox ร้าน (PUT shops) |
| `LR/_components/detail/ScheduleCard.tsx` | client | รายวัน/รายเดือน/ตัดรอบ/ข้ามถ้าไม่มีรายการ/แนบยอดสะสม |
| `LR/_components/detail/MetricsCard.tsx` | client | checkbox ตัวเลข + กำไรพร้อม Swal |
| `LR/_components/detail/PreviewCard.tsx` | client | seg รายวัน/รายเดือน + `FlexBubbleView` |
| `LR/_components/detail/CommandsCard.tsx` | RSC | chip `สรุปวันนี้` / `สรุปเดือนนี้` (ใช้ `CopyLinkButton`) |
| `LR/_components/detail/HistoryCard.tsx` | RSC | ตาราง ≥768 / แถว 2 บรรทัดบนมือถือ |
| `LR/_components/detail/GroupMenu.tsx` | client | `⋯` (React-controlled) มีรายการเดียว "ยกเลิกการผูก" → `pacesConfirm.danger` → DELETE |
| `LR/_components/detail/useAutosave.ts` | client hook | debounce + coalesce + serialize + revert (§4.4) |
| `lib/preview-sample.ts` + test | pure | `buildSampleSummary()` → `GroupSummary` ตัวอย่างจากร้านจริงของกลุ่ม |
| `lib/flex-preview-tokens.ts` + test | pure | map ค่าสีในโหนด Flex (hex) → class Paces (hex อยู่นอก `(paces)/**` เพื่อไม่ชน grep HR7) |
| `lib/settings-guards.ts` + test | pure | `canAddTime`, `canRemoveTime`, `isLastMetric`, `isLastShop` (ตามคอนเวนชัน `ui-boolean-needs-a-testable-home`) |
| `lib/delivery-view.ts` (หรือรวมใน `list-view.ts`) | pure | map `kind`/`status` → ป้าย/โทน (ดู §7 copy delta) |
| `lib/order-word.ts` + test | pure | `orderWordFor(shops)` ห่อ `reportOrderWord` (§6) |

### E4: ทางเข้า + จุดแจ้งเตือน + props ของ layout
| ไฟล์ | การแก้ |
|---|---|
| `shop/components/ShopQuickLinks.tsx` | เพิ่ม prop บังคับ `lineReports: { hasAlert: boolean } \| null` + แถวใหม่ |
| `shop/page.tsx` | เรียก `resolveReportAccess(session)` + `countUnackedAlerts` ส่ง prop ข้างบน |
| `_shared/SellerBottomNav.tsx` | เพิ่ม prop บังคับ `shopAlert: boolean` → จุดแดงที่ช่อง "ร้านค้า" |
| `(dashboard)/layout.tsx` | คำนวณ `shopAlert` (try/catch → false) ส่งให้ `SellerBottomNav` |
| `business/page.tsx` + `business/components/LineReportsEntryRow.tsx` (ใหม่, RSC) | แถวเว็บใต้ `QuotaUsageCard` |
| `src/i18n/dictionaries/{th,en}.ts` | key aria ของจุดแจ้งเตือน (ต้อง mint ครบทั้งสองภาษาและต่อสายใช้งานจริง) |
| `shop/loading.tsx` | ไม่ต้องแก้ ยอมรับ layout shift 1 แถวเฉพาะ owner (บันทึกใน Open) |

---

## 2. Theme Source Mapping (ต่อ component)

Paces root = `theme/paces/Admin/TS/src/app/(admin)/` · ทุก icon ผ่าน `@/components/wrappers/Icon` ด้วยชื่อ tabler แบบสั้น (ชื่อที่ใช้ซ้ำใน `(paces)` อยู่แล้ว: `alert-triangle` `circle-check` `info-circle` `loader-2` `link-off` `clock` `send` `refresh` · `brand-line` ยืนยันแล้วใน `seller-menu.ts` · `qrcode` `circle-x` `history` `users` `building-store` `copy` `plus` `x` `dots-vertical` `chevron-right` ใช้ใน base spec/precedent เดิม)

> หน้า `icons/tabler/page.tsx` ของ Paces โหลดรายชื่อแบบ dynamic grep ไม่ได้ developer ต้องยืนยันชื่อด้วย precedent ที่ใช้อยู่แล้ว ไม่ต้องเดาชื่อใหม่

| Component | Theme file | src precedent | Props จาก API / presenter | หมายเหตุ adapt |
|---|---|---|---|---|
| **page shell** list/new/[groupId] | `pages/pricing/page.tsx` | `business/page.tsx`, `invites/page.tsx`, `PageBreadcrumb.tsx` | `access: ReportAccess`, `shell: AppShell` | RSC, `notFound()` เมื่อ NOT_OWNER |
| **ReportGroupList** | `ui/cards/page.tsx` (CardWithHeader) | `QuotaUsageCard.tsx` | `groups: GroupListDto[]`, `meta` | `.card-header` เส้นประ · ห้ามซ้อนการ์ด |
| **ReportGroupRow** | closest `ui/cards` | `settings/channels/LineChannelCard.tsx` (แถว + โลโก้ `/images/logos/line.svg`) | `id, groupName, shopCount, mixedVertical, shops[≤2], nextSendAt, lastDelivery, alert, bind.codeExpiresAt, paused, status` | anchor ทั้งแถว `min-h-11` · `lg` grid 12 คอลัมน์ |
| **GroupStatusBadge** | `ui/badges/page.tsx` | `LineChannelCard.tsx` `TONE_BADGE` | **`groupBadge({status}, paused)`** → `{key,label,icon,tone}` | map tone → `bg-{tone}/15 text-{tone}-ink` (neutral → `bg-default-100 text-default-700`) |
| **GroupBanner** | `ui/alerts/page.tsx` | `LockedStateBanner.tsx` | **`bannerFor(pg, paused, shell, lockReason)`** → `{key,tone,message,action}` | ใช้ `-ink` ห้ามลอก `text-danger` ของ `LockedStateBanner` · `action.kind==='REBIND'` = ปุ่ม, `'LINK'` = `Link` |
| **Switch row** | `form/elements/components/ChecksRadioSwitches.tsx` | `FinanceVisibilityToggle.tsx` (`form-switch`) | `settings.dailyEnabled/monthlyEnabled` | `disabled={!canEdit(pg,paused)}` |
| **Checkbox row** (ร้าน/ตัวเลข/รับทราบ) | `form/elements/components/ChecksRadioSwitches.tsx` | `OrderAgentClient.tsx` | `settings.show*`, `shops[]`, `shopIds` | `min-h-11` บนมือถือ · label ครอบทั้งแถว |
| **form-select** (เพิ่มเวลา, วันตัดรอบ) | `form/elements/components/InputTextfieldType.tsx` | HR6(a): native `<select class="form-select">` | `settings.dailyTimes`, `settings.cutoffDay` | ห้าม `hs-dropdown`/`FilterDropdown` (autosave re-render บ่อย) |
| **GroupMenu `⋯`** | `ui/dropdowns/page.tsx` | `orders/components/OrderCardMenu.tsx` (`dots-vertical`) | `groupId`, `groupName` | React-controlled (HR6 ข) · เพราะอยู่ใน scroll container ให้เช็ค `scroll-container-clips-popovers` |
| **Time chip** | `ui/badges/page.tsx` | `OrderAgentClient.tsx` (ชิปวลี) | `settings.dailyTimes[]` | × พื้นที่แตะ ≥44px บนมือถือ (`size-11 lg:size-N`) |
| **Seg รายวัน/รายเดือน** | closest `ui/buttons` | `OrderAgentClient.tsx` radiogroup | `settings.dailyEnabled/monthlyEnabled` | `role="radiogroup"` · ห้าม `.btn-group` |
| **BindWizard `<ol>`** | `form/wizard/components/Steps.tsx` (แนวคิดเท่านั้น) | `LineChannelCard.tsx` `LineConnectWizard` | ดู §4.1 | **ไม่พบ theme match ที่ตรงพอ** → §9 ข้อ 2 |
| **ShopPicker** | `form/elements/components/ChecksRadioSwitches.tsx` | `OrderAgentClient.tsx` (checkbox ช่องทาง) | `shops: {id,name,vertical,kind}[]` จาก `listReportableShops` | |
| **BindCodeBox** | closest `ui/alerts` (กล่องพื้นจาง) | `LockedStateBanner.tsx` | `code`, `expiresAt` | ไม่มี theme match สำหรับ "กล่องแสดงโค้ด" → §9 ข้อ 3 |
| **Copy button** | `assets/css/custom/_buttons.css` (btn-sm) | `orders/[token]/components/CopyLinkButton.tsx` | `value="ผูก K7M2-XQ4P"`, `label="คัดลอกข้อความ"`, `successMessage="คัดลอกข้อความแล้ว"` | 🛑 **ห้ามส่ง `showPreview`** (มี `font-mono` ฆ่า Anuphan) |
| **QR** | — | `orders/components/OrderQrSheet.tsx` (`qrcode.react`) | `addFriendUrl` (null → ซ่อนทั้ง QR และปุ่มเปิดใน LINE) | |
| **CodeCountdown** | — | — | `expiresAt` | **ไม่พบ theme match** → §9 ข้อ 3 |
| **FlexBubbleView** | closest `ui/cards` + utility ข้อความ | — | `messages: LineFlexMessage[]` | **ไม่พบ theme match** → §9 ข้อ 1 |
| **HistoryCard** | `apps/ecommerce/(orders)/orders/components/OrdersList.tsx` (table) | `inventory/movements/[productId]/MovementHistoryTable.tsx` | `deliveries[]` | `table table-sm` |
| **Confirm** (ยกเลิกผูก, เปิดกำไร) | `plugins/sweet-alerts/components/SweetAlerts.tsx` | `src/lib/paces-swal.ts` → `pacesConfirm.danger/warning` | | HR8: ห้าม `window.confirm` |
| **Toast** | — | `src/lib/paces-toast.ts` | | HR9 |
| **Skeleton** | — | `shop/loading.tsx` (`animate-pulse`) | | |
| **ShopQuickLinks row** | `apps/users/profile/components/ProfileCard.tsx` (ผ่าน `ShopQuickLinks.tsx` เดิม) | `ShopQuickLinks.tsx` เอง | `lineReports: {hasAlert}\|null` | เพิ่มสมาชิก `LINES` ตัวเดียว ไม่แตะโครงเดิม |
| **Nav dot** | `ui/tabs/page.tsx` + `Customizer/index.tsx` (ตามหัว `SellerBottomNav`) | `SellerBottomNav.tsx` ช่อง "คำสั่งซื้อ" (badge `bg-danger`) | `shopAlert: boolean` | ใช้ carve-out เดิมของไฟล์ (ตำแหน่ง/ring) ไม่เพิ่มค่าดิบใหม่ |
| **/business entry row** | `ui/cards/page.tsx` | `QuotaUsageCard.tsx` (แถวใน card) | `hasAlert`, `alertCount` | RSC `Link` ห้าม `component={Link}` |

---

## 3. Wireframe เฉพาะส่วนที่เปลี่ยน

### 3.1 ผูกกลุ่ม `/new`: ขั้น 2 รวม "เลือกร้านและสร้างโค้ด" (375px)

คงเป็น **3 ขั้น** เพื่อไม่ให้การ์ดยาวกว่าที่นิ้วเลื่อนไหว ขั้นที่เพิ่มคือรายการร้านในขั้น 2 ไม่ใช่ขั้นที่ 4

```
 ธุรกิจ / รายงานเข้ากลุ่ม LINE / ผูกกลุ่มใหม่
┌─ .card ─────────────────────────────────────┐
│ (✓) เพิ่ม Deep รายงานยอด เข้ากลุ่ม LINE      │  ขั้น 1 ผ่านแล้ว = bg-primary/15 + check
│     เพิ่มบอทเป็นเพื่อนก่อน แล้วเชิญบอทเข้า    │
│     กลุ่มที่ต้องการรับรายงาน                 │
│     (i) กลุ่มหนึ่งมี OA ได้ตัวเดียว — ถ้ามี   │  info-circle + text-default-700 ไม่ใส่กล่อง
│         OA อื่น (เช่น OA ของร้าน) ในกลุ่ม     │
│         ให้นำออกก่อน                          │
│     [LINE เปิดใน LINE] [qr แสดง QR]          │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ (2) เลือกร้านและสร้างโค้ดผูกกลุ่ม             │  ขั้นปัจจุบัน = bg-primary text-white
│     เลือก 1 ร้านเป็นรายงานของสาขา เลือก        │
│     หลายร้านเป็นรายงานรวมพร้อมแยกรายร้าน      │
│     ☑ BT Premium Auto Xenon คลอง4 ธัญบุรี     │  แถว min-h-11 · ชื่อเต็มขึ้นบรรทัดได้
│        สินค้าและบริการ                         │  ป้ายชนิด = text-default-700 text-xs
│     ☐ ศรีสุข อะไหล่ออนไลน์ เซ็นเตอร์ สาขา…     │
│        ขายออนไลน์                              │
│     เลือกแล้ว 1 จาก 5 ร้าน                    │  text-xs เปลี่ยนเป็น "ครบ 10 ร้านแล้ว" เมื่อชน
│     ☑ รับทราบว่าทุกคนในกลุ่มจะเห็นตัวเลขที่ส่ง │
│        และ Deep ลบข้อความที่ส่งไปแล้วออกจาก   │
│        กลุ่มไม่ได้                             │
│     [        สร้างโค้ด         ]  ← primary   │  disabled จนกว่า ≥1 ร้านและติ๊กรับทราบ
│     โค้ดใช้ได้ 10 นาที และใช้ผูกได้ครั้งเดียว  │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ (3) พิมพ์ในกลุ่ม แล้วรอสักครู่                │  ยังไม่ถึงขั้น = bg-primary/15 text-primary
└─────────────────────────────────────────────┘
 [ยกเลิก]  (ลิงก์กลับ list)
```

**หลังกด "สร้างโค้ด"** (POST /bind-code สำเร็จ):
- รายการร้านหุบเหลือบรรทัดสรุป `ร้านที่รวม: BT Premium Auto Xenon… และอีก 2 ร้าน` + `text-xs` "เปลี่ยนร้านได้หลังผูกเสร็จ"
- checkbox รับทราบหายไป (ผูกกับ record ที่สร้างแล้ว)
- ขั้น 2 เปลี่ยนเป็น `check` และขั้น 3 เป็นขั้นปัจจุบัน

### 3.2 กล่องโค้ด (ขั้น 3 ที่ 375px)

```
┌─ bg-light rounded-lg p-4 ──────────────────┐
│ พิมพ์ข้อความนี้ในกลุ่ม LINE      text-xs text-default-700
│                                            │
│ ผูก   K7M2-XQ4P                            │  flex flex-wrap items-baseline gap-x-2
│ ↑      ↑                                   │
│ text-base   text-2xl font-semibold          │  Anuphan · tabular-nums · tracking-wide
│ font-medium whitespace-nowrap select-all    │  ห้าม font-mono
│ text-default-700                            │
│                                            │
│ [copy คัดลอกข้อความ]  (clock ใช้ได้อีก 09:41)│  btn-sm + badge bg-warning/15 text-warning-ink
│                                            │
│ ในโค้ดไม่มีตัวอักษร O, I, L — 0 และ 1      │  text-xs text-default-700
│ คือตัวเลข พิมพ์ตัวเล็กหรือตัวใหญ่ก็ได้       │
└────────────────────────────────────────────┘
```

- **ทำไมแยก "ผูก" เป็นคำเล็ก:** พระเอกของกล่องคือ 8 ตัวที่ผู้ใช้ต้องอ่านออกหรือพิมพ์เอง คำว่า "ผูก" เป็นแค่คำสั่งนำ ถ้าใหญ่เท่ากันโค้ดจะดูยาวขึ้นและตัวแรกกลมกลืนกับคำไทย
- **รูปทรง `XXXX-XXXX`:** ขีดอยู่ใน `<span>` เดียวกับตัวอักษร `whitespace-nowrap` ห้ามตัดบรรทัดระหว่างครึ่ง
- **ความกว้าง:** กว้างโดยประมาณของโค้ด ~150–170px ที่ `text-2xl` พื้นที่ใช้ได้ที่ 320px ≈ 208px (shell 16×2 + card 20×2 + แถวขั้น 40px) พอดีบรรทัดเดียว ถ้าแคบกว่านี้ (ซูม 200%) `flex-wrap` ย้าย "ผูก" ขึ้นบรรทัดบนเอง โค้ดไม่แตก developer ต้องวัดที่ 320 และ 375 จอจริง
- **ค่าคัดลอก:** `value = \`ผูก ${code}\`` ใช้ `code` ที่ API ส่งมาตรง ๆ (`"K7M2-XQ4P"`) ผู้ใช้วางแล้วส่งได้ทันที
- **ห้ามแสดงโค้ดซ้ำหลังเปิดหน้าใหม่** (hash at rest) ดูสถานะ resume ใน §3.3
- **หมดอายุ:** กล่องเปลี่ยนเป็น `bg-default-100` ข้อความ "โค้ดหมดอายุแล้ว" ปุ่ม "สร้างโค้ดใหม่" และหยุด poll (เรียก GET อีกครั้งเดียวก่อนหยุด กันแข่งกับกลุ่มที่เพิ่งผูกสำเร็จในวินาทีสุดท้าย)

### 3.3 สถานะ PENDING เปิดซ้ำ (`[groupId]`, ไม่มีโค้ดในมือ) และ rebind

```
(2) สร้างโค้ดผูกกลุ่ม   ✓ ร้านที่รวม: 3 ร้าน
    ┌─ bg-light rounded-lg p-4 ───────────────────┐
    │ โค้ดที่สร้างไว้แสดงซ้ำไม่ได้                  │
    │ (clock โค้ดเดิมยังใช้ได้อีก 06:12)  ← ถ้า bind.hasLiveCode
    │ [refresh สร้างโค้ดใหม่]                       │ → POST /groups/{id}/bind-code {}
    └──────────────────────────────────────────────┘
```

- `bind.hasLiveCode=false` (หมดอายุแล้ว) ตัดบรรทัด clock ทิ้ง เหลือข้อความ "โค้ดเดิมหมดอายุแล้ว" + ปุ่มเดิม
- ปุ่ม "สร้างโค้ดใหม่" ใช้ endpoint **ของกลุ่มที่มีอยู่** (§4.1 กติกา 1) ไม่ต้องติ๊กรับทราบซ้ำ (API.md §4.3)
- **rebind (`INACTIVE`):** ไม่มีรายการร้านและไม่มีรับทราบ แสดง "ผูกกลุ่มนี้อีกครั้ง — ค่าที่ตั้งไว้เดิมยังอยู่ครบ" + ปุ่ม "สร้างโค้ด" → POST `/groups/{id}/bind-code {}` (status เปลี่ยนเป็น PENDING ที่ฝั่ง server) ได้โค้ดแล้วใช้กล่องเดิมในรูป §3.2

---

## 4. Behavior, mapping และ state

### 4.1 BindWizard

**กติกาที่ต้องรักษา:**

1. **สร้างกลุ่มครั้งเดียวต่อ wizard.** POST `/bind-code` สร้างทั้งกลุ่มและโค้ด และกลุ่ม PENDING นับเข้าเพดาน 10 กลุ่ม หลังได้ `groupId` แล้ว **ทุกการสร้างโค้ดใหม่ใช้ `/groups/{id}/bind-code`** ห้ามยิง `/bind-code` ซ้ำ ไม่งั้นได้แถว PENDING ค้างเต็มเพดาน
2. **ห้าม `router.replace` ไป `[groupId]` ตอนสร้างสำเร็จ** (แก้จาก flow ข้อ 2 ของ base spec) เพราะ component จะ unmount และโค้ด (ไม่มีที่ไหนเก็บ) หาย ให้เก็บโค้ดใน state ของ wizard แล้วใช้ `window.history.replaceState(null, '', '/business/line-reports/' + groupId)` เปลี่ยน URL เฉย ๆ รีโหลดตอนไหนก็ตกที่สถานะ resume ใน §3.3 ซึ่งตรงกับข้อมูลที่ server มีจริง
3. **ผูกสำเร็จ** (poll เห็น `status==='ACTIVE'`): แสดงแบนเนอร์ `bg-success/15 text-success-ink` + ปุ่ม primary "ตั้งค่ารายงานของกลุ่มนี้" → `router.refresh()` ให้ RSC render โหมดตั้งค่า (ไม่ auto-redirect ตามเดิม)

**Mapping ของ control → request:**

| Control | เมื่อ | Request | Field / ผล |
|---|---|---|---|
| ShopPicker + รับทราบ + "สร้างโค้ด" | create | `POST /api/line-report/bind-code` | body `{shopIds: string[1..10], acknowledged: true}` → `{groupId, code, expiresAt, addFriendUrl, groupCount}` |
| "สร้างโค้ดใหม่" | resume / expired / rebind | `POST /api/line-report/groups/{id}/bind-code` | body `{}` → `{groupId, status, code, expiresAt, addFriendUrl}` |
| Poll | phase=waiting, `document.visibilityState==='visible'`, ยังไม่หมดอายุ | `GET /api/line-report/groups/{id}` ทุก 3 วิ | อ่าน `group.status` · `ACTIVE` → สำเร็จ · `bind.expiresAt` ใช้ sync นาฬิกา |
| "เปิดใน LINE" / QR | — | ลิงก์ไป `addFriendUrl` | null → ซ่อนทั้งสองปุ่ม แสดงบรรทัด "ยังไม่มีลิงก์เพิ่มเพื่อนของบอท ค้นหา Deep รายงานยอด ใน LINE เอง" |

**Poll:**
- ใช้ `setTimeout` วนต่อเมื่อคำขอก่อนเสร็จ (ไม่ซ้อน) เพื่อเลี่ยงเกิน rate limit GET 120/นาที/IP
- ออฟไลน์ / เกิด error → แสดง "เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่…" (ไม่ใช่ toast) และไม่หยุดนับถอยหลัง
- 404 → หยุด poll, toast "ไม่พบกลุ่มนี้" แล้วกลับ list
- แท็บกลับมา visible → GET ทันทีหนึ่งครั้ง

**ปุ่ม "สร้างโค้ด" กดได้เมื่อ** `selectedIds.length ∈ [1,10] && acknowledged && !busy` (`canCreateCode()` อยู่ใน `lib/bind-wizard-rules.ts` พร้อมเทส mutation)

**ShopPicker:**
- ข้อมูลมาจาก `listReportableShops` ซึ่ง **ตัดร้านล็อก/ลบออกแล้ว** จึงไม่มีแถว disabled-เพราะล็อกในหน้านี้ (ต่างจากหน้า detail)
- ร้านเดียว → ติ๊กไว้ให้เลย แต่ถอดได้ (ถอดแล้วปุ่มสร้างโค้ด disabled พร้อมบรรทัด "ต้องเลือกอย่างน้อย 1 ร้าน")
- ถ้าเลือกครบ 10 ร้าน ที่เหลือเป็น `disabled` + "เลือกได้สูงสุด 10 ร้าน"
- **ไม่มีร้านให้เลือกเลย** → แทนรายการด้วยข้อความ "ตอนนี้ไม่มีร้านที่เลือกได้ ร้านที่ถูกล็อกเพราะแพ็กเกจเลือกไม่ได้" และปุ่มสร้างโค้ด disabled
- ป้ายชนิดร้าน:
  - ใช้ `SHOP_VERTICALS` จาก `lib/lodging.ts` เป็นหลัก (`ขายออนไลน์` / `สินค้าและบริการ` / `บ้านพัก`)
  - `kind==='PERSONAL'` ใช้ "บัญชีส่วนตัว"
  - ห้ามประดิษฐ์คำ "ร้านบริการ/ร้านขายของ" ของ base spec ซ้ำ เพราะไม่ตรงศัพท์ SSOT (แก้ copy ใน §7)

### 4.2 Detail: mapping ทุก control → API

| Control | Request | Body / field | Debounce |
|---|---|---|---|
| form-switch รายวัน | PATCH `/groups/{id}` | `dailyEnabled` | 500 ms coalesce |
| form-switch รายเดือน | PATCH | `monthlyEnabled` (ปิดแล้ว server ล้าง `attachCycleToDaily` เอง → UI ใช้ค่าจาก response) | 500 ms |
| เพิ่มเวลา (`form-select` + "เพิ่มเวลา") | PATCH | `dailyTimes` = array เต็มชุดใหม่ (นาที 30..1440 ก้าว 30) | 500 ms |
| ลบเวลา (×) | PATCH | `dailyTimes` | 500 ms |
| วันตัดรอบ `form-select` | PATCH | `cutoffDay` (1..31 หรือ `null` = สิ้นเดือน) | 500 ms |
| ตัวอย่างช่วงวันตัดรอบ | — | อ่าน `group.cycle.{startIso,endIso,nextFireDate}` ผ่าน `formatDate` (ห้ามคำนวณซ้ำ) `cycle===null` = ซ่อนบรรทัด | — |
| checkbox ข้ามถ้าไม่มีรายการ | PATCH | `skipWhenNoOrders` | 500 ms |
| checkbox แนบยอดสะสม | PATCH | `attachCycleToDaily` (disabled เมื่อ `!monthlyEnabled`) | 500 ms |
| checkbox ตัวเลข ×4 | PATCH | `showOrders` `showSales` `showCancelled` `showTopProducts` | 500 ms |
| checkbox กำไร ปิด→เปิด | `pacesConfirm.warning` ก่อน → PATCH | `{showProfit:true, confirmProfit:true}` ใน **คำขอเดียว** | **ไม่ debounce** ยิงทันทีหลังยืนยัน |
| checkbox กำไร เปิด→ปิด | PATCH | `{showProfit:false}` | 500 ms |
| checkbox ร้าน | PUT `/groups/{id}/shops` | `{shopIds}` (ชุดเต็ม) → ใช้ `shops[]` จาก response | 800 ms |
| "ส่งทดสอบ" | POST `/groups/{id}/test` | ไม่มี body | ล็อกกดซ้ำด้วยสถานะ sending ไม่ใช่ debounce |
| `⋯` → "ยกเลิกการผูก" | `pacesConfirm.danger` → DELETE `/groups/{id}` | — | — |
| เปิดหน้า (alert ยังไม่ ack) | POST `/groups/{id}/ack` (fire-and-forget) | — | ครั้งเดียวตอน mount |

**ack ทำเมื่อเปิดหน้ากลุ่ม ไม่ใช่ปุ่มแยก:** การเปิดดูคือการรับทราบ จุดแดงที่ nav/แถวจึงหายตามกันโดยไม่เพิ่มภาระให้ผู้ใช้ `alertKind` ใน DB ยังอยู่ แบนเนอร์ของ presenter ซึ่งมาจาก `status` จึงไม่หาย (ถูกต้อง เพราะเหตุยังไม่แก้)

**ตัวควบคุมที่ disabled ตาม guard:**
- ลบเวลาสุดท้ายเมื่อ `dailyEnabled||monthlyEnabled` → ปุ่ม × ของตัวสุดท้ายเป็น `disabled` + helper "ต้องมีอย่างน้อย 1 เวลา ปิดรายวันถ้าไม่ต้องการส่ง"
- ตัวเลขสุดท้ายที่ติ๊กอยู่ disabled + "ต้องแสดงตัวเลขอย่างน้อย 1 รายการ"
- ร้านสุดท้ายที่ติ๊กอยู่ disabled + "ต้องเลือกอย่างน้อย 1 ร้าน"
- ทั้งหมดผ่าน `settings-guards.ts` · server ยังเป็นด่านจริง ส่วนนี้กันไม่ให้เจอ error จากปุ่มที่ไม่ควรกดได้

### 4.3 Presenter → UI (ห้ามคำนวณ boolean เอง)

adapter เดียว: `toPresenterGroup(dto) = { status: dto.status, allShopsLocked: dto.shops.length > 0 && dto.shops.every(s => s.state !== 'OK') }` ให้ใส่ใน `presenter.ts` เอง ไม่ใช่ใน component (ดู §9 ข้อ 5)

| จุดใน UI | เรียก | ผล |
|---|---|---|
| ป้ายสถานะ list/detail/action-bar | `groupBadge(pg, dto.paused)` | `label`, `icon`, `tone` ตรงกับตาราง base spec (BOUND/PENDING/BOT_REMOVED/PACKAGE_PAUSED) · `REMOVED` ไม่ถูกส่งมาที่ UI |
| แบนเนอร์บนสุดของ detail | `bannerFor(pg, dto.paused, shell, lockReason)` | `key` PACKAGE_PAUSED / BOT_REMOVED / ALL_SHOPS_LOCKED · `action` REBIND (ปุ่ม) หรือ LINK (`Link`) หรือ null (Android: ไม่มีปุ่ม/ลิงก์) |
| ปุ่ม "ส่งทดสอบ" enabled | `canTest(pg, dto.paused, dto.test.usedToday)` | |
| ตัวนับ "เหลือ N จาก 5" | `testsLeft(dto.test.usedToday)` + `TEST_SEND_DAILY_LIMIT` | ไม่ใช้ `test.limit` / `test.remaining` จาก DTO เพื่อมีความจริงเดียว |
| ฟอร์มทั้งหมด disabled | `!canEdit(pg, dto.paused)` | ปุ่ม `⋯` ยกเลิกการผูก **ไม่ผูกกับ canEdit** (ยกเลิกได้แม้แพ็กเกจหมด ตามมติ #11) |
| หน้า locked E1 (ปุ่ม) | `lockedCta(shell, access.reason)` | null = ไม่มีปุ่ม ไม่มีราคา ไม่มีลิงก์ |
| list เมื่อแพ็กเกจหมด (E2) | `groupBadge` ได้ PACKAGE_PAUSED ทุกแถวเอง + `bannerFor` สำหรับ banner เหนือการ์ด | ต้องสร้าง `pg` จาก `{status}` เปล่า (list ไม่มี shops) |

**ข้อความเหตุที่ปุ่มทดสอบ disabled** (เลือกข้อความเดียว ลำดับ: แพ็กเกจหยุด > ยังไม่ผูก > ร้านล็อกหมด > ครบโควตา):
- presenter คืนแค่ boolean แต่ UI ต้องเลือกประโยค จึงเสนอให้ Controller เพิ่ม `testBlockedReason()` ใน `presenter.ts` (§9 ข้อ 5)
- ถ้าไม่เพิ่ม developer เขียนลำดับนี้ในฟังก์ชันเดียวที่มีเทส และห้ามกระจายเป็น `if` ในหลาย component

### 4.4 Autosave (`useAutosave`)

ขีดจำกัดจริง: mutation ผ่าน `proxy.ts` 30 ครั้ง/นาที/IP และใช้ร่วมกับ mutation อื่นของ IP เดียวกัน

1. เก็บ patch ที่ยังไม่ส่งเป็น object (`pending`) การเปลี่ยนซ้ำของ key เดียวกันทับค่าเดิม
2. trailing debounce 500 ms (PUT shops 800 ms แยกคิวของตัวเอง)
3. **ส่งทีละคำขอ** ถ้ามีคำขอค้างอยู่ให้รอจนเสร็จแล้วค่อยส่ง `pending` ชุดใหม่ (ไม่ส่งขนาน)
4. `confirmProfit` ไม่ debounce และ**ต้องไปพร้อม `showProfit:true`** ในคำขอเดียวกัน
5. response 200: เอา `group` แทน state ยกเว้น key ที่ยังอยู่ใน `pending` (แสดงค่าของ client ที่ยังไม่ส่งทับ ไม่ให้ response ของคำขอเก่ากระโดดทับสิ่งที่ผู้ใช้เพิ่งกด)
6. ข้อผิดพลาด (ใช้ `message` ภาษาไทยจาก body ของ API ไม่ใช่ `error` ซึ่งเป็นรหัส):
   - 400 `INVALID_SETTINGS` → `pacesToast.error(message)` + revert ไปค่าล่าสุดที่ server ยืนยัน
   - 403 `PACKAGE_REQUIRED` → toast + `router.refresh()` (หน้าจะกลับมาเป็นสถานะ paused)
   - 404 → toast + กลับ list
   - 429 / ข้อผิดพลาดอื่น → revert + toast "บันทึกไม่สำเร็จ ค่ากลับเป็นเดิมแล้ว ลองอีกครั้ง"
7. ตัวบอกสถานะใต้ชื่อกลุ่ม (`aria-live="polite"`): `บันทึกอัตโนมัติ` → `กำลังบันทึก…` → `บันทึกแล้ว` (2 วิแล้วกลับ) สี neutral `text-default-700` **ไม่ใช้เขียว** (การบันทึกไม่ใช่การยืนยันตัวตน/ผลลัพธ์ที่ต้องมีสัญญาณ trust)

### 4.5 พรีวิว Flex

**ทางหลัก (ขอ Controller ยืนยัน §9 ข้อ 1):**

1. `buildSampleSummary({ shops, window, computedAtIso })` ใน `lib/preview-sample.ts` สร้าง `GroupSummary` จาก **ร้านจริงของกลุ่ม** (ชื่อ, vertical, `state` LOCKED/DELETED → `EXCLUDED` เพื่อให้ได้บรรทัด "ไม่รวมร้าน…" จริง) ใส่ตัวเลขตัวอย่างคงที่ ไม่แตะฐานข้อมูล ไม่เรียก service
2. `buildSummaryReportFlex({ summary, kind, showProfit: settings.showProfit, cycleToDate: settings.attachCycleToDaily ? … : undefined })` (ไม่เรียก `fitToLimits` ซึ่งต้องใช้ `Buffer`)
3. `FlexBubbleView` render `messages[0].contents` (โหนด `bubble > box > text/separator/button`) เป็น markup ด้วยตัวแปลงเล็ก ๆ:
   - `size xs/sm/md` → `text-xs/text-sm/text-md`
   - `weight bold` → `font-semibold`
   - `spacing/margin` → `gap-*`/`mt-*` จาก token
   - `layout horizontal` + `flex` → flex row
   - สี: ผ่าน `flex-preview-tokens.ts` เท่านั้น (ACCENT → `text-primary`, INK → `text-default-900`, SLATE → `text-default-700`, DANGER → `text-danger-ink`) · สีไม่รู้จัก → ink ห้าม inline style
   - `button` footer → ปุ่ม `btn bg-primary text-white` ที่ `aria-disabled` + `tabIndex={-1}` (ในพรีวิวไม่นำทางไปไหน)
4. ห่อด้วยกรอบ `bg-light rounded-lg p-3` + bubble `max-w-xs w-full bg-card` + caption "ตัวอย่าง ตัวเลขจริงมาจากข้อมูลของร้านที่เลือก" (ตามมติเดิม ติดป้าย "ตัวอย่าง" เสมอ)
5. **`computedAt` ต้องมาจาก server** (`serverNowIso` เป็น prop) ห้ามเรียก `new Date()` ตอน render ไม่งั้น hydration mismatch (บรรทัด "ข้อมูล ณ HH:MM น.")
6. คำเรียกใบ (`ORDER_VOCAB.nounShort`) ถูกผันมาจาก builder เองอยู่แล้ว ไม่ต้องทำที่พรีวิว

**ตรวจก่อน build:** ไฟล์ที่ builder import (`aggregate` → `finance-rules`, `format-date`, `format-money`, `lodging`, `seller-menu` แบบ type-import) น่าจะ client-safe ยืนยันด้วย `npm run build` ก่อน commit ถ้าติด server-only ให้ใช้ fallback

**Fallback (ถ้า Controller ไม่เห็นชอบ renderer):** ใช้ JSX static ของ bubble ตัวอย่างหนึ่งชุดด้วย token Paces แปะป้าย "ตัวอย่าง" ตามที่ผู้ใช้กำหนด · ความเสี่ยง: ข้อความ/โครงที่แก้ใน `flex-summary-report.ts` แล้วพรีวิวไม่ตาม (HR16) จึงต้องมีเทส snapshot คุมคู่กัน

**Seg รายวัน/รายเดือน:** ตัวที่ปิดอยู่เป็น `disabled` (ตามเดิม) · `kind='MONTHLY'` ใช้ `group.cycle.startIso/endIso` ถ้า `cycle===null` seg ตัวนั้น disabled

---

## 5. E4: ทางเข้า, จุดแจ้งเตือน, props ของ layout

### 5.1 `ShopQuickLinks.tsx`

```ts
interface ShopQuickLinksProps {
  shopKind: ...; shopRole: ...; hidePayments: boolean; offerIap: boolean
  /** null = ซ่อนแถว (ผู้ใช้ไม่ใช่ owner / ไม่ได้ login) · hasAlert = มีกลุ่มที่ alert ยังไม่ ack
   *  🛑 ไม่มี default — ผู้เรียกที่ลืมส่งคือบั๊กเงียบแบบเดียวกับ hidePayments (ดูคอมเมนต์เดิมของไฟล์) */
  lineReports: { hasAlert: boolean } | null
}
```

- แถวใหม่ใน `LINES` ตามโครง `QuickLink` เดิม: `{ url: '/business/line-reports', label: 'รายงานเข้ากลุ่ม LINE', icon: 'brand-line', hint: 'สรุปยอดเข้ากลุ่ม LINE ของทีม' }` (label/icon/url ต้องตรง `seller-menu.ts:205` เป๊ะ เป็นข้อบังคับของไฟล์นี้อยู่แล้ว)
- ตำแหน่ง: ต่อจาก "แพ็กเกจของฉัน" ก่อน "การจัดส่ง" (เรื่องเดียวกัน คือ ของที่มากับแพ็กเกจธุรกิจ)
- **ไม่ใส่ใน `PAYMENT_LINK_URLS` / `IAP_LINK_URLS`** เพราะแถวนี้ไม่มีทางจ่ายเงิน (ถูกกฎ 3.1.1 ทุกเชลล์ ตามคอมเมนต์ใน `applyLineReportMenu`) ต้อง append แบบมีเงื่อนไข `lineReports !== null` ไม่ใช้การกรองด้วย Set เดิม
- จุดแดง: `<span class="bg-danger size-2.5 rounded-full">` คั่นระหว่างข้อความและ chevron + `<span class="sr-only">มีกลุ่มที่ต้องดูแล</span>` (เมื่อ `hasAlert`) ไม่มีตัวเลข (ตัวเลขกลุ่มแยกไม่ได้ในระดับแถว)

### 5.2 จุดแจ้งเตือนที่ bottom nav

- `SellerBottomNav` เพิ่ม prop บังคับ `shopAlert: boolean`
- ที่ช่อง "ร้านค้า" (`/shop`): เพิ่ม `relative` + dot (copy markup badge "คำสั่งซื้อ" ในไฟล์เดียวกัน: ตำแหน่ง `absolute top-[-2px] left-[calc(50%+8px)]` + ring ขาว `shadow-[0_0_0_2px_white]` พร้อม comment carve-out เดิม ขนาดลดเหลือ `size-2.5` ไม่มีเลข ไม่เพิ่ม arbitrary value ชนิดใหม่)
- `aria-label` ของ Link ต่อท้ายด้วยข้อความ aria จาก dictionary (รูปแบบเดียวกับ `navUnreadAria` ของช่อง "แชท") ค่าไทย: "มีรายงานเข้ากลุ่ม LINE ที่ต้องดูแล" · en: "A LINE report group needs attention"
- `(dashboard)/layout.tsx`: คำนวณแบบเดียวกับ `pendingCount`/`unreadChatCount` (try/catch fail-closed → `false`): `shopAlert = (await countUnackedAlerts(user.id)) > 0`
  - ใช้ `user.id` ของ session ไม่ใช่ `shop.userId` (กลุ่มรายงานผูกกับ **User** ตามคอมเมนต์ `applyLineReportMenu`)
  - เป็น query ที่ทุกหน้า seller จ่าย จึง "วัดก่อนแก้": ตรวจว่า `LineReportGroup` มี index ที่ครอบ `ownerId`+`alertKind` ก่อน merge ถ้าไม่มีให้บอก Controller (§9 ข้อ 6)
- ไม่ผูก `hidePayments` (ไม่มีช่องทางจ่ายเงินในจุดแจ้งเตือน)

### 5.3 แถวเว็บใต้ `QuotaUsageCard` (web-only)

เหตุผล: `business/page.tsx:65` เด้งออกทุกเชลล์ที่ซ่อนการจ่ายเงิน ในแอปจึงไม่มีทางมาถึงหน้านี้ ทางเข้าบนมือถือ/แอปคือ `ShopQuickLinks` ส่วนแถวนี้เป็นของคนที่อยู่ในหน้าแพ็กเกจบนเว็บและเห็นว่าแพ็กเกจแถมอะไรบ้าง · บนเดสก์ท็อป sidebar มีเมนูอยู่แล้ว (`seller-menu.ts:205`) แถวนี้จึงเป็นทางลัดรอง ไม่ใช่ทางเข้าเดียว

- `LineReportsEntryRow.tsx` (RSC): `.card` ใบเดียว body เดียว ลิงก์ทั้งแถว `min-h-11`: ไอคอน `brand-line` ใน `bg-light size-10 rounded-lg` → ชื่อ "รายงานเข้ากลุ่ม LINE" + hint "ส่งสรุปยอดของทีมเข้ากลุ่ม LINE ตามเวลาที่ตั้งไว้" → (ถ้ามี alert) `badge bg-danger/15 text-danger-ink` "N กลุ่มต้องดูแล" → `chevron-right`
- ข้อมูล: owner เท่านั้น (`resolveReportAccess().kind` ไม่ใช่ ANON/NOT_OWNER) + `countUnackedAlerts` · **ตัดจำนวนกลุ่ม** (`· 3 กลุ่ม` ใน base spec) เพราะต้องยิง query เพิ่มเพื่อค่าตกแต่ง และจำนวนอยู่ในหน้า list อยู่แล้ว (ลดข้อมูลซ้ำ)
- วางต่อจาก `<QuotaUsageCard … />` ก่อน `<PackageTierGrid />`

---

## 6. คำเรียกใบ ("ออเดอร์") ทั้งระบบ UI

| จุด | วิธี |
|---|---|
| พรีวิว Flex | builder ผันให้เองจาก `reportOrderWord` ภายใน |
| label checkbox "จำนวน…" ใน MetricsCard | `จำนวน${orderWordFor(group.shops).word}` |
| helper ของ "ไม่ส่งถ้าไม่มี…" | `ถ้าช่วงนั้นไม่มี${word}เลย ระบบจะข้ามและบันทึกในประวัติว่าข้าม` |
| Empty / Locked E1 | ใช้คำกลาง "รายการ" ตายตัวได้ เพราะยังไม่มีร้านที่เลือก และห้ามเขียน "ออเดอร์" |
| Toast / history | ใช้ `reasonLabel` จาก API ซึ่งเป็น SSOT อยู่แล้ว (`NO_ORDERS` → "ไม่มีรายการในช่วงนั้น") ห้าม remap ใน UI |

`orderWordFor(shops)` ใน `lib/order-word.ts`: map `GroupShopDto` → รูป `{shop:{vertical}, state}` (`state: s.state==='OK' ? 'OK' : 'EXCLUDED'`) แล้วเรียก `reportOrderWord` ซึ่งเป็นเจ้าของตรรกะ ห้ามนับ vertical เองซ้ำ · ร้านไม่ OK ทั้งหมดจะ fallback เป็น vertical ของทุกร้านตามที่ helper ทำอยู่ ไม่ต้องจัดการซ้ำ

---

## 7. Copy deltas (เทียบ base spec)

| จุด | เดิม | ใหม่ | เหตุ |
|---|---|---|---|
| สัญลักษณ์โค้ด | `K7M2-XQ4P` (ตัวอย่างเท่านั้น) | แสดงตาม API (`XXXX-XXXX`) · ค่าที่คัดลอก = `ผูก K7M2-XQ4P` | #1 |
| ปุ่มคัดลอก | "คัดลอก" / toast "คัดลอกข้อความแล้ว" | **"คัดลอกข้อความ"** / toast คงเดิม | ปุ่มบอกสิ่งที่ได้จริง (คัดลอกทั้งประโยค ไม่ใช่แค่โค้ด) |
| helper ใต้กล่องโค้ด | — | "ในโค้ดไม่มีตัวอักษร O, I, L — 0 และ 1 คือตัวเลข พิมพ์ตัวเล็กหรือตัวใหญ่ก็ได้" | ผู้ใช้ที่พิมพ์เองไม่ต้องเดา (alphabet Crockford + `normalizeBindCode` รับตัวเล็ก) |
| ขั้น 2 หัวข้อ | "สร้างโค้ดผูกกลุ่ม" | **"เลือกร้านและสร้างโค้ดผูกกลุ่ม"** | รวมตัวเลือกร้าน |
| คำอธิบายเลือกร้าน | — | "เลือก 1 ร้านเป็นรายงานของสาขา เลือกหลายร้านเป็นรายงานรวมพร้อมแยกรายร้าน" · "เลือกแล้ว N จาก M ร้าน" · "เลือกได้สูงสุด 10 ร้าน" · "ต้องเลือกอย่างน้อย 1 ร้าน" | |
| ไม่มีร้านให้เลือก | — | "ตอนนี้ไม่มีร้านที่เลือกได้ ร้านที่ถูกล็อกเพราะแพ็กเกจเลือกไม่ได้" | |
| ป้ายชนิดร้านในรายการ | "ร้านบริการ / ร้านขายของ / ร้านส่วนตัว" | ชื่อ vertical ตาม `SHOP_VERTICALS` ("ขายออนไลน์" / "สินค้าและบริการ" / "บ้านพัก") + "บัญชีส่วนตัว" เมื่อ `kind==='PERSONAL'` | ตรง SSOT ของศัพท์ vertical |
| ขั้น 1 บรรทัดเพิ่ม | — | "กลุ่มหนึ่งมี OA ได้ตัวเดียว — ถ้ามี OA อื่น (เช่น OA ของร้าน) ในกลุ่ม ให้นำออกก่อน" | #2 (ใช้คำตามที่ผู้ใช้กำหนด ไม่ปรับ) |
| บรรทัดสรุปร้านหลังสร้างโค้ด | — | "ร้านที่รวม: {ชื่อ} และอีก {n} ร้าน" · "เปลี่ยนร้านได้หลังผูกเสร็จ" | |
| PENDING เปิดซ้ำ | "…แสดงโค้ดเดิม" (ขัดกับ hash) | "โค้ดที่สร้างไว้แสดงซ้ำไม่ได้" · "โค้ดเดิมยังใช้ได้อีก mm:ss" / "โค้ดเดิมหมดอายุแล้ว" · ปุ่ม "สร้างโค้ดใหม่" | #2 |
| ไม่มี OA/ไม่มี `addFriendUrl` | — | "ยังไม่มีลิงก์เพิ่มเพื่อนของบอท ค้นหา Deep รายงานยอด ใน LINE เอง" | `addFriendUrl: null` ต้องมีทางออก |
| Empty หัวคำอธิบาย | "…รายงานยอดสรุปออเดอร์เข้ากลุ่ม LINE…" | "ให้บอท Deep รายงานสรุปยอดของร้านเข้ากลุ่ม LINE ของทีมคุณทุกวันหรือทุกเดือน ไม่ต้องเปิดแอปดูทีละร้าน" | #5 |
| MetricsCard "จำนวนออเดอร์" | "จำนวนออเดอร์" | `จำนวน{word}` (เช่น "จำนวนคำสั่งซื้อ" / "จำนวนบริการ" / "จำนวนรายการ") | #5 |
| ข้ามถ้าไม่มี… helper | "ถ้าช่วงนั้นไม่มีออเดอร์เลย…" | `ถ้าช่วงนั้นไม่มี{word}เลย…` | #5 |
| ปุ่มทดสอบ disabled (ร้านล็อกหมด) | — | "ทุกร้านในกลุ่มนี้ถูกล็อกหรือถูกลบ รายงานจึงยังไม่ถูกส่ง" (ตรง `NO_SENDABLE_SHOPS`) | ใช้ข้อความ API เดียวกัน |
| ประวัติ: ชนิด | รายวัน/รายเดือน/ทดสอบ/คำสั่งในกลุ่ม | + `FINAL_NOTICE` = "แจ้งหยุดส่ง" | `ReportKind` มี `FINAL_NOTICE` |
| ประวัติ: ผล | สำเร็จ/ไม่สำเร็จ/ข้าม | `SENT` สำเร็จ · `FAILED`/`REPLY_FAILED` ไม่สำเร็จ (danger) · `SKIPPED_NO_ORDERS` ข้าม · `MISSED` "พลาดรอบ" (neutral) · `RETRY_PENDING` "รอลองใหม่" (warning) · `CLAIMED` "กำลังส่ง" · `NO_SENDABLE_SHOPS` "ร้านถูกล็อก" (warning) | enum จริงมี 8 ค่า |
| ประวัติ: สาเหตุ | สาเหตุรายตัว | แสดง `reasonLabel` จาก API ตรง ๆ | SSOT เดียว |
| แถว `/business` | "สรุปยอดเข้ากลุ่มของทีม · 3 กลุ่ม" | "ส่งสรุปยอดของทีมเข้ากลุ่ม LINE ตามเวลาที่ตั้งไว้" + badge `N กลุ่มต้องดูแล` เมื่อมี alert | ตัด query เพื่อตัวเลขตกแต่ง |
| แถว ShopQuickLinks hint | — | "สรุปยอดเข้ากลุ่ม LINE ของทีม" | |
| ตัวบอกบันทึก | "บันทึกอัตโนมัติ" | + "กำลังบันทึก…" / "บันทึกแล้ว" | #7 |
| error autosave 429 | — | "ส่งคำขอถี่เกินไป ลองใหม่ภายหลัง" (จาก `message` ของ API) | |
| จุดแจ้งเตือน nav | "จุดแดงบนแท็บ ธุรกิจ" | จุดแดงบนแท็บ **"ร้านค้า"** | #3 |

---

## 8. State table

| State | list | wizard | detail |
|---|---|---|---|
| โหลดครั้งแรก | `loading.tsx` skeleton สูงเท่าแถวจริง ≥3 แถว | RSC ไม่มี loading (ข้อมูลมากับ page) · ปุ่มสร้างโค้ดขณะ POST: spinner + disabled | skeleton ฟอร์ม + พรีวิว |
| โหลดล้ม | `(paces)/error.tsx` ที่มีอยู่แล้ว (`alert-triangle` + "ลองอีกครั้ง") ปรับข้อความหัวเป็น "โหลดรายการกลุ่มไม่สำเร็จ" ถ้า Controller อนุญาตเขียน `error.tsx` ระดับ `LR/` | POST ล้ม → toast `message` จาก API + ปุ่มเดิมกดซ้ำได้ | เช่นเดียวกัน |
| ไม่มีกลุ่ม (PAID) | Empty (base §B) | — | — |
| ไม่เคยมีแพ็กเกจ (LOCKED, ไม่มีกลุ่ม) | E1 + CTA จาก `lockedCta` | `/new` → guard เด้งไป list | `notFound()` ไม่ได้ เพราะไม่มีกลุ่ม |
| แพ็กเกจไม่ active แต่มีกลุ่ม (E2) | แบนเนอร์ `bannerFor` เหนือการ์ด + ทุกแถว `PACKAGE_PAUSED` · ปุ่ม "เพิ่มกลุ่ม" disabled (`canCreate=false`) + บรรทัดอธิบาย | resume/rebind: ปุ่ม "สร้างโค้ด" disabled เพราะ API 403 (ไม่ซ่อน แสดงเหตุ) | อ่านได้แก้ไม่ได้ · "ยกเลิกการผูก" ใช้ได้ |
| ครบ 10 กลุ่ม | ปุ่มเพิ่ม disabled + "ครบ 10 กลุ่มแล้ว ยกเลิกการผูกกลุ่มที่ไม่ได้ใช้ก่อน แล้วค่อยเพิ่มกลุ่มใหม่" | `/new` เด้งกลับ list พร้อมบรรทัดเดียวกัน | — |
| บอทยังไม่ตั้งค่า (`botReady=false`) | ปุ่มเพิ่ม disabled + "ฟีเจอร์ยังไม่พร้อมใช้งาน" (`BOT_NOT_CONFIGURED`) | — | — |
| สถานะ PENDING / โค้ดวิ่ง | แถว "รอผูก · โค้ดใช้ได้อีก mm:ss" | กล่องโค้ด + นับถอยหลัง + poll | = wizard resume |
| โค้ดหมดอายุ | "รอผูก · โค้ดหมดอายุ ต้องสร้างโค้ดใหม่" | กล่อง `bg-default-100` + ปุ่มสร้างโค้ดใหม่ · หยุด poll | = wizard |
| ออฟไลน์ระหว่าง poll | — | "เชื่อมต่อไม่ได้ชั่วคราว กำลังลองใหม่…" นับถอยหลังไม่หยุด | |
| ผูกสำเร็จ | แถวเปลี่ยนเป็น "ผูกแล้ว" | แบนเนอร์ success + ปุ่มไปตั้งค่า | แสดงแบนเนอร์ info "ตอนนี้ยังไม่ได้เปิดรายงานอัตโนมัติ…" ตาม base spec จนกว่าจะเปิดรายวัน/รายเดือน |
| BOT_REMOVED (`INACTIVE`) | ป้าย danger + "ผูกใหม่" (ปุ่มพี่น้องของ anchor) | rebind | แบนเนอร์ danger + `REBIND` · ส่งทดสอบ disabled "ส่งทดสอบไม่ได้จนกว่ากลุ่มจะผูกใหม่" |
| ทุกร้านถูกล็อก | — | — | แบนเนอร์ warning (`ALL_SHOPS_LOCKED`) · ทดสอบ disabled |
| ส่งทดสอบ: กำลังส่ง | — | — | ปุ่มเป็น spinner (`loader-2` + `animate-spin`) disabled · เสร็จ → GET `/groups/{id}` เปลี่ยน `test` + `deliveries` |
| ส่งทดสอบ: ครบโควตา | — | — | disabled + "ครบ 5 ครั้งวันนี้แล้ว ส่งทดสอบได้อีกครั้งพรุ่งนี้" (กับ API `TEST_QUOTA_EXCEEDED` ข้อความเดียวกัน) |
| ส่งทดสอบล้ม | — | — | toast ด้วย `message` ของ API · `BOT_NOT_IN_GROUP` → `router.refresh()` |
| Autosave ล้ม | — | — | revert + toast (§4.4) |
| ชื่อกลุ่ม/ร้านยาวมาก (52+ ตัว) | `truncate` + `title=` | `break-words` ในรายการร้าน | `break-words` ทั้งหัวกลุ่มและพรีวิว |
| ตัวเลข 0 / หลักล้าน | แถวตัวเลขไม่อยู่ใน list | — | พรีวิวใช้ `tabular-nums` ผ่าน builder (`formatBaht`) · 0 → ข้อความของ builder เอง "ไม่มีรายการในช่วงนี้" (ไม่ต้องเขียนซ้ำ) |
| ประวัติว่าง | — | — | "ยังไม่เคยส่งรายงานให้กลุ่มนี้" |
| NOT_OWNER / ANON | `notFound()` / redirect | เหมือนกัน | เหมือนกัน |

---

## 9. ไม่พบ theme match และข้อที่ต้องให้ Controller ตัดสิน

| # | เรื่อง | closest primitive | ข้อเสนอ |
|---|---|---|---|
| 1 | **FlexBubbleView** (Flex JSON → markup) | `.card` + utility ข้อความของ Paces | อนุมัติ renderer เล็ก ๆ (~60 บรรทัด, ไม่มี arbitrary value, สีผ่าน `flex-preview-tokens.ts`) เพื่อให้พรีวิว **ตรงกับของจริงที่ builder ส่ง** · ถ้าไม่อนุมัติ → fallback static (§4.5) พร้อมเทส snapshot คุมคู่ |
| 2 | รายการ 3 ขั้น | `Steps.tsx` ของธีม (แนวคิดเท่านั้น) | ตามที่ base spec ตัดสินแล้ว (แพตเทิร์น `LineConnectWizard`) ยืนยันซ้ำ |
| 3 | กล่องโค้ด + นับถอยหลัง | `bg-light rounded-lg p-4` + `.badge` | ธีมไม่มีของแสดงโค้ดที่คัดลอกได้ · ใช้ primitive ที่มีจริงทั้งหมด ไม่มีค่าดิบ |
| 4 | Seg รายวัน/รายเดือน | `OrderAgentClient` radiogroup | ตามเดิม |
| 5 | **presenter เพิ่ม 2 ตัว** | — | (ก) `toPresenterGroup(dto)` (ข) `testBlockedReason(pg, paused, testsToday)` เพื่อไม่ให้ลำดับเหตุกระจายใน component · ถ้าไม่เพิ่ม developer เขียนเป็นฟังก์ชันเดียวมีเทสไว้ใน `lib/line-report/` |
| 6 | query ที่ layout (`countUnackedAlerts`) ทุกหน้า seller | — | วัดก่อนแก้ ตรวจ index `ownerId`+`alertKind`; ถ้าต้นทุนสูงให้ส่ง boolean ผ่าน cache/`unstable_cache` สั้น ๆ |
| 7 | `reportOrderWord` รับ `ShopSummary[]` เต็ม | — | ขอให้ Controller อนุญาตเปลี่ยนชนิด param เป็น `readonly Pick<ShopSummary,'shop'\|'state'>[]` (superset ของเดิม ไม่เปลี่ยนพฤติกรรม) แทนที่ UI จะสร้างอ็อบเจกต์ปลอม |
| 8 | `CopyLinkButton` เมื่อคัดลอกสำเร็จเปลี่ยนเป็น `border-success text-success` 1.2 วิ | — | "คัดลอกแล้ว" ไม่ใช่ "ยืนยันตัวตน" ขัด Verified-Means-Green เล็กน้อย แต่เป็นคอมโพเนนต์ที่ใช้ร่วมกันทั้งหลังบ้าน · ไม่แก้ในงานนี้ บันทึกไว้ให้ critique |
| 9 | mockup ล้าสมัย | — | ต้องแก้หน้า A/C/V ของ mockup ให้ตรง §0 (HR "mockup ขัดมติต้องแก้รอบเดียวกัน") |

ไม่ต้องรออนุมัติก่อน: ถ้าข้อ 5/7 ไม่ผ่าน ให้ทำตาม fallback ที่ระบุในแถวนั้น

---

### Impeccable compliance

- **Mode: Operate** (ต่อจาก base spec) · ยึด consistency กับหน้าพี่น้อง (`QuotaUsageCard`, `LineChannelCard`, `OrderAgentClient`, `ShopQuickLinks`) มากกว่าการแสดงออก แบรนด์อยู่ในรายละเอียด: เส้นประของ card-header, `-ink` บนพื้น `/15`, คำไทยที่บอกผลลัพธ์
- **พระเอกของแต่ละจอที่แก้:**
  - `/new` = กล่องโค้ด `ผูก K7M2-XQ4P` (ตัวเดียวใน `text-2xl font-semibold` ทั้งหน้า) · ส่วนก่อนสร้างโค้ดพระเอกคือปุ่ม primary "สร้างโค้ด"
  - resume = ปุ่ม "สร้างโค้ดใหม่"
  - detail = พรีวิวข้อความ (ไม่เปลี่ยน)
  - ShopQuickLinks = ไม่มีพระเอก (เป็นรายการเรียบ) จุดแดงเป็นสิ่งเดียวที่เรียกสายตา
- **One Voice:** น้ำเงิน `bg-primary` ใช้เฉพาะปุ่ม primary 1 ตัวต่อหน้า, วงกลมขั้นปัจจุบัน, ลิงก์, switch/checkbox ที่ติ๊ก, chip เวลา · ไม่มีพื้นน้ำเงินเต็มบล็อก · พรีวิวใช้ `text-primary` เฉพาะหัวบับเบิล/ป้ายวันที่ตามสีที่ builder ส่ง (ACCENT)
- **Verified-Means-Green:**
  - เขียวเฉพาะ: "ผูกแล้ว" (presenter tone success), "ส่งสำเร็จ", แบนเนอร์ผูกสำเร็จ
  - รอผูก, นับถอยหลัง, หยุดเพราะแพ็กเกจ, ติ๊กรับทราบที่ยังไม่ครบ, `RETRY_PENDING` = warning
  - `SKIPPED_NO_ORDERS`/`MISSED`/`CLAIMED` = neutral
  - ตัวบอก "บันทึกแล้ว" ของ autosave = neutral (ไม่ใช่เขียว)
  - แดงเฉพาะ: บอทถูกนำออก, ส่งล้มจริง, จุดแจ้งเตือน (ทุก alert kind หมายถึงรายงานไม่ถึงกลุ่มจริง)
  - 🛑 จุดเสี่ยง critique: `CopyLinkButton` เป็นเขียว 1.2 วิ ตอนคัดลอกสำเร็จ (§9 ข้อ 8)
- **Sentence-case:** ไม่มี ALL CAPS · โค้ด `K7M2-XQ4P` เป็นตัวพิมพ์ใหญ่โดยลักษณะข้อมูล (Crockford) ไม่ใช่การบังคับ `uppercase` กับข้อความไทย ไม่ใส่ `uppercase` class
- **เงาผสมหมึก:** ไม่เพิ่มเงาใหม่ · จุดแดงใช้ ring ขาวของ badge เดิมใน `SellerBottomNav` (carve-out เดิมของไฟล์)
- **Anuphan เท่านั้น:** กล่องโค้ดใช้ Anuphan + `tabular-nums` + `tracking-wide` 🛑 **ห้าม `font-mono`** และห้ามส่ง `showPreview` ให้ `CopyLinkButton`
- **Impeccable vs theme ขัดกัน:**
  - `LockedStateBanner` ใช้ `text-danger` บน `bg-danger/10` (ตก contrast ตามที่ DESIGN.md วางกฎ `-ink`) → ตัดสินใช้ `-ink` ใน `GroupBanner` ใหม่ ไม่ลอก
  - `QuotaUsageCard` ใช้ `text-default-400` สำหรับข้อความรอง → ใช้ `text-default-700` แทน (4.5:1)
  - `CopyLinkButton.showPreview` มี `font-mono` → ไม่ใช้
- **HR7 (ไม่มี arbitrary):** ทั้งหมดใช้ `text-xs/sm/md/2xl`, `size-2.5/10/11`, `gap-*`, `rounded-lg`, `bg-{semantic}/15`, `-ink` ยกเว้นจุดแดงที่ nav ซึ่ง **ใช้ carve-out เดิมของไฟล์** (`top-[-2px] left-[calc(50%+8px)]`, `shadow-[0_0_0_2px_white]`) ต้องคัดลอก comment กำกับบรรทัดเดียวกันมาด้วย ไม่มีค่าใหม่
- **สี LINE:** ไม่ใช้เขียว LINE เป็นพื้น/ปุ่ม ใช้โลโก้ `/images/logos/line.svg` และไอคอน `brand-line` (สี neutral)
- **น้ำเสียง:** ปุ่ม/ข้อความบอกผลลัพธ์ ("คัดลอกข้อความ", "สร้างโค้ดใหม่") · error บอกทางออก ("ครบ 10 กลุ่มแล้ว ยกเลิกการผูกกลุ่มที่ไม่ได้ใช้ก่อน…") · ไม่มี "ไม่สามารถ…ได้" · ไม่ไฮป์
- **ความเสี่ยงให้ Controller เพ่งตอน `/impeccable critique`:** (ก) กล่องโค้ดบน 320px และซูม 200% (ข) การ์ดขั้น 2 ที่รวมรายการร้าน + รับทราบ + ปุ่ม + กล่องโค้ดไว้ใน `<li>` เดียว ถ้าแน่นเกินให้แยกรายการร้านเป็นขั้นของมันเอง (ค) preview ซ้อนกรอบ (ยอมรับแล้วใน base spec) (ง) ถ้า detector คืน 0 findings แต่หน้ายังดูจาง ให้ตรวจว่ามีที่ใช้ accent จริงตามรายการ "พระเอก" ข้างบนหรือไม่ (บทเรียน auto-reply 25/40)

### Anti-slop self-check

1. **ใช้กับสินค้าอื่นได้ทันทีไหม:** ไม่ได้ · เฉพาะ Deep: ผูกกลุ่มด้วยโค้ดที่พิมพ์ในกลุ่ม LINE และ hash ทำให้แสดงซ้ำไม่ได้, ติ๊กรับทราบเรื่อง "ลบข้อความที่ส่งไปแล้วไม่ได้", คำเรียกใบผันตาม vertical (`reportOrderWord`), เหตุที่ OA หนึ่งกลุ่มอยู่ได้ตัวเดียว, กำไรต้อง confirm เพราะทุกคนในกลุ่มเห็น, ลิงก์ล็อกที่เปลี่ยนตามเชลล์ App Store
2. **เด่นสุด 1 อย่างต่อหน้าจอ:** ระบุแล้วต่อจอใน Impeccable compliance (กล่องโค้ด / ปุ่มสร้างโค้ดใหม่ / พรีวิว) · ShopQuickLinks ไม่มีพระเอกโดยตั้งใจ มีแต่จุดแดงที่เดียว
3. **element ซ้ำหรือค่าคงที่:** ตัด `· 3 กลุ่ม` จากแถว `/business` (ซ้ำกับหน้า list + ต้องยิง query เพิ่ม) · ไม่ใช้ `test.limit/remaining` จาก DTO (ซ้ำกับ presenter) · ไม่มีการ์ดสรุปสถานะ (ตัดแล้วใน base spec) · ไม่มีขั้นที่ 4 แยกสำหรับเลือกร้าน
4. **state ครบไหม:** §8 ครอบ empty / loading / error / locked (E1,E2) / ครบ 10 / bot ไม่พร้อม / PENDING / หมดอายุ / ออฟไลน์ / BOT_REMOVED / ร้านล็อกหมด / ส่งทดสอบ 3 แบบ / autosave ล้ม / ชื่อยาว 52+ ตัว / 0 และหลักล้าน (ผ่าน builder) / ประวัติว่าง
5. **copy ตรงกับสิ่งที่ระบบทำได้จริง:** ปุ่ม "คัดลอกข้อความ" เพราะคัดลอกทั้งประโยค · ไม่แนะนำให้ "ดูโค้ดเดิม" ในสถานะที่ไม่มีปุ่มนั้น (PENDING เปิดซ้ำแสดงปุ่มสร้างใหม่แทน) · ไม่แนะนำให้ซื้อแพ็กเกจใน Android (presenter คืน null → ไม่มีปุ่ม) · ข้อความทดสอบ disabled ตามเหตุจริงตัวเดียว
6. **ศัพท์เดียวกัน:** "กลุ่ม" = กลุ่ม LINE ที่ผูก · "ร้านที่รวม" = ร้านที่กลุ่มเห็น · "ผูกใหม่" = rebind บน `INACTIVE` เท่านั้น ส่วน "สร้างโค้ดใหม่" = regenerate โค้ดบน PENDING · "ออเดอร์" ไม่ปรากฏเป็นคำตายตัวเลย ใช้ `reportOrderWord` · ชนิดร้านใช้ `SHOP_VERTICALS` ของโปรเจกต์ ไม่ตั้งคำใหม่
7. **สีสื่อความหมายถูกไหม:** ดูหัวข้อ Verified-Means-Green ข้างบน · สถานะเดียวกันได้สีเดียวกันทุกที่เพราะทุกจุดมาจาก `groupBadge` ตัวเดียว
8. **แตะได้บนมือถือ:** แถว anchor `min-h-11` · ปุ่ม "ผูกใหม่", "สร้างโค้ด", "คัดลอกข้อความ" เป็น `.btn` ที่ safepay-overrides ยก 44px บน <1024 · chip × ใช้ `size-11 lg:size-N` · checkbox/switch ยกโดย override เดียวกัน · action หลักอยู่ใน action-bar (ตามกติกา seller-action-placement) ไม่ลอย · ปุ่ม "สร้างโค้ด" อยู่ท้ายขั้น 2 ในสายนิ้วโป้ง
9. **จอ 1440 ไหนว่าง:** wizard `max-w-3xl` ชิดซ้าย (ไม่เติมการ์ดตกแต่งข้าง ตามมติ base spec) · detail ใช้ `lg:grid-cols-5` (3:2) ที่เนื้อหาจริงอยู่ซ้าย พรีวิว sticky ขวา · list เป็นแถวเต็มกว้าง ไม่มีคอลัมน์ว่างเปล่า · แถว `/business` เป็น card เดียวกว้างเท่า `QuotaUsageCard` ไม่มีที่ว่างเหลือ

---

**ไฟล์ที่เกี่ยวข้อง (absolute):**
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/docs/superpowers/specs/2026-10-05-line-group-summary-report-design.md`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/docs/superpowers/specs/2026-10-05-line-group-summary-report-mockup.html`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/docs/20 - Features/00068 - LINE Group Summary Report/API.md`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/lib/line-report/presenter.ts`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/lib/line/flex-summary-report.ts`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(dashboard)/_shared/SellerBottomNav.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(dashboard)/layout.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(dashboard)/shop/page.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(dashboard)/business/page.tsx`
- `/Users/craftman/orca/workspaces/safepay/Line-Group-Summary-Reports/src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx`

## 10. มติ Controller ต่อ §9 (2026-10-05)
| # | มติ |
|---|---|
| 1 | อนุมัติ FlexBubbleView (renderer จาก Flex JSON จริงของ buildSummaryReportFlex) — สีผ่าน flex-preview-tokens.ts · ต้องยืนยัน client-safe ด้วย build ก่อน commit ถ้าไม่ผ่านใช้ fallback static + snapshot |
| 2,3,4 | ยืนยันตาม addendum |
| 5 | อนุมัติเพิ่ม toPresenterGroup(dto) และ testBlockedReason(pg, paused, testsToday) ใน presenter.ts พร้อมเทส |
| 6 | dev ตรวจ index ownerId+alertKind ของ LineReportGroup ก่อน — ถ้าไม่มี รายงาน Controller (ห้ามแก้ schema เอง) |
| 7 | อนุมัติขยาย param ของ reportOrderWord เป็น readonly Pick<ShopSummary,'shop'|'state'>[] |
| 8 | ไม่แก้ CopyLinkButton ในงานนี้ |
| 9 | Controller สั่งแก้ mockup หน้า A/C/V ในรอบเดียวกัน |
