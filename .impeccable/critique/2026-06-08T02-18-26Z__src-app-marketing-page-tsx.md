---
target: "หน้า Home (marketing landing, :4001 redesign)"
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-06-08T02-18-26Z
slug: src-app-marketing-page-tsx
---
# Critique — หน้า Home (`src/app/(marketing)/page.tsx`, live :4001 home-redesign)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | landing นิ่ง — search/nav ครบ ไม่มี dynamic state ให้ติดตาม |
| 2 | Match System / Real World | 2 | placeholder `[ banner หลัก เปลี่ยน/หมุนได้ ]` โผล่จริงในฮีโร่; amber = badge เชิงบวก ขัดสัญชาตญาณ (เหลือง=เตือน) |
| 3 | User Control and Freedom | 3 | nav/search/link มาตรฐานครบ |
| 4 | Consistency and Standards | 3 | การ์ด "ยืนยันตัวตนรับ Badge" ใช้ amber ขัดกฎ Verified-Means-Green ของ DESIGN.md |
| 5 | Error Prevention | 3 | n/a สำหรับ landing |
| 6 | Recognition Rather Than Recall | 3 | หมวดหมู่ติด label ครบ มองเห็นทุกอย่าง |
| 7 | Flexibility and Efficiency | 3 | มี search; ไม่มี accelerator (ไม่จำเป็นบน landing) |
| 8 | Aesthetic and Minimalist Design | 2 | placeholder text + สถิติ N≈0 เด่น + เทมเพลต Shopee ทั่วไป + ฮีโร่เป็นบล็อกสีไม่มีภาพ |
| 9 | Error Recovery | 3 | n/a |
| 10 | Help and Documentation | 3 | มี FAQ section + ลิงก์ช่วยเหลือ |
| **Total** | | **28/40** | **Good (ขอบล่าง)** — แต่คะแนนนี้ *ประเมินต่ำกว่าจริง* เพราะปัญหาหลักคือ "ความน่าเชื่อถือ/ความเป็นแบรนด์" ที่ heuristic จับไม่ครบ |

## Anti-Patterns Verdict

**LLM assessment:** ไม่ใช่ AI-slop แบบจัดจ้าน แต่ติด **second-order reflex: "marketplace ไทย → เลย์เอาต์ Shopee"** — mega banner ม่วง + กริดหมวดหมู่วงกลมพาสเทล + แถวร้านค้า + แถวสถิติ. มันอ่านเป็น "สกินมาร์เก็ตเพลสทั่วไป" มากกว่า "แบรนด์ trust ที่มี POV". ฮีโร่เป็น gradient ม่วงทึบ + ข้อความกลาง + **ไม่มีภาพเลย** = จุดที่ brand register เตือนตรงๆ ("บล็อกสีตรงที่ควรเป็น hero image แย่กว่ารูปสต็อก"). กริดหมวดหมู่ 18 วงกลมพาสเทลคือบล็อกที่ "เทมเพลต" ที่สุด. ม่วง/Anuphan เองไม่ผิด (identity ที่ ship อยู่แล้ว — preserve).

**Deterministic scan:** detector เจอ `gradient-text` 1 รายการที่ `styles.module.css:34` — แต่ **importedBy = ContactUs/CustomerReviews/OurTeam/Pricing ซึ่งเป็น section ที่ถูก archive** (index.tsx render แค่ Hero → Category → FeaturedShops → ProductStat → Faqs). **= false positive ต่อหน้า home จริง** แต่เป็น dead-code ที่ควรลบกัน accident ในอนาคต.

**Visual:** ตรวจจริงบน live :4001 ทั้ง desktop (1280) + mobile (390) — ไม่ได้ inject overlay (ตรวจด้วยตา + computed styles + source).

## Overall Impression

หน้านี้ "ใช้งานได้" และสะอาดในระดับโครงสร้าง แต่บน **flagship brand surface** มันสะดุด 3 เรื่องที่ทำลายความเชื่อใจทันที: (1) **placeholder ดิบในฮีโร่**, (2) **สถิติจริงที่ N≈0 โชว์เด่น** ("2 ร้านค้า", "0 มิจฉาชีพถูกบล็อก") ซึ่งบนแพลตฟอร์ม *trust* ยิ่งโชว์ยิ่งสะกิดว่า "ยังไม่มีคนใช้/ยังพิสูจน์ไม่ได้", (3) **ฮีโร่ไม่มีภาพ** เป็นแค่บล็อกสีม่วง. โอกาสใหญ่สุด: ทำให้หน้าแรก *นำด้วยข้อเสนอ trust อย่างมีโครงสร้าง* แทนการลอก IA แบบ commerce-first ของ Shopee.

## What's Working

1. **โครง Shopee-flat อ่านง่าย** — bg เทา + การ์ดขาว bordered ลอย, ลำดับ banner → หมวดหมู่ → ร้าน → สถิติ → FAQ เป็น IA ที่คนไทยคุ้นและสแกนเร็ว.
2. **Graceful degradation จริง** — `Promise.allSettled` ให้แต่ละ section degrade อิสระ ไม่ blank ทั้งหน้าเมื่อ DB ช้า/ล่ม (ดู page.tsx). วิศวกรรมดี.
3. **ยึด design system** — Anuphan, ม่วง, radius/เงานุ่ม สอดคล้อง DESIGN.md; verified chip + tier (Deep Silver/Classic) บนการ์ดร้านสื่อ trust ได้ถูกทาง.

## Priority Issues

- **[P1] Placeholder ดิบในฮีโร่**
  - **Why:** บรรทัด sub-headline ที่เด่นที่สุดของหน้าแรกคือ `[ banner หลัก เปลี่ยน/หมุนได้ ]` (ยืนยันใน `HeroSection.tsx`). ผู้ใช้ครั้งแรกเห็น = "เว็บยังทำไม่เสร็จ" → ความเชื่อใจพังทันทีบนแพลตฟอร์มที่ขายความเชื่อใจ.
  - **Fix:** แทนด้วย sub-headline จริง (เช่น value prop "โอนได้อย่างสบายใจ เพราะทุกร้านยืนยันตัวตน") หรือถ้าตั้งใจทำ banner หมุนได้จริง → ship เนื้อหา/ภาพ banner จริงแทน bracket.
  - **Suggested command:** `/impeccable clarify` (copy) → ตามด้วยพิจารณา hero ใน `shape`

- **[P1] สถิติ N≈0 โชว์เด่นบั่นทอน trust**
  - **Why:** "2 ร้านค้าในระบบ" + "0 มิจฉาชีพถูกแจ้งบล็อก" + "4 ยืนยันตัวตนแล้ว" — บนแพลตฟอร์ม trust การโชว์เลขเล็ก/ศูนย์ = สัญญาณ "ยังไม่มีใครใช้/ยังจับมิจฉาชีพไม่ได้". "show, don't tell" ย้อนศรเมื่อ N ต่ำ. "0 บล็อก" แย่กว่าการเงียบ.
  - **Fix:** ซ่อนบล็อกสถิติจนกว่าตัวเลขจะมีน้ำหนัก, หรือ reframe เป็นเชิงคุณภาพ (เช่น "ทุกร้านยืนยันตัวตน 100%", "รีวิวจริงเฉลี่ย 4.8★"), หรือสลับเป็น proof แบบอื่น (verified-shop spotlight). ตัด "0 มิจฉาชีพ" ออกก่อน.
  - **Suggested command:** `/impeccable shape` (ตัดสินใจ proof strategy) หรือ `/impeccable layout`

- **[P1] ฮีโร่ไม่มีภาพ — เป็นบล็อกสีล้วน**
  - **Why:** brand register: บล็อกสีตรงที่ควรเป็น hero image แย่กว่ารูปสต็อก. มาร์เก็ตเพลสควรโชว์คุณค่า (สินค้า/ร้านที่ verified/banner โปรจริง) — ตอนนี้เป็นกล่อง gradient ม่วงเฉยๆ.
  - **Fix:** ถ้าเป็น banner หมุนได้ → ship ภาพ banner โปรโมชันจริง; หรือจัดองค์ประกอบฮีโร่ที่มี product/shop imagery + verified signal.
  - **Suggested command:** `/impeccable shape` (ออกแบบฮีโร่ใหม่)

- **[P2] อ่านเป็น Shopee clone ไม่ใช่ "Deep"**
  - **Why:** เลย์เอาต์ = เทมเพลตมาร์เก็ตเพลสไทยมาตรฐาน. POV "trust-first" บางมาก — trust เป็นแค่ banner เดียว + แถวสถิติ. โครงสร้างไม่ได้นำด้วยความเชื่อใจ.
  - **Fix:** พิจารณา IA ที่นำด้วย trust (verified-shop spotlight, "how Deep protects you" flow) แทนการ mimic commerce-first; กริดหมวดหมู่พาสเทลคือบล็อกที่ generic สุด — ลดทอน/จัดใหม่.
  - **Suggested command:** `/impeccable shape` (rethink IA) → `/impeccable bolder`

- **[P2] การ์ดฮีโร่ฝั่งขวาอ่อน + ขัด semantic**
  - **Why:** "ยืนยันตัวตนรับ Badge" ใช้ amber (warning) กับข้อความเชิงบวก — ขัดกฎ Verified-Means-Green ของ DESIGN.md; amber อ่านเป็น "ระวัง". การ์ดสองใบดูเหมือน promo slot ตกค้างจาก Vuexy.
  - **Fix:** เปลี่ยนการ์ด Badge เป็นโทนเขียว Verified `#28C76F`; ทบทวนว่าการ์ดสองใบนี้คุ้มพื้นที่ฮีโร่ไหม.
  - **Suggested command:** `/impeccable colorize` หรือ `/impeccable layout`

## Persona Red Flags

**Jordan (First-Timer):** เห็น `[ banner หลัก... ]` → "เว็บยังไม่เสร็จเหรอ"; เห็น "0 มิจฉาชีพถูกแจ้งบล็อก" → "ตกลงมันกันมิจฉาชีพได้จริงไหม?" — สองจุดนี้ทำลาย first impression ของแพลตฟอร์ม trust.

**Casey (Distracted Mobile):** แถบลิงก์ utility บนสุด (เปิดร้านค้า/Seller Center/ช่วยเหลือ/ภาษา/สมัคร/เข้าระบบ) อัดกันในแถบจิ๋วบน 390px — tap target <44px, เสี่ยงกดผิด; การ์ดร้าน 2 คอลัมน์บีบจนชื่อร้านถูกตัด ("BT premium auto xenon สาขา…").

**ป้าสมศรี — ผู้ซื้อสูงวัย ระวังมิจฉาชีพ (project persona จาก PRODUCT.md):** กลุ่มเป้าหมายแกนของ Deep. placeholder + สถิติ N≈0 → "ดูยังไม่เสร็จ/ยังไม่มีคนใช้" → ไม่กล้าโอน; การ์ด Badge สีเหลืองอ่านเป็น "คำเตือน" แทน "ความมั่นใจ" สวนเป้าหมาย warm-credibility.

## Minor Observations

- `gradient-text` ใน `styles.module.css:34` เป็น dead code (section archive) — ลบทิ้งกัน accident ในอนาคต (detector จะเลิก flag).
- การ์ดร้านบน mobile (2-col บีบ) ควรลอง 1-col หรือ horizontal scroll; ชื่อร้านถูก truncate.
- หัวข้อ section ("หมวดหมู่"/"ร้านค้าแอคทีฟ") เรียบเกินจนไม่มี hierarchy เด่น — แต่ไม่เร่งด่วน.

## Questions to Consider

- ถ้าหน้าแรกต้อง "พิสูจน์ความน่าเชื่อถือ" ตั้งแต่วินาทีแรก — banner ม่วงทำหน้าที่นั้นจริงไหม หรือ verified-shop spotlight ทำได้ดีกว่า?
- ตอนนี้ตัวเลขจริงยังต่ำ — proof ที่ honest แต่ไม่บั่นทอน trust หน้าตาเป็นยังไง (qualitative? per-shop? ซ่อนไปก่อน)?
- เวอร์ชันที่ "เป็น Deep ไม่ใช่ Shopee" จะตัดอะไรทิ้งและเพิ่มอะไรเข้าโครง?
