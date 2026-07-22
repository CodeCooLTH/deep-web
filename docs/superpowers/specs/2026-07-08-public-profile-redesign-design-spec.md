# Design Spec: Public Profile Redesign — `/u/[username]` + `/b/[slug]`

> Surface: Vuexy (MUI) · route group `(marketing)/**` · mockup SSOT: `docs/superpowers/specs/2026-07-08-public-profile-redesign-mockup.html`
> ออกโดย safepay-ux (mandatory design gate, Hard Rule 8) — 2026-07-08

---

## 1. Overview

**เป้าหมาย:** redesign หน้า public trust profile (`/u/[username]` คนทั่วไป/ร้านส่วนตัว, `/b/[slug]` ธุรกิจจดทะเบียน) ให้ตรง mockup ที่ user อนุมัติ — banner tier เต็มใบพร้อม pill สรุป, identity card overlap, สถิติ/ความน่าเชื่อถือ/การยืนยันตัวตน/เกี่ยวกับร้าน แยกเป็น 4 การ์ดในคอลัมน์ซ้าย, สินค้าคอลัมน์ขวา — และมี **mobile-specific behavior ที่ต่างจาก desktop โดยสิ้นเชิง** (tab switcher + IG-style product grid)

**Scope:** 2 route ที่ share component tree เดียวกัน (`src/views/pages/user-profile/`) — ต้อง sync กันเสมอตาม comment เดิมในทั้ง 2 page.tsx

**Design system:** Impeccable (`.impeccable/design.json`) — ค่าฐาน (violet #7367F0, verified-green #28C76F, ink #2F2B3D, mist #F8F7FA, motion 150/200ms ease-out-quart) ตรงกับ design.json

> **⚠️ หมายเหตุแก้ไข 2026-07-22 (Impeccable audit):** ประโยคเดิมของบรรทัดนี้เขียนว่าค่าที่ mockup ใช้ "ตรงกับ design.json 100%" และระบุ radius 6-8px — **เป็นเท็จ**: mockup ฉบับก่อนแก้ยังใช้ tier-gradient เป็น Tailwind slate/orange/sky (ไม่มีใน token เลย) และ radius การ์ด/identity เป็น 12/14/18px ไม่ใช่ 6-8px ตามที่อ้าง. ได้แก้ mockup ให้ตรง `tonalRamp` จริง + radius canonical 8px แล้วในรอบนี้ (ดู §5 gradient table ปัจจุบัน) — **ห้ามเชื่อประโยค "ตรงกับ 100%" แบบเหมารวมอีก** ยึดค่าที่ระบุใน §5 เป็นความจริงปัจจุบัน ไม่ใช่สมมติว่า mockup CSS ตรงตัวเสมอไป

**Decisions ที่ยึด (จาก user, ห้ามขัด):**
1. Redesign ใหม่หมดตาม mockup
2. Completion rate แสดง (การ์ดสถิติ 3 ช่อง) — เพิ่ม field `completionRate` ใหม่
3. Verified badge = เขียวเดียว (chip `.chip-verified`) — ลบ badge วงกลมน้ำเงิน + rosette น้ำเงินบน avatar ทิ้ง
4. ครอบทั้ง 2 route, business เพิ่ม chip "ธุรกิจจดทะเบียน"
5. Avatar วงกลม (คงเดิม)
6. Star tier banner = ม่วงเต็มใบ — **accepted exception** ต่อ One Voice Rule (≤10%) เฉพาะ tier สูงสุด — ไม่ต้องแก้อะไรเพราะ `getTierGradient()` คืนม่วงอยู่แล้วสำหรับ A+ (มีอยู่แล้ว ไม่ใช่ของใหม่ — แค่บันทึกเป็น exception ที่รับทราบ)
7. Mobile (<768) พิเศษ: ข้อมูลร้าน → **4-tab switcher** (สถิติซื้อขาย/ความน่าเชื่อถือ/การยืนยันตัวตน/เกี่ยวกับร้าน, default=สถิติซื้อขาย), สินค้า → **IG grid 3-col ชิดกัน edge-to-edge ไม่มีปุ่ม** (แตะทั้งใบ); ≥768 กลับเป็นการ์ดครบ + product card grid มีปุ่ม

---

## 2. ASCII Wireframe — 3 device

### Desktop ≥1200px (2-col: sidebar 340px + main)

```
┌─────────────────────────────────────────────────────────────────┐
│ [Deep●]         หน้าแรก   ราคา              [เข้าสู่ระบบ]        │ topnav (ดู §12 open Q)
├─────────────────────────────────────────────────────────────────┤
│░░░░░░░░░░░░░░ tier gradient banner (240px) ░░░░░░░░░░░░░░░░░░░░░│
│ (Deep Gold ●●●○○)                          [74  คะแนนความน่าเชื่อถือ]│
├─────────────────────────────────────────────────────────────────┤
│ (avatar -56px)  ร้านกาญจนาช้อป ✓ยืนยันตัวตนแล้ว [ธุรกิจจดทะเบียน]│
│                 @kanjanashop                                     │
│                 [pin]กรุงเทพฯ  [cal]เข้าร่วม มี.ค. 2568          │
│           [award ร้านค้าขายอดนิยม][bolt จัดส่งสายฟ้า][check ยืนยันครบถ้วน][+3]│
│                 [ แชทกับร้าน ]  [ ติดตาม เร็วๆนี้ ]              │
├───────────────────────────┬─────────────────────────────────────┤
│ col-left (340px, sticky)  │ col-right (1fr)                     │
│ ┌───────────────────────┐ │ [pin] สินค้าปักหมุด      3 รายการ    │
│ │ คะแนนความน่าเชื่อถือ   │ │ ┌────┐┌────┐┌────┐                │
│ │      (gauge 74/100)   │ │ │card││card││card│  ← มีปุ่ม        │
│ │   ระดับ Deep Gold      │ │ │ ฿  ││ ฿  ││ ฿  │    "สอบถาม     │
│ │   อีก 6 แต้มถึง Diamond│ │ └────┘└────┘└────┘     สินค้านี้"  │
│ └───────────────────────┘ │                                     │
│ ┌───────────────────────┐ │ [grid] สินค้าทั้งหมด     9 รายการ  │
│ │ การยืนยันตัวตน         │ │ ┌────┐┌────┐┌────┐                │
│ │  ✓ OTP  ✓เอกสาร  ○L3  │ │ │card││card││card│ ×3 แถว          │
│ └───────────────────────┘ │ └────┘└────┘└────┘                │
│ ┌───────────────────────┐ │                                     │
│ │ สถิติการซื้อขาย        │ │                                     │
│ │  142 · 98% · ★4.9      │ │                                     │
│ │  ตอบกลับ 96% ~5นาที    │ │                                     │
│ └───────────────────────┘ │                                     │
│ ┌───────────────────────┐ │                                     │
│ │ เกี่ยวกับร้าน           │ │                                     │
│ │  bio · [pin] · [cal]   │ │                                     │
│ └───────────────────────┘ │                                     │
│ ┌───────────────────────┐ │                                     │
│ │ ชื่อเสียงแพลตฟอร์ม      │ │                                     │
│ │  [ตัวอย่าง] Shopee/Laz…│ │                                     │
│ └───────────────────────┘ │                                     │
├───────────────────────────┴─────────────────────────────────────┤
│                นโยบายความเป็นส่วนตัว · © Deep 2569               │
└─────────────────────────────────────────────────────────────────┘
```

### Tablet 768–1199px (stack, info card 2-up, product 3-up card)

```
┌──────────────────────────────────────────┐
│ [Deep●]      หน้าแรก ราคา  [เข้าสู่ระบบ]  │
├──────────────────────────────────────────┤
│░░░░░░ banner (190px) ░░░░░░░░░░░░░░░░░░░░│
│(Gold ●●●○○)              [74 คะแนน…]      │
├──────────────────────────────────────────┤
│ (avatar104) ร้านกาญจนาช้อป ✓ [ธุรกิจ]     │
│  @kanjanashop  [pin]กทม [cal]มี.ค.2568     │
│  [badges pills…]                          │
│  [แชทกับร้าน]     [ติดตาม เร็วๆนี้]        │
├──────────────────────────────────────────┤
│ col-left (2-col grid, ไม่มี tab)          │
│ ┌────────────────────────────────────┐   │
│ │ คะแนนความน่าเชื่อถือ (span 2)       │   │
│ └────────────────────────────────────┘   │
│ ┌──────────────────┐┌──────────────────┐ │
│ │ การยืนยันตัวตน    ││ สถิติซื้อขาย      │ │
│ └──────────────────┘└──────────────────┘ │
│ ┌──────────────────┐┌──────────────────┐ │
│ │ เกี่ยวกับร้าน      ││ แพลตฟอร์มอื่น     │ │
│ └──────────────────┘└──────────────────┘ │
├──────────────────────────────────────────┤
│ [pin] สินค้าปักหมุด     3 รายการ          │
│ ┌──────┐┌──────┐┌──────┐                  │
│ │ card ││ card ││ card │ ← มีปุ่มสอบถาม   │
│ └──────┘└──────┘└──────┘                  │
│ [grid] สินค้าทั้งหมด     9 รายการ         │
│ ┌──────┐┌──────┐┌──────┐  ×3 แถว          │
│ └──────┘└──────┘└──────┘                  │
├──────────────────────────────────────────┤
│      นโยบายความเป็นส่วนตัว · © Deep       │
└──────────────────────────────────────────┘
```

### Mobile <768px (identity → tab bar 4 แท็บ + panel เดียว → IG grid 3-up edge-to-edge)

```
┌──────────────────────┐
│[Deep●]      [เข้าสู่ระบบ]│  ← hamburger/compact nav (ดู §12)
├──────────────────────┤
│░░ banner (150px) ░░░░│
│(Gold●●●○○)  [74 คะแนน]│
├──────────────────────┤
│(avatar84 left-align)  │
│ ร้านกาญจนาช้อป ✓       │
│ @kanjanashop           │
│ [pin]กทม [cal]มี.ค.2568 │
│ [badge][badge][+3]     │
│ [แชท][ติดตาม]          │
├──────────────────────┤
│┌────────────────────┐│
││สถิติ│ความ│ยืนยัน│เกี่ยว││ ← mobile-tabs (scroll-x, pill active=violet-16)
│└────────────────────┘│
│┌────────────────────┐│
││ สถิติการซื้อขาย       ││ ← panel เดียวที่ active (default=สถิติ)
││ 142 · 98% · ★4.9     ││
││ ตอบกลับ 96% ~5นาที   ││
│└────────────────────┘│
├──────────────────────┤ ← col-right เริ่ม (ไม่อยู่ใน tab, เสมอโชว์)
│ สินค้าปักหมุด 3        │
│┌───┬───┬───┐          │
││📌฿││ ฿ ││ ฿ │  IG-grid, gap 2px
│└───┴───┴───┘  ไม่มี body/ปุ่ม
│ สินค้าทั้งหมด 9        │
│┌───┬───┬───┐          │
││ ฿ ││ ฿ ││ ฿ │  ×3 แถว
│└───┴───┴───┘          │
├──────────────────────┤
│  นโยบาย · © Deep       │
└──────────────────────┘
```

---

## 3. Component breakdown

| # | Component | Server/Client | Data / Props | Conditional render |
|---|---|---|---|---|
| 1 | `page.tsx` (×2 route) | Server (RSC) | fetch user/shop, verifications, orderStats(+CANCELLED), rating, pinned/other products | `notFound()` ถ้าไม่มี username/slug |
| 2 | `ProfileBanner` (redesign, **shared component — เห็น breaking-change risk ด้านล่าง**) | Client (`'use client'`, มีอยู่แล้ว) | `trustScore`, **ใหม่:** `tierLabel`, `showTierBadge?`, `showScoreBadge?`, `showBackButton?` (default `true` เพื่อ backward-compat กับ `/o/[token]`) | tier-pill+score-pill โชว์เฉพาะเมื่อ `showTierBadge/showScoreBadge=true` (ตั้งจาก /u,/b) |
| 3 | `ProfileIdentityBar` (redesign) | Client (มีอยู่แล้ว) | เพิ่ม `location`, `memberSince` (meta-row ใหม่), `topBadges` (3 แรก), `remainingBadgeCount`, **ใหม่:** `isBusiness?: boolean` | verified chip เขียวเดียว (ลบ blue rosette avatar-badge); business chip เฉพาะ `isBusiness` |
| 4 | `MobileInfoTabs` **(ใหม่)** | **Client** (`'use client'`, `useState<TabKey>`) | `tabs: {key,label}[]`, `activePanel` render children ตาม key | เฉพาะ `<768` (CSS ซ่อนที่ ≥768); จำนวน tab แปรตาม `isShop` (ดู §9) |
| 5 | `TrustScoreCard` (adapt เดิม) | Client (มีอยู่แล้ว) | เดิมครบแล้ว — เพิ่ม header icon `tabler-shield-check` | เสมอ |
| 6 | `VerificationChecklist` **(ใหม่ — revive จาก dead code `VerificationBadges.tsx`)** | Client | `verifiedLevels: number[]` → 3 แถว OTP/เอกสาร/ธุรกิจ (done/todo) | เสมอ (todo-state ถ้าไม่มี level ผ่าน) |
| 7 | `StatsCard` **(ใหม่)** | Client | `completedOrders`, `completionRate: number\|null`, `avgRating`, `showRating`, `chatResponseRate`, `chatMedianResponseSec`, `chatResponseSampleSize` | resp-line ซ่อนถ้า `chatResponseSampleSize<3`; คะแนนรีวิว → "—" ถ้า `!showRating` |
| 8 | `AboutCard` (แยกจาก `ProfileLeftContent` เดิม, ตัด response-line ออกไป StatsCard) | Client | `bio`, `location`, `memberSince` | bio/location conditional เดิม |
| 9 | `PlatformReputationList` (ย้ายจาก right → **left column**, เข้ากลุ่ม "ความน่าเชื่อถือ" tab) | Client (มีอยู่แล้ว) | ไม่มี props (placeholder) | ซ่อนเมื่อ `openShopEmptyState` |
| 10 | `ProductGrid` + `ProductTile` (redesign `ProfileRightContent`'s `ProductCard`) | Client (มีอยู่แล้ว, ask-button login-gate) | `product`, `pinned`, `shopId`, `isOwnShop` | ที่ `<768`: ไม่มี body/ปุ่ม, ทั้ง tile คลิกได้ (เงื่อนไขเดียวกับ `showAskButton`); ที่ `≥768`: การ์ด+ปุ่มเดิม |
| 11 | `UserProfile` (`index.tsx`) | Client (มีอยู่แล้ว) | ปรับ grid breakpoint จาก `md`(900) → `1200px` (ดู §8), prop-drill `completedOrders/avgRating/showRating/completionRate` จาก `profileHeader` ไปยัง `ProfileLeftContent` | — |

**สำคัญ — ProfileBanner เป็น shared component ข้ามหน้า:** `ProfileBanner` ถูก import ตรงใน `src/app/(marketing)/o/[token]/OrderDetailMobile.tsx` (order detail, ไม่อยู่ใน scope งานนี้) ด้วย `<ProfileBanner data={{trustScore}} bannerHeight={140} />` (ไม่มี back-button override, ไม่มี tier/score pill). ถ้าเพิ่ม tier-pill/score-pill/ปิด back-button ตรง ๆ ใน component จะกระทบหน้า order detail ทันที (breaking change นอก scope). **ต้องเพิ่มเป็น optional prop ใหม่ (default = พฤติกรรมเดิมทุกอย่าง)** ไม่ใช่เปลี่ยน default. `ProfileIdentityBar` ไม่ถูก import ที่อื่น (เฉพาะ `index.tsx`) — แก้ได้อิสระ

---

## 4. Theme Source Mapping

| Section | Theme file path | Component | หมายเหตุ adapt |
|---|---|---|---|
| Banner (gradient+pill) | `theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/UserProfileHeader.tsx` (Base เดิมของ `ProfileBanner`) | `Box` + `getTierGradient()` | เพิ่ม 2 pill overlay (`Box` absolute) — tier-name+dots ซ้ายบน, score ขวาบน; copy pattern จาก chip overlay ที่มีอยู่แล้วในไฟล์เดียวกัน (verify-badge overlay เดิม) |
| Identity card | เดิม `UserProfileHeader.tsx` → `ProfileIdentityBar` | MUI `Avatar`+`Chip`+`Button` | เพิ่ม meta-row (location/joined) จาก pattern `AboutOverview.tsx` icon-row; badge pills จาก `AchievementBadgeRow.tsx` ย่อ (icon+label pill แทน medal-frame) |
| Mobile tab switcher | `src/@core/components/mui/TabList.tsx` (`CustomTabList`, มีอยู่แล้ว) + `@mui/lab/TabContext`/`TabPanel` | `CustomTabList pill='true'` + `TabContext` | ดู §6 — override `.Mui-selected` sx ให้เป็น tonal (violet-16/violet) แทน solid fill ของ pill default |
| Trust gauge | `theme/vuexy/typescript-version/full-version/src/views/pages/widget-examples/advanced/AssignmentProgress.tsx` (Base เดิมของ `TrustScoreCard.tsx` — มีอยู่แล้ว ใช้ต่อได้เลย) | dual `CircularProgress` | ดู §5 — **พบบั๊ก SSOT accent color** ต้องแก้ |
| Verification checklist | `theme/vuexy/typescript-version/full-version/src/views/pages/user-profile/profile/ConnectionsTeams.tsx` (Base เดิมของ dead-code `VerificationBadges.tsx` ที่จะ revive) | Card + icon-row | "revive+restyle": icon-box 34×34 rounded, text ซ้าย, check-icon ขวา (ตาม mockup `.verify-item`) |
| Stats card | `theme/.../widget-examples/actions/RefreshContent.tsx` (3-column stat pattern) — ใกล้สุดที่พบ | `Grid`/`Box` 3-col + `Divider` (border-left) | **ไม่พบ theme widget ตรงเป๊ะ** — closest = `Box` grid + `sx={{borderLeft}}` (เหมือน mockup CSS). ให้ Controller ตัดสินยอมรับ MUI-primitive-compose (Hard Rule 1 ข้อยกเว้น) |
| About card | เดิม `ProfileLeftContent` About block (มีอยู่แล้ว) | `Box`+`Typography`+icon row | ตัด response-line ออก (ย้ายไป StatsCard) |
| Platform reputation | `theme/.../components/layout/shared/NotificationsDropdown.tsx` (Base เดิม) | `CustomAvatar` list | ไม่เปลี่ยน markup — ย้าย mount point จาก right → left column ใต้ trust tab |
| Product grid (mobile IG) | เดิม `ProductCard` ใน `profile/index.tsx` (Base: `theme/.../apps/academy/my-courses/Courses.tsx`) | `Box` image+overlay | ปรับ sx ให้ media-query-driven (ดู §8) — ลด `border-radius`/`box-shadow`/`prod-body` ที่ `<768`, คืนที่ `≥768` |
| Verified/business chip | `.impeccable/design.json` component `"Verified Chip"` (canonical) | MUI `Chip` + `sx` hardcode token (`rgb(40 199 111/0.16)`/`#28C76F`) — มีอยู่ใน design.json ไม่ใช่ arbitrary ใหม่ | |
| Topnav (ถ้าอนุมัติ — ดู §12) | `src/components/layout/front-pages/Header.tsx` (มีอยู่แล้ว, ใช้ใน `(buyer-app)/layout.tsx` ผ่าน `FrontLayout solidHeader`) | `<Header mode solidHeader />` ใน `FrontLayout` | ใช้ component จริงที่ auth-aware (`UserDropdown` ถ้า login) ไม่ใช่ static mockup nav |

---

## 5. สี/token spec

**⚠️ อัปเดต 2026-07-22 (Impeccable audit, S-B1 ข้อ 1):** ตารางนี้เดิมใช้ค่า Tailwind slate/orange/sky (หลุด token ทั้งชุด). แก้เป็นค่า derive จาก `.impeccable/design.json` `tonalRamp` จริงแล้ว (user อนุมัติ). **ที่มาแต่ละ tier:**

| Tier | `tonalRamp` source | index [dark, mid, light] |
|---|---|---|
| Classic | `warning-amber.tonalRamp` | `[0, 2, 4]` |
| Silver | `ink.tonalRamp` | `[1, 3, 5]` |
| Gold | `warning-amber.tonalRamp` | `[3, 4, 6]` |
| Diamond | `signal-cyan.tonalRamp` | `[3, 4, 6]` |
| Star | `primary.tonalRamp` | `[3, 4, 6]` |

**หมายเหตุ:** ตารางด้านล่างคือค่า "ปลายทาง" ที่ mockup ปรับตามแล้ว — `getTierGradient()` ใน `src/lib/trust-tier.ts` **ยังไม่ได้แก้** (ยังคืนค่า Tailwind เดิม) ต้องอัปเดตโค้ดให้ตรงตารางนี้เป็นงานแยก (S-Bx โค้ด นอก scope doc-only ของ S-B1) ก่อน implement banner จริง — ห้ามเขียนโค้ดอิงค่าเก่า:

| Tier | Gradient (banner) | Mid-stop / gauge accent | Dots |
|---|---|---|---|
| Deep Classic | `linear-gradient(135deg, #5c3300 0%, #b36700 45%, #FF9F43 100%)` | `#b36700` | 1/5 |
| Deep Silver | `linear-gradient(135deg, #454155 0%, #7a7689 45%, #bdbbc7 100%)` | `#7a7689` | 2/5 |
| Deep Gold | `linear-gradient(135deg, #e08400 0%, #FF9F43 45%, #ffd1a3 100%)` | `#FF9F43` | 3/5 |
| Deep Diamond | `linear-gradient(135deg, #009eb2 0%, #00BAD1 45%, #8ee5ee 100%)` | `#00BAD1` | 4/5 |
| Deep Star | `linear-gradient(135deg, #5a4ee0 0%, #7367F0 45%, #b3acf8 100%)` (accepted violet exception) | `#7367F0` | 5/5 |

**🐛 บั๊กที่พบใน SSOT helper ที่มีอยู่:** `TrustScoreCard.tsx`'s `GAUGE_ACCENT` map ปัจจุบัน key ด้วย `TierChipColor` (4 ค่า) แต่ `getTierColor()` คืน `'warning'` ให้ **ทั้ง Deep Classic (C/D) และ Deep Gold (B+)** → gauge accent วาด Classic เป็นสีเดียวกับ Gold ทั้งที่ mockup ต้องการ Classic (mid-stop `#b36700`) แยกจาก Gold (mid-stop `#FF9F43`). **5 สีต้องแยกกันหมด.** แนะนำ dev เพิ่ม `getTierAccentColor(trustScore): string` ใน `src/lib/trust-tier.ts` (parallel กับ `getTierGradient`, คืน mid-stop hex) แล้วให้ `TrustScoreCard` + banner tier-line text ใช้ getter ใหม่แทน `GAUGE_ACCENT[tierColor]` เดิม

**Scrim override — Gold/Diamond (B1 ข้อ 3):** `.banner-tier`/`.banner-score` ใช้ scrim พื้นหลัง `rgb(47 43 61 / 0.26)`/`0.28` ทุก tier — ยกเว้น **Gold กับ Diamond ต้องเพิ่ม override เป็น `rgb(47 43 61 / 0.34)`** (tier อื่นคงค่าเดิม, accepted inconsistency ดู scope baseline A-4). เหตุผล: contrast ตกเกณฑ์ AA จริงที่ 2 tier นี้ (Gold 4.20:1, Diamond mid-stop 3.64:1) และ tier-name 15px/600 **ไม่เข้าเกณฑ์ large text** ของ WCAG (ต้อง ≥18.66px@700) จึงต้องผ่าน 4.5:1 ไม่ใช่ 3:1 — override ด้วย descendant selector ต่อ `.banner[data-tier="gold|diamond"]` (ดู mockup CSS) ไม่รื้อโครง `.banner-tier`/`.banner-score` เดิม

**ตำแหน่ง pill (B1 ข้อ 4):** pill ข้อความ (tier-name, score) **ห้ามวางบนโซน >60% ของ gradient** (โซนสว่าง/ปลาย gradient ตกเกณฑ์ AA ทุก tier แม้มี scrim) — ยึดตำแหน่งมุมบนเดิมของ mockup (tier-pill ซ้ายบน, score-pill ขวาบน) ซึ่งอยู่ในโซน 0–20% ของ gradient (dark stop) เสมอ

**Token อื่น (ตรง design.json):**
- Verified green chip: bg `rgb(40 199 111 / 0.16)`, text `#28C76F`
- Business chip: bg `rgb(115 103 240 / 0.16)`, text `#7367F0` (violet tonal — chip เล็ก ยังอยู่ใน ≤10% budget)
- Ink Plum `#2F2B3D` (ไม่ใช่ `#000`); Cool Mist `#F8F7FA`
- Card shadow (พัก): `0 2px 8px rgb(47 43 61 / 0.12)`; hover: `0 3px 12px rgb(47 43 61 / 0.14)`
- Radius: การ์ด `8px`, chip/pill `9999px`, verify-icon box `10px`
- Motion: `150ms cubic-bezier(0.25,1,0.5,1)` (hover/tab switch), `700ms` เฉพาะ gauge reveal (comment กำกับ arbitrary duration — one-time reveal ไม่ใช่ hover state)
- Tab active state (mobile): bg `violet-16`, text `#7367F0`, weight 600 — **ไม่ใช่ solid fill** (override `CustomTabList pill` default)

---

## 6. Interactive/state + client island

| Interaction | Behavior | Client component |
|---|---|---|
| ปุ่ม "แชทกับร้าน" | reuse `handleChatClick` เดิม (login-gate → `/auth/sign-in?callbackUrl=/messages/{shopId}`) | `ProfileIdentityBar` (เดิม) |
| แตะสินค้า mobile (<768) | ทั้ง tile clickable, target เดียวกับปุ่ม "สอบถามสินค้านี้" (`/messages/{shopId}?productId=X`, login-gate) — **disable เมื่อ `isOwnShop` หรือไม่มี `shopId`** | `ProductTile` (adapt เดิม) |
| ปุ่ม "สอบถามสินค้านี้" (≥768) | เดิมทุกอย่าง (`handleAskClick`) | `ProductTile` (เดิม) |
| Mobile tab switch | `useState<TabKey>` ใน `MobileInfoTabs`, คลิก tab → เปลี่ยน active panel (ไม่ scroll, ไม่เปลี่ยน URL) | **ใหม่:** `MobileInfoTabs.tsx` |
| Gauge reveal animation | `stroke-dashoffset` transition — คง `CircularProgress` behavior เดิม, comment กำกับ 700ms arbitrary | `TrustScoreCard` (เดิม) |
| ปุ่มติดตาม | คง `disabled` + tooltip "เร็ว ๆ นี้" | `ProfileIdentityBar` (เดิม) |
| Mock control bar (device/tier/page switcher) | **ไม่ port** — demo tool ของ mockup | — |

---

## 7. RSC/nav

- `page.tsx` (×2) คง Server Component เดิม — เพิ่มแค่ query `cancelledCount` จาก `orderStats` ที่ fetch อยู่แล้ว (ไม่เพิ่ม query ใหม่) + คำนวณ `completionRate`
- Interactivity ทั้งหมดอยู่ใน `'use client'` sub-component ที่มีอยู่แล้ว + ใหม่ 3 ตัว: `MobileInfoTabs`, `VerificationChecklist`, `StatsCard` (presentational — รับ props ล้วน)
- Topnav (ถ้าอนุมัติ §12) → ใช้ `Header` ที่มีอยู่แล้วผ่าน `FrontLayout` — ไม่กระทบ RSC
- Footer link เดิม (`NextLink` ห่อ `Typography`, Hard Rule 2 compliant) — คงไว้
- ไม่มีจุดไหนต้องใช้ `component={Link}` ใหม่

---

## 8. Responsive spec — breakpoint approach

**ปัญหา:** MUI default breakpoints (ไม่ override ในโปรเจกต์) = `sm=600 / md=900 / lg=1200`. Mockup ต้องการ `768` และ `1200`. `768` ไม่ตรง `md`(900) — ถ้าใช้ `md` ตรง ๆ จะเกิดช่วง 768–899 ที่ layout ค้างโหมด mobile

**Container query ของ mockup มีไว้ demo เท่านั้น** (จำลอง 3 device ในกรอบเดียว) — หน้าเว็บจริง container = viewport เต็มจอ ผลลัพธ์จาก `@media (min-width:768px)` เหมือนกันทุกประการ

**2 ทางเลือก:**
- **Option A (แนะนำ):** raw media-query key ใน MUI `sx` — `sx={{ display:'none', '@media (min-width:768px)':{ display:'block' } }}` ตรง 768/1200 ตาม mockup, ไม่แตะ MUI theme breakpoints, สอดคล้อง tree เดิม (sx-heavy 100%) — diff เล็กสุด
- **Option B:** Tailwind `min-[768px]:`/`min-[1200px]:` — มี precedent (`(buyer-app)/layout.tsx` 2026-07-04) แต่ precedent อยู่ใน Tailwind-className component; เอามาใช้กับ `user-profile/` (sx-heavy) ต้องแปลงทั้งชุด sx→className diff ใหญ่ เสี่ยง mixed styling

**Recommendation: Option A**

**Mobile↔desktop 2-layout-mode implementation:**
- **Tab vs sidebar (col-left):** DOM เดียว — `MobileInfoTabs` (useState) คุม panel active ที่ `<768`; ≥768 sx บังคับทุก panel `display:block` + ซ่อน tab-bar (`'@media (min-width:768px)':{display:'none'}`) — 1 tree, CSS คุม tab-bar visibility, JS คุม panel เฉพาะตอน tab-bar โชว์
- **IG grid vs card grid (product):** **CSS-only switch บน component เดียว** (ไม่ fork) — `ProductTile` sx เปลี่ยน `border-radius`/`box-shadow`/`.prod-body`/`.prod-price-ov` ตาม media query — เบา/ปลอดภัย (SSR เดียว ไม่ hydration-mismatch)
- **Grid split:** `UserProfile` (`index.tsx`) เปลี่ยนจาก `display:{md:'grid'}` → `'@media (min-width:1200px)':{display:'grid', gridTemplateColumns:'340px 1fr'}`; ต่ำกว่านั้น normal flow (DOM order = col-left ก่อน col-right)

---

## 9. Edge cases → render

| Edge case | Render |
|---|---|
| Buyer-only (`isShop=false`) | col-right (products) ซ่อน; Platform card ซ่อน; **mobile tab เหลือ 3 แท็บ** (ความน่าเชื่อถือ/การยืนยันตัวตน/เกี่ยวกับ) — **ซ่อน "สถิติซื้อขาย"** (0 ออเดอร์ทำให้เข้าใจผิด); default active → "ความน่าเชื่อถือ"; หัวการ์ด → "เกี่ยวกับ" (ตัด "ร้าน") |
| `maxVerifyLevel=0` | Verify chip (identity) ซ่อน; **แท็บ "การยืนยันตัวตน" ยังอยู่** — โชว์ 3 แถว `todo` ทั้งหมด (CTA ให้ไปยืนยัน) |
| ไม่มีสินค้าเลย | empty-state เดิม (`tabler-photo-off` + "ร้านนี้ยังไม่มีสินค้า") full-width (ไม่ edge-to-edge, คง padding 40/20) |
| ไม่มี pinned (other>0) | ซ่อนโซน "สินค้าปักหมุด" (gate เดิม) — เหลือ "สินค้าทั้งหมด" |
| `reviewCount<3` (`showRating=false`) | Stat "คะแนนรีวิว" คง 3 คอลัมน์ โชว์ `"—"` (ไม่ยุบ) |
| `chatResponseSampleSize<3` | resp-line ซ่อน (gate เดิม FR-RESP-04) |
| `completionRate` หารศูนย์ (`confirmed+cancelled=0`) | โชว์ `"—"` แทน `%` (ไม่ซ่อน stat) |
| `trustScore=0` (Classic) / `≥90` (Star) | gradient/accent ตาม §5 — ไม่มี edge พิเศษ |
| `isOwnShop=true` | ปุ่มแชท disabled + tooltip "นี่คือร้านค้าของคุณเอง"; ask/tile-tap สินค้าปิด (gate เดิม) |
| username/slug ไม่มี | `notFound()` (เดิม) |
| `bio`/`location` ว่าง | Conditional render เดิม — sync gate ทั้ง identity meta-row และ About card |
| `/b/[slug]` business | chip "ธุรกิจจดทะเบียน" เสมอ; L3 verify มัก done (observation, checklist render ตาม `verifiedLevels` จริง) |
| ไม่มี avatar/logo | fallback อักษรแรก วงกลม `#E7E5EF` bg |

---

## 10. Icon mapping (inline SVG mockup → `@iconify/react` tabler)

> Convention: `<Icon icon='tabler-xxx' />` (dash format, ไม่ใช่ colon) — ยึด precedent เดิมในไฟล์นี้

| mockup element | Icon name |
|---|---|
| แชทกับร้าน | `tabler-message-circle-2` (มีอยู่แล้ว) |
| ติดตาม (disabled) | `tabler-user-plus` |
| Verified chip rosette | `tabler-rosette-discount-check` (outline — ต่างจาก `-filled` เดิมที่ถูกลบ) |
| Business chip / verify ธุรกิจ | `tabler-building-bank` (closest) |
| meta-row location | `tabler-map-pin` |
| meta-row joined | `tabler-calendar` |
| badge "ร้านค้าขายอดนิยม" (ตัวอย่าง) | `tabler-award` (mockup icon shape — ของจริงใช้ `badgeIconName()` helper) |
| badge "จัดส่งสายฟ้า" (ตัวอย่าง) | `tabler-bolt` (mockup icon shape — ของจริงใช้ `badgeIconName()` helper) |
| badge "ยืนยันครบถ้วน" (ตัวอย่าง) | `tabler-check` (mockup icon shape — ของจริงใช้ `badgeIconName()` helper) |
| card-head คะแนน | `tabler-shield-check` |
| card-head ยืนยันตัวตน | `tabler-circle-check` |
| card-head สถิติ | `tabler-chart-line` (fallback `tabler-chart-histogram`) |
| card-head เกี่ยวกับ | `tabler-info-circle` |
| card-head แพลตฟอร์ม | `tabler-world` |
| verify OTP | `tabler-phone` |
| verify เอกสาร | `tabler-file-text` |
| resp-line clock | `tabler-clock` |
| section pin | `tabler-pin-filled` |
| section grid | `tabler-layout-grid` |
| product empty | `tabler-photo` / `tabler-photo-off` |
| ask button | `tabler-message-question` |
| star rating | `tabler-star-filled` |
| back button (ถ้าใช้) | `tabler-arrow-left` |

---

## 11. Acceptance / QA checklist

- [ ] ตรง mockup ทุก breakpoint: 375px (mobile), 834px (tablet), 1160–1440px (desktop) — Chrome DevTools MCP baseline
- [ ] Mobile: tab bar 4 แท็บ (3 ถ้า buyer-only) สลับ panel ได้, default = สถิติ (หรือความน่าเชื่อถือถ้า buyer-only), ไม่ scroll หน้าเวลาสลับ
- [ ] Mobile: product grid 3-col edge-to-edge (gap ~2px), ไม่มี chrome/ปุ่ม, ราคา overlay อ่านออกบนรูปมืด/สว่าง
- [ ] ≥768: tab หาย, การ์ด info ครบ, product กลับเป็น card grid มีปุ่ม
- [ ] ≥1200: sidebar 340px sticky + main แยก
- [ ] Verified chip เขียวเดี่ยว (ไม่มี badge วงกลมน้ำเงินหลงเหลือบน avatar)
- [ ] Gauge สี 5 tier แยกกันชัด (Classic ≠ Gold หลังแก้บั๊ก §5)
- [ ] `completionRate` หารศูนย์ → "—" ไม่ crash/NaN%
- [ ] `/b/[slug]` chip "ธุรกิจจดทะเบียน" โชว์, sync กับ `/u/`
- [ ] `/o/[token]` (OrderDetailMobile) **ไม่พัง** หลังแก้ `ProfileBanner` (regression check)
- [ ] tap target ≥44px ทุกปุ่ม/tab/tile
- [ ] grep emoji = 0 (Hard Rule 12), grep font อื่น = 0 (Hard Rule 5)
- [ ] Edge case ทุกแถว §9 ทดสอบด้วย seed data

---

## 12. Open questions (ให้ Controller เคาะก่อน dev)

1. **Topnav ใหม่:** mockup ใส่ Vuexy front header ที่หน้านี้ — ปัจจุบัน `/u`,`/b` ไม่มี nav (มีแค่ back-button บน banner ซึ่ง mockup ตัดออก). เพิ่มจริงไหม? ถ้าเพิ่ม แนะนำ `Header.tsx` จริง (auth-aware) ผ่าน `FrontLayout solidHeader`; ถ้าไม่ ต้องคง back-button
2. **`ProfileBanner` breaking-change:** เห็นด้วยกับ optional-prop-backward-compat (ไม่กระทบ `/o/[token]`) หรือ fork banner แยก?
3. **`isBusiness` mapping:** `/b/[slug]`=true เสมอ, `/u/[username]`=`user.shop?.kind==='BUSINESS'` ถ้ามี field — ให้ safepay-product/dev ยืนยัน field ที่ถูกความหมาย
4. ~~**Achievements section:** mockup ตัดการ์ด medal-frame แยก เหลือแค่ badge pills 3 ใบ + "+N" ใน identity → `AchievementBadgeRow.tsx` กลายเป็น dead code. ยืนยันตัด หรือเก็บ "ดูทั้งหมด" ใน About tab?~~ **ปิดแล้ว 2026-07-22 (Impeccable audit, S-B1 ข้อ 5):** ตัดการ์ด medal-frame แยกจริง — เหลือ badge pills 3 ใบในแถว identity (เรียง `userBadges` ตาม `earnedAt` **DESC** เอา 3 ใบล่าสุด, icon จาก `badgeIconName()` helper เดิม — **ห้าม hardcode ชื่อ/icon**) + link "ดูเหรียญทั้งหมด (N)" (`.badge-more` ใน mockup) เป็นทางเข้าดู badge ครบ (ปลายทาง route/modal ยังไม่กำหนด — TODO แยก นอก scope นี้). `AchievementBadgeRow.tsx` ยืนยันเป็น dead code ต่อไปตาม S-B8 (no-op, ไม่ลบ). ตัวอย่าง badge จริง 3 ใบที่ใช้อ้างอิงใน mockup (จาก `prisma/badge-seed-data.ts`, audience SELLER/ANY): "ร้านค้าขายอดนิยม" (Trusted Seller 50), "จัดส่งสายฟ้า" (Speed Demon), "ยืนยันครบถ้วน" (Fully Verified) — ชื่อเดิม 3 ชื่อที่ mockup เคย hardcode เป็นชื่อสมมติที่ไม่มีอยู่จริงในระบบ ถูกแก้แล้ว
5. **Stats card — ไม่มี theme widget ตรง:** ยอมรับ MUI-primitive-compose (`Box`+`Divider`) ตาม Hard Rule 1 ข้อยกเว้น?
6. **Tab component:** แนะนำ `CustomTabList pill` + sx override tonal, หรือ `ToggleButtonGroup`?
7. **`/b/` username display:** mockup โชว์ `deepthailand.app/b/kanjana-trading` แทน `@slug` — เจตนาหรือ demo quirk? แนะนำ default `@{slug}` เพื่อ consistent
8. **breakpoint approach (§8):** ยืนยัน Option A (raw `@media` ใน sx)?

---

## ไฟล์ที่เกี่ยวข้อง

- mockup SSOT: `docs/superpowers/specs/2026-07-08-public-profile-redesign-mockup.html`
- requirement (safepay-product): ในประวัติ session (Goal/FR live-vs-placeholder/edge/acceptance)
- helpers: `src/lib/trust-tier.ts`, Tier Lists: `docs/10 - Business Rules/Tier Lists.md`
- โค้ดปัจจุบัน: `src/app/(marketing)/u/[username]/page.tsx`, `.../b/[slug]/page.tsx`, `src/views/pages/user-profile/**`
- RSC nav: `src/app/(marketing)/_components/mui-link.tsx`
