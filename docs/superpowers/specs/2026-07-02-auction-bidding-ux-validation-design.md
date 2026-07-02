# Auction Bidding UX & Validation Enhancements — Design Spec

> feat 00007 (enhancement ของ 00002 Seller Auction + 00004 Buyer Web Auction) · 2026-07-02 · approved
> ไม่มี DB migration. frontend ผ่าน safepay-ux gate (HR8) ก่อน implement

## 1. Block self-outbid + debounce double-submit

**Backend (`placeBid`, auction.service.ts):**
- เพิ่ม guard ในสาขา bid ปกติ (ไม่ใช่ buy-now): อ่านผู้เสนอสูงสุดปัจจุบัน — ถ้า `leader.bidderId === bidderId` → `throw new BidError('คุณเป็นผู้เสนอราคาสูงสุดอยู่แล้ว ไม่ต้องเสนอซ้ำ', 409)` วางก่อน conditional update
- **buy-now ยังทำได้เสมอ** (leader กด buy-now ปิดดีลทันที = valid)

**DTO:** `PublicAuctionDTO` + `youAreHighestBidder: boolean` (per-viewer, คำนวณใน getAuctionDetail(viewerUserId) เหมือน reactedByMe) — leader ของ auction = viewer ไหม

**Frontend (`AuctionBidPanel`):**
- `youAreHighestBidder` → ปุ่มเสนอราคา disable + label "คุณเป็นผู้เสนอราคาสูงสุด"
- ปุ่ม disable ระหว่าง in-flight (`bidding` state — กันกดรัว double-submit)

## 2. ข้อความ outbid-race ชัดขึ้น (backend logic done)

- แก้ message 409 ตอน `res.count===0` (bid ปกติ) → **"ราคาปัจจุบันเปลี่ยนแล้ว มีผู้เสนอราคาแซงก่อนคุณ"** + ส่ง `currentPrice` ล่าสุดใน error payload
- frontend: 409 → react-toastify + re-sync ราคา (มีอยู่แล้ว) — เพิ่มโชว์ราคาล่าสุดในข้อความ

## 3. Buyer image carousel

- `AuctionHero`: รูปเดี่ยว (backgroundImage) → **keen-slider** carousel ของ `images[]` (มีใน DTO), dots + arrows; `images.length<=1` → รูปเดี่ยว (ไม่มี control); คง HUD/status/viewer overlay ทับบนสุด
- resolve แต่ละรูป: `startsWith('http') ? url : /api/files/{key}`

## 4. Price-change animate + mobile toast

- ราคาเปลี่ยน (currentPrice) → **flash/pulse animation** ที่ตัวเลขราคา (hero HUD + AuctionBidPanel next-bid)
- **react-toastify** "ราคาอัปเดตแล้ว ฿X" — เด้ง**ทุกครั้งที่ราคาเปลี่ยน รวมตอนบิดเอง** (refine ตาม user)
- detect ที่ AuctionDetailClient (prev currentPrice vs new จาก broadcast/bid success)

## 5. Winner announcement

- status live→ended (**มีผู้ชนะเท่านั้น**; unsold/cancelled ไม่เด้ง — result card เดิมพอ):
  - **buyer** = **MUI Dialog** กลางจอ (Vuexy): 🏆 avatar + level icon + displayName + ราคาปิด
  - **seller console** = **Sweet Alerts** (pacesConfirm/Swal, convention (paces))
  - **ค้างจนกดปิด** (ไม่ auto-close — refine ตาม user)
  - ทุก viewer เห็น (ผ่าน realtime hook เดิมที่ detect status→ended); winner = `bidHistory[0]` (displayName+level), ราคา = currentPrice

## 6. Rate-limit — auction ไม่ชน 429 ตอนร้อน (เพิ่มตาม finding)

**ปัญหา:** `guardApi` (proxy.ts) จำกัด auth **30 req/min ทุก /api รวมกัน** (ไม่แยก method). ตอน auction ร้อน client refetch `/api/app/auctions/[id]` ทุกครั้งที่ราคาเปลี่ยน (realtime reconcile) → กินโควตา → **คนดูเฉยๆ ก็ 429** ได้

**แก้:**
- **guardApi แยก bucket ตาม method:** GET (read, realtime-refetch) = limit สูงขึ้น (auth ~120/min); mutation (POST/PUT/DELETE เช่น bid) = คง 30/min (key suffix `:get` vs `:mut`). ปลอดภัย (read ถูก + realtime-driven) + กันคนดูโดน 429 โดยไม่ลดความเข้มของ mutation
- **Client throttle refetch:** `AuctionDetailClient` broadcast handler → coalesce/throttle refetch (trailing ~1s) ลด GET spam
- POST `/api/auctions/[id]/bid` คง mutation guard + debounce (ข้อ 1) — บิดเร็วเกินจริงยังกันด้วย debounce

## Refinements (user 2026-07-02)
- ข้อ 4: toast ราคาอัปเดต **เด้งทุกครั้งรวมตอนบิดเอง**
- ข้อ 5: winner dialog/alert **ค้างจนกดปิด** (ไม่ auto-close)

## Scope / non-goals
- ไม่มี migration; ไม่แตะ settle/anti-snipe logic; presence/reaction ไม่เกี่ยว
- Deep-App มือถือ = cross-repo (endpoint พร้อม, UI ภายหลัง)
