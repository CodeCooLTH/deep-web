# Buyer App API (`/api/app/*`)

> API สำหรับ **แอปมือถือผู้ซื้อ** (Deep-App, Expo/React Native) — สร้าง 2026-06-14.
> แยกจาก API เว็บ/seller/admin เดิม; ผูกกับระบบ Order/escrow/trust ของ SafePay ผ่าน Prisma เดียวกัน.

## ภาพรวม

- แอปเป็น **client ล้วน** เรียกผ่าน HTTP มาที่ `/api/app/*`.
- **Auth = HMAC Bearer token** (ไม่ใช่ cookie/NextAuth — มือถือไม่มี cookie jar):
  - `src/lib/app-token.ts` — `signAppToken(userId)` / `verifyAppToken(token)` เซ็นด้วย `NEXTAUTH_SECRET`.
  - `src/lib/app-auth.ts` — `requireAppUser(req)` / `getAppUser(req)` อ่าน `Authorization: Bearer <token>`.
- **CSRF:** `/api/app/*` ถูก exempt จาก Origin-check ใน `src/proxy.ts` (มือถือไม่มี Origin; auth ใช้ Bearer แทน) — แต่ยังคง rate-limit.
- **Validation:** valibot schemas ใน `src/lib/app-validations.ts`.
- **Error shape:** `{ error: string }` (client เช็ก `err.status` / `err.message`).
- ทุก response map เป็น shape ที่แอปคาดหวัง (ตรงกับ `Deep-App/src/api/types.ts`).

## Endpoints (25)

| Method | Path | Auth | หมายเหตุ / mapper |
|---|---|---|---|
| POST | `/api/app/auth/request-otp` | – | `{ phone }` → ส่ง OTP (ใช้ระบบ OTP เดิม); คืน `{ ok, message }` |
| POST | `/api/app/auth/verify-otp` | – | `{ phone, code }` → upsert user + คืน `{ token, phone, user }` |
| GET | `/api/app/me` | ✅ | โปรไฟล์ + **trust (score/letter/tier/dots)** + **verifyLevel** + memberSince + badges |
| GET | `/api/app/users/[username]` | – | **Public Profile** (trust + badges) — เหมือน `/u/{username}` ของเว็บ |
| GET | `/api/app/verification` | ✅ | สถานะยืนยันตัวตน (currentLevel + records) |
| POST | `/api/app/verification` | ✅ | ขอยืนยัน L2/L3 (`{ level }`) → record PENDING (dedup) |
| GET | `/api/app/server-time` | – | `{ serverNowMs }` (sync นาฬิกา countdown) |
| GET | `/api/app/auctions/browse` | – | `?sort=&category=&page=` → `{ items, nextCursor }` (auto-settle ก่อน) |
| GET | `/api/app/auctions/top` | – | auction บิดเยอะสุด |
| GET | `/api/app/auctions/[id]` | – | รายละเอียด + `bidHistory` + **`seller` (trust ผู้ขาย)** |
| POST | `/api/app/auctions/[id]/bid` | ✅ | `{ amount }` — atomic + แจ้งเตือน outbid |
| POST | `/api/app/auctions/[id]/settle` | – | (cron/manual) ปิดประมูล + ออก order ให้ผู้ชนะ |
| GET | `/api/app/categories` | – | 16 หมวดหลัก (static; name ตรงกับ `CategoryTile` CAT_MAP) |
| GET | `/api/app/command-center` | – | 4 tile หน้า Home: Trust ฉัน / ที่ฉันบิด / ออเดอร์ / แจ้งเตือน (id `cc1–cc4`) |
| GET | `/api/app/search?q=` | – | ค้นหา auction จาก title |
| GET | `/api/app/shops` | – | `?page=` รายชื่อร้าน (paginated) |
| GET | `/api/app/shops/[id]` | – | รายละเอียดร้าน + `trustLevel` (tier ตาม SSOT `getTierDisplay`) |
| GET | `/api/app/shops/[id]/reviews` | – | รีวิวของร้าน |
| GET | `/api/app/orders` | ✅ | ออเดอร์ของ buyer (auto-settle ก่อน) |
| GET | `/api/app/orders/[id]` | ✅ | รายละเอียด + invoice |
| POST | `/api/app/orders/[id]/review` | ✅ | `{ rating, text }` → createReview เดิม |
| GET | `/api/app/me/watching` | ✅ | auction ที่ติดตาม (WatchList) |
| GET | `/api/app/me/won` | ✅ | order ที่ชนะ (CONFIRMED) |
| GET | `/api/app/me/history` | ✅ | ประวัติการบิด |
| GET | `/api/app/me/replays` | ✅ | (stub `[]` — realtime ยังไม่ทำ) |
| GET | `/api/app/notifications` | ✅ | แจ้งเตือน (outbid/won) |
| POST | `/api/app/notifications/[id]/read` | ✅ | ทำเครื่องหมายอ่าน |
| GET | `/api/app/live/feed` | – | (stub `{ items: [], nextCursor: null }` — realtime ยังไม่ทำ) |

## Prisma models (additive — ไม่แตะตารางเดิม)

- **`Auction`** — id, shopId, productId?, title, imageUrl, images, startPrice, currentPrice, bidIncrement, endTime, status (`live`|`ended`), bidCount, category
- **`Bid`** — auctionId, bidderId, amount
- **`WatchList`** — userId, auctionId (`@@unique`)
- **`Notification`** — userId, kind (`outbid`|`won`|`system`), title, body, refId?, read
- **`Order.auctionId`** — เพิ่ม field (`@unique`) ผูก order ที่มาจากการชนะประมูล

Migrations: `add_buyer_app_auction`, `order_auction_id`.

## Phase 2 — ชนะประมูล → Order

`settleAuction(id)` / `settleEndedAuctions()` (`src/services/auction.service.ts`): เมื่อ `endTime` ผ่านและยัง `live` → set `ended` + สร้าง **SafePay Order** (PENDING) ให้ผู้บิดสูงสุด (ผูก `auctionId`, idempotent) + แจ้งเตือน `won`. เรียกแบบ lazy ตอน browse/top/orders + endpoint `/settle` (cron). **Phase ถัดไป:** ต่อ escrow flow (จ่าย→ส่ง→รับ→รีวิว) ของ SafePay เข้า UI แอป.

## Trust (กันมิจฉาชีพ — เมนหลักของ Deep)

แอปนำด้วย Trust เหมือนเว็บ ครบ 5 เสา ใช้ระบบเดิมของ Deep ผ่าน `/api/app/*`:

- **Verify ตัวตน** — `GET/POST /verification` (ใช้ `verification.service`: `getMaxVerificationLevel`, `submitVerification` L1 phone auto / L2 เอกสาร / L3 ธุรกิจ → admin review ฝั่งเว็บ). POST มี dedup กันส่งซ้ำ.
- **Trust Score** — `getTierDisplay(score)` ใน `trust-score.service` → letter + tier + dots **ตาม SSOT `docs/10 - Business Rules/Tier Lists.md`** (Deep Classic/Silver/Gold/Diamond/Star). โผล่ที่: `/me`, `/users/[username]`, `/shops/[id]` (`trustLevel`), `/auctions/[id]` (`seller.trust`).
- **Badge** — `/me` + `/users/[username]` คืน `badges[]` (ระบบ badge เดิม).
- **Public Profile** — `/users/[username]` (reuse `findByUsername`).
- **Order history** — `/orders`, `/me/won`, `/me/history`.

> ⚠️ ห้าม hardcode tier mapping ที่อื่น — ใช้ `getTierDisplay` เสมอ (SSOT).
> **ยังไม่ทำ:** อัปโหลดเอกสาร verify จริง (ตอนนี้ POST สร้างคำขอ PENDING เปล่า ๆ → ต้องต่อ image-picker → `/api/upload`).

## Services

`auction.service` (โดเมนประมูล + settle + `toAuctionDTO` mapper ใช้ร่วม) · `app-account.service` (upsert buyer จากเบอร์) · `app-shop.service` (map shop/review + `getSellerTrust`; batched ไม่ N+1) · `app-order.service` (map order/invoice) · ใช้ `trust-score.service` + `verification.service` เดิมของ Deep.

## Dev setup (local)

- DB: **Postgres ใน Docker port 5434** (creds `safepay/safepay/safepay`) — เพราะ 5432 ถูกโปรเจกต์อื่นใช้. `.env` → `DATABASE_URL`/`DIRECT_URL` ชี้ 5434 + ต้องมี `NEXTAUTH_SECRET`.
- Migrate: `npm run migrate` · Seed: `npx dotenv -e .env -- npx tsx scripts/seed-auctions.ts` (ร้าน + 6 auction live + 1 ended ที่ `0000000001` ชนะ).
- Dev login: เบอร์ **`0000000001`** / OTP **`123456`** (TEST_ACCOUNTS, dev only).
- ⚠️ หลัง `migrate`/`generate` ต้อง **restart `npm run dev`** (Prisma client cache ในแรม).
- ⚠️ อย่ารัน Vitest บน DB local ที่มี seed — `cleanDatabase()` จะลบข้อมูล.

## ที่ยังไม่ทำ (deferred)

Realtime (Live room, แชต, live feed มีเนื้อหา) · push notification (expo) · escrow flow ใน UI · seller สร้าง auction · automated test ของ `/api/app` · deploy prod (ต้องรีวิว migration ก่อน).
