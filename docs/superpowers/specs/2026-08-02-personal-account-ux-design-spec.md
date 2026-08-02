SendMessage isn't available in this tool context, so I'm delivering the full Design Spec directly as my response below.

# Design Spec — Personal Account & Connections A+B (feature 00026), seller/Paces

**Route surfaces:** `(paces)/seller/**` → theme **Paces**. Font Anuphan เท่านั้น. Primary = น้ำเงิน `#236dc9` (`bg-primary`) — **ห้ามม่วง `#7367F0`**.
**Mode (Impeccable): Operate** — dashboard/settings/switcher, ใน `.impeccable/design.json` register ต้อง override เป็น `product` ตาม PRODUCT.md §Register. Craft-floor + operate.md อ่านแล้ว: "earned familiarity" ชนะการแสดงออก, ห้าม decorative choreography, ทุก interactive ต้องมี default/hover/focus/active/disabled/loading/error.

อ่านครบแล้ว: SSOT `docs/superpowers/specs/2026-08-02-personal-account-and-connections-design.md`, `DESIGN.md`+`PRODUCT.md`+`.impeccable/design.json`, playbooks `shape.md`/`operate.md`/`craft-floor.md`, `paces-component-reference.md`, และโค้ดจริงทั้งหมดที่ระบุ (`UserDropdownDetailed.tsx`, `AccountSwitcherSheet.tsx`, `AccountSwitcherLauncher.tsx`, `ChooseShopClient.tsx`, `onboarding/page.tsx`, `shop/page.tsx`+`ShopForm.tsx`+`ShopMobileHero.tsx`+`ShopQuickLinks.tsx`+`SignOutCard.tsx`, `AvatarEditable.tsx`, `AccountAvatar.tsx`, `useShopSwitcher.ts`+`ShopSwitchOverlay.tsx`, `paces-swal.ts`, `_seller-menu.ts`, `settings/page.tsx`+`ConnectedAccountsClient.tsx`).

---

## 🛑 การค้นพบสำคัญที่ต้องอ่านก่อนอ่านสเปกที่เหลือ

**"การเชื่อมต่อบัญชี" (รหัสผ่าน/LINE/Facebook/Instagram พร้อม connect/disconnect + OTP-gated unlink) มีอยู่แล้วจริง ใช้งานได้จริงวันนี้ที่ `/settings`** (`ConnectedAccountsClient.tsx` + `/api/account/link/start`, `/send-otp`, `/remove`) — ไม่ใช่แค่ "ออกแบบไว้ ยังไม่ implement" ตามที่ SSOT §6 (Section C) สันนิษฐาน. SSOT เขียนแผนใหม่ทั้งเส้น (`/api/account/link/{provider}/start+callback` แยกจาก NextAuth) โดยดูเหมือนไม่รู้ว่าของเดิมมีอยู่แล้วและทำงานคนละวิธี (ของเดิมใช้ NextAuth `signIn(provider,{callbackUrl})` ตรง ๆ ซึ่งเป็นวิธีที่ SSOT §6/C2 ระบุว่า "ปฏิเสธ" เพราะเปราะ)

สิ่งนี้กระทบ scope ของงานที่ Controller สั่งโดยตรง ("ออกแบบการ์ดเผื่อ C") — ดู **Open Questions #1** ก่อนส่งต่อ developer เพราะเป็น IA decision (ย้าย route หรือไม่) ที่ฉันตัดสินเองไม่ได้ (Hard Rule 3)

---

> **แก้ไข 2026-08-02 (หลัง implement):** ข้ออ้างในเอกสารนี้ที่ว่า "รูปทรง avatar วงกลม=คน
> สี่เหลี่ยมมน=ร้าน เป็นสัญญาณภาพที่มีอยู่แล้วในแอป (ตาม `AccountAvatar.tsx` kind convention)"
> **ไม่จริง** — `AccountAvatar.tsx:39,45` ใส่ `rounded-full` ให้ทั้ง `kind='business'` และ
> `'personal'` ต่างกันแค่ icon fallback ตอนไม่มีรูป สัญญาณนี้จึงไม่เคยมีอยู่ ตัดสินใจ 2026-08-02
> ว่า**ไม่แก้ที่ `AccountAvatar`** เพราะกระทบ switcher ทุกจุดทั้งแอป — ให้ badge "ไม่ผูกกับร้านไหน"
> กับ subtitle แบกหน้าที่แยกหน้าแทน

## ส่วน A1 — แถว "สร้างร้านส่วนตัวของฉัน" ใน 2 switcher

### Layout (ASCII) — Desktop dropdown (`UserDropdownDetailed`, ≥1024px)

```
Topbar[...] [🔵Avatar ธนภัทร ▾]
                └──────────────────────────────┐
                │  ┌ active box ─────────────┐ │  w-72 (288px)
                │  │ 🔵 ธนภัทร   ผู้ดูแล(BT) │ │
                │  └──────────────────────────┘ │
                │  สลับบัญชี                     │
                │  ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │  ← ใหม่ (แทนที่ตำแหน่ง personal row)
                │  ┊ (+) สร้างร้านส่วนตัวของฉัน┊ │    border-dashed border-primary/40
                │  ┊     ขายของในนามตัวเอง    ┊ │    bg-primary/5, primary text
                │  └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
                │  🏪 BT ร้านค้า        เจ้าของ  │
                │  🏪 ร้านอื่น          ผู้ดูแล  │
                │  ─────────────────────────────│
                │  🚀 แพ็กเกจธุรกิจ              │
                │  👤 ข้อมูลส่วนตัว        ← ใหม่│
                │  ⚙️ โปรไฟล์ / ตั้งค่าร้าน       │
                │  🏬 เปิดหน้าร้าน          ↗    │
                │  ─────────────────────────────│
                │  🚪 ออกจากระบบ                 │
                └────────────────────────────────┘
```

### Layout (ASCII) — Mobile + Tablet (`AccountSwitcherSheet`, <1024px, full-screen)

```
┌ mobile 375px ─────────────┐   ┌ tablet 768–1023px ────────────────┐
│ สลับบัญชี              ✕  │   │ สลับบัญชี                       ✕ │
├────────────────────────────┤   ├──────────────────────────────────┤
│┊(+) สร้างร้านส่วนตัวของฉัน ┊│   │┊(+) สร้างร้านส่วนตัวของฉัน      ┊│
│┊    ขายของในนามตัวเอง      ┊│   │┊    ขายของในนามตัวเอง — สร้างได้┊│
│┊    — สร้างได้ครั้งเดียว  →┊│   │┊    ครั้งเดียว                →┊│
│ 🏪 BT ร้านค้า    เจ้าของ ✓ │   │ 🏪 BT ร้านค้า          เจ้าของ ✓│
│ 🏪 ร้านอื่น      ผู้ดูแล   │   │ 🏪 ร้านอื่น            ผู้ดูแล  │
│ ─────────────────────────  │   │ ──────────────────────────────  │
│ 👤 ข้อมูลส่วนตัว        → │   │ 👤 ข้อมูลส่วนตัว              →│  ← ใหม่ (footer entry)
└────────────────────────────┘   └──────────────────────────────────┘
```

Sheet เป็น full-screen เดียวกันทั้ง mobile/tablet (Paces sidebar breakpoint = 1024px ไม่ใช่ 768/900 ของ Tailwind ปกติ — ต่างจาก MUI breakpoint ที่ใช้ฝั่ง buyer) ต่างแค่ความกว้างเนื้อหา ไม่ต่าง layout

### Section breakdown

- **เงื่อนไข render:** `context.personal === null` (จาก `/api/business/context` เดิม) — เมื่อสร้างสำเร็จ `context.personal` ไม่ null อีก แถวนี้หายเองอัตโนมัติ ไม่ต้องมี logic ลบทิ้งเพิ่ม
- **ตำแหน่ง:** desktop แทนตำแหน่งที่ personal row จะอยู่ (บนสุดของรายการใต้ "สลับบัญชี" ก่อน business list) — ใช้ภาษาเดียวกับที่ `ChooseShopClient.tsx` ใช้กับปุ่ม "เปิดร้านของฉันเอง" (dashed border + primary + icon `plus`) เพื่อให้ผู้ใช้จำ affordance "เส้นประ = สร้างของใหม่" ได้ข้ามหน้า — **ไม่ใช่การประดิษฐ์ pattern ใหม่ แต่ reuse grammar ที่มีอยู่แล้วในแอป**
- **สถานะ loading:** ขณะกำลัง `POST /api/shops/open-personal` → icon `plus` เปลี่ยนเป็น `loader-2` (`animate-spin`), แถว `disabled` (pattern เดียวกับ `ShopMobileHero.tsx` logo/cover upload loading icon swap) แล้วต่อด้วย `ShopSwitchOverlay` เต็มจอทันทีที่ API สำเร็จ (ดู flow ด้านล่าง)
- **ไม่มี badge "ใหม่"/eyebrow ใด ๆ** — คำอธิบาย 1 บรรทัดพอ (anti-slop: ไม่ใช่ hero-metric, ไม่ใช่ eyebrow ตัวพิมพ์เล็กจิ๋ว)

### Confirm dialog

**Base: `src/lib/paces-swal.ts` → `pacesConfirm.question(title, text, opts)`** (ห้ามเขียน `Swal.fire` ดิบเมื่อมี helper กลางอยู่แล้ว — นี่คือ SSOT ของ blocking dialog ในโปรเจกต์ ตัวมันเองอ้าง `SweetAlerts.tsx` เป็น Base อยู่แล้ว)

```
pacesConfirm.question(
  'สร้างร้านส่วนตัวของคุณ?',
  'ร้านนี้ผูกกับตัวคุณโดยตรงและสร้างได้ครั้งเดียว — พอยืนยันแล้วเราจะพาไปตั้งค่าร้านต่อทันที',
  { confirmButtonText: 'สร้างร้านเลย', cancelButtonText: 'ยังไม่สร้างตอนนี้' }
)
```
icon = `question` (primary ปุ่มน้ำเงิน จาก `CONFIRM_BTN.primary` — ไม่ใช่ danger เพราะนี่ไม่ใช่การกระทำทำลายล้าง), cancel = neutral `bg-light` (ตรงกับ semantic ของ helper อยู่แล้ว ไม่ต้องระบุ)

### Flow หลังยืนยัน

```
ยืนยัน (pacesConfirm.question → true)
  → setCreating(true) → แสดง ShopSwitchOverlay (reuse ตัวเดิม, portal อยู่แล้ว)
     - targetName/targetLogo/targetKind ไม่มีค่าจริงให้ส่ง (ยังไม่มีร้าน) → overlay ตกไป branch
       "กำลังสลับบัญชี…" ทั่วไป ซึ่ง**ไม่ตรงบริบท** ("สลับ" ผิด เพราะนี่คือ "เปิด" ร้านใหม่)
     - แนะนำ: เพิ่ม optional prop `label`/`subLabel` ให้ ShopSwitchOverlay override ข้อความ
       เฉพาะจุดนี้ ("กำลังเปิดร้านส่วนตัวให้คุณ…" / "กำลังพาไปตั้งค่าร้านต่อ") — เป็นการปรับ
       component เดิมเล็กน้อย ไม่ใช่สร้างใหม่ (adaptation ปกติของ theme-copy workflow)
  → POST /api/shops/open-personal
     - ok → update({activeShopId: data.shopId}) → window.location.href = '/onboarding'
       (hard-navigate ตรง useShopSwitcher pattern เป๊ะ — บังคับ session/menu ใหม่ทั้งหมด)
     - fail → ซ่อน overlay, pacesToast.error('เปิดร้านไม่สำเร็จ กรุณาลองใหม่')
       (ข้อความเดียวกับ ChooseShopClient.tsx:103 — คำเดียวกันหมายถึงเหตุการณ์เดียวกันทั้งแอป)
```

---

## ส่วน A3 — ปุ่ม "กลับไปร้านเดิม" บน `/onboarding`

### Layout (ASCII — Shell เป็น card กลางจอ max-w-md เหมือนกันทุก breakpoint โดยตัว Paces เอง ไม่ต่างกัน)

```
┌ mobile/tablet/desktop (การ์ดกลางจอเท่ากันทุกขนาด — Shell เดิมไม่ responsive แยก) ┐
│  ← กลับไปร้านเดิม                                      (แสดงเฉพาะมี biz membership)│
│                                                                                    │
│              [Deep logo]                                                         │
│              ● ● ○ ○   ขั้นที่ 2/4                                              │
│                                                                                    │
│              (icon วงกลม step)                                                   │
│           ตั้ง URL ร้านของคุณ                                                    │
│        ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้                                          │
│                                                                                    │
│        [input url ...........................]                                  │
│                                                                                    │
│              [ ถัดไป → ]  ← primary ปุ่มหลัก อยู่ล่างสุด ห่างจาก back-link มากสุด │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Section breakdown

- **ตำแหน่ง:** มุมบนซ้ายของ `Shell`, เหนือโลโก้ — อยู่ในทุก step (Shell ครอบทุก step อยู่แล้ว) ไม่ใช่แค่ step สุดท้าย เพราะ D4 ต้องการให้ "หาเจอเมื่อต้องการ" ตลอด wizard ไม่ใช่แค่ปลายทาง
- **ทำไมมุมบนซ้าย ไม่ใช่ใกล้ปุ่ม "ถัดไป →":** ปุ่มหลัก (primary CTA) อยู่ล่างสุดเสมอในทุก step — วาง back-link ให้ไกลจากโซนนิ้วโป้งที่กดปุ่มหลัก (จุดที่กดถี่สุด) มากที่สุดเท่าที่ layout จะให้ = ป้องกัน mis-tap ได้ดีกว่าวางใกล้กัน โดยไม่ต้องซ่อนมันเข้า menu ที่ "หาไม่เจอ"
- **ขนาดตัวอักษรเล็ก (`text-xs text-default-400`) แต่ tap target ยังต้อง ≥44px** — ใช้เทคนิค padding แนวตั้งเกินขนาด visual (`py-2.5` รอบ text ที่ line-height เล็ก) ไม่ขยาย font ให้เด่น (ตรงโจทย์ "ไม่เด่นแต่หาเจอ")
- **ไม่มี confirm dialog** — การกดออกไม่ทำลายข้อมูล (ทุก step ของ onboarding POST บันทึกทันทีที่กด "ถัดไป" ของ step นั้นแล้ว — `submitCategory`/`submitSlug`/`submitAddress` ยิง API ก่อนเปลี่ยน step) กลับมาทีหลังได้ที่ step เดิม ไม่ใช่ action ทำลายล้างที่ต้องเตือน (SSOT ไม่ได้ระบุ confirm — ไม่ประดิษฐ์ business rule เพิ่มเอง)

### Flow

```
กด "← กลับไปร้านเดิม"
  → useShopSwitcher({landingPath:'/dashboard'}).switchShop(firstBusinessShopId, {name, kind:'business', logo})
  → ShopSwitchOverlay (มีอยู่แล้ว, ข้อความ default "กำลังสลับไปที่ร้าน 'X'" ใช้ได้ตรงบริบทพอดี — ไม่ต้อง override)
  → hard-navigate /dashboard
```
ต้องมี `shopId`/`name`/`logo` ของ business shop แรกส่งเข้ามาที่หน้านี้ — หน้าปัจจุบันไม่ fetch `/api/business/context` เลย ต้องเพิ่ม fetch เดียวกับ switcher (guard ด้วย `hasBusinessMembership` เหมือนที่อื่นทุกจุด) หรือส่งจาก session ถ้ามีพอ (`activeShopId`/`activeShopName` ใน session **ไม่ใช่**ของ business เพราะตอนนี้ active = personal ที่เพิ่งสร้าง — ต้อง fetch จริง)

---

## ส่วน B — หน้าใหม่ `/account`

### Layout (ASCII) — Desktop ≥1024px (มี sidebar 245px + topbar)

```
┌ sidebar 245px ┬────────────────────────────────────────────────────────────────┐
│ ...           │ หน้าหลัก › ข้อมูลส่วนตัว                                        │
│ STORE         │ ข้อมูลนี้เป็นของคุณโดยตรง ไม่ใช่ของร้าน                        │
│ 👤ข้อมูลส่วนตัว│ — เหมือนกันไม่ว่าจะสลับไปร้านไหน                                │
│ 🏪ตั้งค่าร้าน  │                                                                  │
│ ...           │  ┌─ max-w-2xl (672px) ─────────────────────────────────────┐    │
│               │  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ข้อมูลส่วนตัว ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌  │    │
│               │  │                                                          │    │
│               │  │   ( 🔵 )📷   ธนภัทร ใจดี   [ใช้ร่วมกันทุกร้าน]           │    │
│               │  │   avatar     เปลี่ยนรูป · ลบรูป                          │    │
│               │  │                                                          │    │
│               │  │  ชื่อที่แสดง       [ธนภัทร ใจดี.......................] │    │
│               │  │  ชื่อผู้ใช้         [thanapat_j.......................] │    │
│               │  │    deepthailand.app/u/thanapat_j                        │    │
│               │  │  อีเมล (ไม่บังคับ) [.....................................] │  │
│               │  │  เบอร์โทร          📞 08x-xxx-xxxx  [✓ ยืนยันแล้ว]      │    │
│               │  │    เปลี่ยนไม่ได้หลังตั้งค่าแล้ว เพื่อความปลอดภัยบัญชี   │    │
│               │  │                                                          │    │
│               │  │                          [ บันทึกการเปลี่ยนแปลง ]        │    │
│               │  └──────────────────────────────────────────────────────────┘    │
│               │  ┌──────────────────────────────────────────────────────────┐    │
│               │  │ ╌╌╌╌╌╌╌╌╌╌╌╌╌ 🔗 การเชื่อมต่อบัญชี ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌  │    │
│               │  │ เพิ่มวิธีเข้าสู่ระบบให้บัญชีนี้ — เปิดใช้งานเร็ว ๆ นี้ │    │
│               │  │ 🔑 รหัสผ่าน        ยังไม่ได้ตั้ง         [เร็ว ๆ นี้]   │    │
│               │  │ 💬 LINE            ยังไม่เชื่อม           [เร็ว ๆ นี้]   │    │
│               │  │ f  Facebook        เชื่อมแล้ว             [เร็ว ๆ นี้]   │    │
│               │  └──────────────────────────────────────────────────────────┘    │
└───────────────┴────────────────────────────────────────────────────────────────┘
```
(คอลัมน์ขวาของ 672px การ์ดในจอ 1440px ปล่อยว่างตั้งใจ ไม่ยืดการ์ดเต็ม main — เนื้อหามีแค่ 5 ฟิลด์+3 แถว ยืดเต็มจะดูโหว่กว่าจำกัดความกว้างและให้สายตาโฟกัส)

### Layout (ASCII) — Tablet 768–1023px (ไม่มี sidebar, มี `SellerMobileHeader` ด้านบน)

```
┌────────────────────────────────────────────┐
│ ‹ ข้อมูลส่วนตัว                             │ SellerMobileHeader
├──────────────────────────────────────────────┤
│ ┌ card ────────────────────────────────────┐ │
│ │ ╌╌╌╌╌╌╌ ข้อมูลส่วนตัว ╌╌╌╌╌╌╌            │ │
│ │  (🔵)📷  ธนภัทร ใจดี                     │ │
│ │          [ใช้ร่วมกันทุกร้าน]              │ │
│ │  เปลี่ยนรูป · ลบรูป                       │ │
│ │  ชื่อที่แสดง [.........................]  │ │
│ │  ชื่อผู้ใช้   [.........................]  │ │
│ │  อีเมล      [.........................]  │ │
│ │  เบอร์โทร    📞 08x-xxx-xxxx ✓ ยืนยันแล้ว │ │
│ │       [ บันทึกการเปลี่ยนแปลง ]            │ │
│ └────────────────────────────────────────────┘│
│ ┌ card: การเชื่อมต่อบัญชี (เหมือน desktop) ──┐ │
│ └────────────────────────────────────────────┘│
│ ┌ card: จัดการร้าน (ShopQuickLinks, reuse) ──┐ │
│ └────────────────────────────────────────────┘│
│ ┌ card: ออกจากระบบ (SignOutCard, reuse) ─────┐ │
│ └────────────────────────────────────────────┘│
└──────────────────────────────────────────────┘  bottom nav (SellerBottomNav)
```

### Layout (ASCII) — Mobile <768px

```
┌ 375px ───────────────────────┐
│ ‹ ข้อมูลส่วนตัว              │
├────────────────────────────────┤
│ ┌ card ────────────────────┐  │
│ │╌╌ ข้อมูลส่วนตัว ╌╌       │  │
│ │   (🔵)📷                 │  │
│ │  ธนภัทร ใจดี             │  │
│ │  [ใช้ร่วมกันทุกร้าน]      │  │
│ │  เปลี่ยนรูป · ลบรูป       │  │
│ │  ชื่อที่แสดง              │  │
│ │  [....................]  │  │
│ │  ชื่อผู้ใช้                │  │
│ │  [....................]  │  │
│ │  deepthailand.app/u/...  │  │
│ │  อีเมล (ไม่บังคับ)        │  │
│ │  [....................]  │  │
│ │  เบอร์โทร                 │  │
│ │  📞 08x-xxx-xxxx          │  │
│ │  [✓ ยืนยันแล้ว]           │  │
│ │  เปลี่ยนไม่ได้ เพื่อความ  │  │
│ │  ปลอดภัยของบัญชี          │  │
│ │ [ บันทึกการเปลี่ยนแปลง ]  │  │
│ └──────────────────────────┘  │
│ ┌ การเชื่อมต่อบัญชี ────────┐  │
│ │ 🔑 รหัสผ่าน   ยังไม่ตั้ง  │  │
│ │            [เร็ว ๆ นี้]   │  │
│ │ 💬 LINE      ยังไม่เชื่อม │  │
│ │            [เร็ว ๆ นี้]   │  │
│ │ f Facebook   เชื่อมแล้ว   │  │
│ │            [เร็ว ๆ นี้]   │  │
│ └──────────────────────────┘  │
│ ┌ จัดการร้าน (reuse) ──────┐  │
│ ┌ ออกจากระบบ (reuse) ─────┐  │
└────────────────────────────────┘
      [🏠][📦][➕][💬][🏪]  ← bottom nav
```

### Section breakdown (การแก้ปัญหา "ผูกกับคน ไม่ใช่ร้าน" — โจทย์ UX หลัก)

สัญญาณที่ทำให้ผู้ใช้เข้าใจโดยไม่ต้องอ่านคำอธิบายยาว วางไว้ **3 ชั้นซ้อนกัน** ที่จุดสายตาต่างกัน (กันกรณีตาข้ามชั้นใดชั้นหนึ่งไป — โดยเฉพาะ subtitle เล็กใต้ breadcrumb ที่คนมักสแกนข้าม):

1. **Page subtitle** ใต้ breadcrumb (จุดแรกที่เห็น): "ข้อมูลนี้เป็นของคุณโดยตรง ไม่ใช่ของร้าน — เหมือนกันไม่ว่าจะสลับไปร้านไหน"
2. **Badge ข้าง displayName ในการ์ด** (จุดที่สายตาจริง ๆ หยุดมองก่อนอ่านฟอร์ม): `<span className="badge bg-default-100 text-default-500">ใช้ร่วมกันทุกร้าน</span>` — **reuse ตัวอักษร/สไตล์เดียวกับ badge "ส่วนตัว" ที่ใช้ในทั้ง 2 switcher** (`bg-default-100 text-default-500`) เพื่อให้ผู้ใช้จับ visual grammar เดียวกันข้ามหน้าได้ (ไม่ใช่สร้างศัพท์ภาพใหม่)
3. **รูปทรง avatar เป็นวงกลม (`rounded-full`) เสมอ** — ต่างจาก `/shop`'s hero ที่ใช้โลโก้ **สี่เหลี่ยมมน** (`rounded-lg`, เหตุผลระบุไว้ใน comment ของ `ShopMobileHero.tsx` เองว่า "โลโก้ร้านเป็นสี่เหลี่ยม") — **ความต่างของรูปทรงนี้คือสัญญาณภาพที่มีอยู่แล้วในแอป** (วงกลม=คน, สี่เหลี่ยมมน=ร้าน ตาม `AccountAvatar.tsx` kind convention) ไม่ต้องสร้างภาษาใหม่ แค่ **ไม่ทำให้ /account หน้าตาเหมือน /shop โดยไม่ตั้งใจ**

**ห้ามมี:** shop name, active-shop badge, shop logo, breadcrumb ที่พาดพิงร้าน — หน้านี้ resolve จาก `session.user.id` เท่านั้น (SSOT บังคับห้าม `requireActiveShop`/`activeShopId` — reviewer grep gate มีอยู่แล้วใน SSOT §9)

### Card 1 — "ข้อมูลส่วนตัว"

**ไม่ใช้ stepper** (ต่างจาก `ShopForm.tsx`) — ตั้งใจ: เนื้อหามีแค่ avatar + 4 ฟิลด์ ไม่จำเป็นต้องแบ่ง step แบบร้าน (12 step เดิมของ Paces theme ถูก strip เหลือ 2 ใน ShopForm อยู่แล้ว) การบังคับ stepper ที่นี่จะเป็น "ทำตาม template เพราะเพื่อนบ้านทำ" ไม่ใช่ทำเพราะเนื้อหาต้องการ (craft-floor: no template answer)

| Field | Component | หมายเหตุ |
|---|---|---|
| avatar | tap-to-change circle, camera badge มุมล่างขวา | Base markup: `ShopMobileHero.tsx:110-140` (label+sr-only input+camera badge) **ปรับ `rounded-lg`→`rounded-full`** (คนละ semantic กับโลโก้ร้าน ตามข้อ 3 ด้านบน) ต่อด้วยปุ่มข้อความเล็ก "เปลี่ยนรูป · ลบรูป" ใต้ชื่อ (ลบ = `PATCH /api/users/me {avatar:null}` → fallback initials ของ `AccountAvatar.tsx`) |
| displayName | `form-input` | validation ฝั่ง client ขั้นต่ำ (ไม่ว่าง) — ความยาว/รูปแบบตาม Valibot schema ของ B0 (ไม่ใช่ของฉันกำหนด) |
| username | `form-input` + realtime check | Base UX: `onboarding/page.tsx` slug-check pattern (`idle/checking/ok/taken/invalid`, debounce, `invalid-msg` class) — **แต่ endpoint คนละตัว** (username ไม่ใช่ slug, ต้องมี endpoint check-username ใหม่หรือใช้ PATCH เองแล้วจับ 409 — ไม่ใช่ของฉันตัดสิน) helper text 2 สถานะ: ไม่แก้ไข = แสดง URL ปัจจุบันเฉย ๆ (`deepthailand.app/u/{username}` สี `text-default-400`); พิมพ์ค่าใหม่ที่ valid/available = เปลี่ยนเป็น **`text-warning`**: "เปลี่ยนแล้วลิงก์เดิม /u/{เดิม} จะใช้ไม่ได้อีก — ต้องแชร์ลิงก์ใหม่แทน" (บอกผลลัพธ์ ไม่ใช่แค่บอกว่า "ระวัง" ตาม clarify.md) |
| email | `form-input type=email` | optional, ไม่มี badge required |
| phone (มีแล้ว) | read-only row, ไม่ใช่ input | icon `phone` + เลข + `badge bg-success/15 text-success` `circle-check` "ยืนยันแล้ว" (เขียว **ถูกต้องตาม Verified-Means-Green** เพราะเป็น L1 PHONE_OTP ที่ verify จริงแล้ว ไม่ใช่สถานะรอ) + helper "เปลี่ยนไม่ได้หลังตั้งค่าแล้ว เพื่อความปลอดภัยของบัญชีคุณ" (อธิบายเหตุผล ไม่ใช่แค่สั่งห้าม) |
| phone (ยังไม่มี) | dashed row + ปุ่ม | border-dashed row (grammar เดียวกับปุ่ม "สร้างร้าน" — "เส้นประ = ยังไม่มี ตั้งได้") + `btn btn-sm bg-primary/15 text-primary` "เพิ่มเบอร์โทร" → เปิด 2-step OTP ผ่าน Swal input flow (ดูล่าง) |

**ปุ่ม "เพิ่มเบอร์โทร" flow** (2 ขั้น Swal.fire แบบ input — Base: `ConnectedAccountsClient.tsx:172-199` ajax-input Swal pattern):
1. Swal `input:'text'` กรอกเบอร์ → preConfirm validate `0[0-9]{9}` → `POST /api/otp/send {contact:phone, type:'PHONE'}` (endpoint เดียวกับ `register/page.tsx:102`)
2. Swal `input:'text'` กรอก OTP 6 หลัก → preConfirm → `POST /api/account/set-phone {phone, otp}` → success: `pacesToast.success('เพิ่มเบอร์โทรแล้ว')` + `update()` + `router.refresh()`

**บันทึก:** ปุ่ม "บันทึกการเปลี่ยนแปลง" เดียวสำหรับ displayName/username/email (batch, PATCH เดียว) — avatar เปลี่ยนทันทีไม่รอปุ่มนี้ (มี pattern เดิมจาก `AvatarEditable.tsx` แล้ว: อัปโหลดแล้วเซฟทันที) ปุ่ม disabled เมื่อ username check state = `checking`/`taken`/`invalid`

### Card 2 — "การเชื่อมต่อบัญชี" (preview, ไม่ implement action รอบนี้)

**คำแนะนำหลัก (ดู Open Questions #1):** ควรเป็น `<ConnectedAccountsClient>` ตัวเดิมที่ย้ายมาจาก `/settings` ตรง ๆ (ไม่ต้องออกแบบใหม่). แต่ถ้า Controller เลือกให้ `/settings` คงอยู่แยกต่างหาก (ตาม SSOT เดิม) ต่อไปนี้คือดีไซน์การ์ด "preview" ที่ Controller สั่งมา:

**ข้อมูลแสดงเป็นของจริง ไม่ใช่ mock** — คำนวณจาก query เดียวกับที่ `/settings/page.tsx:33-45` ทำอยู่แล้ว (`AuthAccount.provider` + `User.passwordHash != null`) ส่ง boolean ล้วนลง client (ไม่มี PII) **มีแค่ปุ่ม action ที่ยัง disabled** — ไม่ใช่การ์ดที่โกหกสถานะ (Impeccable: "trust ต้องแสดง ไม่ใช่ป่าวประกาศ" ใช้ตรงตัว แม้กับ dev-facing preview)

Base row markup: `ConnectedAccountsClient.tsx` `ProviderRow` (icon square `bg-default-100 size-9` + label + status badge ซ้าย, ปุ่ม action ขวา) — **icon 3 ตัว copy ของเดิมเป๊ะ** (proven ใช้งานจริงแล้ว ไม่เดาใหม่): รหัสผ่าน = `key` (tabler, ยืนยันมีจริงใน `theme/paces/.../icons/tabler/page.tsx:31`), LINE = inline SVG `LineIcon` จาก `ConnectedAccountsClient.tsx:45-63` (**ห้ามใช้ `icon="brand-line"`** — พบว่า `register/page.tsx` ใช้ชื่อนี้อยู่แต่ `ConnectedAccountsClient.tsx` มีคอมเมนต์ยืนยันชัดว่า tabler set ไม่มี LINE จริง จึงมี SVG แยกไว้แล้ว, ความขัดแย้งนี้เป็นความเสี่ยงที่มีอยู่แล้วในโค้ด ไม่ใช่สิ่งที่ฉันสร้างใหม่ — flag ไว้ Open Questions), Facebook = `icon="bxl:facebook-circle"` (boxicons, มีอยู่ใน allowed set ตาม Hard Rule 7)

ปุ่ม action: `btn btn-sm bg-light text-default-400 cursor-not-allowed` "เร็ว ๆ นี้" `disabled` — **ไม่ใช้สี danger/warning สำหรับ disabled** (ไม่ใช่ error state, เป็นแค่ยังไม่เปิดใช้งาน)

Card subtitle: "เพิ่มวิธีเข้าสู่ระบบให้บัญชีนี้ — เปิดใช้งานเร็ว ๆ นี้"

---

## Entry points (ทั้งหมด 3 จุด — เหตุผลไม่ใช่ความซ้ำซ้อน แต่ mirror pattern ที่ `/shop` มีอยู่แล้ว 3 จุดเท่ากัน)

| จุด | ไฟล์ | การเปลี่ยน |
|---|---|---|
| Sidebar (desktop) + auto-flow ไป mobile quick-links | `_seller-menu.ts` STORE group | เพิ่ม `{ url:'/account', slug:'seller:account', label:'ข้อมูลส่วนตัว', icon:'user-circle' }` **ก่อน** `seller:shop` (identity มาก่อน shop settings ตามลำดับความคิด) |
| Desktop dropdown | `UserDropdownDetailed.tsx` | เพิ่มแถว `<Link href="/account">` เหนือแถว "โปรไฟล์ / ตั้งค่าร้าน" เดิม เหมือน pattern เป๊ะ (`dropdown-item` + icon `user-circle` + label) |
| Mobile sheet footer | `AccountSwitcherSheet.tsx` | เพิ่มแถว footer หลัง business list (ดู ASCII ด้านบน) — เพราะ `AccountSwitcherLauncher` mount sheet เฉพาะ `hasBusinessMembership` (ผู้ถูกเชิญมีเสมอ) และเป็นทางเดียวที่มือถือถึง identity-context UI ได้จากทุกหน้า ไม่ต้องผ่าน `/shop` ก่อน |
| Mobile quick-links (fallback list) | `ShopQuickLinks.tsx` `LINKS` array | เพิ่ม entry แรกสุด (ก่อน "ยืนยันตน") mirror จาก `_seller-menu.ts` ตาม comment เดิมของไฟล์ที่บอกว่าต้อง sync กันด้วยมือ |
| Mobile nav hub ที่ /account เอง | `/account/page.tsx` `lg:hidden` block | reuse `<ShopQuickLinks>` + `<SignOutCard>` เดียวกับที่ `/shop` มี (component เดิม รับ prop shopKind/shopRole เดิม) — เพื่อให้ /account ทำหน้าที่ mobile-nav-fallback ได้เหมือน /shop ถ้าผู้ใช้ landing ที่นี่ก่อน |

---

## Theme Source Mapping

| Section | Source path | Component/pattern | หมายเหตุ adapt |
|---|---|---|---|
| A1 desktop CTA row | `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx` (แถว personal/business ที่มีอยู่) + `ChooseShopClient.tsx` (dashed-plus button style) | dropdown item + dashed accent | ผสม 2 pattern ที่มีอยู่แล้วในแอป ไม่ใช่ theme file ใหม่ |
| A1 mobile CTA row | `AccountSwitcherSheet.tsx` (แถว business ที่มีอยู่) + `ChooseShopClient.tsx` | list row + dashed accent | เดียวกับข้างบน สไตล์ sheet |
| A1 confirm | `src/lib/paces-swal.ts` (`pacesConfirm.question`) ← ตัว helper อ้าง `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx` เป็น Base อยู่แล้ว | `pacesConfirm.question(title,text,opts)` | ใช้ helper ตรง ไม่เขียน `Swal.fire` ดิบ |
| A1 loading overlay | `src/components/paces/ShopSwitchOverlay.tsx` | reuse ตรง + เพิ่ม optional `label` prop | ปรับเล็กน้อยให้ข้อความตรงบริบท "เปิดร้าน" ไม่ใช่ "สลับร้าน" |
| A3 back-link | ไม่มี pattern ตรง — **compose จาก** `dropdown-item`-scale text link + icon `arrow-back-up` (verified ใช้จริงใน `ChatThread.tsx:372`) | text link, tap target 44px via padding | ไม่พบ Paces primitive สำเร็จรูปสำหรับ "quiet back-link ในการ์ด auth" — ใกล้สุดคือ `w-full py-1 text-center text-sm text-default-500` skip-link ที่มีอยู่แล้วใน `onboarding/page.tsx:224` เอง (ปรับ align ซ้าย + ขนาดเล็กกว่า) |
| A3 switch flow | `src/hooks/useShopSwitcher.ts` + `ShopSwitchOverlay.tsx` | reuse ตรง | ต้อง fetch `/api/business/context` เพิ่มในหน้านี้ (ยังไม่มี) |
| B page shell | `src/app/(paces)/seller/(dashboard)/shop/page.tsx` (PageBreadcrumb + subtitle pattern) | server component + `requireActiveShop` **ตัดออก** | Base โครง breadcrumb/subtitle เท่านั้น — logic resolve คนละแบบตาม SSOT §5 |
| B card header (ทั้ง 2 การ์ด) | `theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx:32-35` (h5 `bg-light/15 border-dashed` centered) — ใช้จริงแล้วใน `/settings/page.tsx:108-129` | `card-header` centered dashed h5 | ตัด `uppercase` ตามที่โปรเจกต์ทำอยู่แล้วทุกจุด (Sentence-Case Rule) |
| B avatar tap-to-change | `src/app/(paces)/seller/(dashboard)/shop/components/ShopMobileHero.tsx:110-140` | `label htmlFor + sr-only input file + camera badge` | `rounded-lg`→`rounded-full` (คนละ semantic กับโลโก้ร้าน) |
| B avatar fallback render | `src/components/AccountAvatar.tsx` | circle + initials/icon fallback | ใช้ตรง — มี `kind='personal'` อยู่แล้ว |
| B avatar upload flow | `src/app/(marketing)/m/settings/profile/AvatarEditable.tsx` | `/api/upload` → `PATCH /api/users/me` | เอา flow ตาม CLAUDE.md convention (เอา flow ไม่เอา skin) — เปลี่ยน `toast` (react-toastify) → `pacesToast` |
| B username check UX | `src/app/(paces)/seller/onboarding/page.tsx:88-100` (slug check state machine) | debounce + `idle/checking/ok/taken/invalid` + `invalid-msg` | endpoint คนละตัว (username ไม่ใช่ slug) |
| B phone-verified row | ไม่มี pattern ตรง — compose จาก `.badge bg-success/15 text-success` (มาตรฐาน §6 component reference) + icon `phone`/`circle-check` | badge + icon row | primitive มีครบ ไม่ต้อง arbitrary |
| B เพิ่มเบอร์ OTP flow | `src/app/(paces)/seller/(dashboard)/settings/ConnectedAccountsClient.tsx:172-199` (2-step Swal ajax input) | `Swal.fire({input:'text',...})` ×2 | endpoint เปลี่ยนเป็น `/api/otp/send` + `/api/account/set-phone` |
| B connections card | `src/app/(paces)/seller/(dashboard)/settings/ConnectedAccountsClient.tsx` (ทั้งไฟล์ — production code จริง ไม่ใช่ theme demo) | `ProviderRow` pattern | ปุ่ม action → disabled "เร็ว ๆ นี้" state เท่านั้นรอบนี้ |
| Sidebar entry | `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` | เพิ่ม 1 entry ใน `children` ของ STORE group | ไม่แตะ logic gate functions |
| Mobile quick-links | `src/app/(paces)/seller/(dashboard)/shop/components/ShopQuickLinks.tsx` | เพิ่ม 1 entry ใน `LINKS` | sync ด้วยมือตาม comment เดิมของไฟล์ |
| Mobile nav-hub reuse | `ShopQuickLinks.tsx` + `SignOutCard.tsx` | reuse ตรง | ไม่ต้อง copy ใหม่ |

---

## User flow (ภาพรวม)

```
[Invited user, ไม่มี personal shop, active=BT]
  เปิด topbar dropdown (desktop) หรือแตะ avatar หัว /dashboard (mobile)
    → เห็นแถว "＋ สร้างร้านส่วนตัวของฉัน" แทนตำแหน่ง personal
    → กด → pacesConfirm.question ยืนยัน
    → ShopSwitchOverlay "กำลังเปิดร้าน..." → hard-navigate /onboarding
    → step 1/4 ... "← กลับไปร้านเดิม" อยู่มุมบนซ้ายตลอด 4 step (ไม่บังคับทำจนจบ)
    → จบ wizard หรือกดกลับกลางทาง → /dashboard ของร้านที่เลือก

[User คนไหนก็ได้ ต้องการแก้ชื่อ/รูปตัวเอง]
  เปิด dropdown/sheet → กด "ข้อมูลส่วนตัว" (หรือ sidebar/ShopQuickLinks)
    → /account → แก้ avatar (เซฟทันที) / แก้ฟิลด์ → "บันทึกการเปลี่ยนแปลง"
    → topbar/sheet อัปเดตชื่อ+รูปทันที (session.update())
```

---

## Content outline (ภาษาไทย — สรุปรวม)

- "＋ สร้างร้านส่วนตัวของฉัน" / "ขายของในนามตัวเอง" / "ขายของในนามตัวเอง — สร้างได้ครั้งเดียว"
- Confirm: "สร้างร้านส่วนตัวของคุณ?" / "ร้านนี้ผูกกับตัวคุณโดยตรงและสร้างได้ครั้งเดียว — พอยืนยันแล้วเราจะพาไปตั้งค่าร้านต่อทันที" / "สร้างร้านเลย" / "ยังไม่สร้างตอนนี้"
- Overlay: "กำลังเปิดร้านส่วนตัวให้คุณ…" / "กำลังพาไปตั้งค่าร้านต่อ"
- Error: "เปิดร้านไม่สำเร็จ กรุณาลองใหม่"
- Back-link: "กลับไปร้านเดิม"
- Page: "ข้อมูลส่วนตัว" / "ข้อมูลนี้เป็นของคุณโดยตรง ไม่ใช่ของร้าน — เหมือนกันไม่ว่าจะสลับไปร้านไหน"
- Badge: "ใช้ร่วมกันทุกร้าน"
- Labels: "ชื่อที่แสดง" / "ชื่อผู้ใช้" / "อีเมล (ไม่บังคับ)" / "เบอร์โทร"
- Username helper (ปกติ): "deepthailand.app/u/{username}"
- Username helper (เปลี่ยน): "เปลี่ยนแล้วลิงก์เดิม /u/{เดิม} จะใช้ไม่ได้อีก — ต้องแชร์ลิงก์ใหม่แทน"
- Phone verified: "ยืนยันแล้ว" / "เปลี่ยนไม่ได้หลังตั้งค่าแล้ว เพื่อความปลอดภัยของบัญชีคุณ"
- Phone missing: "ยังไม่มีเบอร์โทร" / ปุ่ม "เพิ่มเบอร์โทร"
- OTP add-phone Swal: "เพิ่มเบอร์โทรของคุณ" / "ใช้สำหรับยืนยันตัวตนและกู้คืนบัญชี — เปลี่ยนไม่ได้หลังตั้งค่าแล้ว" / "ส่งรหัส OTP"
- Save: "บันทึกการเปลี่ยนแปลง" / "กำลังบันทึก..." → toast "บันทึกข้อมูลส่วนตัวแล้ว"
- Connections card: "การเชื่อมต่อบัญชี" / "เพิ่มวิธีเข้าสู่ระบบให้บัญชีนี้ — เปิดใช้งานเร็ว ๆ นี้" / ปุ่ม "เร็ว ๆ นี้"
- เมนู entry: "ข้อมูลส่วนตัว"

---

## Edge states

- **A1 — race กดซ้ำ:** ปุ่มถูก disable ทันทีที่กด ก่อน confirm อีกที (double-click ระหว่างรอ confirm dialog ปิด)
- **A1 — API fail:** overlay ซ่อน, toast error, กลับสู่สถานะเดิม (แถวยังอยู่, กดใหม่ได้)
- **A1 — race 2 อุปกรณ์:** ถ้า personal shop ถูกสร้างจากอุปกรณ์อื่นระหว่างเปิด dropdown ค้างไว้ → partial unique index กันซ้ำที่ backend อยู่แล้ว (SSOT §4) → UI แค่ต้อง handle response 200 idempotent ตามปกติ ไม่ต้อง error พิเศษ
- **A3 — ไม่มี business membership:** ไม่ render ปุ่มเลย (ไม่ใช่ disabled — ไม่มี use case ให้เห็น)
- **A3 — business shop ถูกล็อก:** ถ้า business shop แรกที่จะกลับไปถูกล็อก (billing) — ใช้ toast error เดียวกับที่ `useShopSwitcher`/`handleSwitch` มีอยู่แล้ว ("บัญชีนี้ถูกล็อกชั่วคราว") ไม่ต้องออกแบบใหม่
- **B — username พิมพ์แล้วเคลียร์กลับเป็นค่าเดิม:** helper text ต้องกลับเป็น neutral (ไม่ค้าง warning) — เทียบค่าปัจจุบันกับค่าที่ save ไว้ล่าสุดเสมอ ไม่ใช่แค่ "มีการพิมพ์"
- **B — ชื่อ/username ยาวผิดปกติ:** `truncate` ทุกจุดที่แสดงชื่อ (badge, header) — input เองไม่ truncate (ต้องเห็นสิ่งที่พิมพ์เต็ม) แต่ helper URL preview ต้อง wrap หรือ truncate กลาง (`.../u/thanapat_...`) ป้องกัน username ยาว 30 ตัวดันเลย์เอาท์
- **B — เบอร์ format ผิดปกติ (ข้อมูลเก่า legacy):** แสดงค่าดิบตามที่เก็บใน DB ไม่พยายาม re-format ถ้าไม่ตรง pattern `0XXXXXXXXX` (กัน crash จาก edge-case data เก่า)
- **B — avatar upload fail/ไฟล์เกิน 5MB:** reuse error message จาก `AvatarEditable.tsx` เป๊ะ ("ไฟล์ใหญ่เกิน 5MB" / "เปลี่ยนรูปไม่สำเร็จ") ผ่าน `pacesToast.error`
- **B — no-permission:** ไม่มี — หน้านี้ auth-guard ระดับ session เท่านั้น (ทุก user login แล้วเข้าได้ ไม่มี role gate เพราะเป็นข้อมูลของตัวเอง)
- **B — loading แรกเข้าเพจ:** server component fetch user ตรง ๆ (เหมือน `/shop`) ไม่มี client loading state ที่เห็น — ถ้า user ไม่มี session → `redirect('/auth/sign-in')` (เหมือน `/shop` เป๊ะ)
- **Connections card — provider count 0/3 หรือ 3/3:** ทุก badge สถานะอ่านตรงไปตรงมา ไม่มีเคสพิเศษ (boolean ล้วน)

---

### Impeccable compliance

- **Mode: Operate** (dashboard/settings/switcher, seller authenticated) — earned familiarity ชนะการแสดงออก, ไม่มี choreography ตอนโหลดหน้า, ทุก state (default/hover/focus/active/disabled/loading/error) ต้องมีครบตามที่ระบุใน edge states ด้านบน. Register override = `product` ตาม PRODUCT.md
- **One Voice Rule:** primary น้ำเงิน `#236dc9` ปรากฏเฉพาะ: ปุ่ม "บันทึกการเปลี่ยนแปลง", badge active-state ใน switcher, dashed-CTA row (สร้างร้าน), primary ของ confirm dialog — ไม่ใช้กับพื้นหลัง/ตกแต่ง ไม่เกิน ~10% ของพื้นที่จอในทุก breakpoint (การ์ดส่วนใหญ่เป็น `bg-card` ขาว/`text-default-*` เทา)
- **Verified-Means-Green:** เขียวใช้จุดเดียวคือ badge "ยืนยันแล้ว" ของเบอร์โทร (verified L1 จริง) — **"เชื่อมแล้ว" ของ LINE/Facebook ใน connections card ใช้ `text-success`/`bg-success/15` เช่นกัน ซึ่งถูกต้อง** เพราะ AuthAccount ผูกจริงแล้วก็คือ "verified" ในความหมายนี้ (ไม่ใช่สถานะ "รอ") ส่วนปุ่ม action ที่ disabled ใช้ `bg-light text-default-400` (neutral, ไม่ใช่ warning เพราะไม่ใช่ error)
- **Sentence-case:** ทุก label/ปุ่ม/toast เป็นประโยคปกติ ไม่มี ALL CAPS (ตัด `uppercase` จาก theme demo ตามที่โปรเจกต์ทำอยู่แล้วทุกจุด)
- **Ink-tinted shadow:** ไม่มีการเพิ่ม shadow ใหม่ในสเปกนี้ — ใช้ `.card` (`shadow` token Paces) ตรงทุกจุด ไม่แตะค่า
- **Anti-slop:** ไม่มี hero-metric, ไม่มี eyebrow ตัวพิมพ์เล็กจิ๋ว, ไม่มีการ์ดซ้อนการ์ด (connections card ไม่ซ้อนใน personal-info card — แยก 2 การ์ดชัดเจน), ไม่มี gradient ตกแต่งใหม่, border-dashed ที่ใช้ (CTA row) เป็น pattern ที่มีอยู่แล้วในแอป (`ChooseShopClient.tsx`) ไม่ใช่ของประดิษฐ์ใหม่
- **น้ำเสียง:** ทุกจุดบอกทางออก/เหตุผล ไม่ใช่แค่บอกว่าห้าม (เบอร์โทร: บอกเหตุผลความปลอดภัย; username: บอกผลลัพธ์การเปลี่ยน ไม่ใช่แค่ "ระวัง"; error เปิดร้านไม่สำเร็จ: บอกให้ลองใหม่); ไม่มีคำไฮป์
- **พระเอกของแต่ละหน้า:** A1 = แถว CTA สร้างร้าน (สีต่างจากแถวอื่นด้วย dashed+primary tint, จุดเดียวในเมนูทั้งหมดที่ไม่ใช่ dropdown-item ธรรมดา); B = avatar+ชื่อในการ์ดแรก (ใหญ่สุด, บนสุด, badge เกาะติด) ส่วนการ์ด connections ตั้งใจให้เบากว่า (ปุ่ม disabled, สีเทา) เพราะยังไม่ implement — ไม่แย่ง focus จากการ์ดแรกที่ใช้งานได้จริง
- **จุดที่ theme ขัดกับ Impeccable + วิธีตัดสิน:**
  1. Theme `account-settings/page.tsx` ต้นฉบับใช้ `uppercase` บน section header — ตัดออกทุกจุด (Sentence-Case Rule ชนะ)
  2. Theme demo ของ Sweet Alerts ใช้ raw `Swal.fire` — โปรเจกต์มี `pacesConfirm` helper กลางแล้ว ใช้ helper แทนของ theme ตรง ๆ (ไม่ใช่ conflict กับ Impeccable แต่เป็นจุดที่ "theme file" ≠ "แหล่งที่ถูกต้องที่สุดในโปรเจกต์" — โปรเจกต์เองมี layer เหนือ theme อีกชั้น ต้องใช้ layer นั้น)
  3. ไม่มีจุดขัดสีอื่น — Paces primary ทุกจุดตรง token `bg-primary`/`text-primary` ไม่มี fallback ม่วง

### Design decisions + rationale

1. **avatar วงกลมเสมอใน /account** — ไม่ใช่แค่สวย แต่เป็นกลไก UX หลักที่แก้โจทย์ "ผูกกับคนไม่ใช่ร้าน" (ดู Section breakdown B)
2. **ไม่ใช้ stepper สำหรับ personal-info form** — เนื้อหาสั้นกว่าฟอร์มร้านมาก บังคับ stepper คือ over-engineering
3. **CTA แถวสร้างร้าน reuse grammar เส้นประจาก ChooseShopClient** แทนที่จะออกแบบใหม่ — ผู้ใช้เจอ "เส้นประ = สร้างของใหม่" ที่ /choose-shop มาก่อนแล้ว (คนละ entry point แต่ concept เดียวกัน — "เปิดร้านของฉันเอง")
4. **connections card แสดงสถานะจริงแม้ปุ่มยัง disabled** — ตรงกับหลัก "show don't tell" ของ PRODUCT.md มากกว่าโชว์ mock ที่ไม่ตรงความจริง และทำให้ dev ไม่ต้องรื้อ query ตอน implement C จริง
5. **max-w-2xl บนเดสก์ท็อป ไม่ยืดเต็ม main content** — ตอบโจทย์ anti-slop self-check ข้อ 9 (คอลัมน์ว่างที่ 1440px) ด้วยความตั้งใจ ไม่ใช่ปล่อยว่าง

### Anti-slop self-check

1. **เฉพาะกับ Deep:** ทุกจุดผูกกับกฎธุรกิจจริงของ Deep (personal shop สร้างครั้งเดียว, phone-immutable+trust score, `/u/{username}` เป็นสาธารณะ, tier ยืนยันตัวตน L1) — เอาไปแปะกับ SaaS ทั่วไปไม่ได้เพราะข้อความ/state ทั้งหมดอ้างอิงกลไกเฉพาะเหล่านี้
2. **1 พระเอกต่อหน้า:** มี — ระบุไว้ใน Impeccable compliance ทั้ง A1 (CTA row) และ B (avatar+ชื่อการ์ดแรก) การ์ด connections ตั้งใจเบากว่า
3. **ตัดของซ้ำ/ค่าคงที่:** ไม่มีการ์ด/metric คงที่ในสเปกนี้ (ไม่มี stat card ที่โชว์เลขเดิมทุกครั้ง) — ทุก field เป็นข้อมูลจริงที่เปลี่ยนได้ Card "การเชื่อมต่อบัญชี" อาจดูเหมือนซ้ำกับ `/settings` แต่ระบุชัดใน Open Questions #1 ว่าควรทำแค่จุดเดียว
4. **State ครบ:** empty (ไม่มีเบอร์/ไม่มี avatar) / loading (upload, save, otp) / error (upload fail, save fail, OTP ผิด, open-personal fail) / ข้อความยาวผิดปกติ (username 30 ตัว, ชื่อยาว) — ระบุไว้ใน Edge states ทั้งหมด
5. **Copy ตรงสิ่งที่ระบบทำได้จริง:** ปุ่ม "เร็ว ๆ นี้" ไม่ใช่ "เชื่อมต่อ" (เพราะยังกดไม่ได้จริง); "สร้างร้านเลย" ทำจริงตามนั้น; ไม่มีปุ่มไหนบอกทำอย่างหนึ่งแล้วทำอีกอย่าง
6. **คำเดียวกัน=ของเดียวกัน:** "ร้านส่วนตัว"/"ส่วนตัว" ใช้สม่ำเสมอกับที่มีอยู่แล้วในแอป (badge "ส่วนตัว" ของ switcher), "ยืนยันแล้ว" ใช้คำเดียวกับ phone-verify ทั่วระบบ, ข้อความ error "เปิดร้านไม่สำเร็จ กรุณาลองใหม่" ใช้คำเดิมเป๊ะจาก `ChooseShopClient.tsx`
7. **สีสื่อความหมายถูก:** เขียวเฉพาะสถานะ verified/linked จริง (ไม่มีจุดไหนใช้เขียวกับ "รอ"/"ยังไม่ยืนยัน") — ระบุเหตุผลไว้ชัดใน Impeccable compliance
8. **แตะได้จริงบนมือถือ:** ทุกปุ่ม/แถวใน switcher (size-9 avatar + py-3 row), back-link บน onboarding ระบุ padding-technique ให้ถึง 44px แม้ตัวหนังสือเล็ก, ปุ่มหลักทุกฟอร์มอยู่ล่างสุด/เต็มความกว้างบนมือถือ
9. **คอลัมน์ว่างที่ 1440px:** แก้แล้วด้วย `max-w-2xl` cap บนการ์ดของ `/account` (ระบุเหตุผลใน Design decisions #5) — ไม่ปล่อยให้ main content ยืดเปล่า

ข้อไหนไม่ผ่าน → ไม่มี ทุกข้อผ่านตามหลักฐานข้างต้น

### Open questions (ให้ Controller ตัดสิน)

1. 🛑 **[สำคัญที่สุด] `ConnectedAccountsClient` มีอยู่แล้วที่ `/settings` — จะย้ายมา `/account` เลย (Path A, แนะนำ) หรือคง SSOT เดิม (Path B, สร้าง preview card ที่ฉันออกแบบไว้ข้างบน แล้วรอ implement flow ใหม่ทีหลัง)?** ผลกระทบถ้าเลือก A: ต้องแก้ sidebar menu (`seller:settings` label/href), ลบการ์ดออกจาก `/settings/page.tsx` (เหลือแค่การ์ดการจัดส่ง), ไม่ต้องสร้างอะไรใหม่เลยสำหรับ C. นี่คือ IA/scope decision ที่กระทบ SSOT §6 โดยตรง — ฉันไม่ตัดสินเอง (Hard Rule 3)
2. **`icon="brand-line"` ที่ใช้ใน `register/page.tsx`** ขัดกับคอมเมนต์ใน `ConnectedAccountsClient.tsx` ที่บอกว่า tabler set ไม่มี LINE icon จริง (จึงมี inline SVG แยก) — ควร verify ว่า `register/page.tsx` render ไอคอนว่างอยู่หรือไม่ (ไม่ใช่ scope ของงานนี้ แต่เจอระหว่างสำรวจ ควรมีคน follow-up)
3. **A3 "กลับไปร้านเดิม" เมื่อมี business membership มากกว่า 1 ร้าน** — SSOT บอกแค่ "ร้านแรก" ไม่ได้ระบุลำดับ (created แรก? role OWNER ก่อน?) — ต้องให้ safepay-product/developer ตัดสิน ไม่ใช่ UX call
4. **username validation rules (ความยาว/อักขระ)** ที่แน่นอน มาจาก Valibot schema ของ B0 ซึ่งยังไม่ implement — helper text ข้อความ error แบบ "invalid" ที่ฉันร่างไว้เป็น placeholder เนื้อหา ให้ developer ปรับให้ตรง schema จริง
5. **companion HTML mockup** — ตาม memory `feedback_spec_html_mockup` งาน UI spec ปกติออกคู่ .md+.html ใน `docs/superpowers/specs/` แต่ฉันมีแค่ Read/Glob/Grep (ไม่มี Write) จึงส่งเฉพาะ markdown response นี้ — ถ้าต้องการ .html companion (3-breakpoint mockup จริงแทน ASCII) ต้องให้อีก turn/agent ที่มี Write ทำต่อ