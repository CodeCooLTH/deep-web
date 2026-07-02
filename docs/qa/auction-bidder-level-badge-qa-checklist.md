# QA Checklist — Auction Bidder Level Badge (seller `/auctions/[id]` bid feed "ประวัติการเสนอราคา")

> reusable regression checklist · smoke/batch-E2E QA 2026-07-02 (feature 00002 Track B item 1, TFR-016)
> component: `src/app/(paces)/seller/(dashboard)/auctions/[id]/components/AuctionBidFeed.tsx`
> ladder logic (SSOT): `src/lib/auction-level.ts` — pure function `getAuctionLevel(successfulBidCount)`, threshold ตาม SDS §6 / DATABASE.md §5.2
> wired จาก: `src/services/auction.service.ts` (`BidDTO.level = getAuctionLevel(bidder.successfulBidCount)`, comment ยืนยัน "ไม่ใช่ PII")
> รันที่ `seller.deepth.local:4000` (user รัน dev server เอง — **ห้าม start เอง**) · login OTP `0000000001`/`123456` หรือ username `btpremium_suksawat`
> seed auction ใช้ QA: `c428960f-b6c1-4011-9c0c-601ee2af53fc` ("พระสมเด็จวัดระฆัง (ทดสอบ level)" — live, 5 บิดจาก 5 user ต่าง `successfulBidCount`: 120/45/15/5/0)

## Ladder (SSOT `src/lib/auction-level.ts`)
| min successfulBidCount | level | label | icon | badge class |
|---|---|---|---|---|
| ≥100 | 5 | ตำนาน | `tabler-crown` | `bg-warning/15 text-warning` |
| ≥30 | 4 | ระดับเพชร | `tabler-diamond` | `bg-info/15 text-info` |
| ≥10 | 3 | เซียน | `tabler-trophy` | `bg-primary/15 text-primary` |
| ≥3 | 2 | นักประมูล | `tabler-shield` | `bg-default-100 text-default-600` |
| ≥0 | 1 | มือใหม่ | `tabler-podium` | `bg-default-100 text-default-400` |

## ⚠️ ก่อนเทสทุกครั้ง (pre-flight)
- [ ] dev server รันที่ port 4000 (probe `curl -s http://seller.deepth.local:4000/ -o /dev/null -w "%{http_code}"` ต้อง 2xx/3xx) — **ห้าม start เอง**
- [ ] ใช้ `http://seller.deepth.local:4000` เท่านั้น (**ห้าม** `seller.deepthailand.app` — โดเมนนั้น resolve ไป prod IP จริง ไม่ใช่ dev)
- [ ] login แล้ว resize browser ≥1280px ก่อนดูหน้า auction detail (2-col layout)
- [ ] auction seed ต้องมี ≥1 บิด — ถ้า `bidHistory.length === 0` แสดง empty state "ยังไม่มีการเสนอราคา" (ไม่มี badge ให้ตรวจ ไม่ใช่บั๊ก)

## A. Presence / mapping ต่อแถว (happy path)
- [x] ทุกแถวบิดมี level badge (icon + label ไทย) ต่อท้ายชื่อ bidder — PASS
- [x] แถวราคาสูงสุด (bidder `successfulBidCount=120`, GP Seller) = "ตำนาน" — PASS
- [x] bidder `successfulBidCount=45` (QA Inventory Admin) = "ระดับเพชร" — PASS
- [x] bidder `successfulBidCount=15` (QA-INV-REGRESSION-SHOP) = "เซียน" — PASS
- [x] bidder `successfulBidCount=5` (ผู้ใช้ทดสอบ) = "นักประมูล" — PASS
- [x] bidder `successfulBidCount=0` (QA E2E) = "มือใหม่" — PASS

## B. Icon render
- [x] ทุก icon แสดงจริง (ไม่ใช่กล่องพัง/ช่องว่าง) — crown/diamond/trophy/shield/podium ครบ — PASS (screenshot zoom 2x ยืนยัน)

## C. สี badge ต่าง level (computed-value spot check)
- [x] "ตำนาน" → `color: rgb(249, 191, 89)` (warning/ทอง) — PASS
- [x] "ระดับเพชร" → `color: rgb(91, 195, 225)` (info/ฟ้า) — PASS
- [x] "เซียน" → `color: rgb(35, 109, 201)` (primary น้ำเงิน — ตรงกับ Paces token `#236dc9` เป๊ะ) — PASS
- [x] "นักประมูล" → `color: rgb(138, 150, 156)` (default-600 เทาเข้ม) — PASS
- [x] "มือใหม่" → `color: rgb(155, 166, 183)` (default-400 เทาอ่อนกว่า นักประมูล เล็กน้อย) — PASS
- [ ] contrast/legibility ของ 2 เฉดเทา (นักประมูล vs มือใหม่) ใกล้กันมาก — ยังไม่ได้ประเมิน a11y contrast ratio อย่างเป็นทางการ (carry)

## D. Badge "ผู้นำ" ร่วมกับ level badge
- [x] แถวบนสุด (`idx===0`, ราคาสูงสุดเสมอ) มี badge "ผู้นำ" (เขียว `bg-success/15 text-success`) อยู่ **ข้าง** level badge ไม่ทับ/ไม่หาย — PASS

## E. Console / hydration
- [x] `list_console_messages` ไม่มี `[error]`/`[warn]` — PASS (มีแค่ Vercel Analytics debug log + Fast Refresh ปกติ)

## F. Hard Rule 7 grep gate (Paces primitive only)
- [x] `grep -nE "text-\[|bg-\[rgba|#[0-9a-fA-F]{3,6}" AuctionBidFeed.tsx` → 0 hit — PASS (ใช้ token `bg-warning/15`/`text-info`/`bg-default-100` ทั้งหมด)
- [x] `grep -rn "react-toastify" src/app/(paces)/` → 1 hit แต่เป็น **comment อ้างอิง** ใน `ConnectedAccountsClient.tsx` (ไม่ใช่ import จริง) ไม่เกี่ยวกับ feature นี้ — ไม่ block

## ยังไม่ได้เทส (carry)
- [ ] scenario "แสดง top 5 + ปุ่มดูก่อนหน้า (N)" เมื่อ `bidHistory.length > 5` — seed ปัจจุบันมีพอดี 5 บิด (`hiddenCount=0`) ปุ่มไม่ขึ้น ยังไม่เห็นแถวที่ 6+ ว่า level badge render ถูกต้องไหมหลังกด "ดูก่อนหน้า"
- [ ] realtime: บิดใหม่เข้ามาระหว่างดูหน้า (ผ่าน Supabase Realtime, `connectionState='live'`) → แถวใหม่มี level badge ถูกต้องทันทีหรือไม่ (ปัจจุบันดูจาก SSR static list เท่านั้น)
- [ ] mobile/tablet viewport (<1280px) — ยังไม่ตรวจว่า badge ล้น/ตัดคำ/wrap ผิดที่ในจอแคบ (ชื่อ bidder ยาว + level badge + ผู้นำ badge ใน 1 แถว)
- [ ] bidder ที่ `successfulBidCount` เป็นค่า malformed (NaN/negative, ไม่ควรเกิดจริงจาก DB) → fallback เป็น "มือใหม่" (ยัง verify แค่จากอ่านโค้ด guard ใน `getAuctionLevel`)
- [ ] a11y contrast ratio ของ badge "นักประมูล"/"มือใหม่" (สีเทาใกล้กัน) — ยังไม่วัดจริง
- [ ] cross-check ladder เดียวกันฝั่ง buyer `/a/[id]` (`AuctionBidHistory.tsx` มี comment อ้าง TFR-016 เหมือนกัน) — ไม่อยู่ใน scope QA รอบนี้ (เทสเฉพาะ seller console)
