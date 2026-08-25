'use client'

/**
 * ChatNavRail — แถบเมนูร้านแบบไอคอนล้วนที่ขอบซ้ายของหน้าแชท กางออกตอน hover (เดสก์ท็อป ≥1024px)
 *
 * user สั่ง 2026-08-25 พร้อมภาพ Meta Business Suite 2 ใบ: *"default แสดงแค่ icon และเมื่อ hover
 * จะ slide ออกมาข้าง ๆ (โดยที่ chat ตรงกลางไม่ขยับ เหมือน expand ลอยด้านบน)"*
 *
 * ## Base — โหมด `on-hover` ของธีม ไม่ใช่ `condensed`
 *
 * Base: theme/paces/Admin/TS/src/assets/css/structure/_sidenav.css
 *       (`.app-menu` บรรทัด 3-7 + บล็อก `html[data-sidenav-size="on-hover"]` บรรทัด 154-246)
 *
 * `_sidenav.css` มีสองโหมดที่ดูคล้ายกันแต่คนละกลไก:
 *   · `on-hover`   — `.app-menu` เป็น `fixed` กว้าง 75px ตอนพัก ขยายเป็น 245px ด้วย `:hover`
 *                    ล้วน ๆ ขณะที่ margin ของเนื้อหา **คงที่** ⇒ แผงลอยทับ เนื้อหาไม่ขยับ
 *   · `condensed`  — `absolute` และกางเป็น flyout **รายเมนู** (sub-menu ออกข้าง) ไม่ใช่ทั้ง rail
 * จึงยก `on-hover` มา แต่ **re-scope จาก `html[data-sidenav-size]` (global) เป็นคลาสบนตัวเอง**
 * (`.chat-nav-rail` ใน safepay-overrides.css) — ห้ามแตะ `sidenavSize`/`useLayoutContext` เพราะ
 * ค่านั้นถูกใช้ร่วมกับหน้า seller อื่นทุกหน้า การสลับที่นี่จะไปเปลี่ยนเมนูของหน้าอื่นไปด้วย
 *
 * ## ทำไมไม่ mount `Sidenav/index.tsx` เดิมตรง ๆ
 *
 * `(chat)/layout.tsx` จงใจไม่ใช้ `VerticalLayout`/`Sidenav`/`TopBar` ของ seller (อ่านเหตุผลเต็ม
 * ที่หัวไฟล์นั้น) และ `Sidenav` ใช้คลาส `.app-menu` ซึ่ง **มีกฎ global ของ
 * `html[data-sidenav-size="on-hover-active"]` (ค่า default ที่ `(paces)/layout.tsx` ตั้งไว้)
 * รออยู่** — เอามาใช้ตรงนี้จะได้เมนูกางเต็ม 245px ค้างตลอดเวลาแทนที่จะเป็นไอคอนล้วน
 * ⇒ ใช้คลาสของตัวเอง แล้ว reuse เฉพาะ **ตัวเนื้อ** (`AppMenu` + `SimpleBar`) ซึ่งพิสูจน์บน prod
 * มาแล้วและได้ active-state/badge/ลำดับกลุ่มมาฟรีทั้งชุด
 *
 * ## รอบแก้ 2026-08-25 (user เปิดดูของจริงแล้วสั่ง) — 4 อย่าง
 *
 * 1. *"ต้องดู group ได้ง่ายด้วย ตอนนี้ดูยาก"* — เดิมตอนหุบสั่ง `.menu-title { display:none }`
 *    ตามธีม ⇒ ไอคอน 20 กว่าตัวกองเป็นพืดเดียวไม่มีอะไรแบ่ง. ตอนนี้หัวข้อกลุ่มกลายเป็น
 *    **เส้นคั่น** ตอนหุบ และเป็น **เส้นคั่น + ตัวหนังสือ** ตอนกาง (CSS ล้วน — `AppMenu.tsx`
 *    ใช้ร่วมกับ sidenav ของหน้าอื่น ห้ามแก้ markup)
 * 2. *"ไม่ต้องมี pin"* — ถอดปุ่มปักหมุดออกทั้งชุด (state/sessionStorage/หัว rail หายไปด้วย)
 *    ⇒ กางได้ทาง `:hover` กับ `:focus-within` (Tab เข้ามา) เท่านั้น
 * 3. *"logo ต้องอยู่บนสุดเหมือนเดิม เวลา hover ให้ hover แค่ส่วนด้านล่าง (logo ไม่ต้องหุบ)"*
 *    ⇒ `ChatHeader` พาดเต็มความกว้างที่ y=0 เหมือนก่อนมี rail ส่วน rail เริ่มที่
 *    `top: var(--topbar-height)` ลงไป — กางแล้วทับเฉพาะเนื้อหาใต้หัวแชท ไม่บังโลโก้/ช่องค้นหา
 *    (กลับมติ "rail สูงเต็มจอตั้งแต่บนสุด" ที่เคาะไว้รอบแรก — user เห็นของจริงแล้วเปลี่ยน)
 * 4. *"ลองทำสีขาวมาให้ดูหน่อย"* — โทเคนสีของ rail ยกจากบล็อก `html[data-menu-color="light"]`
 *    ของธีมมา override เฉพาะใต้ `.chat-nav-rail` (ห้ามสลับ `data-menu-color` ที่ `<html>`
 *    เพราะเป็นค่าที่ sidenav ของหน้า seller อื่นใช้ร่วมกัน)
 *
 * component นี้จึงเหลือแค่กล่อง + รายการเมนู ไม่มี state ของตัวเองแล้ว (ทุกอย่างเป็น CSS)
 */
import { SimpleBar } from '@/components/wrappers/SimpleBar'
import AppMenu from '@/layouts/components/Sidenav/components/AppMenu'
import type { MenuItemType } from '@/types'

export default function ChatNavRail({ items }: { items: MenuItemType[] }) {
  return (
    <aside
      // hidden lg:flex — rail เป็นของเดสก์ท็อปเท่านั้น (<1024px ใช้ SellerBottomNav เดิม ไม่แตะ)
      // ความกว้าง/การซ่อนป้าย/ไอคอนโต/เส้นคั่นกลุ่ม อยู่ใน .chat-nav-rail ทั้งหมด
      className="chat-nav-rail hidden lg:flex"
      // landmark ต้องมีชื่อ: หน้านี้มีทั้ง rail เมนู และคอลัมน์รายการแชท ถ้าไม่ตั้งชื่อ screen reader
      // จะอ่านว่า "complementary" เหมือนกันสองอันแยกไม่ออก
      aria-label="เมนูร้านค้า"
    >
      {/* id="sidenav-menu" — `AppMenu` เลื่อนไปหาเมนูที่ active ตอน mount ด้วย
          `document.querySelector('#sidenav-menu .simplebar-content-wrapper')` ต้องคงชื่อไว้
          ไม่งั้นการเลื่อนหาเมนูที่ active เงียบไปโดยไม่มีอะไรฟ้อง (หน้าแชทไม่มี Sidenav ตัวอื่น
          อยู่แล้ว จึงไม่มี id ชนกัน)
          `!h-full` — simplebar-core เขียน `height:auto` ลง .simplebar-content-wrapper ทุกครั้งที่
          recalculate ทำให้กล่อง scroll หดเท่าเนื้อหา (docs/conventions/scroll-container-clips-popovers.md) */}
      <div className="relative min-h-0 grow" id="sidenav-menu">
        <SimpleBar className="size-full" scrollableNodeProps={{ className: '!h-full' }}>
          <AppMenu items={items} />
        </SimpleBar>
      </div>
    </aside>
  )
}
