# Design Spec — ความทนของการเชื่อมต่อ LINE (00025-ext Connection Health)

> ผู้ออกแบบ: `safepay-ux` (HR8 gate) 2026-08-12 · Mode: **Operate**
> Requirement: `docs/20 - Features/00025 - LINE OA Chat Integration/EXTENSIONS-2026-08-12-connection-health.md`
> ม็อกอัพ: `2026-08-12-line-connection-health-mockup.html`

---

## 0. มติของ Controller ต่อ Open Questions ของ ux (ตัดสินแล้ว — developer ยึดตามนี้)

| # | คำถามของ ux | มติ | เหตุผล |
|---|---|---|---|
| OQ-1 | S3 (บล็อกช่องพิมพ์) ขยายไป Messenger/IG ด้วยไหม | **จำกัดเฉพาะ LINE** — เพิ่ม `channel === 'LINE'` ในเงื่อนไข | กรอบที่ user เคาะไว้คือ LINE และ `tokenInvalid` ของ Meta มีความหมายต่างกัน (token ของเพจ + หน้าต่าง 24 ชม.) copy ที่เขียนไว้ *"ข้อความที่ลูกค้าส่งมายังอ่านได้ตามปกติ"* ยังไม่ได้ยืนยันว่าจริงกับ Meta ⇒ **ขยายทีหลังได้ ขยายผิดแล้วบล็อกคนที่กำลังคุยลูกค้าอยู่** |
| OQ-2 | S4 dismiss ได้ไหม | **ไม่มีปุ่มปิด** ตามที่ ux แนะนำ | บล็อกหายเมื่อ "เปิดแจ้งเตือน" สำเร็จเท่านั้น = เงื่อนไขตรงกับความจริง ไม่ใช่การซ่อน |
| OQ-3 | input ของ `resolveLineChannelHealth()` | ตาราง §S1 คือ contract — ดู §6 ลายเซ็นฟังก์ชัน | AC-CH-25: pure function ห้ามเทอร์นารีใน JSX |
| OQ-4 | deep-link ผูก `channelId` เลยไหม | **ผูกเลย: `?lineReconnect={channelId}`** | ถูกกว่าทำตอนนี้ และกฎ grandfather (AC-CH-28) ยอมให้มี >1 ใบอยู่จริง — query ที่สมมติว่ามีใบเดียวจะเปิด wizard ผิดใบเงียบ ๆ |

---

## 1. S1 — การ์ด LINE ใน `/settings/channels`

ครอบ FR-CH-07 · AC-CH-23/24/25

### Wireframe — Mobile (≤640px)

```
┌──────────────────────────────────┐
│ [LINE] BT สาขา สุขสวัสดิ์          │
│        @448wtblz                  │
│  ┌──────────────────────────┐    │
│  │ shield-check เชื่อมต่อสมบูรณ์│   │ ← HEALTHY เท่านั้นที่เขียว
│  └──────────────────────────┘    │
│  [ทดสอบการเชื่อมต่อ] [ถอด]        │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│  เมนูลัดใน LINE      [จัดการเมนู] │
└──────────────────────────────────┘

สถานะ SECRET_MISMATCH (ร้ายแรงสุด)
┌──────────────────────────────────┐
│ [LINE] BT สาขา สุขสวัสดิ์          │
│  ┌──────────────────────────┐    │
│  │ shield-lock Channel secret ไม่ตรง│
│  └──────────────────────────┘    │
│  ข้อความจากลูกค้าเข้าไม่ถึง Deep   │
│  เลย ทั้งที่ LINE รายงานว่าส่ง     │
│  สำเร็จ                            │
│  [แก้ไข Channel secret]           │
│  [ทดสอบการเชื่อมต่อ] [ถอด]        │
└──────────────────────────────────┘
```

### Wireframe — Desktop (≥1024px)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⬤LINE  BT สาขา สุขสวัสดิ์  @448wtblz   [shield-lock Channel secret ไม่ตรง]│
│         ข้อความจากลูกค้าเข้าไม่ถึง Deep — secret ไม่ตรงกับที่ตั้งใน LINE │
│                              [แก้ไข secret] [ทดสอบการเชื่อมต่อ] [ถอด]   │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│ เมนูลัดใน LINE                                        [จัดการเมนู →]    │
└────────────────────────────────────────────────────────────────────────┘
```

### ลำดับ + สี + ไอคอน (ตัวจริง)

| ลำดับ | สถานะ | badge class | icon |
|---|---|---|---|
| 1 | `SECRET_MISMATCH` | `bg-danger/15 text-danger-ink` | `shield-lock` |
| 2 | `TOKEN_INVALID` | `bg-danger/15 text-danger-ink` | `alert-circle` |
| 3 | `WEBHOOK_NOT_SET` / `WEBHOOK_INACTIVE` / `WEBHOOK_POINTS_ELSEWHERE` | `bg-warning/15 text-warning-ink` | `link-off` |
| 4 | `TOKEN_EXPIRING` | `bg-warning/15 text-warning-ink` | `clock-exclamation` |
| 5 | `HEALTHY` | `bg-success/15 text-success-ink` | `shield-check` |

```tsx
<span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded mt-1 ${cls}`}>
  <Icon icon={iconName} className="text-xs" aria-hidden="true" />
  {label}
</span>
```

ปุ่ม action ต่อสถานะใช้คลาสเดียวกับปุ่ม "เชื่อมต่อใหม่" เดิมของไฟล์: `btn btn-sm bg-{tone}/15 text-{tone}-ink hover:bg-{tone}/25`

### Copy ไทย (ครบทุกสถานะ — ห้าม dev แต่งเอง)

| สถานะ | Label | บรรทัดอธิบาย | ปุ่ม |
|---|---|---|---|
| `SECRET_MISMATCH` | Channel secret ไม่ตรง | ข้อความจากลูกค้าเข้าไม่ถึง Deep เลย ทั้งที่ LINE รายงานว่าส่งสำเร็จ — Channel secret ที่วางไว้ไม่ตรงกับที่ตั้งในคอนโซล LINE | แก้ไข Channel secret |
| `TOKEN_INVALID` | Token ใช้งานไม่ได้แล้ว | ส่งข้อความหาลูกค้าไม่ได้จนกว่าจะวาง token ใหม่ — token เดิมอาจถูกเพิกถอนหรือหมดอายุ | อัปเดต token |
| `WEBHOOK_NOT_SET` | ยังไม่ได้ตั้ง Webhook | วาง Webhook URL ในคอนโซล LINE ให้เรียบร้อยก่อน จึงจะเริ่มรับข้อความลูกค้าได้ | ตั้งค่า Webhook |
| `WEBHOOK_INACTIVE` | Webhook ปิดอยู่ | ตั้ง URL ไว้แล้วแต่สวิตช์ "Use webhook" ในคอนโซล LINE ยังปิดอยู่ | ตั้งค่า Webhook |
| `WEBHOOK_POINTS_ELSEWHERE` | Webhook ชี้ไปที่อื่น | Webhook ของ OA นี้ชี้ไปยัง URL อื่น ไม่ใช่ของ Deep — ข้อความลูกค้าจะไม่เข้าที่นี่ | ตั้งค่า Webhook |
| `TOKEN_EXPIRING` | Token จะหมดอายุ {วันที่ พ.ศ.} | อีก {N} วัน token นี้จะใช้งานไม่ได้ — เปลี่ยนเป็นแบบไม่หมดอายุเพื่อไม่ต้องมาตั้งซ้ำ | เปลี่ยนเป็นไม่หมดอายุ |
| `HEALTHY` | เชื่อมต่อสมบูรณ์ | *(ไม่มี)* | *(ไม่มี)* |

**409 `LINE_ALREADY_CONNECTED`** (ในกล่อง error แดงเดิมของ wizard):
> ร้านนี้เชื่อมต่อ LINE OA อื่นอยู่แล้ว ({existingOaName}) — เชื่อมได้ทีละ 1 OA ต่อร้าน ต้องถอดตัวเดิมก่อนเชื่อม OA ใหม่

**Sweet Alert "เปลี่ยนเป็นไม่หมดอายุ"** (`icon: info`, ปุ่ม "เข้าใจแล้ว"):
> **ออก token แบบไม่หมดอายุ**
> token ปัจจุบันเป็นแบบ 30 วัน — ไปที่ LINE Developers Console → Messaging API → Channel access token แล้วเลือก Issue แบบ long-lived จากนั้นนำมาวางแทนที่นี่ (ปุ่มอัปเดต token ในการ์ดนี้)

### Theme Source Mapping

| Block | Source | adapt |
|---|---|---|
| โครงแถว + avatar + ปุ่มขวา | `settings/channels/LineChannelCard.tsx` | เก็บทั้งหมด เปลี่ยนแค่ badge block |
| Badge 5-tone + priority | `verification/components/StatusBadge.tsx` (`Record<Status,{label,icon,cls}>`) + `RichMenuStatusRow.tsx:25-30` | ขยาย 3→5 tone เพิ่ม `ctaLabel`/`detail` |
| ปุ่มทดสอบ (idle/spin) | `settings/ShippingSettingsRow.tsx:585-597` | เปลี่ยน endpoint |
| แถบอธิบาย + ปุ่ม action | `LineChannelCard.tsx` warningNotice block | tone/ปุ่มผันตามสถานะ |
| Swal info | `LineChannelCard.tsx:120-128` | เปลี่ยนข้อความ |
| deep-link auto-open | `ShippingSettingsRow.tsx:278-284` (`searchParams` → `setModal` → `router.replace`) | query `lineReconnect={channelId}` (OQ-4) |
| Webhook URL copy | `LineChannelCard.tsx` `<CopyLinkButton>` | reuse ตรง ๆ |

### Edge states
- **ยังไม่เชื่อมเลย** — ไม่เปลี่ยน (ปุ่ม "เชื่อม LINE OA" เดิม)
- **>1 LINE (grandfather)** — `channels.map()` เดิมรองรับอยู่แล้ว
- **ยิง `/health` แล้ว network error** — toast error, **ไม่เปลี่ยน badge** (badge มาจากค่าที่ persist ไม่ใช่ผล fetch ที่ล้ม)

---

## 2. S2 — ปุ่ม "ทดสอบการเชื่อมต่อ" (2 จังหวะ)

ครอบ FR-CH-05 · AC-CH-16/17/18

### Wireframe (panel ขยายใต้แถว — mobile/desktop เหมือนกัน)

```
Loading
[ ⟳ กำลังทดสอบ... ]                     ← ปุ่ม disabled + icon spin
กำลังส่งข้อความทดสอบไปที่ระบบ...          ← aria-live="polite"
อาจใช้เวลาถึง 5 วินาที

ผ่านทุกด้าน
┌──────────────────────────────────────┐
│ เชื่อมต่อใช้งานได้ปกติ               ✕│  bg-success/15 text-success-ink
├──────────────────────────────────────┤
│ ✓ Webhook              ตั้งค่าและเปิดใช้งานถูกต้อง│
│ ✓ Channel access token ใช้งานได้ปกติ  │
│ ✓ ข้อความทดสอบ         ระบบประมวลผลสำเร็จ│
│ ตรวจสอบล่าสุด 12 ส.ค. 2569 14:32       │
└──────────────────────────────────────┘

ผ่านแต่มีข้อสังเกต
│ ⚠ การตั้งค่าถูกต้อง แต่ยังไม่เห็นผลข้อความทดสอบชัดเจน │ bg-warning/15
│ ? ข้อความทดสอบ  ไม่พบสัญญาณว่าถูกปฏิเสธ แต่ยังยืนยัน │
│                 การรับไม่ได้ 100% — ลองอีกครั้งใน 1 นาที│

ล้มเหลว (secret mismatch — เคสที่ต้องเถียง success:true ของ LINE)
│ ⊗ Channel secret ไม่ตรงกับ LINE                      │ bg-danger/15
│ ✗ ข้อความทดสอบ  ประมวลผลไม่สำเร็จ — Channel secret   │
│                 ไม่ตรงกับที่ตั้งไว้ใน LINE (LINE รายงาน│
│                 ว่าส่งสำเร็จ แต่นั่นบอกแค่ว่า server   │
│                 เรายังออนไลน์)                        │
│                 [แก้ไข Channel secret]                │
```

### Copy ไทย

**ปุ่ม:** `ทดสอบการเชื่อมต่อ` / `กำลังทดสอบ...`
**ระหว่างโหลด:** `กำลังส่งข้อความทดสอบไปที่ระบบ... อาจใช้เวลาถึง 5 วินาที`

| verdict | headline |
|---|---|
| `PASS` | เชื่อมต่อใช้งานได้ปกติ |
| `PASS_WITH_NOTE` | การตั้งค่าถูกต้อง แต่ยังไม่เห็นผลข้อความทดสอบชัดเจน |
| `FAIL_SECRET` | Channel secret ไม่ตรงกับ LINE |
| `FAIL_TOKEN` | Token ใช้งานไม่ได้แล้ว |
| `FAIL_WEBHOOK` | Webhook ยังไม่พร้อมรับข้อความ |

| แถว | pass | fail | inconclusive |
|---|---|---|---|
| Webhook | ตั้งค่าและเปิดใช้งานถูกต้อง | *(ใช้บรรทัดอธิบายเดียวกับ S1 ตามสาเหตุจริง)* | — |
| Channel access token | ใช้งานได้ปกติ | Token ใช้งานไม่ได้แล้ว (ถูกเพิกถอนหรือหมดอายุ) | — |
| ข้อความทดสอบ | ระบบประมวลผลสำเร็จ | ประมวลผลไม่สำเร็จ — Channel secret ไม่ตรงกับที่ตั้งไว้ใน LINE (LINE รายงานว่าส่งสำเร็จ แต่นั่นบอกแค่ว่า server เรายังออนไลน์) | ไม่พบสัญญาณว่าถูกปฏิเสธ แต่ยังยืนยันการรับไม่ได้ 100% — ลองอีกครั้งใน 1 นาทีถ้าไม่แน่ใจ |

> **ทำไมต้องมี `PASS_WITH_NOTE`:** การตรวจ inbound เป็น **absence-of-failure** ไม่ใช่ presence-of-success (เราดูว่า "ตัวนับความล้มเหลวไม่ขยับ") ⇒ มีความไม่แน่นอนโดยธรรมชาติ **ห้ามรายงานเป็นเขียวเต็ม**

### Theme Source Mapping

| Block | Source |
|---|---|
| ปุ่ม + spinner | `ShippingSettingsRow.tsx:585-597` |
| checklist 3 แถว | `verification/components/LevelCard.tsx:172-194` (`check`/`x`) + state ที่ 3 = `help-circle` tone `text-warning` |
| verdict banner | `LineChannelCard.tsx` warningNotice block (3 tone) |
| timestamp | `formatDateTime` จาก `src/lib/format-date.ts` (ห้าม `toLocaleDateString`) |

### Edge states
- network error → `pacesToast.error('ทดสอบไม่สำเร็จ — เครือข่ายมีปัญหา กรุณาลองใหม่')` panel ไม่เปิด
- กดซ้ำระหว่างโหลด → ปุ่ม disabled
- ทดสอบซ้ำ → panel อัปเดต in-place + timestamp ขยับ

---

## 3. S3 — แถบแทนที่ช่องพิมพ์เมื่อ `TOKEN_INVALID`

ครอบ FR-CH-06 · AC-CH-21/22 · **เฉพาะ `channel === 'LINE'` (OQ-1)**

### Wireframe

```
Mobile
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│         alert-circle              │
│  ส่งข้อความหาลูกค้าไม่ได้ตอนนี้    │
│  — การเชื่อมต่อ LINE มีปัญหา       │
│  (ข้อความที่ลูกค้าส่งมายังอ่านได้  │
│   ตามปกติ)                        │
│      [ อัปเดต token ]             │
└──────────────────────────────────┘

Desktop (≥640px — sm:flex-row)
┌──────────────────────────────────────────────────────────────────┐
│ ⊘  ส่งข้อความหาลูกค้าไม่ได้ตอนนี้ — การเชื่อมต่อ LINE มีปัญหา     │
│    (ข้อความที่ลูกค้าส่งมายังอ่านได้ตามปกติ)  [ อัปเดต token ]     │
└──────────────────────────────────────────────────────────────────┘
```

### สิ่งที่เปลี่ยน / ไม่เปลี่ยน

เดิม `tokenInvalid` ทำ 2 อย่าง: (1) เติม entry ใน `ThreadStatusBar` เหนือเธรด (2) `composerDisabled=true` → dim ทั้งแถบด้วย `opacity-50 pointer-events-none`

**เปลี่ยนเฉพาะ (2)** เป็นบล็อกแทนที่ · **(1) คงเดิมไม่แตะ** (เป็นสัญญาณสำรองที่เห็นได้แม้เลื่อนเธรดขึ้นไปไกล)

```tsx
<div className="bg-danger/15 text-danger-ink flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm sm:flex-row sm:items-center sm:text-start">
  <Icon icon="alert-circle" className="shrink-0 text-lg" aria-hidden="true" />
  <span className="min-w-0 flex-1">
    ส่งข้อความหาลูกค้าไม่ได้ตอนนี้ — การเชื่อมต่อ LINE มีปัญหา
    <span className="block text-xs opacity-80 sm:ms-1 sm:inline">(ข้อความที่ลูกค้าส่งมายังอ่านได้ตามปกติ)</span>
  </span>
  <Link href={`/settings/channels?lineReconnect=${channelId}`} className="btn btn-sm bg-card text-default-700 min-h-11 shrink-0 sm:min-h-0">
    อัปเดต token
  </Link>
</div>
```

Base: `ChatThread.tsx:3121-3153` (`showAiTakeoverComposer`) — เปลี่ยน tone `bg-info/15`→`bg-danger/15`, icon `robot`→`alert-circle`, ปุ่ม "ตอบเอง"→"อัปเดต token"

🛑 ตัวแปรใหม่ `showTokenInvalidComposer = isExternal && tokenInvalid && channel === 'LINE'` **แยกจาก `composerDisabled`** ซึ่งยังใช้กับเคสโควตาเดิม

### Edge states
- เธรดจากคอมเมนต์ — ไม่กระทบ (คนละชนิด)
- `tokenInvalid` + โควตาบล็อกพร้อมกัน → **`tokenInvalid` ชนะ** (ตรงกับคอมเมนต์เดิม `ChatThread.tsx:1412`)

---

## 4. S4 — แถบ "คุณปิดแจ้งเตือนของร้านนี้อยู่"

ครอบ AC-CH-31/33 · จุดแทรกเดียว = `InboxList.tsx` (desktop ใช้ผ่าน `ChatRail.tsx` ที่ wrap ทั้งชุด)

```
┌──────────────────────────────────┐
│  [ค้นหา...]  [ทั้งหมด][ยังไม่ตอบ] │
├──────────────────────────────────┤
│ bell-off คุณปิดแจ้งเตือนของร้านนี้อยู่│  bg-info/15 text-info-ink
│    จะไม่มีแจ้งเตือนเด้งเข้ามือถือ  │
│    เมื่อมีข้อความใหม่จากร้านนี้    │
│              [เปิดแจ้งเตือน]      │
├──────────────────────────────────┤
│ [รายการสนทนา...]                  │
```

```tsx
<div className="bg-info/15 text-info-ink mb-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
  <Icon icon="bell-off" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
  <div className="min-w-0 flex-1">
    <p className="mb-1 font-medium">คุณปิดแจ้งเตือนของร้านนี้อยู่</p>
    <p className="mb-2">จะไม่มีแจ้งเตือนเด้งเข้ามือถือเมื่อมีข้อความใหม่จากร้านนี้</p>
    <button type="button" onClick={handleTurnOn} className="btn btn-sm bg-card text-info hover:bg-info/10">เปิดแจ้งเตือน</button>
  </div>
</div>
```

Base: `LineChannelCard.tsx` บล็อก "ก่อนเริ่มใช้งาน โปรดทราบ" · toggle logic Base: `account/components/NotificationPrefsCard.tsx:81-100`

- **ไม่มีปุ่มปิด** (OQ-2) — หายเมื่อกด "เปิดแจ้งเตือน" สำเร็จเท่านั้น
- ไม่มีแถว pref / มีแถวค่า `true` → **ไม่แสดง** (AC-CH-33)
- PATCH ล้ม → toast error **บล็อกยังอยู่** (ไม่ optimistic-hide — ซ่อนผิดแล้วร้านพลาดข้อความเสียหายกว่าปุ่มค้าง)

---

## 5. S5 — ป้าย "ปิดแจ้งเตือน" ในรายชื่อสมาชิก (ทำทีหลัง)

ครอบ AC-CH-32 · Base: `business/[shopId]/invites/components/CurrentMembersTable.tsx:64-68`

```tsx
<span className="flex items-center gap-1.5">
  {member.displayName}
  {member.notificationsOff && (
    <span className="badge bg-default-100 text-default-600 text-2xs inline-flex items-center gap-1">
      <Icon icon="bell-off" className="text-2xs" aria-hidden="true" />
      ปิดแจ้งเตือน
    </span>
  )}
</span>
```

🛑 **tone = neutral ไม่ใช่ warning** — S4 (เรื่องของตัวเอง) = info + ปุ่มแก้ทันที · S5 (เรื่องของคนอื่น) = neutral + ไม่มีปุ่ม เพราะเจ้าของ toggle แทนพนักงานไม่ได้อยู่ดี (`NotificationPrefsCard` ผูกกับ `session.user.id` ของเจ้าของค่าเอง)

---

## 6. สัญญาของฟังก์ชันบริสุทธิ์ (AC-CH-25)

```ts
// src/lib/line/channel-health.ts
export type LineChannelHealth =
  | 'SECRET_MISMATCH' | 'TOKEN_INVALID'
  | 'WEBHOOK_NOT_SET' | 'WEBHOOK_INACTIVE' | 'WEBHOOK_POINTS_ELSEWHERE'
  | 'TOKEN_EXPIRING' | 'HEALTHY'

export interface LineChannelHealthInput {
  status: string                      // ShopChannel.status
  tokenExpiresAt: Date | null
  tokenCheckedAt: Date | null
  inboundFailReason: string | null    // SIGNATURE_MISMATCH | DESTINATION_NOT_FOUND | null
  inboundFailCount: number
  webhook: { endpoint: string | null; active: boolean; matchesUs: boolean } | null  // null = ยังไม่เคยตรวจ
}

export function resolveLineChannelHealth(input: LineChannelHealthInput, nowMs: number): LineChannelHealth
```

- `webhook === null` (ยังไม่เคยตรวจ) → **ห้ามตัดสินว่าผิด** ข้ามไปพิจารณาข้อถัดไป
- `tokenExpiresAt === null` → ไม่มีวันหมดอายุ **ห้ามเข้า `TOKEN_EXPIRING`**
- `TOKEN_EXPIRING` เมื่อเหลือ ≤ `TOKEN_EXPIRING_DAYS` (14) เท่านั้น

---

### Impeccable compliance

**Mode: Operate** — ทุก surface อยู่ใต้ `(paces)/**` ผู้ใช้กำลังทำงาน ไม่ใช่ถูกโน้มน้าว

- **One Voice** — น้ำเงิน Paces primary ปรากฏเฉพาะปุ่มเดิม ("เชื่อม LINE OA", "อัปเดตและเชื่อมต่อ") · badge/action ใหม่ทั้งหมดใช้สี **semantic** เพราะสื่อสถานะ ไม่ใช่ action หลักของหน้า
- **🛑 Verified-Means-Green** — เขียวผูกกับ `HEALTHY` เท่านั้น (ผ่านทุกด่านจริง) ต่อให้ `status='ACTIVE'` ก็ไม่เขียวถ้าด่านไหนไม่ผ่าน — เป็นการแก้การละเมิดที่มีอยู่เดิม (การ์ดเคยขึ้นเขียว "เชื่อมแล้ว" ทั้งที่ webhook ไม่เคยถูกตั้ง)
- **Sentence-case** ทุก label · **ไม่มี** gradient / hero-metric / eyebrow / การ์ดซ้อนการ์ด
- **น้ำเสียง** — ทุก error บอกทางออก 1 ทาง · S3 ระบุชัดว่าขาเข้ายังอ่านได้ (กันตื่นตระหนกเกินจริง) · S4 เป็นข้อเท็จจริงไม่ใช่คำเตือน · ไม่มี "ไม่สามารถ...ได้"
- **ไม่พบจุดที่ theme ขัดกับ Impeccable** — ทุก block ประกอบจาก Paces primitive ที่มีอยู่ (`bg-{semantic}/15`, `text-{semantic}-ink`, `btn btn-sm`, `rounded-lg`) ไม่มี arbitrary value

### Anti-slop self-check (ผ่าน 9/9)

เฉพาะกับ Deep (copy อ้างกลไกจริงของ LINE) · 1 อย่างเด่นต่อจอ (badge ตัวเดียว ไม่ใช่ 6 บรรทัด) · ไม่มีบล็อกคงที่ · state ครบทุก surface · ปุ่มทุกปุ่มมีผลจริง · คำเดียวกัน = ของเดียวกัน ("อัปเดต token" ใช้เหมือนกันทั้ง S1/S3) · สีถูกความหมาย · tap target ≥44px (`min-h-11`) · ไม่สร้าง layout คอลัมน์ใหม่
