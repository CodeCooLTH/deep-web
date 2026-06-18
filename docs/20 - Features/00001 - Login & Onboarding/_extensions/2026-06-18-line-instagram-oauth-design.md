# Extension Design: LINE + Instagram OAuth Login

> **Feature:** 00001 - Login & Onboarding
> **วันที่:** 2026-06-18
> **สถานะ:** Design approved (user) — รอ implement
> **เจ้าของ design:** Controller (main session)
> ขยาย FR-LO-03 (Facebook OAuth) ให้รองรับ provider เพิ่ม: **LINE (ใช้งานจริง)** + **Instagram (เตรียมโค้ด, ปิด flag ไว้)**

---

## 1. บริบท / เหตุผล

- Facebook OAuth ติด **Meta Business Verification** (สถานะ Incomplete) → app ยัง go-live เต็มตัวไม่ได้
- **Instagram login = Meta = ติด business verification ตัวเดียวกัน** (Instagram Basic Display API ยกเลิก ธ.ค. 2024; ปัจจุบันวิ่งผ่าน Meta ต้อง App Review + business verification) → ทำตอนนี้ไปก็ใช้จริงไม่ได้ → **เตรียมโค้ดไว้ ปิด flag**
- **LINE Login = อิสระจาก Meta 100%** (LINE Developers Console แยกต่างหาก) → ใช้งานได้ทันที + เหมาะตลาดไทย

## 2. หลักการออกแบบ: reuse pattern Facebook ทั้งหมด

- `AuthAccount.provider` เป็น **String** + `@@unique([provider, providerAccountId])` → เพิ่มค่าใหม่ได้ **โดยไม่ต้อง migration**
- OAuth flow ทำใน `jwt` callback (`account.provider === "facebook"`) → generalize เป็น helper เดียว

## 3. Frozen Contract (ห้ามเปลี่ยนระหว่าง implement / doc-update)

| ด้าน | ค่า |
|---|---|
| **FR/BR ใหม่ (freeze)** | **FR-LO-14** = LINE OAuth (live), **FR-LO-15** = Instagram OAuth (prepared/flag-off), **BR-19** = pre-tick `"line"` ตอน LINE login ⚠️ **DEFERRED → Phase 2** (BR-07 ต้นแบบเป็น vestigial — ดู `docs/scope/2026-06-18-line-instagram-oauth-scope-baseline.md`) |
| next-auth provider id | `line`, `instagram` (เพิ่มจาก `facebook` เดิม) |
| `AuthAccount.provider` string | `LINE`, `INSTAGRAM` (เพิ่มจาก `FACEBOOK`, `PHONE` เดิม) |
| username scheme | LINE = `line{providerAccountId}`, IG = `ig{providerAccountId}` (mirror `fb{id}`) |
| avatar source | LINE = `profile.picture`, IG = (เตรียมไว้) |
| email scope | **ไม่ขอ** → LINE user ไม่มี email → `needsRegistration=true` → reuse `/register` + `/onboarding` gating เดิม |
| env (LINE — จริง) | `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` |
| env (IG — placeholder) | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` |
| feature flag (IG) | `NEXT_PUBLIC_ENABLE_IG_LOGIN` (default off → ปุ่ม IG ไม่ render) |
| auth helper | `upsertOAuthUser(account, user, { providerEnum, usernamePrefix })` |
| callback route | `/auth/callback/[provider]` dynamic (reuse spinner page; FB ใช้ต่อได้) |
| LINE callback API (register ใน LINE console) | `https://deepthailand.app/api/auth/callback/line` + `https://seller.deepthailand.app/api/auth/callback/line` |
| ปุ่ม LINE placement | seller sign-in (Paces), buyer sign-in + sign-up (Vuexy) — 3 ที่เหมือน FB |
| ปุ่ม IG placement | เตรียม component แต่ปิดหลัง flag → ไม่ render ทุกที่ |
| pre-tick sales channel | LINE login → pre-tick `"line"` (mirror BR-07 ของ FB → `"facebook"`) |
| LINE brand color | เขียว `#06C755` = brand asset (Hard Rule 6) → ใช้ได้พร้อม comment กำกับ |

## 4. Backend — `src/lib/auth.ts`

1. เพิ่ม `LineProvider({ clientId: LINE_CHANNEL_ID, clientSecret: LINE_CHANNEL_SECRET })` + `InstagramProvider({...})` พร้อม `profile()` map → `{ id, name, image, email: null }`
2. Refactor `jwt` callback: ดึง logic `account.provider === "facebook"` block → helper `upsertOAuthUser`:
   - match by `(provider, providerAccountId)` → ไม่เจอ → create user (`{prefix}{id}`, avatar, email ถ้ามี) + `linkBuyerHistory(email)` (เฉพาะมี email) + `evaluateSignupYearBadge` best-effort
   - เจอ → refresh avatar ถ้าเปลี่ยน
   - set `token.userId`
3. map: `facebook→{FACEBOOK, "fb"}`, `line→{LINE, "line"}`, `instagram→{INSTAGRAM, "ig"}`
4. ไม่แตะ needsRegistration/needsOnboarding logic เดิม (ทำงานต่อได้เพราะ LINE user ไม่มี phone/slug)

## 5. Frontend (ผ่าน safepay-ux gate — Hard Rule 8)

- ปุ่ม LINE: copy social-button pattern จาก theme (seller=Paces auth/split, buyer=Vuexy) → `signIn('line', { callbackUrl: '/auth/callback/line' })`
- ปุ่ม IG: render เฉพาะเมื่อ `process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true'` (default ไม่ render)
- callback `/auth/callback/[provider]/page.tsx` reuse spinner เดิมของ FB

## 6. `next.config.ts`

เพิ่ม remotePatterns: `profile.line-scdn.net`, `*.cdninstagram.com`

## 7. Prerequisite (user ทำเอง — Claude ทำให้ไม่ได้)

- สร้าง LINE Login channel ใน LINE Developers Console → Channel ID/Secret → ใส่ env (`.env.local` + Vercel prod)
- register callback URL 2 ตัวข้างบนใน LINE console

## 8. Out of scope (YAGNI)

- ❌ Instagram ใช้งานจริง (ติด Meta verify)
- ❌ LINE email + history-link by email (ไม่ขอ scope)
- ❌ Cross-provider account linking (LINE+FB = คนละ user ถ้าไม่มี email match — เหมือน FB เดิม)

## 9. เอกสาร feature 00001 ที่ต้องอัปเดต (ownership)

| Doc | Owner | เพิ่มอะไร |
|---|---|---|
| PRD.md | safepay-product | provider scope LINE/IG, feature overview |
| BRD.md | safepay-product | FR-LO-* ใหม่ (LINE OAuth + IG prepared/flagged), acceptance, BR pre-tick line, scenario |
| SRS.md | safepay-planner | provider config, `upsertOAuthUser`, auth flow, env, authz |
| SDS.md | safepay-planner | sequence diagram, callback route, button component, feature flag |
| API.md | safepay-planner | `/api/auth/callback/line`, provider list |
| DATABASE.md | safepay-database | provider String รับ LINE/INSTAGRAM (no schema change) |
| Tests/ | safepay-qa | LINE login new/existing user, IG flag-off ไม่ render |
