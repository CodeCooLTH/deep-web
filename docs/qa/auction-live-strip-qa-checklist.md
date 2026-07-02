# QA Checklist — AuctionLiveStrip (seller /auctions desktop "LIVE กำลังประมูลตอนนี้")

> reusable regression checklist · smoke QA 2026-07-02
> component: `src/app/(paces)/seller/(dashboard)/auctions/components/AuctionLiveStrip.tsx`
> wired at: `src/app/(paces)/seller/(dashboard)/auctions/page.tsx`
> mockup (SSOT หน้าตา): `docs/mockups/auction/seller-auction-v1.html` frame "🖥 Desktop — รายการประมูล" (`.livestrip`/`.livecard`, บรรทัด ~340-360, 906-917)
> รันที่ `seller.deepth.local:4000` (user รัน dev server เอง) · login: `btpremium_suksawat` / `Abcd123!` (หรือ OTP `0000000001`/`123456`)
> seed data: 3 auction live ("พระสมเด็จวัดระฆัง เนื้อผง" ฿12,500·12บิด·ติดตาม7, "เหรียญหลวงพ่อรุ่นแรก เนื้อทองแดง" ฿8,200·5บิด·ติดตาม2, "พระนางพญา กรุวัดนางพญา" ฿4,300·3บิด·ยังไม่มีคนติดตาม) + 1 scheduled ("นาฬิกา Seiko วินเทจ 5 Sports" ฿5,000 เริ่มต้น)

## ⚠️ ก่อนเทสทุกครั้ง (pre-flight)
- [ ] dev server รันที่ port 4000 (ห้าม start เอง — probe `curl -s http://seller.deepth.local:4000/ -o /dev/null -w "%{http_code}"` ต้อง 2xx/3xx)
- [ ] login แล้ว **resize browser ≥1280px width ก่อนดูหน้า /auctions** — strip เป็น `hidden lg:block`, จอเล็กจะไม่โผล่ (ไม่ใช่บั๊ก — by design, mockup ไม่มี mobile variant)
- [ ] ยืนยันมี auction seed อย่างน้อย 1 live/scheduled ใต้ shop ของ user ที่ login (ไม่งั้น section จะซ่อนทั้งหมด — `items.length === 0 → return null`)

## A. Structure / presence
- [ ] section header "● LIVE กำลังประมูลตอนนี้" อยู่ระหว่าง stat cards (4 ใบ) กับ toolbar/status-tabs
- [ ] ไม่มี auction live/scheduled เลย → section ซ่อนทั้งหมด (ไม่โชว์ header ลอย) — ทดสอบด้วย shop ที่ไม่มี auction
- [ ] การ์ดเรียงแนวนอน scroll-x (`overflow-x-auto`, ซ่อน scrollbar) ไม่ wrap ไม่ตัดจอ
- [ ] live items มาก่อน scheduled items เสมอ (ลำดับ status ไม่ผสม)

## B. Card visual (per card)
- [ ] รูป cover สูง ~112px เต็มความกว้างการ์ด ด้านบน (object-cover)
- [ ] รูปโหลดพัง/ไม่มี `imageUrl` → fallback icon (`photo`) พื้น `bg-default-100` (ไม่ broken-image icon เบราว์เซอร์)
- [ ] live card: badge "● LIVE" พื้นแดง solid (`bg-danger`) + จุดขาว pulse มุมบนซ้าย
- [ ] live card: countdown overlay พื้นเข้ม (`bg-dark/70`) ตัวขาว มุมล่างขวา นับถอยหลัง (mm:ss หรือ hh:mm:ss) — ต้องขยับเมื่อ reload
- [ ] scheduled card: badge "เริ่มเร็ว ๆ นี้" พื้นฟ้า (`bg-info`) มุมบนซ้าย (แทน LIVE แดง)
- [ ] scheduled card: overlay มุมล่างขวา = เวลาเปิด (`formatDateTime`, พ.ศ.) ไม่ใช่ countdown

## C. Card body
- [ ] ชื่อสินค้า **บรรทัดเดียว truncate** (ไม่ wrap 2 บรรทัด, ไม่ overflow การ์ด)
- [ ] ราคาตัวใหญ่ ตัวหนา สี primary (`text-primary`, ฿ + comma-formatted `toLocaleString('th-TH')`)
- [ ] scheduled card: ราคา + label "เริ่มต้น" (ตัวเล็กสีเทา) ต่อท้าย
- [ ] live card meta: `"{N} บิด · {ติดตาม M / ยังไม่มีคนติดตาม}"`; ไม่มีบิดเลย → "ยังไม่มีบิด" (ไม่ใช่ "0 บิด")
- [ ] scheduled card meta: ข้อความคงที่ "รอเปิดประมูล"

## D. Data correctness — watchCount แทนที่ viewer-count (impossible-data fix)
- [ ] คลิกแต่ละการ์ด → ตรงกับ auction จริงใน DB (id/title/price/bidCount ตรง)
- [ ] ค่า "ติดตาม N" = `COUNT(WatchList WHERE auctionId=...)` จริง (ไม่ใช่ mock/placeholder) — cross-check กับ mockup ที่เขียน "142 กำลังดู" (concurrent viewer, ไม่มี presence tracking ในระบบ) → **ต้องไม่ปรากฏคำว่า "กำลังดู" ที่ไหนในการ์ด**
- [ ] watchCount = 0 → ข้อความ "ยังไม่มีคนติดตาม" (ไม่ใช่ "ติดตาม 0")
- [ ] เปลี่ยนลำดับการ์ดตาม `fetchAllAuctions` order (ไม่ได้ sort ตาม watchCount/urgency) — เป็น known-behavior ไม่ใช่บั๊ก ถ้าลำดับการ์ดต่างจาก assumption เดิม ให้เช็คค่าต่อใบแทนลำดับซ้าย-ขวา

## E. Fidelity เทียบ mockup (`seller-auction-v1.html` .livestrip/.livecard)
- [ ] layout: header badge เขียว (success) + ข้อความ, การ์ดกว้างคงที่ (มockup 248px → token จริง `w-64`), gap ระหว่างการ์ดสม่ำเสมอ
- [ ] สี LIVE badge = แดง solid (mockup ตรงกับ danger token, ไม่ใช่สีอื่น), สีราคา = primary (#236dc9 / rgb(35,109,201))
- [ ] radius/overlay opacity ใกล้เคียง mockup (`bg-dark/70` ~ mockup `rgba(0,0,0,.62)`)
- [ ] ไม่มี arbitrary Tailwind value ใน component (Hard Rule 7) — grep `text-\[`/`bg-\[rgba`/hex ใน `AuctionLiveStrip.tsx` ต้อง 0 hit (ยกเว้น comment)

## F. Computed-value / token spot check
- [ ] `getComputedStyle` ราคา: `color` = `rgb(35, 109, 201)` (primary token, ไม่ใช่ม่วง Vuexy `#7367F0`)
- [ ] `font-family` ทุก text node ในการ์ด = `Anuphan, ...` (ไม่ใช่ Poppins/Courier/font-mono)
- [ ] LIVE badge `background-color` = danger token (`rgb(247, 87, 126)` ตาม Paces `--color-danger`)
- [ ] `data-skin` บน `<html>` = `"default"` (Paces แท้ ไม่ใช่ `"saas"` mood Vuexy)

## G. Console / network
- [ ] `list_console_messages` ไม่มี `[error]` level (info/log/issue accessibility เล็กน้อยผ่านได้)
- [ ] ไม่มี failed network request (image 404 อนุโลมถ้า fallback icon แสดงถูก)

## Mobile / responsive
- [ ] width <1024px (lg breakpoint) → section หายไปทั้งหมด (ตาม design ไม่ใช่บั๊ก) — ตรวจว่าไม่เหลือ empty gap/broken layout ที่เดิม

## ยังไม่ได้เทส (carry)
- [ ] countdown edge case: auction ที่เหลือ <60 วินาที / หมดเวลาพอดีขณะเปิดหน้า (ยังไม่ trigger เพราะ seed มีเวลาเหลือ >9 นาทีทุกใบตอน QA run)
- [ ] auction จำนวนมาก (>10 live) — ยังไม่เทส horizontal-scroll ที่ปริมาณเยอะ/scroll ด้วย touch บน mobile-in-desktop-emulation
- [ ] real-time bid update ระหว่างดู livestrip (ไม่ reload) — ยังไม่ยืนยันว่า strip re-render เมื่อมี bid ใหม่เข้ามา (Realtime wiring)
- [ ] shop ที่ไม่มี auction เลย (section ซ่อน) — ยืนยัน logic จากโค้ด (`items.length === 0 → null`) แต่ยังไม่ได้ manual-verify ด้วย shop จริงที่ไม่มีข้อมูล
