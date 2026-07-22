# Scope Baseline — Impeccable Remediation: Public Profile (`/u/[username]` + `/b/[slug]`)

> สถานะ: **DRAFT**
> อ้างอิง: `docs/conventions/impeccable-design.md`, `.impeccable/design.json`, `DESIGN.md`
> spec/mockup ที่ต้อง sync ก่อนโค้ด: `docs/superpowers/specs/2026-07-08-public-profile-redesign-design-spec.md` + `...-mockup.html`
> baseline ก่อนหน้าที่ยังมีผล: `docs/scope/2026-07-04-profile-redesign-scope-baseline.md` (งานนี้เป็น remediation รอบถัดจากนั้น ไม่ทับ scope เดิม)
> วันที่ตั้ง baseline: 2026-07-22

---

## Goal

Sync เอกสาร spec/mockup ให้ตรง token จริง**ก่อน** แล้วแก้โค้ด live ของหน้าโปรไฟล์สาธารณะให้ตรง Impeccable design system รวบรอบเดียว (ชั้น A โค้ด + ชั้น B spec) — ไม่แยก hotfix ตามที่ user ตัดสิน

**Non-goals:** feature ใหม่ (follow, cross-platform stats จริง, on-time จริง), redesign เกินกว่าที่ spec 2026-07-08 กำหนด

---

## In-Scope

> ทุก commit ต้อง map กับ S-id อย่างน้อย 1 ตัว. ไม่ map = CREEP.
> **S-B1 + S-B5 (doc-only) เป็น hard gate — ต้องเสร็จก่อน S-B2..S-B8 (โค้ด) เริ่ม**

| ID | Priority | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|----|--------|----------------------|-------|
| S-B1 | P0 (gate) | **(doc-only)** อัปเดต mockup.html + design-spec.md ให้ตรง token จริง (5 เรื่อง — ดูรายละเอียดด้านล่าง) | ดู "S-B1 acceptance เต็ม" ด้านล่าง | TODO |
| S-B5 | P0 (gate) | **(doc-only)** แก้ comment ค้างหัวไฟล์ mockup บรรทัด 22 ("product 2-up" → CSS จริงคือ 3-up) | comment ตรงกับ `grid-template-columns` ที่ใช้จริง (3-up) | TODO |
| S-B2 | P0 | (PP-A-01) `UserProfileHeader.tsx:178,185,203` — **ลบ** verified badge วงกลมน้ำเงิน `#1D9BF0` + rosette บน avatar ทิ้ง ตาม spec decision #3 (ลบ ไม่ใช่ recolor) แทนด้วย chip เขียวเดี่ยว | `rg '#1D9BF0' UserProfileHeader.tsx` = 0; ไม่มี markup วงกลม/rosette บน avatar; มี verified chip เขียว `#28C76F` 1 จุดต่อ identity block | TODO |
| S-B3 | P0 | (PP-A-02) แทน Tailwind slate hex ทั้งหมด (30+ จุด / 5 ไฟล์) ด้วย MUI theme token (`text.primary`/`text.secondary`/`divider` — verified ว่า resolve เป็น Ink Plum ที่ `src/@core/theme/colorSchemes.ts:76-83`) หรือ literal `#2F2B3D`/`#F8F7FA` | `rg '#0F172A\|#64748B\|#94A3B8\|#E2E8F0\|#475569\|#334155\|#CBD5E1\|#F1F5F9\|#EEF2FF' src/views/pages/user-profile/` = 0 | TODO |
| S-B4 | P1 | (PP-A-03) เงาฐานดำ/slate-900 → ink-tinted `rgb(47 43 61 / α)` — `UserProfileHeader.tsx:97,157`, `profile/index.tsx:131`, `AchievementBadgeRow.tsx:61` | `rg 'rgba\(0,\s*0,\s*0\|rgba\(15,\s*23,\s*42' src/views/pages/user-profile/` = 0; ใช้ `rgb(47 43 61 / *)` ตาม `design.json` shadow vocabulary | TODO |
| S-B6 | P1 | (PP-A-04) ตัด `textTransform:'uppercase'` 6 จุด — `TrustScoreCard.tsx:52`, `profile/index.tsx:265,311,366,395`, `PlatformReputationList.tsx:40` | `rg "textTransform:\s*'uppercase'" src/views/pages/user-profile/` = 0 | TODO |
| S-B7 | P1 | (PP-A-05) เพิ่ม `getTierAccentColor()` ใน `src/lib/trust-tier.ts` คืน 5 ค่าต่างกันจริง แก้บั๊ก `getTierColor():38-50` ที่คืน `warning` ซ้ำทั้ง Classic และ Gold → gauge สีซ้ำ. **เพิ่มฟังก์ชันใหม่ควบคู่ ไม่รื้อ `TierChipColor` เดิม** | Vitest: 5 tier คืนค่าต่างกันครบ 5 ค่า; `getTierAccentColor(classic) !== getTierAccentColor(gold)`; regression — `getTierColor()`/`TierChipColor` ยังทำงานเหมือนเดิม (order page chip ไม่กระทบ) | TODO |
| S-B8 | P2 | (PP-A-06) dead code `VerificationBadges.tsx` / `RecentReviews.tsx` / `AboutOverview.tsx` — **no-op รอบนี้ อย่าเพิ่งลบ** (spec วางแผน revive `VerificationBadges.tsx` → `VerificationChecklist` แต่ยังไม่ implement) | ไฟล์ทั้ง 3 คงอยู่ ไม่ถูกลบ ไม่ถูก wire เข้าใช้งาน; commit message ระบุ "no-op — เก็บรอ future task" | TODO |

### S-B1 acceptance เต็ม (5 เรื่อง)

**1. tier gradient ramp ใหม่** — ทุกค่า derive จาก `.impeccable/design.json` `tonalRamp` จริง ไม่มี interpolate (user อนุมัติ 2026-07-22):

| Tier | gradient | ที่มา |
|------|----------|-------|
| Classic | `#5c3300 → #b36700 → #FF9F43` | `warning-amber.tonalRamp[0,2,4]` |
| Silver | `#454155 → #7a7689 → #bdbbc7` | `ink.tonalRamp[1,3,5]` |
| Gold | `#e08400 → #FF9F43 → #ffd1a3` | `warning-amber.tonalRamp[3,4,6]` |
| Diamond | `#009eb2 → #00BAD1 → #8ee5ee` | `signal-cyan.tonalRamp[3,4,6]` |
| Star | `#5a4ee0 → #7367F0 → #b3acf8` | `primary.tonalRamp[3,4,6]` |

โครง `linear-gradient(135deg, dark 0%, mid 45%, light 100%)` คงเดิม
→ grep: ค่า Tailwind เดิม (`#F59E0B`,`#0EA5E9`,`#F97316`,`#C2410C`,`#B45309`,`#0284C7`,`#7DD3FC`,`#FCD34D`,`#FDBA74`) = 0 ในทั้ง 2 ไฟล์

**2. เงา/radius → canonical** (user เลือก "ยึด spec.md"): `box-shadow: 0 2px 8px rgb(47 43 61 / .12)` + `border-radius: 8px`
→ grep: `border-radius:\s*1[248]px` = 0 · สูตร 2-layer `opacity .04/.05` = 0

**3. scrim Gold + Diamond** `rgb(47 43 61 / 0.26)` → `0.34` (tier อื่นคง `0.26`)
เหตุผล: contrast ตกเกณฑ์ AA จริง — Gold 4.20:1, Diamond mid-stop 3.64:1 และ tier-name 15px/600 **ไม่เข้าเกณฑ์ large text** ของ WCAG (ต้อง ≥18.66px@700) จึงต้องผ่าน 4.5:1 ไม่ใช่ 3:1

**4. ห้าม pill ข้อความวางบนโซน >60% ของ gradient** (โซนสว่างตก AA ทุก tier แม้มี scrim) — spec ต้องระบุตำแหน่ง pill = มุมบนเดิม

**5. badge pill 3 ใบ ผูกข้อมูลจริง** — `userBadges` เรียง `earnedAt` DESC เอา 3 ใบแรก, icon จาก `badgeIconName()` helper เดิม
→ grep string ปลอมใน mockup `"ผู้ขายดีเด่น"|"ตอบไว"|"ส่งตรงเวลา"` = 0 (ไม่มีใน `prisma/badge-seed-data.ts` เลย — เสี่ยงย้อนรอยบั๊ก "ส่งตรงเวลา 98%" ที่เพิ่งแก้ไป)

**6. แก้ประโยคเท็จใน spec.md** — บรรทัด ~14 เขียนว่า `"ค่าที่ mockup ใช้ ... ตรงกับ design.json 100%"` และระบุ `radius 6-8px` ทั้งที่ mockup จริงใช้ 12/14/18px และสี tier เป็น Tailwind ล้วน → ต้องแก้ประโยคนี้ให้ตรงความจริงหลัง sync เสร็จ ไม่งั้นคนอ่านรอบหน้าจะเชื่อผิดอีก
→ grep `ตรงกับ design.json 100%` ต้องไม่ปรากฏในบริบทที่ยังเป็นเท็จ

---

## ไฟล์ที่แตะ / Base guidance

| ID | ไฟล์ที่แตะ | Base: |
|----|-----------|-------|
| S-B1, S-B5 | `docs/superpowers/specs/2026-07-08-public-profile-redesign-mockup.html`, `...-design-spec.md` | doc — ไม่บังคับ Base: line |
| S-B2 | `src/views/pages/user-profile/UserProfileHeader.tsx` | ไฟล์เดิม — ตาม design-spec decision #3 |
| S-B3 | `UserProfileHeader.tsx`, `TrustScoreCard.tsx`, `profile/index.tsx`, `PlatformReputationList.tsx`, `profile/AchievementBadgeRow.tsx` | ไฟล์เดิม — token normalize ตาม `.impeccable/design.json` (Ink Plum `#2F2B3D`) |
| S-B4 | `UserProfileHeader.tsx`, `profile/index.tsx`, `AchievementBadgeRow.tsx` | ไฟล์เดิม — shadow ink-tint ตาม `design.json` shadows |
| S-B6 | `TrustScoreCard.tsx`, `profile/index.tsx`, `PlatformReputationList.tsx` | ไฟล์เดิม |
| S-B7 | `src/lib/trust-tier.ts` | ไฟล์เดิม — เพิ่มฟังก์ชันใหม่ ไม่แก้ของเดิม |
| S-B8 | (no-op) | N/A |

### Overlap map — ต้อง serialize

| ไฟล์ | ถูกแตะโดย |
|------|-----------|
| `UserProfileHeader.tsx` | S-B2, S-B3, S-B4 |
| `profile/index.tsx` | S-B3, S-B4, S-B6 |
| `TrustScoreCard.tsx` | S-B3, S-B6 |
| `PlatformReputationList.tsx` | S-B3, S-B6 |
| `AchievementBadgeRow.tsx` | S-B3, S-B4 |

→ **S-B2 → S-B3 → S-B4 → S-B6 ต้องทำเป็นลำดับเดียว developer เดียวกัน** ห้ามแยก dispatch พร้อมกันเด็ดขาด

### Parallel plan (Phase B ใช้ได้จริงแค่ 2 สาย)

| สาย | S-id | เงื่อนไข |
|-----|------|----------|
| gate | S-B1 + S-B5 | ทำก่อนสุด (Controller ทำเองได้ เป็น doc) |
| dev 1 (chain) | S-B2 → S-B3 → S-B4 → S-B6 | หลัง gate ผ่าน |
| dev 2 | S-B7 | `trust-tier.ts` ไฟล์แยก ขนานกับ chain ได้ทันทีหลัง gate |

---

## Out-of-Scope

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-B1 | Revive `VerificationBadges.tsx` → `VerificationChecklist` จริง | future task — S-B8 แค่ "ไม่ลบ" ไม่ใช่ "revive" |
| OOS-B2 | เพิ่ม topnav (`Header.tsx` auth-aware) เข้าหน้า `/u`/`/b` | **open question ยังไม่มีคำตอบ** — ห้าม implement จนกว่า user ตอบ |
| OOS-B3 | Fork/share `ProfileBanner` กับ `/o/[token]` | **open question ยังไม่มีคำตอบ** — แตะ `ProfileBanner` หรือ `/o/[token]` ก่อนตอบ = CREEP |
| OOS-B4 | Follow system, cross-platform stats จริง, on-time tracking จริง, product detail page | ตาม baseline เดิม `2026-07-04-profile-redesign` |
| OOS-B5 | Pin backend | feat 00013 เสร็จแล้วนอก branch นี้ |
| OOS-B6 | ทุกอย่างใน `(paces)/**` | มี baseline แยก (backoffice) |
| OOS-B7 | เพิ่ม token `info-sky` เข้า design.json เพื่อให้ Diamond เป็นฟ้าเพชร | **user ตัดสินแล้วว่ารับ signal-cyan** อยู่ใน token เดิม 100% ไม่แตะ design.json |

---

## Open Questions — ต้องถาม user ก่อนถึง task ห้าม dev เดา

1. **Topnav** — เพิ่ม `Header.tsx` auth-aware เข้าหน้าโปรไฟล์สาธารณะตาม mockup หรือคงแค่ back-button เดิม? → ยังไม่มี S-id ครอบ
2. **ProfileBanner sharing** — share component เดียวกับ `/o/[token]` แบบ optional-prop backward-compat ตามที่ spec เสนอ หรือ fork แยกไฟล์? → ยังไม่มี S-id ครอบ

---

## Assumptions

- **A-1:** spec decision #3 (`design-spec.md:19`) ยืนยันแล้วว่า **ลบ** badge วงกลมน้ำเงิน + rosette ไม่ใช่แค่เปลี่ยนสี — S-B2 ยึดทางนี้ (Controller verify 2026-07-22)
- **A-2:** S-B1/S-B5 เป็น dependency gate จริง — ถ้าตัดสินให้ dev เริ่มก่อนเอกสาร sync เสร็จ ต้องบันทึกใน Change Log ว่ายกเว้น gate (ความเสี่ยง: โค้ดกับ spec หลุดกันอีกรอบ ซ้ำรอยเดิม)
- **A-3:** `getTierAccentColor()` เป็นฟังก์ชันใหม่แยกจาก `TierChipColor`/`getTierColor()` — จุดอื่นที่ใช้ `TierChipColor` (เช่น order page chip) ไม่ถูกแตะรอบนี้ (Controller ตัดสิน)
- **A-4:** scrim Gold/Diamond ไม่เท่า tier อื่น = ยอมรับความไม่สม่ำเสมอเพื่อแลก accessibility (Controller ตัดสิน)
- **A-5:** ค่า ramp ทั้ง 15 ค่าเป็น element ที่มีอยู่จริงใน `tonalRamp` array — ไม่มีค่าใด interpolate/ประดิษฐ์ใหม่ (safepay-ux verify path+บรรทัดแล้ว)

---

## Deferred → Phase 2

- OOS-B1, OOS-B4, OOS-B5
- Open Questions 1-2 จนกว่าจะมีคำตอบและถูกย้ายขึ้น In-Scope พร้อม S-id ใหม่ผ่าน Change Log

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-22 | baseline สร้าง (DRAFT) | kick-off Impeccable remediation — public profile (ชั้น A โค้ด + ชั้น B spec-sync รวมรอบเดียว) | shinobu22 |
| 2026-07-22 | S-B1 เพิ่มข้อ 6 — แก้ประโยค "ตรงกับ design.json 100%" ใน spec.md | Controller อ่าน spec เอง พบว่าประโยคนี้เป็นเท็จ (mockup ใช้ Tailwind palette + radius 12/14/18 ขณะที่ spec เขียน radius 6-8px) ถ้าไม่แก้ คนอ่านรอบหน้าจะเชื่อผิดซ้ำ | Controller |
| 2026-07-22 | **ผลข้างเคียงจาก grep acceptance ที่กว้างเกินไป — บันทึกไว้ 2 จุด** | grep ข้อ 3 ของ S-B1 (`rgb(47 43 61 / 0.0[45])`) ไม่แยก property ทำให้ match `border` ด้วย ไม่ใช่แค่ `box-shadow`: (ก) hairline border ของการ์ด `0.05` → `var(--ink-08)` — **ยอมรับไว้** เพราะเป็น token ที่ mockup ประกาศอยู่แล้ว และ 0.08 ใกล้ค่า divider canonical (0.12) มากกว่าเดิม (ข) `.frame` device bezel radius 18px → 8px — **Controller revert คืน 18px** เพราะเป็นกรอบจอจำลองของตัว mockup ไม่ใช่ UI ของแอป ไม่อยู่ใต้ radius scale ของ design system (เขียน comment กำกับแล้ว) | Controller |
| 2026-07-22 | S-B1 ข้อ 5 ขยายไปแก้ ASCII wireframe + ตาราง icon-mapping §10 ใน spec.md ด้วย | developer flag ว่าถ้าแก้ชื่อ badge เฉพาะใน mockup เอกสารจะขัดกันเอง — เห็นด้วย | Controller |
