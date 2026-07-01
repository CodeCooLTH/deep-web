---
title: "Buyer Web Auction — Public Detail + Web Bidding (design spec)"
date: 2026-07-01
status: approved
feature: 00004-BuyerWebAuction (OOS-10 pull-forward จาก 00002 Seller Auction)
theme: Vuexy (marketing/buyer)
related:
  - "docs/scope/2026-07-01-seller-auction-scope-baseline.md (OOS-10)"
  - "docs/20 - Features/00002 - Seller Auction/{SRS,API,SDS}.md"
  - "docs/mockups/auction/seller-auction-v1.html (buyer immersive frames = visual ref)"
---

# Buyer Web Auction — Public Detail + Web Bidding

> **ที่มา:** ปุ่ม "แชร์ลิงก์" ในหน้า seller console (feature 00002) ต้องมีปลายทาง — หน้า auction สาธารณะบนเว็บ. นี่คือ **OOS-10** ("Buyer Web View") ที่ sign-off ไว้เป็น Phase 2 ของ 00002 → ดึงมาทำก่อน (change-control: อัปเดต scope baseline 00002 + เปิด feature 00004).
> **Visual ref:** buyer immersive frames ใน `docs/mockups/auction/seller-auction-v1.html` (มีอยู่แล้ว — ไม่สร้าง mockup ใหม่).

## Goal / Success

Buyer (และคนทั่วไป) เปิดลิงก์ `/a/[id]` บนเว็บ → เห็นหน้า auction (รูป/ราคา/countdown/ประวัติบิด/trust ผู้ขาย) แบบ realtime โดยไม่ต้อง login; เมื่อจะ **เสนอราคา / ซื้อทันที / ติดตาม** → login (phone-OTP/Facebook) แล้วทำได้บนเว็บ โดย reuse business logic เดิม (atomic bid, anti-snipe, buy-now, reserve, self-bid block) 100%. ปุ่มแชร์ลิงก์ฝั่ง seller เลิกเป็น placeholder.

## Decisions (sign-off 2026-07-01)

| # | ประเด็น | มติ |
|---|---|---|
| D1 | ขอบเขตหน้า | **Detail อย่างเดียว** (`/a/[id]`) — ไม่มี browse listing บนเว็บ (Phase ถัดไป) |
| D2 | Access | **ดูฟรี (public, ไม่ login) + bid/buy-now/watch ต้อง login** (เด้ง sign-in callbackUrl กลับมา); ไม่มี verify-gate (ตรง OQ-2) |
| D3 | Auth architecture | **A: session routes ใหม่** `/api/auctions/[id]/{bid,buy-now,watch}` (getServerSession→userId→auction.service เดิม) — ไม่แตะ mobile `/api/app/*` (HMAC Bearer) |
| D4 | Theme | **Vuexy** (`(marketing)/**`, MUI) — buyer surface |
| D5 | Realtime | reuse `src/lib/supabase-browser.ts` (มีแล้วจาก 00002 #12) subscribe channel `auction:{id}` (payload sanitized) |

## Architecture

```
(marketing)/a/[id]/page.tsx (RSC, Vuexy, PUBLIC — no auth)
  → auction.service.getAuctionDetail(id)  [reuse — คืน PublicAuctionDTO (ไม่มี reservePrice/expectedPrice) + bidHistory]
  → getSellerTrust(shopId) [reuse app-shop.service]
  → client components (bid panel / live state / bid history)
         │ (action ต้อง session)
         ▼
  POST /api/auctions/[id]/bid        ─┐
  POST /api/auctions/[id]/buy-now     ├─ NEW session routes: getServerSession→userId→
  POST|DELETE /api/auctions/[id]/watch┘   auction.service.{placeBid,settleAuction(via buy-now),watchToggle}
         │
  realtime: supabase-browser channel auction:{id} broadcast 'update' → live price/countdown/bidHistory
```

**Service reuse:** `placeBid(auctionId, bidderId, amount)` และ buy-now path (amount≥buyNowPrice → settle) และ self-bid/anti-snipe/reserve — auth-agnostic (รับ `bidderId`) อยู่แล้ว → web routes แค่ derive `bidderId` จาก session แล้วเรียก. watch = upsert/delete WatchList by userId (logic เดียวกับ `/api/app/auctions/[id]/watch` แต่ session-authed).

## Components (Vuexy — ต้องผ่าน safepay-ux + theme sourcing)

| ไฟล์ | หน้าที่ | RSC/Client |
|---|---|---|
| `(marketing)/a/[id]/page.tsx` | RSC public — fetch PublicAuctionDTO + seller trust + metadata | RSC |
| `(marketing)/a/[id]/AuctionDetailClient.tsx` | wrapper ถือ realtime state (currentPrice/bidCount/endTime/bidHistory) | client |
| `AuctionHero` | รูป + ชื่อ + status + seller trust chip | client/RSC |
| `AuctionBidPanel` | current price + quick-bid chips + bid input + buy-now + watch ♡; not-login → sign-in redirect | client |
| `AuctionLiveState` | countdown (reuse pattern) + realtime price | client |
| `AuctionBidHistory` | รายการบิด (displayName + amount + เวลา) | client |

## New session routes

- `POST /api/auctions/[id]/bid` — body `{amount}` → getServerSession(401) → placeBid(id, user.id, amount) → PublicAuctionDTO; error: BidError→e.status (400/403/404/409)
- `POST /api/auctions/[id]/buy-now` — no body → placeBid(id, user.id, buyNowPrice) → {auction, orderId}; 400 ถ้าไม่มี buyNowPrice
- `POST/DELETE /api/auctions/[id]/watch` — upsert/delete WatchList (user.id) → {watching}
- อยู่ใต้ `guardApi` (CSRF Origin-check + rate-limit) เดิมของ `/api/**`

## PII / Security

- public page ใช้ **PublicAuctionDTO เท่านั้น** (ไม่มี reservePrice/expectedPrice) — grep-gate เดิม (`rg reservePrice|expectedPrice src/app/api/`) ยังคุ้มครอง; เพิ่ม path `(marketing)/a/` ใน gate
- realtime payload sanitized แล้ว (M3 trigger)
- bid feed = displayName only
- session routes: derive userId จาก session เท่านั้น (ไม่รับจาก body); self-bid block reuse

## Seller share button (ปิด placeholder)

`ConsoleHead` / `AuctionControlPanel` "แชร์ลิงก์" → `navigator.clipboard.writeText(${NEXT_PUBLIC_BUYER_URL}/a/${id})` + toast success (แทน `pacesToast.info` "เร็ว ๆ นี้")

## Win → Order (reuse)

ชนะ/buy-now → `settleAuctionCore` สร้าง Order (buyerUserId=winner) เดิม → buyer เห็นใน `(marketing)/(buyer-app)/orders` ที่มีอยู่แล้ว. ไม่ต้องทำ order flow ใหม่.

## Out of scope (Phase ถัดไป)

- browse/listing auction สาธารณะบนเว็บ (ยังใช้ Deep-App browse)
- buyer dashboard auction section (my bids/watching บนเว็บ)
- auto-bid, SEO/OG เต็มรูป (มี basic metadata พอ), live-stream

## Testing

- Playwright E2E: (1) view `/a/[id]` โดยไม่ login (เห็นราคา/ประวัติ), (2) กด bid ไม่ login → redirect sign-in → กลับมา bid สำเร็จ, (3) buy-now, (4) watch toggle, (5) realtime price update เมื่อมี bid อื่นเข้า, (6) self-bid (seller เปิด auction ตัวเอง) → 403
- service logic (placeBid/settle/anti-snipe/buy-now) tested แล้วใน 00002

## Change-control

อัปเดต `docs/scope/2026-07-01-seller-auction-scope-baseline.md`: OOS-10 → "pulled to feature 00004 (2026-07-01)". feature 00004 ทำแบบ lite (spec นี้ + safepay-ux + agent-team) — ไม่ต้อง full Documentation-First 8/8 เพราะ business logic/BRD/SRS/API มีครบใน 00002 แล้ว (นี่คือ web surface + auth adapter บาง ๆ).

## Build order (agent-team)

1. **safepay-ux** Design Spec (Vuexy buyer auction detail, theme sourcing) — Hard Rule 8 gate
2. **session routes** `/api/auctions/[id]/{bid,buy-now,watch}` (backend, reuse service) + web watch logic
3. **buyer UI** `(marketing)/a/[id]/**` (Vuexy) — page + bid panel + live state + bid history
4. **seller share button** wire (ปิด placeholder)
5. reviewer + security (auth/PII) + safepay-qa (Playwright E2E + visual Vuexy)
6. merge (หลัง QA)
