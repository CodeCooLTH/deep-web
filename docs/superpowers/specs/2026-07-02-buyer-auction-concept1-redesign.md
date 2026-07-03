# Buyer Auction Detail Redesign — Concept 1 (Live Commerce)

**Route:** `src/app/(marketing)/a/[id]/**` (Vuexy/MUI, buyer public)
**Visual reference (LOCKED):** `docs/mockups/auction/buyer-auction-concept1-flow.html` (3 screens)
**Date:** 2026-07-02 · **Status:** approved by user, ready to implement (mobile-first)

> Companion of the HTML mockup (feedback_spec_html_mockup). No emoji anywhere — every glyph = `@iconify/react` icon (leader = `tabler-crown`). Font Anuphan. Colors via Vuexy theme tokens.

---

## Scope

Mobile (`xs`, <600px) = full rebuild into an app-like fixed-viewport screen (hero fills the area above a sticky bid bar; NO page scroll). Desktop (`≥sm`, existing `isWide` branch) = keep the current bounded wide-layout, wearing the same new overlay components on the bounded hero; below-hero sections may remain as-is on desktop only. Mobile is the priority.

## Screens (see mockup for pixel reference)

**Screen 1 — Live (default):** full-bleed product image; top gradient + bottom gradient. Overlays: `AuctionSellerHeader` (top, NO back button), `AuctionActionRail` (right frosted pill), `AuctionLiveComment` (bottom-left: title + 1 latest bid). Sticky bottom bar (`AuctionBidPanel`).

**Screen 2 — Detail sheet:** tap "ดูรายละเอียดสินค้า" pull-up link → bottom `Drawer` (~44%h), **description only** (no seller card, no chart, no bid list). Sticky bar stays usable.

**Screen 3 — Bid History modal:** tap rail bid circle → bottom `Drawer` (~82%h), FB-comment-style bid feed, **newest→oldest**, **lazy-load** (spinner at bottom → fetch next page). Sticky bar stays usable.

## Components

### Changed (existing)
- **AuctionDetailClient.tsx** — new state `detailSheetOpen`, `bidHistoryOpen`. Mobile branch: drop `MobileFrame`, use full-viewport flex column `[hero flex:1][sticky bar]` + mount `AuctionDetailSheet` + `AuctionBidHistoryModal` as siblings. Compose overlays into hero. Do NOT render chart/live-state/meta/inline-history on mobile default flow. Keep realtime broadcast + presence + `onBidSuccess` merge logic intact.
- **AuctionHero.tsx** — strip back button, status-badge, viewer pill, title/HUD blocks. Becomes image + `grad-t`(h130) + `grad-b`(h52%) canvas that accepts overlay children. Mobile height `flex:1`; desktop fixed 380.
- **AuctionBidPanel.tsx** — remove quick-multiplier chips + custom-amount TextField. Add pull-up link row ("ดูรายละเอียดสินค้า", `tabler-chevron-up`, primary, only when no sheet open). Price row (current price primary/900 + "· N บิด" + "เพิ่มครั้งละ ฿N" + countdown pill). Action row: watch heart button + one-tap primary bid CTA (2-line: "บิดเลย ฿{minNext}" / "แตะเพื่อยืนยัน", fires `handleBid` at `currentPrice+bidIncrement` directly) + conditional buy-now tonal-warning (keep confirm `Dialog`).
- **AuctionBidHistory.tsx** — logic (reaction toggle, `LEVEL_STYLE`/`AuctionLevel`, relative-time, avatar/leader) absorbed into `AuctionBidHistoryModal`. Remove inline card from mobile flow.
- **AuctionLiveState.tsx / AuctionPriceChart.tsx** — not in mobile flow. `scheduled` card replaces the bid bar when scheduled. Anti-snipe → small `tabler-flame` + "ต่อเวลา N ครั้ง" next to countdown pill when `antiSnipeCount>0` (optional).
- **AuctionResultCard.tsx** — unchanged; replaces the sticky bid bar on terminal states.
- **AuctionNavbar.tsx / MobileFrame.tsx** — no change (mobile branch stops using MobileFrame).

### New (under `src/app/(marketing)/a/[id]/`)
- **AuctionSellerHeader.tsx** `{seller, status}` — avatar photo (CustomAvatar + getInitials fallback) + name (noWrap ellipsis, minWidth:0) + verified check (`tabler-rosette-discount-check-filled` if verified) + gold `Lv.N` pill (`tabler-award-filled`, `level` from SellerTrust) + stats line (`tabler-package` `{ordersCount} ออเดอร์`, `tabler-gavel` `{successfulAuctionsCount} สำเร็จ`) + LIVE pill (error, pulse) when live.
- **AuctionActionRail.tsx** `{viewerCount, watching, onToggleWatch, bidCount, onOpenBidHistory, shareUrl, shareTitle}` — frosted vertical pill (`rgba(18,16,28,.46)` + blur8 + `1px solid rgba(255,255,255,.16)`). Items: eye + `{viewerCount}`; heart (watch toggle, `error.main` when watching, **no count number**); bid = `primary.main` filled circle + `tabler-gavel` + "บิด {bidCount}" (opens history modal); share `tabler-share-3` (Web Share API + clipboard fallback). White icons.
- **AuctionLiveComment.tsx** `{title, latestBid}` — title (≤2 lines) + one chat bubble (avatar 23 + `{username}` + `tabler-crown` if leader + "เสนอ ฿{amount} · {relative}"), bubble `rgba(0,0,0,.44)`+blur. If `latestBid==null` → title only.
- **AuctionDetailSheet.tsx** `{open,onClose,title,description}` — `Drawer anchor="bottom"`, rounded-top, grip + header "รายละเอียด" + `tabler-x` close, body = title + description. ~44%h.
- **AuctionBidHistoryModal.tsx** `{open,onClose,auctionId,bidCount,initialBids}` — `Drawer anchor="bottom"` ~82%h, header "ประวัติการเสนอราคา ({bidCount})" + close + connectionState indicator (สด/กำลังเชื่อมต่อใหม่ when live). Body = FB-comment feed newest→oldest; `initialBids` = SSR bidHistory; infinite scroll fetches `GET /api/app/auctions/{id}/bids?page=N` → `{items, nextPage}` (append; spinner "กำลังโหลดเพิ่ม…"; inline "โหลดไม่สำเร็จ ลองใหม่" on error). New realtime bid → prepend silently. Reuse reaction toggle + level/leader chips + avatar from old AuctionBidHistory.

## Backend contract (DONE — do not change field names)
- `SellerTrust` +`level:number`(1-5), +`ordersCount:number`, +`successfulAuctionsCount:number` (in `getSellerTrust`).
- `GET /api/app/auctions/[id]/bids?page=<n>` → `{ items: BidDTO[], nextPage: number|null }`, newest→oldest, PAGE_SIZE 20.
- `BidDTO` = `{ id, amount, bidder(displayName), atMs, level(AuctionLevel), avatar, reactionCount, reactedByMe }`.
- Existing endpoints unchanged: `/api/auctions/[id]/{bid,buy-now,watch,react}`, `/api/app/auctions/[id]`.

## Theme mapping (key)
Bottom sheets: `Drawer anchor="bottom"` (base pattern `theme/vuexy/.../views/apps/email/ComposeMail.tsx`), PaperProps rounded-top, `customShadows.xl`. Avatar: `CustomAvatar` (`@core/components/mui/Avatar`). Lv badge: `Box` pill gradient `warning.light→warning.main`, text `warning.dark` (documented hex exception allowed on marketing/Vuexy if contrast needs it — Hard Rule 7 is `(paces)` only). Countdown pill: `primary.lightOpacity` bg / `primary.dark` text. Bid CTA: `Button variant="contained" color="primary"`. Buy-now: `Button variant="tonal" color="warning"` + `tabler-bolt`. Bidder level chips: existing `LEVEL_STYLE`/`AuctionLevel` (`src/lib/auction-level.ts`). Leader chip: `primary.lighterOpacity`/`primary.main` + `tabler-crown`. Spinner: MUI `CircularProgress size={16}`.

## Interactions
- Not logged in → any action → `router.push('/auth/sign-in?callbackUrl=/a/{id}')` (existing `requireLogin`).
- One-tap bid → POST `/api/auctions/{id}/bid` `{amount: currentPrice+bidIncrement}` → `onBidSuccess` updates price/count/latest-comment; CTA recomputes.
- Buy-now → confirm Dialog → POST buy-now (unchanged).
- Realtime broadcast (unchanged) → refresh price/bidCount/bidHistory → live comment swaps, rail count ticks, CTA amount updates; if history modal open, prepend new bid.
- Countdown 0 → existing refresh → terminal state swaps header/rail/bar (result card).

## Edge states
scheduled (no LIVE, rail hidden, no live comment, bid bar → scheduled card); ended/unsold/cancelled (neutral pill, rail read-only history, bar → AuctionResultCard); buyNowPrice null (omit buy-now, bid CTA full width); 0 bids (title only, rail "0", modal empty state); long name (ellipsis); missing avatar (initials); seller null (minimal placeholder, no crash); pagination error (inline retry).

## Resolved decisions (Controller, 2026-07-02)
1. One-tap bid only (drop chips + custom amount) — per locked mockup.
2. level = backend dots-based (done).
3. Rail heart = watch toggle, no like-count number.
4. pagination contract locked (above).
5. mobile priority; desktop bounded graceful.
6. connectionState → history modal header.
7. no back button (user).
8. new bid while modal open → prepend silently.

## Rules
No emoji (icons only; leader=`tabler-crown`). Anuphan font. Vuexy tokens (no raw hex except documented on-image scrims / Lv-badge text). No commit by developer — Controller reviews+commits. No schema/migration.
