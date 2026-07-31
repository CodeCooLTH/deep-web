# Retro — seller-order-detail-v5

- **Phase:** redesign หน้ารายละเอียดคำสั่งซื้อของผู้ขาย `(paces)/seller/(dashboard)/orders/[token]`
- **Branch:** `shinobu22/main-7` · 23 commits · Gate 2 **SIGNED-OFF** (2026-07-31)
- **Impeccable:** 26/40 (ก่อน) → **28/40** + finding ปิดครบ · detector 0 finding

---

## Problems

### P-1 · บั๊ก 4 ตัวผ่าน tsc + build + unit test + reviewer 8-gate มาได้ทั้งหมด

| บั๊ก | เจอด้วย | commit ที่แก้ |
|---|---|---|
| RSC serialization — ส่ง Prisma `Decimal` ดิบเข้า client component 5 จุด (console error ×3) | เปิด console บนเบราว์เซอร์ | `650d0751` |
| ไทม์ไลน์ตัดบรรทัดเละในคอลัมน์ 25% (หัวข้อเหลือกว้าง 58px ตัด 3 บรรทัด, วันที่ตัด 4) | วัด `getBoundingClientRect().height / lineHeight` | `650d0751` |
| `fulfillmentMode='PICKUP'` ถูกนับเป็น "ต้องส่งของ" | query ค่าจริงในฐาน | `0efcddb3` |
| badge สถานะ contrast 1.54:1 | Impeccable critique วัด computed color | `53854eb1` |

ทั้ง 4 ตัว **static check ผ่านหมด** — tsc เขียว, `next build` ผ่าน, unit test 187 เคสเขียว, reviewer ตรวจ 8 gate ให้ MERGE ไม่มี must-fix

### P-2 · GAP ที่ทุกชั้นตรวจมองไม่เห็นพร้อมกัน

`fulfillmentMode` ใน `prisma/schema.prisma:425,490` เป็น **`String` ไม่ใช่ enum** และในฐานจริงมี **3 ค่า** (`SHIPPED` / `NO_SHIPPING` / `PICKUP` — ค่าหลังสร้างโดย `booking.service.ts:201` ฝั่งที่พัก feat 00017)

design spec enumerate ไว้ 2 ค่า → scope baseline คัดลอกมา 2 ค่า → developer เขียน deny-list `!== 'NO_SHIPPING'` → reviewer อ่าน spec แล้วเทียบโค้ด เห็นตรงกัน = PASS

**ทุกชั้นอ่านจากแหล่งเดียวที่ enumerate ไม่ครบ จึงมองไม่เห็นพร้อมกันทั้งสายงาน** เจอตอน query ค่าจริงในฐานระหว่าง QA

### P-3 · ข้อสรุปผิดใน spec ที่เกือบกลายเป็นหนี้ถาวร

spec §8 เขียนว่า badge contrast "แก้เฉพาะหน้านี้ต้องใช้ arbitrary value = ผิด Hard Rule 7 → ต้องตัดสินระดับ design system" และ Controller ยืนยันกับ user ซ้ำ 2 ครั้ง

**ผิด** — `DESIGN.md §2` วางแบบแผน "สองโทน: สีเป็นพื้น vs สีเป็นหมึก" ไว้แล้ว (Verified Ink `#18804A` ฝั่ง Vuexy) ทางแก้คือเติม token `--color-{semantic}-ink` ซึ่งเป็น **token ไม่ใช่ arbitrary** ไม่ผิดกฎเลย · ถ้าไม่มี Impeccable critique มาชน จะถูกส่งต่อเป็น "หนี้ที่แก้ไม่ได้" ให้คนอ่านรอบหน้าเชื่อตาม

### P-4 · หนี้ที่ปิดแค่บนกระดาษ

S-11 acceptance เขียนว่า "แทน `text-default-300` ด้วย `text-default-400`" — ทำตามแล้ว ติ๊กว่าปิดหนี้ contrast

วัดจริง: `default-400` = **2.46:1** ยังห่างจาก AA 4.5 เกือบครึ่ง · `default-600` (label ทุกฟิลด์) = 3.03:1 ก็ไม่ผ่าน · **acceptance เขียนเป็น "เปลี่ยน token อะไรเป็นอะไร" แทนที่จะเป็น "ต้องได้ ratio เท่าไร" จึงผ่านได้ทั้งที่ปัญหายังอยู่**

### P-5 · Controller วัดผิดเอง 2 ครั้ง เกือบสั่งแก้โค้ดที่ไม่ได้พัง

| ครั้ง | อ้างว่าพัง | ความจริง | สาเหตุ |
|---|---|---|---|
| G-2 | ปุ่ม action ซ้ำ 2 ชุดบน desktop | แถบตรึงเป็น `visibility:hidden`, แถบล่างเป็น `display:none` — เห็นชุดเดียว | probe กรองแค่ `width>0 && height>0` · element ที่ `visibility:hidden` **ยังมี layout box** |
| contrast | `฿3,500.00` ตก AA 1.64:1 | `text-default-900` บนการ์ดขาว = ~11.7:1 | ฟังก์ชัน composite background เดินขึ้น ancestor แล้วคำนวณผิด |

ครั้งแรก user สั่ง "แก้ G-2 ต่อเลย" ไปแล้ว — ถ้าไม่ตรวจซ้ำก่อนจะไปแก้โค้ดที่ทำงานถูกอยู่

### P-6 · สภาพแวดล้อม QA หลอกได้ 3 ชั้น

1. **dev server ที่ port 4000 เสิร์ฟ worktree อื่น** (`revise-ui-order-link`) — ถ้าไม่เช็ค `lsof -a -p <pid> -d cwd` จะ QA โค้ดคนละชุดทั้งหมด
2. **`browser-harness` attach แท็บที่ active อยู่** ซึ่ง user กำลังใช้งาน — ผลรอบแรกที่อ่านมาเป็นหน้าของ user (`:4010/settings/auto-reply`) ไม่ใช่หน้าที่เปิดเอง
3. **error 2 ตัวที่ทุก agent รายงานว่า "pre-existing ไม่เกี่ยว" ตลอด 9 task** — จริง ๆ คือ **stale Prisma client** (schema มี `sortOrder` แต่ client เก่า) รัน `prisma generate` แล้วหายเกลี้ยง tsc เขียวทั้ง repo

---

## Root causes

1. **static check พิสูจน์ได้แค่ "โค้ด compile ได้และ logic ตรงที่เขียนไว้" — พิสูจน์ไม่ได้ว่า "ผู้ใช้เห็นอะไร"** RSC serialization เป็น runtime warning · การตัดบรรทัดเป็นผลของ layout จริง · contrast ต้องวัด computed color ที่ composite แล้ว · ไม่มีอันไหนอยู่ใน type system
2. **สายตรวจที่อ่านจากเอกสารเดียวกันไม่ใช่การตรวจอิสระ** reviewer เทียบโค้ดกับ spec ได้ แต่ไม่ได้เทียบ spec กับ**ความจริงในฐานข้อมูล** — ความอิสระที่แท้จริงต้องมาจากแหล่งข้อมูลคนละแหล่ง
3. **field ที่เป็น `String` แทน enum ทำให้ compiler ช่วยไม่ได้** ถ้า `fulfillmentMode` เป็น enum จริง การเขียน deny-list จะยังพลาดได้ แต่การเพิ่มค่าที่ 3 จะมีจุดให้ compiler เตือน
4. **acceptance ที่เขียนเป็น "ทำอะไร" แทน "ต้องได้ผลเท่าไร" วัดไม่ได้จริง** — "เปลี่ยน 300 เป็น 400" ติ๊กผ่านได้โดยปัญหายังอยู่ · "ต้องได้ ≥4.5:1 วัดจากจอ" ติ๊กผ่านไม่ได้ถ้ายังไม่ผ่าน
5. **เกณฑ์ "มองเห็น" ที่หละหลวมสร้าง false positive ที่ดูน่าเชื่อ** เพราะมันมีตัวเลขประกอบ — ตัวเลขที่วัดผิดอันตรายกว่าไม่มีตัวเลข

---

## Conventions to adopt

### C-1 · ก่อนเขียนเงื่อนไขจากค่าใน field ต้อง query ค่าจริงในฐานก่อน
field ที่เป็น `String`/`enum` ที่ใช้ตัดสิน branch — **ห้าม** enumerate จาก spec/memory อย่างเดียว ต้อง
```sql
SELECT <field>, count(*) FROM <table> GROUP BY 1
```
แล้วเขียนเป็น **allow-list** (`=== 'X'`) ไม่ใช่ deny-list (`!== 'Y'`) เพื่อให้ค่าใหม่ในอนาคตตกไปทางที่ปลอดภัยเอง

### C-2 · acceptance ของงาน a11y/visual ต้องเป็นตัวเลขที่วัดจากจอ
ห้ามเขียน "เปลี่ยน token A เป็น token B" · ต้องเขียน "ต้องได้ contrast ≥4.5:1 วัดจาก computed color + background ที่ composite แล้ว" และ **แนบตัวเลขก่อน/หลังตอนรายงาน**

### C-3 · เกณฑ์ "ผู้ใช้เห็นจริง" ต้องเช็ค 3 อย่าง ไม่ใช่ขนาดกล่อง
`visibility` + `display` + ไล่ ancestor chain — element ที่ `visibility:hidden` ยังมี layout box · `display:none` ยังคืน `visibility:visible`
```js
function seen(el){var e=el;while(e&&e!==document.body){var s=getComputedStyle(e);
  if(s.visibility==='hidden'||s.display==='none')return false;e=e.parentElement}
  var r=el.getBoundingClientRect();return r.width>0&&r.height>0}
```

### C-4 · ก่อน QA ต้องพิสูจน์ว่า dev server เสิร์ฟ worktree ที่กำลังทำงานอยู่
```bash
lsof -a -p $(lsof -ti:<port> | head -1) -d cwd -Fn | grep '^n'
```
ไม่ตรง → เปิด server ของ worktree นี้แยกพอร์ต · **ห้าม `kill $(lsof -ti:<port>)`** เพราะคืน process ที่ *ต่อ* พอร์ตนั้นด้วย (เคย kill Chrome helper ของ user)

### C-5 · `browser-harness` ต้องทำจบใน invocation เดียว
แต่ละครั้งมัน attach แท็บที่ active ซึ่ง user อาจกำลังใช้อยู่ — ทุก assertion ของรอบนั้นต้องอยู่ใน `js()` ก้อนเดียวที่ poll เอง · ห้าม `location.href=` ข้างใน (ฆ่า CDP context) ใช้ `new_tab()` แทน

### C-6 · error ที่ subagent บอกว่า "pre-existing ไม่เกี่ยว" ต้องพิสูจน์ ไม่ใช่รับฟัง
วิธีพิสูจน์: รัน `prisma generate` (stale client เป็นสาเหตุอันดับ 1) แล้วถ้ายังเหลือ ให้ตรวจบน base branch จริงด้วย worktree แยก
```bash
git worktree add /tmp/probe origin/main && ln -s <repo>/node_modules /tmp/probe/node_modules
```

### C-7 · ห้าม `npx next build` ในโฟลเดอร์ที่มี dev server รันอยู่
build ทับ `.next` ทำให้ dev server ล่ม (เกิดจริงใน phase นี้) — ใช้ tsc + vitest ระหว่างพัฒนา, build เฉพาะตอนจะ push

---

## What went right

1. **`getOrderActionSet()` เป็น SSOT ตัวเดียว** — หน้าเดียวมีแถบ action 3 ตำแหน่ง ทุกตำแหน่งอ่านจากฟังก์ชันเดียว ไม่มี per-status branching ในไฟล์ UI เลย (grep `'PENDING'` ใน `OrderActionBar.tsx` = 0) · เมื่อ user เปลี่ยนกติกากลางทาง (ตัด "แก้ไขคำสั่งซื้อ" ออกจาก SHIPPED, PICKUP ไม่ใช่โหมดส่งของ) แก้ที่เดียวจบ + เทส 73 เคสจับให้ทันที
2. **prop ใหม่เป็น optional ทุกตัว → ทุก commit compile ผ่านด้วยตัวเอง** ไม่มีช่วงไหนที่ repo พังระหว่าง 10 task · ไฟล์เก่าถูกลบใน commit เดียวกับที่ผสาน ไม่ใช่ลบทิ้งไว้ก่อน
3. **Change Log ของ scope baseline ทำงานจริง** — มติ 6 ข้อที่เปลี่ยนจาก spec ต้นฉบับถูกบันทึกพร้อมเหตุผลทุกข้อ ทำให้ Gate 1 audit ตัดสินได้ว่าอะไรคือ CREEP อะไรคือมติที่อนุมัติแล้ว
4. **reviewer จับได้ว่า Controller แก้ baseline โดยไม่ลง Change Log** — จ่าหน้าผิดคน (คิดว่าเป็น developer) แต่ประเด็นถูกและเป็นการตรวจที่ระบบ scope-baseline ออกแบบมาเพื่อกันพอดี
5. **การถอน G-2 ทันทีที่พบว่าวัดผิด** — user สั่งแก้ไปแล้ว แต่ตรวจซ้ำก่อนแตะโค้ด แล้วรายงานว่าไม่ใช่บั๊ก แทนที่จะแก้ให้จบ ๆ

---

## Action items

1. **ปิดหนี้ `ORDER_STAGE_META`** (`src/lib/order-stage.ts`) — chip สถานะฝั่ง inbox/chat ใช้ `bg-{semantic}/15 text-{semantic}` ตกเกณฑ์ AA แบบเดียวกัน ตอนนี้มี `--color-{semantic}-ink` ให้ใช้แล้ว (known-gap #7)
2. **เพิ่ม dark-mode override ของ `--color-{semantic}-ink`** ใน `[data-theme="dark"]` block ของ `_root.css` — ตอนนี้เป็น latent bug (สีเข้มบน dark card `#1e1f27`) ผู้ใช้เข้าไม่ถึงเพราะ `data-theme="light"` hardcode แต่จะระเบิดทันทีที่เปิด dark mode (known-gap #6)
3. **smoke-test ปุ่ม "แก้ไขเลขพัสดุ" บนออเดอร์ SHIPPED+MANUAL จริง 1 ครั้ง** หลัง deploy — ปิด known-gap #1 ด้วย real data
4. **QA ที่ยังค้าง**: CONFIRMED+รีวิวจริง · NO_SHIPPING accessUrl · หน้า list เทียบภาพ · badge variant อื่นวัด contrast จริง (known-gap #2-#5)
5. **พิจารณาเปลี่ยน `fulfillmentMode` เป็น enum ใน Prisma** — ตอนนี้เป็น `String` ทำให้ compiler ช่วยจับค่าที่ 3 ไม่ได้เลย (ต้นเหตุ P-2)
6. **promote C-1..C-7 เข้า memory/convention** ตามหัวข้อถัดไป
