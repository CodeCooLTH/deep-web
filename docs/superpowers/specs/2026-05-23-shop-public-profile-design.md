# Design Spec — Public Shop Profile `/u/[username]` (Vuexy redesign)

> **วันที่:** 2026-05-23 · **Route:** `src/app/(marketing)/u/[username]/page.tsx` (RSC, route group `(marketing)` = Vuexy)
> **Reference mockup:** `/Users/craftman/Documents/Claude/Projects/Deep Achivements/mockup_shop_profile.html` (Instagram-style shop profile)
> **ที่มา:** safepay-product (requirement) + safepay-ux (design spec) + Controller/user decisions รอบ 2026-05-23

## Goal

ยกเครื่องหน้า `/u/{username}` ให้แสดงความน่าเชื่อถือของร้านตาม layout mockup โดย **ใช้ข้อมูลจริงจาก DB** ทุกที่ที่มี data รองรับ และ section ที่ mockup มีแต่ DB ไม่มี → แสดงเป็น **placeholder ตัวอย่าง** (มีป้ายกำกับ) หรือ **disabled "เร็ว ๆ นี้"** ตามที่ user ตัดสิน

---

## Locked decisions (user, 2026-05-23)

| # | Decision | สรุป |
|---|---|---|
| D1 | **Trust tier names** | ใช้ Deep tier names (ไม่ใช่ A/B/C ดิบ) |
| D2 | **Cross-platform stats** | เก็บไว้ในหน้า แต่เป็น **ค่าตัวอย่าง mockup** (hardcode) |
| D3 | **Follow + Chat FAB** | ปุ่ม **disabled + tooltip "เร็ว ๆ นี้"** (ไม่มี backend) |
| D4 | **On-time % + response time** | ค่าตัวอย่าง mockup (placeholder) |
| D5 | **ป้าย placeholder** | ทุก section placeholder ต้องมีป้าย **"ตัวอย่าง" ชัดเจน** (Deep = trust platform, buyer ต้องแยกออกว่าไม่ใช่ยอดจริง) |
| D6 | **avgRating bug** | **Must-fix** — เลิก `take=10`, คำนวณจาก review ทั้งหมด |
| D7 | **Theme strategy** | **Hybrid + อนุมัติ compose-from-primitive exception** (Hard Rule 1 exception + retro #20) |
| D8 | platform logo | ใช้ Iconify (ไม่ download asset) |
| D9 | not-verified state | ซ่อน verified chip (ไม่แสดง "ยังไม่ยืนยัน") |

### Deep tier mapping (D1) — ผูกกับ `getTrustLevel()`

| PRD level | threshold | Deep tier name | gradient (จาก UX spec) |
|---|---|---|---|
| D | < 40 | **Deep Starter** | gray `#E2E8F0→#94A3B8` |
| C | ≥ 40 | **Deep Bronze** | amber `#FDE68A→#D97706` |
| B | ≥ 60 | **Deep Silver** | silver `#E2E8F0→#9CA3AF` |
| B+ | ≥ 70 | **Deep Gold** | gold `#FEF9C3→#CA8A04` |
| A | ≥ 80 | **Deep Platinum** | blue `#BAE6FD→#0284C7` |
| A+ | ≥ 90 | **Deep Diamond** | violet-pink `#DDD6FE→#7C3AED→#EC4899` |

---

## Section tiers — Live / Placeholder / Disabled

### 🟢 Live (data จริงจาก DB)
| Section | Data source (verified) |
|---|---|
| Trust banner (Deep tier + gradient) | `user.trustScore` → `getTrustLevel()` |
| Avatar/logo | `Shop.logo` → fallback `User.avatar` → fallback ตัวอักษรแรก |
| ชื่อร้าน + verified ✓ | `Shop.shopName` + `maxVerifyLevel≥1` (สีตาม level: L1=info, L2=success, L3=primary) |
| @username · bio · location · วันเข้าร่วม | `User.username`, `Shop.description`, `Shop.address`, `User.createdAt` |
| Badges + "ดูทั้งหมด N" | `UserBadge` audience=SELLER/ANY (FR-4.8) |
| **Product grid** (≤9, 3-col square) | `Product` where `isActive=true` orderBy `createdAt desc` take 9; tile = `images[0]`, hover name+`price` |
| Stats: order count, avg rating, completion rate | CONFIRMED count · **avg rating (FIX: aggregate ทั้งหมด)** · CONFIRMED÷(CONFIRMED+CANCELLED) |

### 🟡 Placeholder — **ต้องมีป้าย "ตัวอย่าง"** (D5)
- Cross-platform stats (Shopee/Lazada/TikTok/Deep orders+rating) — hardcode mockup values
- On-time delivery % + response time — hardcode mockup values
- Pattern ป้าย: `CustomChip` color="warning" size="small" label="ตัวอย่าง" ที่หัว section + fine print "*ข้อมูลตัวอย่าง ไม่ใช่ยอดจริง"

### ⚪ Disabled "เร็ว ๆ นี้" (D3)
- ปุ่ม Follow (ใน banner) · Chat FAB (sticky bottom) — MUI `Button disabled` + `Tooltip` (ห่อ `<span>`)

---

## Data contract (verified by Controller — lock ก่อน parallel dev)

```
Product:  id, name, price(Decimal 12,2 → serialize), images(Json[] string), isActive(Boolean), createdAt
Shop:     shopName, description?, logo?, address?
getTrustLevel(score): "A+"|"A"|"B+"|"B"|"C"|"D"  (threshold 90/80/70/60/40)
getReviewsByUsername(username, take=10, skip=0)  ← bug: avg ใช้ take=10
getProductsByShop(shopId): findMany isActive + orderBy createdAt desc + include tags  ← ไม่มี take limit
```

**TODO data layer:**
- เพิ่ม service/aggregate สำหรับ avg rating จริง (เช่น `prisma.review.aggregate({ _avg, _count, where: { order: { shop: { user: { username } } } } })`) — D6
- product query ใน page เพิ่ม `take: 9` (หรือ slice ผล `getProductsByShop`)
- `price` Decimal → `.toNumber()` / string ก่อนส่ง props ข้าม RSC boundary

---

## Theme strategy (D7) — Hybrid + approved exception

| ✅ copy จาก Vuexy theme ตรง | ❌ compose จาก MUI primitive (approved exception — `Base:` multi-source) |
|---|---|
| Header identity, avatar, chip, follow button → `theme/vuexy/.../views/pages/user-profile/UserProfileHeader.tsx` · Badges (existing `AchievementBadges.tsx`) · `CustomChip` → `src/@core/components/mui/Chip.tsx` | Trust banner gradient · progress dots (Box) · cross-platform pills (Card+Typography) · Instagram product grid (MUI `Grid`+Box aspect-ratio 1:1) · Chat FAB (Button+sticky) |

**Commit rule:** ทุก commit ที่แตะ UI ต้องมี `Base:` line. ส่วน compose-from-primitive ระบุชัดว่า primitive จาก MUI + cite theme file ที่ใกล้สุดเป็น reference (multi-source).

---

## Acceptance Criteria (testable)

1. Trust banner แสดง Deep tier name ถูกตาม `user.trustScore`
2. Product grid แสดง isActive products ≤9 เรียงใหม่สุด; ไม่แสดง isActive=false
3. avg rating คำนวณจาก review **ทั้งหมด** (สร้าง >10 review เทียบค่า)
4. `Shop.address` ว่าง → ซ่อน location row
5. verified chip แสดงเมื่อ maxVerifyLevel≥1; ไม่มี → ไม่แสดง (D9)
6. completion rate = CONFIRMED/(CONFIRMED+CANCELLED)×100
7. ร้านไม่มี active product → empty state ไม่ crash
8. placeholder sections มีป้าย "ตัวอย่าง" ทุกอัน (D5)
9. Follow/Chat = disabled + tooltip "เร็ว ๆ นี้" (D3)
10. buyer-only account (isShop=false) → ซ่อน product grid + shop meta, empty state ชวนเปิดร้าน
11. โหลดได้โดยไม่ login (session=null), ไม่ redirect
12. avatar null → fallback letter
13. mobile 375px ไม่ overflow horizontal

## Edge states
not-found→404 · buyer-only→ซ่อน shop sections · no-product→empty state · no-review(<3)→ซ่อน rating · not-verified→ซ่อน chip · no-badge→ซ่อน section · no-address→ซ่อน row · product no-image→placeholder tile

## Out of scope
**MVP:** Follow/Chat backend, real cross-platform integration, real on-time/response tracking, public product detail page, SEO JSON-LD.
**Phase 2:** Follow system, external-platform self-report, deliveryDeadline tracking, product detail page, paid Verified Badge, seller-managed social links.

## Relevant files
- `src/app/(marketing)/u/[username]/page.tsx` — RSC (เพิ่ม product query + avg aggregate + props)
- `src/views/pages/user-profile/UserProfileHeader.tsx` — rebuild banner + identity
- `src/views/pages/user-profile/index.tsx` — wrapper (เพิ่ม product grid + FAB)
- `src/views/pages/user-profile/profile/AchievementBadges.tsx` — เพิ่ม "ดูทั้งหมด N"
- `src/services/review.service.ts` — เพิ่ม avg aggregate (D6)
- `src/services/product.service.ts` — `getProductsByShop` (เพิ่ม take param หรือ slice ใน page)
- theme: `theme/vuexy/.../views/pages/user-profile/UserProfileHeader.tsx`, `.../@core/components/mui/Chip.tsx`, `.../@core/components/mui/Avatar.tsx`
