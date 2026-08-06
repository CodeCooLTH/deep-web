# Convention — ตำแหน่งปุ่ม Action (Seller / Paces)

> สถานะ: agreed 2026-05-16 · ครอบทุกหน้าฝั่ง seller (`(paces)/seller/**`)
> เป้าหมาย: ผู้ใช้เจอปุ่มที่ "ตำแหน่งเดิม" ทุกหน้า → ลด cognitive load + กดพลาดปุ่มอันตราย

---

## 1. โซนของ action (มีแค่ 4 โซน ห้ามมีนอกนี้)

| โซน | อยู่ที่ไหน | ใส่อะไรได้ |
|---|---|---|
| **Action-bar** | แถวบนสุดของเนื้อหา — sticky เสมอ (fullscreen = sticky header; dashboard page = sticky row ใต้ topbar ที่ `top-[65px]`) | primary + secondary + overflow `⋯` |
| **List toolbar** | หน้า list ที่มี filter/search → ไม่มี action-bar; primary อยู่ใน `card-header` ระดับเดียวกับ search/filter (ซ้าย=search/filter, ขวา=primary) | primary (สร้าง/เพิ่ม) |
| **Row action** | คอลัมน์/มุมขวาของแถว/การ์ดในรายการ | overflow `⋯` (ดู/แก้/ลบรายแถว) |
| **Footer** | `card-footer` | pagination / bulk เท่านั้น |
| **Inline form** | ในเนื้อหา ติดกับสิ่งที่มันกระทำ | ปุ่ม submit ของ sub-form (เช่น "+ เพิ่มรายการ") |

> **Recap / Summary panel = ไม่มีปุ่ม action เด็ดขาด** — แสดงข้อมูลสรุปอย่างเดียว ปุ่มหลักอยู่ action-bar ที่เดียว

---

## 2. Action-bar layout (กฎเหล็ก)

```
┌───────────────────────────────────────────────┐
│ [‹ back] ชื่อ/สถานะ        [⋯] [secondary] [PRIMARY] │
│  ───ซ้าย: บอกว่าอยู่ที่ไหน───   ───ขวา: ทำอะไรได้─── │
└───────────────────────────────────────────────┘
```

- **Primary action** (สร้าง / บันทึก / ยืนยัน / บันทึกการจัดส่ง) — **ขวาสุดเสมอ**, `btn bg-primary text-white`, **1 ปุ่มต่อหน้า ห้าม duplicate** (ห้ามมีทั้ง header และ panel)
- **Secondary** (ยกเลิก / ออกจากหน้า โดยไม่บันทึก) — ติดซ้ายของ primary, `btn border-default-300` (ghost)
- **Overflow `⋯`** — ซ้ายสุดของกลุ่มขวา, `btn-icon border-default-300`; เก็บ action รอง + อันตราย
- ลำดับซ้าย→ขวา: `⋯ → secondary → PRIMARY` (primary ชิดขวาสุด = นิ้วโป้ง reach บนมือถือ + สายตา LTR จบที่ขวา)
- Action-bar **สูง/ตำแหน่งเท่ากันทุกหน้า** — ตาเจอปุ่มที่เดิม

---

## 3. ปุ่มอันตราย / destructive (ยกเลิกออเดอร์ · ลบ)

- **ห้ามวางติด primary** — ต้องอยู่ใน **overflow `⋯` menu** เท่านั้น
- ในเมนู: รายการปกติด้านบน → `divider` → รายการอันตราย (`text-danger`) ด้านล่างสุด
- กดแล้วต้องเปิด **confirm dialog ผ่าน Sweet Alerts** (`pacesConfirm.danger(...)` จาก `@/lib/paces-swal`) — ห้าม `window.confirm()` และห้ามประดิษฐ์ card-overlay modal เอง (safepay-ux Hard Rule 8, 2026-06-16; เดิมใช้ Preline overlay → migrate เป็น Sweet Alerts แล้ว). ข้อยกเว้น: dialog ที่เป็น **multi-phase progress** (เช่น bulk-send-SMS ใน `BulkActionBar` — confirm→progress bar→done) คงเป็น custom card-overlay ได้ (Sweet Alerts ไม่เหมาะกับ progress loop)
- `แก้ไขออเดอร์` ถือเป็น action รอง (ไม่ใช่ flow หลักของหน้า detail) → อยู่ใน `⋯` menu เช่นกัน

---

## 4. การ map ต่อหน้า

| หน้า | Action-bar (ขวา) | Overflow `⋯` | Row / อื่น |
|---|---|---|---|
| **Order List** | *ไม่มี action-bar* — `[+ สร้างออเดอร์]` (primary) อยู่ใน `card-header` ชิดขวา ระดับเดียวกับ search/filter | per-card `⋯` (ดูรายละเอียด · คัดลอกลิงก์ · แก้ไข[PENDING] · ยกเลิก[PENDING/SHIPPED]) | filter/search = ซ้ายของ card-header · summary ยอดเงินอยู่ท้ายรายการสินค้าในการ์ด · pagination = footer |
| **Order Create** | `[ยกเลิก] [บันทึกออเดอร์]` | — | summary panel = recap ล้วน ไม่มีปุ่ม |
| **Order Edit** | `[ยกเลิก] [บันทึกการแก้ไข]` | — | guard banner มีลิงก์ "ดูรายละเอียด" (ไม่ใช่ปุ่ม action-bar) |
| **Order Detail** | `[⋯] [บันทึกการจัดส่ง]` (primary ผันตาม state) | `แก้ไขออเดอร์` · — · `ยกเลิกออเดอร์` (แดง) | buyer-link card มีปุ่ม "คัดลอกลิงก์" = inline utility (ไม่ใช่ action หน้า) |
| **Product List** (มือถือ 2026-08-06) | *full-screen* — `[+]` icon ขวาสุดของ sticky header (ดู §5.1); เดสก์ท็อป = `[+ เพิ่มสินค้า]` ใน `card-header` | per-card `⋯` (ดูรายละเอียด · — · เปิด/ปิดการขาย · — · ลบสินค้า[แดง+Swal]) | primary ต่อการ์ด = **แก้ไข** (filled น้ำเงิน icon-only) · ปักหมุด = outline · **ห้ามมีปุ่มลบบนการ์ด** |

### Detail — primary ผันตาม order state
| สถานะ | Primary (ขวาสุด) | Overflow `⋯` |
|---|---|---|
| PENDING + ต้องจัดส่ง | บันทึกการจัดส่ง | แก้ไขออเดอร์ · ยกเลิกออเดอร์ |
| PENDING + ไม่จัดส่ง | (ไม่มี primary — รอผู้ซื้อ) | แก้ไขออเดอร์ · ยกเลิกออเดอร์ |
| SHIPPED | (ไม่มี primary) | ยกเลิกออเดอร์ |
| CONFIRMED / CANCELLED | (ไม่มี primary — terminal) | — |

> ถ้าไม่มี primary: action-bar เหลือแค่ `[⋯]` ทางขวา (ตำแหน่งคงเดิม ตาไม่ต้องหาใหม่)

### Order List — toolbar pattern (ข้อยกเว้น sticky action-bar)

หน้าที่เป็น **list + มี filter/search toolbar อยู่แล้ว** ไม่ต้องมี sticky action-bar แยก — รวม primary เข้ากับ toolbar ใน `card-header` เพื่อไม่ให้มี 2 แถบซ้อนกินพื้นที่:

```
┌ card-header ─────────────────────────────────────────┐
│ [🔍 ค้นหา] [▼ filter] [▼ แสดง]        [+ สร้างออเดอร์] │  ซ้าย=filter · ขวา=primary
├─ tabs (สถานะ) ────────────────────────────────────────┤
│  การ์ดออเดอร์ (1 การ์ด = 1 ออเดอร์)                      │
│   • header: ลูกค้า + ข้อมูลออเดอร์ บรรทัดเดียว (border-b)│
│   • items: รูปสินค้าเด่น + ชื่อ/SKU + ราคา×จำนวน + รวม   │
│   • summary breakdown (ยอดสินค้า/ส่วนลด/VAT/สุทธิ) ท้าย items│
│   • footer (border-t): `[⋯] [คัดลอกลิงก์] [ดูรายละเอียด]`│
└────────────────────────────────────────────────────────┘
```

- primary (`+ สร้าง...`) ชิดขวาของ `card-header` ระดับเดียวกับ search/filter — **ไม่ใช่** sticky bar
- action ต่อรายการ = footer การ์ด ชิดขวา ลำดับ `⋯ → secondary → primary` (`⋯` เก็บ แก้ไข/ยกเลิก ตาม state)
- destructive ใน `⋯` เท่านั้น + confirm modal (กฎข้อ 3 ยังบังคับ)
- summary panel/recap ไม่มีปุ่ม (กฎข้อ 1 ยังบังคับ)

---

## 5. Mobile

- Action-bar ยัง sticky (fullscreen = top; dashboard = top ใต้ topbar) — **ปุ่มไม่ย้ายตำแหน่ง ไม่ยุบเป็น bottom bar**
- ถ้าปุ่มล้น: secondary ยุบเป็น icon-only ก่อน, primary คงข้อความเสมอ, overflow `⋯` คงเดิม

### 5.1 🛑 หน้า full-screen ซ่อน bottom nav → action ที่อยู่ใน FAB หายไปด้วย

`SellerBottomNav.tsx` **`return null` ทั้งก้อน** สำหรับ path ที่เป็น full-screen (`/orders`, `/orders/<token>`, `/products`) — และ **FAB "สร้าง" อยู่ข้างในตัวนั้น** ดังนั้นทุก action ใน `buildFabActions` (สร้างหมวดหมู่ · สร้างสินค้า · สร้างออเดอร์) **หายไปพร้อมกันทั้งชุด** บนหน้าที่ full-screen

กฎ: **หน้าไหนเข้าโหมด full-screen ต้องหาที่ใหม่ให้ action ที่เคยพึ่ง FAB ในคอมมิตเดียวกัน** — ตำแหน่งมาตรฐานคือ **ปุ่มไอคอนขวาสุดของ sticky header** (`size-11 rounded-lg bg-primary text-white`, ไอคอน `plus`, `aria-label` = คำสร้างของหน้านั้น) และเป็น **ปุ่ม filled สีน้ำเงินปุ่มเดียวในหัวหน้า** (back/filter/bell เป็น icon เปล่า `text-default-700`)

เหตุการณ์จริง 2026-08-06: `/orders` เขียนคอมเมนต์ไว้เหนือปุ่มสร้างว่า *"desktop เท่านั้น (มือถือใช้ FAB ใน bottom nav)"* — เจตนาถูก แต่ **ไม่มีใครไล่ดูว่า nav ตัวนั้นยัง render อยู่ไหมในหน้านี้** ผลคือ **สร้างออเดอร์จากหน้า `/orders` บนมือถือทำไม่ได้เลย** และไม่มีอะไรฟ้อง (tsc/build/grep ถูกหมด ปุ่มมีอยู่จริงในโค้ด แค่ `hidden` บนมือถือ และตัวสำรองไม่ได้ถูก render) เพิ่งเจอตอนทำ `/products` ให้ full-screen แบบเดียวกันแล้วถามว่า "แล้วปุ่มเพิ่มไปอยู่ไหน"

**บทเรียนที่กว้างกว่านั้น: คอมเมนต์ที่อ้างถึง component อื่น ("อันนี้ไม่ต้องมีเพราะ X มีให้แล้ว") ไม่ใช่หลักฐานว่า X ยังทำงานอยู่ในบริบทนี้ — ต้องเปิด X อ่านเงื่อนไข render จริง** (ดู memory `feedback_verify_scope_before_claiming_exists`)

---

## 6. Checklist ก่อน merge งาน UI ฝั่ง seller

- [ ] primary action อยู่ขวาสุดของ action-bar และมีที่เดียวในหน้า
- [ ] ไม่มีปุ่ม action ใน recap/summary panel
- [ ] destructive อยู่ใน `⋯` menu + มี confirm modal (ไม่ใช่ `window.confirm`)
- [ ] action-bar sticky และ anchor ตำแหน่งเดียวกับหน้าอื่น
- [ ] ลำดับ `⋯ → secondary → primary`
