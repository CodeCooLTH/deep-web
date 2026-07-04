# Design Spec — `/u/[username]` Profile Redesign (Hybrid: Facebook Page × Threads)

> **วันที่:** 2026-07-04 · **Route:** `src/app/(marketing)/u/[username]/page.tsx` (+ `b/[slug]/page.tsx` shared) · route group `(marketing)` = Vuexy
> **Mockup (คู่ไฟล์นี้):** `docs/superpowers/specs/2026-07-04-profile-redesign-mockup.html` (3 devices เต็มจอ)
> **ที่มา:** user brainstorm 7 รอบ → เลือก reference **Facebook Page + Threads** → ผสมเป็น 1 layout · safepay-ux Design Spec · user sign-off mockup + honesty decisions

## Goal
ยกเครื่องหน้าโปรไฟล์ร้านสาธารณะให้ "สวย + น่าเชื่อถือ" ตาม reference ที่ user ให้ (Facebook Page structure + Threads visual language) skin ด้วย Vuexy CI (primary ม่วง #7367F0) โดย**โชว์เฉพาะข้อมูลจริง** — ตัดตัวเลขที่ไม่มี data backing ออก (Deep = trust platform, ห้ามเลขปลอม)

## Locked decisions (user, 2026-07-04)
| # | Decision |
|---|---|
| D1 | **Layout = Hybrid**: โครงจาก FB Page (cover + avatar overlap + metric row + tabs + desktop 2-col) + ภาษาภาพจาก Threads (underline tabs, สะอาด เว้นเยอะ การ์ดเบา) |
| D2 | **สี = Vuexy CI** ทั้งหมด (primary/success/warning/info + Anuphan) — ไม่ใช่ palette ที่ประดิษฐ์เอง |
| D3 | **เต็มจอทุก breakpoint** — ไม่มีการ์ดลอย/gradient frame/padding ขอบข้าง (mobile/tablet/desktop full-bleed) |
| D4 | **Cover = CSS gradient ต่อ tier** (แทนรูป baked `getTierCover`) — โทนยึด `Tier Lists.md` SSOT |
| D5 | **Pinned = interim visual** — "สินค้าปักหมุด" = 3 ชิ้นแรก (pin backend ยังไม่มี → เป็น feature ถัดไป) |
| D6 | **ตัดเลขปลอม 3 จุด** (honesty) — ผู้ติดตาม, ★rating รายสินค้า, ส่งตรงเวลา 98% |

## Section breakdown (โครงที่ implement)
1. **Cover** — gradient ต่อ tier (`getTierGradient`) + dot-mesh CSS overlay, height `{xs:148, sm:200, md:240}`, back-button frosted เดิม
2. **Identity bar** — avatar 112px overlap + verify badge (✓ carve-out); ชื่อ + verify icon (`tabler-rosette-discount-check-filled`) + @handle; **metric row = ออเดอร์ · ★rating(gate) · tier chip**; ปุ่ม แชท(primary, login-gate เดิม) / ติดตาม(disabled "เร็ว ๆ นี้"). responsive: xs=column กลาง, sm+=row (ปุ่ม ml:auto)
3. **Tabs** — MUI `Tabs`/`Tab` underline (ไม่ pill), anchor-scroll ไป section id (ไม่เปลี่ยน route); ซ่อนแท็บที่ section ไม่ render
4. **ซ้าย (sticky 340px, desktop)** — เกี่ยวกับร้าน (bio/location/joined + response-rate gate ≥3) · **TrustScoreCard** (gauge dual-CircularProgress + "ระดับ {tier} · อีก N แต้มถึง {next}" + chip OTP/เอกสาร/จดทะเบียนธุรกิจ) · การรับรอง (badge medal-frame)
5. **ขวา (1fr, desktop)** — สินค้าปักหมุด (การ์ด bordered + flag "ปักหมุด") · สินค้าทั้งหมด (ซ่อนถ้า ≤3) · ชื่อเสียงแพลตฟอร์มอื่น (list, ป้าย "ตัวอย่าง")

## Theme Source Mapping (Base:)
| Component | Base (theme/vuexy/typescript-version/full-version/src/) |
|---|---|
| `TrustScoreCard.tsx` | `views/pages/widget-examples/advanced/AssignmentProgress.tsx` (dual CircularProgress + center label) |
| `ProfileTabsNav.tsx` | `views/pages/user-profile/index.tsx` (TabContext + CustomTabList; ตัด pill) |
| `PlatformReputationList.tsx` | `components/layout/shared/NotificationsDropdown.tsx` (getAvatar/CustomAvatar rounded) |
| `ProductCard` (profile/index.tsx) | `views/apps/academy/my-courses/Courses.tsx` (bordered-card) |
| `UserProfileHeader.tsx`, `index.tsx` | `views/pages/user-profile/{UserProfileHeader,index}.tsx` (Base เดิม, adapt ต่อ) |
| cover gradient · identity layout · metric row | compose-from-MUI-primitive (D7 approved exception ต่อเนื่องจาก spec 2026-05-23) — สีจาก Vuexy CI token |

## Honesty decisions (D6 — ตัดเลขปลอม)
โชว์เฉพาะข้อมูลที่มี data จริง; ที่ตัด + เหตุผล:
- **ผู้ติดตาม** — ไม่มี follow system (ปุ่ม Follow ยัง disabled) → ตัด
- **★rating รายสินค้า** — `Product` schema ไม่มี rating ต่อชิ้น (เดิมโชว์ shop `avgRating` ซ้ำทุกใบ = ปลอมต่อชิ้น) → ตัด เหลือราคา
- **ส่งตรงเวลา 98%** — hardcode ไม่มี field จริง → ตัด
- **คงข้อมูลจริง:** ออเดอร์สำเร็จ (CONFIRMED) · avgRating (gate showRating ≥3 รีวิว) · trustScore + verifiedLevels · response-rate (gate ≥3 sample) · แพลตฟอร์มอื่น = placeholder มีป้าย "ตัวอย่าง" + caption

## Acceptance Criteria
1. Cover แสดง gradient ตรง tier (`getTierGradient(trustScore)`)
2. metric row = ออเดอร์ · ★rating(เฉพาะ showRating) · tier chip — ไม่มีผู้ติดตาม/98%
3. TrustScoreCard: gauge = trustScore, ข้อความ next-tier ถูก (threshold 60/70/80/90), chip verify ติ๊กตาม verifiedLevels
4. สินค้าปักหมุด = 3 ชิ้นแรก + flag "ปักหมุด"; สินค้าทั้งหมด = ที่เหลือ (ซ่อนถ้า ≤3); 0 ชิ้น = empty state เดียว
5. ProductCard ไม่มี ★rating (ราคาอย่างเดียว); ปุ่ม "สอบถามสินค้านี้" login-gate เดิม
6. tabs คลิก = smooth-scroll ไป section; ซ่อนแท็บที่ section ไม่ render
7. full-bleed ทุก breakpoint (ไม่มี maxWidth/shadow/radius/padding ขอบ)
8. buyer-only (openShopEmptyState) ซ่อน right + tabs สินค้า; notFound เดิม; chat disabled เมื่อ isOwnShop/ไม่มี shopId
9. mobile 375px ไม่ overflow · Anuphan ทุก surface · ไม่มี emoji (เว้น ✓/★ carve-out)

## Out of scope (feature ถัดไป)
- **Pin backend** (Product.isPinned/pinnedOrder + หน้าจัดการหลังบ้าน seller + wire pinned จริง) — ตอนนี้ interim = 3 ชิ้นแรก
- Follow system, real cross-platform integration, real on-time tracking, product detail page

## Relevant files
page: `src/app/(marketing)/u/[username]/page.tsx`, `src/app/(marketing)/b/[slug]/page.tsx` · views: `src/views/pages/user-profile/{index,UserProfileHeader,TrustScoreCard,ProfileTabsNav,PlatformReputationList}.tsx` + `profile/{index,AchievementBadgeRow}.tsx` · lib: `src/lib/{trust-tier,format-date}.ts`
