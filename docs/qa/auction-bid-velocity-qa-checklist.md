# QA Checklist — AuctionBidVelocity (seller /auctions/[id] "ความถี่การบิด" + อัตราการบิด)

> reusable regression checklist · smoke QA 2026-07-02
> component: `src/app/(paces)/seller/(dashboard)/auctions/[id]/components/AuctionBidVelocity.tsx`
> wired at: seller auction detail page `src/app/(paces)/seller/(dashboard)/auctions/[id]/page.tsx` (คอลัมน์ซ้าย ระหว่าง `AuctionPriceChart` กับ `AuctionBidFeed`)
> mockup (SSOT หน้าตา): `docs/mockups/auction/seller-auction-v1.html` frame "🖥 Desktop — จัดการประมูล · กำลังประมูล (Control Console)" (`.velo`/`.velo-h`/`.velo-bars`/`.hot`/`.now`)
> รันที่ `seller.deepth.local:4000` (user รัน dev server เอง — **ห้าม start เอง**) · login OTP `0000000001`/`123456` หรือ username `btpremium_suksawat`
> seed auction ใช้ QA: `c7842248-22d0-4c33-843e-df028c5b49b3` ("พระสมเด็จวัดระฆัง เนื้อผง พิมพ์ใหญ่" — live, 12 บิด ~40 นาที, ครึ่งหลังบิดถี่กว่า)

## ⚠️ ก่อนเทสทุกครั้ง (pre-flight)
- [ ] dev server รันที่ port 4000 (probe `curl -s http://seller.deepth.local:4000/ -o /dev/null -w "%{http_code}"` ต้อง 2xx/3xx) — **ห้าม start เอง**
- [ ] login แล้ว resize browser ≥1280px ก่อนดูหน้า auction detail (console เป็น 2-col layout; ไม่มี mobile variant ของ card นี้ระบุใน mockup)
- [ ] auction ที่เปิดต้องมี **≥2 บิด** — component `return null` ถ้า `bidHistory.length < 2` (ไม่แสดง card เลย ไม่ใช่บั๊ก)
- [ ] `spanMs` (เวลาบิดแรก→บิดล่าสุด) ต้อง > 0 — ถ้าทุกบิดเข้าเวลาเดียวกัน (edge/seed ผิด) card จะไม่ขึ้นเช่นกัน

## A. Structure / presence
- [x] card header "ความถี่การบิด" อยู่ในคอลัมน์ซ้าย **ระหว่าง** กราฟ "แนวโน้มราคา" (`AuctionPriceChart`) กับ "ประวัติการเสนอราคา" (`AuctionBidFeed`) — PASS (สอดคล้อง comment ใน component: "card shell ยึด sibling AuctionBidFeed.tsx")
- [ ] auction ที่มีบิด <2 → card ไม่แสดงเลย (ไม่มี header ลอย/empty state) — verify ด้วย auction ที่เพิ่งเปิด ยังไม่มีบิด/มีบิดเดียว

## B. Bar histogram
- [x] แสดงเป็นแถบแนวนอน 12 บาร์ (`BUCKETS = 12`, แบ่ง `[firstBidMs, lastBidMs]` เท่า ๆ กัน — **ไม่ใช่ 1 บาร์ต่อ 1 บิด**, บังเอิญ seed มี 12 บิดพอดีเท่ากับจำนวน bucket) — PASS
- [x] ความสูงบาร์ต่างกันตามจำนวนบิดใน bucket (`pct = max(6%, count/maxCount*100%)` — ขั้นต่ำ 6% กันบาร์เตี้ยจนมองไม่เห็น) — PASS
- [x] บาร์สุดท้าย (index 11, ล่าสุด) = `bg-danger` (สีแดง/ชมพู) — PASS
- [x] บาร์ครึ่งหลัง (index 6-10) = `bg-primary` (น้ำเงินเข้ม) — PASS
- [x] บาร์ครึ่งแรก (index 0-5) = `bg-primary/15` (น้ำเงินอ่อน) — PASS

## C. Badge "🔥 พุ่งช่วงท้าย"
- [x] แสดงเมื่อ `lastHalf > firstHalf` (จำนวนบิดครึ่งหลัง > ครึ่งแรก) — seed เร่งช่วงท้าย → badge ขึ้น — PASS
- [ ] auction ที่บิดสม่ำเสมอ/ช้าลงช่วงท้าย (`lastHalf <= firstHalf`) → badge ไม่ขึ้น (component skip render `{accelerating && ...}`) — ยังไม่ได้ verify ด้วย seed ที่ไม่ accelerating

## D. อัตราการบิด (rate)
- [x] แสดง "X.X บิด/นาที" (`rate = bidCount / spanMinutes`, `.toFixed(1)`) — seed 12 บิด/~40 นาที → แสดง "0.3 บิด/นาที" ตรงตามคาด — PASS
- [ ] ตัวเลข rate สูง (บิดถี่มาก เช่น <1 นาที/บิด) → format ยังอ่านง่าย ไม่ล้น (ยังไม่ได้ seed เคสนี้)

## E. Fidelity เทียบ mockup `.velo`
- [x] bar shape (rounded-top), สี badge/บาร์ ตรงกับ mockup `.velo-bars span`/`.hot`/`.now` — PASS (screenshot side-by-side)
- [ ] **หมายเหตุ layout**: mockup ฝัง `.velo` เป็น sub-section ภายใน card เดียวกับกราฟราคา + "อัตราการบิด" แยกไปอยู่ sidebar ขวา ("โมเมนตัมการประมูล" panel); implementation รวมเป็น **card แยกต่างหาก** (histogram + rate ในการ์ดเดียวกัน) — เป็น **scope decision ที่มีการบันทึกไว้ในโค้ด comment** (mockup-to-nextjs FLAG gate, user เคาะ "ทำเฉพาะที่ทำได้จริง") ไม่ใช่บั๊ก แต่ต่างจาก mockup ตรง ๆ — ควร reconfirm กับ UX/PM ว่ายัง sign-off ตามนี้
- [ ] mockup label หัวข้อมี "(ต่อ 5 นาที)" ต่อท้าย "ความถี่การบิด"; implementation ไม่มี suffix (เพราะไม่ได้ bucket ตาม wall-clock 5 นาที แต่แบ่ง span เป็น 12 ส่วนเท่า ๆ กัน) — ต่างเชิง semantic เล็กน้อย ไม่ block merge แต่ note ไว้

## F. Computed-value / token spot check
- [x] บาร์ `bg-primary` (hot) → `getComputedStyle` = `rgb(35, 109, 201)` ตรงกับ mockup `--primary:#236dc9` เป๊ะ — PASS
- [x] บาร์ล่าสุด `bg-danger` → `rgb(247, 87, 126)` (Paces token `--color-danger: #f7577e`) — **ต่างจาก mockup hardcoded `--danger:#e23744` (rgb 226,55,68)** แต่ตรงกับ Paces danger token จริงที่ใช้ทั้งระบบ (ดู `docs/qa/auction-live-strip-qa-checklist.md` §F บรรทัด "LIVE badge background-color = danger token rgb(247, 87, 126)") → ถือเป็นค่าที่ถูกต้องตาม Hard Rule 7 (ห้าม hardcode hex, ใช้ token) ไม่ใช่บั๊ก — PASS (แก้ acceptance criteria เดิมที่อ้าง rgb 226,55,68 ผิด)
- [x] `font-family` header + ตัวเลข rate = `Anuphan, ...` — PASS
- [ ] `bg-primary/15` (บาร์ครึ่งแรก) อัลฟ่า 15% เทียบ mockup 12% (`rgba(35,109,201,0.12)`) — ต่างเล็กน้อย (Tailwind opacity step ปัดเป็น /15 ไม่ใช่ /12) ไม่กระทบสายตา ไม่ block

## G. Console / hydration
- [x] `list_console_messages` ไม่มี `[error]`/hydration mismatch — PASS (มีแค่ Fast Refresh + Vercel Analytics debug log ปกติ)
- [x] component ใช้ `max(atMs)` เป็น anchor (ไม่ใช่ `Date.now()`) ตามที่ comment อ้าง SSR-safe — ยืนยันด้วย console สะอาดจริง ไม่มี hydration warning — PASS

## ยังไม่ได้เทส (carry)
- [ ] auction ที่มีบิด <2 บิด → card ซ่อนจริง (ยัง verify แค่จากอ่านโค้ด `if (bidHistory.length < 2) return null`)
- [ ] auction ที่ไม่ accelerating (`lastHalf <= firstHalf`) → badge "🔥 พุ่งช่วงท้าย" ไม่ขึ้นจริง (ยัง verify แค่จากอ่านโค้ด)
- [ ] `bidCount > bidHistory.length` (>20 บิด) → label "จากบิดล่าสุด N รายการ" ขึ้นจริง (seed ปัจจุบันมีแค่ 12 บิด ไม่ trigger เคสนี้)
- [ ] mobile/tablet viewport (<1280px) — mockup ไม่มี variant ระบุชัด ยังไม่ได้ตรวจว่า card responsive/ซ่อนอย่างไร
- [ ] realtime: บิดใหม่เข้ามาระหว่างดูหน้า (ไม่ reload) → histogram/rate re-compute หรือไม่ (SSR top-20 static ต่อ page load หรือ live-wire ผ่าน Realtime)
- [x] grep arbitrary Tailwind value (Hard Rule 7) ใน `AuctionBidVelocity.tsx`: `grep -nE "text-\[|bg-\[rgba|#[0-9a-fA-F]{3,6}"` → **0 hit** — PASS (2026-07-02)
