# กล่อง scroll ที่สูงเท่าเนื้อหา = ตัด popover ที่อยู่ข้างใน

> เหตุการณ์จริง 2026-08-06 — user รายงาน "เวลา filter chat น้อย ๆ มันเปิดตัวกรองแล้วเพี้ยน":
> แผงตัวกรองของ Chat Rail ถูกตัดครึ่ง เห็นแค่หัวแผงกับชิปครึ่งใบ ปุ่ม "ใช้ตัวกรอง" หายทั้งแถบ
> แก้ที่ `4dc52130` (`src/app/(paces)/seller/(chat)/_components/ChatRail.tsx`)

## กฎ

**popover/dropdown ที่เป็น `absolute` ถูกตัดด้วย `overflow` ของ ancestor ที่ scroll ได้เสมอ —
และ ancestor ตัวนั้น "สูงเท่าไหร่" คือสิ่งที่ต้องตรวจ ไม่ใช่แค่ z-index**

อาการที่บ่งชี้: **แผงถูกตัดพอดีตรงขอบล่างของการ์ด/รายการ** (ไม่ใช่ขอบจอ) และ
**เกิดเฉพาะตอนรายการสั้น** — รายการยาวไม่มีอาการเพราะเส้นตัดไปอยู่ต่ำกว่าจอ

## กับดักเฉพาะของ SimpleBar

`simplebar-core` เขียนความสูงลง `.simplebar-content-wrapper` **เอง** ทุกครั้งที่ `recalculate()`
(`node_modules/simplebar-core/dist/index.mjs:569`):

```js
this.contentWrapperEl.style.height = isHeightAuto ? 'auto' : '100%'
// isHeightAuto = heightAutoObserverEl.offsetHeight <= 1
```

`isHeightAuto` เป็นจริงเมื่อ SimpleBar **สูงด้วย flex (`flex-1`/`grow`) ไม่ใช่ด้วย property `height`**
เพราะ `.simplebar-wrapper` ใช้ `height: inherit` แล้วรับค่า `auto` มาจาก root → กล่อง scroll หดเท่า
เนื้อหาพอดี แล้วตัดทุก popover ที่อยู่ข้างใน

| การใช้งาน | ความสูง | เสี่ยงไหม |
|---|---|---|
| `<SimpleBar className="min-h-0 flex-1">` | flex ล้วน | 🛑 `height:auto` — ตัด |
| `<SimpleBar className="size-full">` (Sidenav) | `height:100%` | ✅ |
| `<SimpleBar className="h-full grow">` (Customizer) | `height:100%` | ✅ |
| `<SimpleBar style={{ maxHeight: 380 }}>` (Megamenu/Notification) | auto ตั้งใจ | ✅ popover อยู่ **นอก** SimpleBar |

## วิธีตรวจ (30 วินาที ไม่ต้องรอ data จริงที่สั้น)

บนหน้าจริง (browser-harness / DevTools console):

```js
document.querySelector('.simplebar-content-wrapper').style.height   // 'auto' = เจอตัวการแล้ว

// จำลอง "รายการสั้น" โดยไม่ต้องแก้ข้อมูล
const body = document.querySelector('.simplebar-content .card .card-body')
;[...body.children].forEach((el, i) => { if (i > 0) el.style.display = 'none' })
// แล้วเปิดแผง วัด panel.getBoundingClientRect().bottom เทียบกับ scroller.getBoundingClientRect().bottom
```

## วิธีแก้

```tsx
<SimpleBar className="min-h-0 flex-1" scrollableNodeProps={{ className: 'overscroll-contain !h-full' }}>
```

- ต้องมี `!` เพราะต้องชนะ **inline style** ที่ SimpleBar เขียนทับใหม่ทุกรอบ `recalculate()`
- `height: 100%` (ของ `.simplebar-offset` ที่ absolute เต็มคอลัมน์) คือค่าที่ SimpleBar ใช้เอง
  ในโหมดปกติอยู่แล้ว และ `max-height: 100%` ของธีมยังอยู่ → **รายการยาวยังเลื่อนได้เหมือนเดิม**
  ไม่ใช่การปิด scroll
- แก้ที่กล่อง scroll ที่เดียว = ดรอปดาวน์ทุกตัวในคอลัมน์นั้นหายอาการพร้อมกัน (แผงตัวกรอง,
  เมนู ⋮ ของแถว, ตัวเลือกกลุ่ม) — ไม่ต้องไล่ portal ทีละตัว

**เมื่อไหร่ถึงต้องใช้ portal แทน:** เมื่อแผงต้องล้น "ขอบจริง" ของกล่อง scroll (เช่น cell ในตาราง
ที่อยู่ใน `.table-wrapper` overflow-auto) — กรณีนั้นใช้ `HoverPanel` (portal ระดับ body) ที่มีอยู่แล้ว
ดู `docs/conventions/one-value-many-entry-points.md` และหน้า `/orders`

## ทำไมไม่มีอะไรจับได้

`tsc` / `next build` / grep / hook ผ่านหมด — ตัวการอยู่ในไฟล์ `node_modules` ไม่ใช่ใน markup ของเรา
และ **บั๊กซ่อนตัวเมื่อข้อมูลเยอะ** ซึ่งเป็นสภาพปกติของเครื่อง dev. ตัวจับได้จริงคือการเปิดหน้าจริง
แล้ววัด `getBoundingClientRect()` — ดู `docs/conventions/` ตัวอื่นในกลุ่มเดียวกัน และ
`docs/retro/2026-08-04-fb-chat-comments-day-retrospective.md`
