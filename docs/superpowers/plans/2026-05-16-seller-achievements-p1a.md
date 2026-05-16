# Seller Achievements P1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม 7 seller achievement badge ใหม่ (data-only, ไม่มี reward) ให้ระบบ badge engine เดิมประเมิน/มอบ/นับ trust ได้จริง

**Architecture:** ระบบ badge เป็น data-driven — `evaluateBadges()`/`getBadgeProgress()` dispatch ตาม `criteria.type` อยู่แล้ว 7 badge ใหม่ใช้ criteria type ที่ engine รองรับครบ (ORDER_COUNT / HIGH_RATING / UNIQUE_REVIEWERS / ZERO_COMPLAINT / VETERAN / FAST_SHIPPING) จึงทำงานอัตโนมัติเมื่อ seed เข้า DB ไม่แตะ engine/schema/trust-score. P1b (asset รูป + locked/progress) เป็น phase แยก — ไม่อยู่ใน plan นี้

**Tech Stack:** Prisma 6 + PostgreSQL, Vitest (test DB จริงผ่าน `tests/setup`), tsx seed runner

**อ้างอิง spec:** `docs/superpowers/specs/2026-05-16-seller-achievements-p1-design.md` (§3, §4 P1a, §8)

---

## File Structure

- `prisma/seed.ts` — refactor: ดึง array `badges` ออกมาเป็น named export `defaultBadges` (testable) + เพิ่ม 7 entry ใหม่
- `src/app/(paces)/seller/(dashboard)/_constants/badge-icons.ts` — เพิ่ม 7 mapping `nameEN → lucide:*` (ชั่วคราว จนกว่า P1b)
- `tests/services/seed-badges.test.ts` — **สร้างใหม่** — assert 7 badge ใน `defaultBadges` (criteria เป๊ะ + map icon ครบ) + integration: criteria ใหม่ถูก award จริงผ่าน `evaluateBadges`

หมายเหตุ pattern test: ใช้ DB จริงผ่าน `import { prisma, cleanDatabase } from "../setup"` และ `beforeEach(cleanDatabase)` ตามแบบ `tests/services/badge.test.ts`

---

## Task 1: Refactor — export `defaultBadges` จาก seed.ts (ไม่เปลี่ยนพฤติกรรม)

**Files:**
- Modify: `prisma/seed.ts:35-66`

- [ ] **Step 1: เปลี่ยน inline `const badges` ใน `main()` เป็น named export ด้านบนไฟล์**

แก้ `prisma/seed.ts` — ย้าย type + array ออกมานอก `main()` แล้ว export. โครงปัจจุบัน (บรรทัด ~35-66) คือ `async function main() { const badges: Array<{...}> = [ ...11 entries... ]; for (const badge of badges) { await prisma.badge.upsert(...) } ... }`

แทนที่ด้วย: ประกาศ type + `export const defaultBadges` **เหนือ** `async function main()` และใน `main()` loop ใช้ `defaultBadges`:

```ts
// ── Default badges — single source of truth, idempotent upsert keyed by nameEN ──
// audience: 'SELLER' = seller-only achievement, 'ANY' = all users.
// icon: nullable String — null หมายถึง engine จะแสดง fallback icon แทน.
export type BadgeSeed = {
  name: string; nameEN: string; icon: string | null;
  type: string; audience: string; criteria: object;
};

export const defaultBadges: BadgeSeed[] = [
  // ── 10 badges เดิม (มี audience field) ──
  { name: "เปิดหน้าร้าน",       nameEN: "First Sale",         icon: "🏪", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FIRST_ORDER" } },
  { name: "ร้านค้าขายอดนิยม",  nameEN: "Trusted Seller 50",  icon: "⭐", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 50 } },
  { name: "ร้อยออเดอร์",        nameEN: "Century Club",       icon: "💯", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 100 } },
  { name: "ร้านคะแนนเต็ม",     nameEN: "Perfect Rating",     icon: "💎", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "PERFECT_RATING", minReviews: 10 } },
  { name: "ร้านคะแนนสูง",      nameEN: "Highly Rated",       icon: "🌟", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "HIGH_RATING", minRating: 4.8, minReviews: 20 } },
  { name: "ไร้ข้อร้องเรียน",   nameEN: "Zero Complaint",     icon: "🛡️", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ZERO_COMPLAINT", minOrders: 50 } },
  { name: "ร้านค้าเก่าแก่",    nameEN: "Veteran",            icon: "🏆", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "VETERAN", minDays: 365 } },
  { name: "จัดส่งสายฟ้า",      nameEN: "Speed Demon",        icon: "⚡", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FAST_SHIPPING", maxHours: 24, minOrders: 20 } },
  { name: "ยืนยันครบถ้วน",     nameEN: "Fully Verified",     icon: "✅", type: "VERIFICATION", audience: "ANY",    criteria: { type: "FULL_VERIFICATION" } },
  { name: "ขวัญใจชุมชน",       nameEN: "Community Favorite", icon: "❤️", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "UNIQUE_REVIEWERS", count: 50 } },
  // ── P1a — 7 badge ใหม่ ฝั่ง seller, reuse engine เดิม, ไม่มี reward ──
  { name: "เริ่มมีลูกค้า",      nameEN: "Getting Started",    icon: "🌱", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 10 } },
  { name: "ร้านกำลังโต",       nameEN: "Rising Seller",      icon: "📈", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 25 } },
  { name: "คะแนนดีน่าซื้อ",    nameEN: "Well Rated",         icon: "👍", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "HIGH_RATING", minRating: 4.5, minReviews: 10 } },
  { name: "เริ่มเป็นที่รู้จัก", nameEN: "Getting Noticed",    icon: "👀", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "UNIQUE_REVIEWERS", count: 10 } },
  { name: "ขายดีไร้ปัญหา",     nameEN: "Spotless 100",       icon: "✨", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "ZERO_COMPLAINT", minOrders: 100 } },
  { name: "เปิดร้านครบไตรมาส", nameEN: "3 Months Strong",    icon: "📅", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "VETERAN", minDays: 90 } },
  { name: "ส่งไวระดับเทพ",     nameEN: "Same-Day Hero",      icon: "🚀", type: "ACHIEVEMENT",  audience: "SELLER", criteria: { type: "FAST_SHIPPING", maxHours: 12, minOrders: 20 } },
  // ── badge ใหม่ (Phase 3) — icon: null = engine ใช้ fallback ──
  { name: "ปี 2026", nameEN: "2026_BADGE", icon: null, type: "ACHIEVEMENT", audience: "ANY", criteria: { type: "SIGNUP_YEAR", year: 2026 } },
];
```

> ⚠️ ก่อนแก้: เปิด `prisma/seed.ts` อ่าน 11 entry เดิม **ของจริง** (บรรทัด ~44-56) แล้ว copy ค่า `name`/`nameEN`/`icon`/`criteria` มาตรง ๆ — ค่าตัวอย่างด้านบน reconstruct จาก spec; ถ้า text ภาษาไทยหรือ emoji ของจริงต่าง ให้ยึดของจริงในไฟล์ ห้ามเปลี่ยน 11 entry เดิม (เพิ่มเฉพาะ 7 entry P1a บล็อกใหม่)

จากนั้นใน `async function main()` แก้ลูปให้ใช้ตัวแปรใหม่:

```ts
  for (const badge of defaultBadges) {
    await prisma.badge.upsert({
      where: { nameEN: badge.nameEN },
      update: { name: badge.name, icon: badge.icon, type: badge.type, audience: badge.audience, criteria: badge.criteria },
      create: badge,
    });
  }
  console.log(`Seeded ${defaultBadges.length} badges`);
```

- [ ] **Step 2: type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: ไม่มี error (exit 0)

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "$(cat <<'EOF'
refactor(seed): export defaultBadges + 7 badge P1a ฝั่ง seller (ไม่มี reward)

ย้าย array badges ออกจาก main() เป็น named export defaultBadges
เพื่อให้ test import ได้ + เพิ่ม 7 achievement: Getting Started/Rising
Seller/Well Rated/Getting Noticed/Spotless 100/3 Months Strong/Same-Day
Hero — reuse criteria type ที่ engine รองรับแล้ว ไม่แตะ engine/schema.
spec: docs/superpowers/specs/2026-05-16-seller-achievements-p1-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: เพิ่ม icon mapping ชั่วคราว (lucide) สำหรับ 7 badge

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/_constants/badge-icons.ts:3-14`

- [ ] **Step 1: เพิ่ม 7 key ใน `LUCIDE_FOR_BADGE`**

ไฟล์ปัจจุบัน object `LUCIDE_FOR_BADGE` มี 10 key เดิม + `FALLBACK_LUCIDE = 'lucide:award'`. เพิ่ม 7 บรรทัดก่อนปิด `}` (ห้ามแก้ key เดิม):

```ts
  'First Sale':          'lucide:store',
  'Trusted Seller 50':   'lucide:star',
  'Century Club':        'lucide:trophy',
  'Perfect Rating':      'lucide:gem',
  'Highly Rated':        'lucide:sparkles',
  'Zero Complaint':      'lucide:shield-check',
  'Veteran':             'lucide:medal',
  'Speed Demon':         'lucide:zap',
  'Fully Verified':      'lucide:badge-check',
  'Community Favorite':  'lucide:heart',
  // ── P1a (ชั่วคราว — P1b จะ swap เป็น asset SVG) ──
  'Getting Started':     'lucide:sprout',
  'Rising Seller':       'lucide:trending-up',
  'Well Rated':          'lucide:thumbs-up',
  'Getting Noticed':     'lucide:eye',
  'Spotless 100':        'lucide:sparkles',
  '3 Months Strong':     'lucide:calendar-check',
  'Same-Day Hero':       'lucide:rocket',
```

- [ ] **Step 2: type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/_constants/badge-icons.ts"
git commit -m "$(cat <<'EOF'
feat(seller-badges): icon map ชั่วคราว 7 badge P1a (lucide, จะ swap asset ใน P1b)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Test — assert 7 badge definition + dispatch จริงผ่าน engine

**Files:**
- Create: `tests/services/seed-badges.test.ts`

ตรวจ 2 ชั้น: (1) `defaultBadges` มี 7 entry P1a criteria เป๊ะ + ทุก `nameEN` มีใน `LUCIDE_FOR_BADGE` (กัน typo / ลืม map), (2) integration — criteria ใหม่ที่ param ต่างจากเดิม (`ORDER_COUNT:10`, `VETERAN:90`) ถูก `evaluateBadges` award จริง (พิสูจน์ engine dispatch ผ่าน DB จริง)

- [ ] **Step 1: เขียน test ที่ต้อง fail ก่อน (ยังไม่ได้ทำ Task 1/2 / หรือ map ผิด)**

สร้าง `tests/services/seed-badges.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, cleanDatabase } from "../setup";
import { defaultBadges } from "../../prisma/seed";
import { LUCIDE_FOR_BADGE } from "@/app/(paces)/seller/(dashboard)/_constants/badge-icons";
import { evaluateBadges } from "@/services/badge.service";

const P1A = [
  { nameEN: "Getting Started", criteria: { type: "ORDER_COUNT", count: 10 } },
  { nameEN: "Rising Seller",   criteria: { type: "ORDER_COUNT", count: 25 } },
  { nameEN: "Well Rated",      criteria: { type: "HIGH_RATING", minRating: 4.5, minReviews: 10 } },
  { nameEN: "Getting Noticed", criteria: { type: "UNIQUE_REVIEWERS", count: 10 } },
  { nameEN: "Spotless 100",    criteria: { type: "ZERO_COMPLAINT", minOrders: 100 } },
  { nameEN: "3 Months Strong", criteria: { type: "VETERAN", minDays: 90 } },
  { nameEN: "Same-Day Hero",   criteria: { type: "FAST_SHIPPING", maxHours: 12, minOrders: 20 } },
];

describe("P1a — badge definitions", () => {
  it("defaultBadges มี 7 badge P1a ครบ + criteria เป๊ะ + audience SELLER", () => {
    for (const want of P1A) {
      const found = defaultBadges.find((b) => b.nameEN === want.nameEN);
      expect(found, `missing badge ${want.nameEN}`).toBeDefined();
      expect(found!.type).toBe("ACHIEVEMENT");
      expect(found!.audience).toBe("SELLER");
      expect(found!.criteria).toEqual(want.criteria);
    }
  });

  it("ทุก nameEN ของ P1a มี mapping ใน LUCIDE_FOR_BADGE", () => {
    for (const want of P1A) {
      expect(LUCIDE_FOR_BADGE[want.nameEN], `no icon for ${want.nameEN}`).toBeTruthy();
    }
  });

  it("ไม่มี nameEN ซ้ำใน defaultBadges", () => {
    const names = defaultBadges.map((b) => b.nameEN);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("P1a — engine dispatch ผ่าน DB จริง", () => {
  beforeEach(cleanDatabase);

  it("ORDER_COUNT:10 → award 'Getting Started' เมื่อมี 10 CONFIRMED order", async () => {
    await prisma.badge.create({
      data: { name: "เริ่มมีลูกค้า", nameEN: "Getting Started", icon: "🌱", type: "ACHIEVEMENT", audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 10 } },
    });
    const user = await prisma.user.create({ data: { displayName: "S", username: "s_gs", isShop: true } });
    const shop = await prisma.shop.create({ data: { userId: user.id, shopName: "Shop", businessType: "INDIVIDUAL" } });
    for (let i = 0; i < 10; i++) {
      await prisma.order.create({
        data: { shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CONFIRMED", items: { create: { name: "x", qty: 1, price: 100 } } },
      });
    }

    await evaluateBadges(user.id, "SELLER");

    const earned = await prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } });
    expect(earned.map((e) => e.badge.nameEN)).toContain("Getting Started");
  });

  it("ORDER_COUNT:10 → ยังไม่ award เมื่อมีแค่ 9 order (boundary)", async () => {
    await prisma.badge.create({
      data: { name: "เริ่มมีลูกค้า", nameEN: "Getting Started", icon: "🌱", type: "ACHIEVEMENT", audience: "SELLER", criteria: { type: "ORDER_COUNT", count: 10 } },
    });
    const user = await prisma.user.create({ data: { displayName: "S", username: "s_gs9", isShop: true } });
    const shop = await prisma.shop.create({ data: { userId: user.id, shopName: "Shop", businessType: "INDIVIDUAL" } });
    for (let i = 0; i < 9; i++) {
      await prisma.order.create({
        data: { shopId: shop.id, type: "DIGITAL", totalAmount: 100, status: "CONFIRMED", items: { create: { name: "x", qty: 1, price: 100 } } },
      });
    }

    await evaluateBadges(user.id, "SELLER");

    const earned = await prisma.userBadge.findMany({ where: { userId: user.id }, include: { badge: true } });
    expect(earned.map((e) => e.badge.nameEN)).not.toContain("Getting Started");
  });
});
```

- [ ] **Step 2: รัน test — คาดว่าผ่าน (ถ้า Task 1/2 ทำถูก)**

Run: `npm test -- tests/services/seed-badges.test.ts --run`
Expected: ทุก test PASS — ถ้า "P1a — badge definitions" fail แปลว่า Task 1/2 ยังไม่ครบ/ค่าผิด (แก้ Task 1/2 แล้วรันใหม่); ถ้า "engine dispatch" fail แปลว่า criteria shape ไม่ตรงที่ handler `checkOrderCount` คาด — ตรวจ `src/services/badge.service.ts` `checkOrderCount`/dispatch แล้วแก้ค่า criteria ใน Task 1 ให้ตรง

- [ ] **Step 3: Commit**

```bash
git add tests/services/seed-badges.test.ts
git commit -m "$(cat <<'EOF'
test(badge): P1a — assert 7 badge definition + engine dispatch (DB จริง)

ครอบ: criteria เป๊ะ, icon map ครบ, nameEN ไม่ซ้ำ, ORDER_COUNT:10
award/ไม่ award ที่ boundary 10/9 ผ่าน evaluateBadges จริง

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Seed + Browser QA (Definition of Done)

**Files:** ไม่แก้โค้ด — ตรวจ runtime จริงตาม spec §7/§8

- [ ] **Step 1: รัน seed เข้า DB ที่ dev ใช้อยู่**

Run: `npm run seed:local`
Expected: log `Seeded 18 badges` (11 เดิม + 7 ใหม่) ไม่มี error

> ถ้า dev ชี้ Supabase ใช้ `npm run seed:supabase` แทน (ดู `.env`/`.env.local` ที่ user ใช้) — ถามผู้ใช้ถ้าไม่แน่ใจว่า DB ตัวไหน active

- [ ] **Step 2: ยืนยันจำนวน badge ใน DB**

Run: `npx tsx -e "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); p.badge.count().then(c=>{console.log('badge count =',c); return p.\$disconnect()})"`
Expected: `badge count = 18`

- [ ] **Step 3: Browser QA ผ่าน Chrome DevTools MCP** (user รัน dev server เอง — ห้าม start; probe port 3000/4000; ใช้ `*.deepth.local`)

ตรวจ 4 จุดตาม spec §8:
1. `http://seller.deepth.local:<port>/seller/badges` — 7 badge ใหม่โผล่ใน in-progress หรือ earned, progress bar มีค่าจริง (ไม่ NaN/ว่าง), icon ไม่แตก (lucide หรือ fallback award)
2. seller dashboard — widget AchievementLevel ไม่ error
3. `http://<main>.deepth.local:<port>/u/<seller-username>` ของ seller ที่ได้ badge ใหม่ — แสดง badge นั้น
4. `http://admin.deepth.local:<port>/admin/...badges` — list มี 7 อันใหม่ + criteria JSON อ่านออก

บันทึกหลักฐาน (screenshot) ต่อจุด รายงาน PASS/FAIL

- [ ] **Step 4: อัปเดต spec — ติ๊ก DoD P1a + เปิด follow-up note P1b**

แก้ `docs/superpowers/specs/2026-05-16-seller-achievements-p1-design.md` §8 ติ๊ก checkbox ที่ทำเสร็จ แล้ว commit:

```bash
git add docs/superpowers/specs/2026-05-16-seller-achievements-p1-design.md
git commit -m "$(cat <<'EOF'
docs(spec): ปิด DoD P1a — seed 18 badge + QA 4 จุดเขียว, P1b เปิดต่อ

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** §3 ตาราง 7 badge → Task 1; §4 P1a icon map → Task 2; §6 idempotent/sticky/boundary → Task 3 (รวม boundary 9/10); §7/§8 QA+DoD → Task 4. ครบทุก requirement P1a
- **Out of scope (P1b):** asset SVG, locked/desaturate, progress styling ตาม mockup — ไม่อยู่ใน plan นี้ตามที่ user ตัดสิน
- **ความเสี่ยงที่เผื่อไว้:** ค่า 11 entry เดิมใน seed.ts ของจริงอาจต่างจากที่ reconstruct → Task 1 Step 1 สั่งให้ยึดไฟล์จริง; criteria shape อาจไม่ตรง handler → Task 3 Step 2 มี fallback ให้ตรวจ `badge.service.ts`
- **Type consistency:** `defaultBadges`/`BadgeSeed` (Task 1) ใช้ชื่อเดียวกันใน Task 3 import; `LUCIDE_FOR_BADGE` ตรงชื่อ export จริงในไฟล์
