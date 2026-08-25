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
 *                    ล้วน ๆ ขณะที่ `.page-content { margin-inline-start: 75px }` **คงที่ตลอด**
 *                    ⇒ แผงลอยทับ เนื้อหาไม่ขยับ = สิ่งที่ user ขอเป๊ะ
 *   · `condensed`  — `absolute` และกางเป็น flyout **รายเมนู** (sub-menu ออกข้าง) ไม่ใช่ทั้ง rail
 * จึงยก `on-hover` มา แต่ **re-scope จาก `html[data-sidenav-size]` (global) เป็นคลาสบนตัวเอง**
 * (`.chat-nav-rail` ใน safepay-overrides.css) — ห้ามแตะ `sidenavSize`/`useLayoutContext` เพราะ
 * ค่านั้นถูกใช้ร่วมกับหน้า seller อื่นทุกหน้า การสลับที่นี่จะไปเปลี่ยนเมนูของหน้าอื่นไปด้วย
 *
 * ## ทำไมไม่ mount `Sidenav/index.tsx` เดิมตรง ๆ
 *
 * `(chat)/layout.tsx` จงใจไม่ใช้ `VerticalLayout`/`Sidenav`/`TopBar` ของ seller (อ่านเหตุผลเต็ม
 * ที่หัวไฟล์นั้น — ของเดิมเคยเอา Chat Rail ไป "สลับ" เนื้อใน Sidenav แล้วชนกับ `--sidenav-width`
 * จนพังทั้งวัน) และ `Sidenav` ใช้คลาส `.app-menu` ซึ่ง **มีกฎ global ของ
 * `html[data-sidenav-size="on-hover-active"]` (ค่า default ที่ `(paces)/layout.tsx` ตั้งไว้)
 * รออยู่** — เอามาใช้ตรงนี้จะได้เมนูกางเต็ม 245px ค้างตลอดเวลาแทนที่จะเป็นไอคอนล้วน
 * ⇒ ใช้คลาสของตัวเอง แล้ว reuse เฉพาะ **ตัวเนื้อ** (`AppMenu` + `SimpleBar`) ซึ่งพิสูจน์บน prod
 * มาแล้วและได้ active-state/badge/ลำดับกลุ่มมาฟรีทั้งชุด
 *
 * ## ไม่มีโลโก้บน rail (user เคาะ 2026-08-25)
 *
 * ตำแหน่งบนสุดของ rail คือที่ที่ ref วางโลโก้ แต่ `ChatHeader` มีโลโก้ Deep อยู่แล้วและ **user
 * สั่งให้กลับมาเป็นโลโก้เองเมื่อ 2026-08-19** (ช่องนั้นกลับมติมา 3 รอบ) — ถามแล้วเลือก "คงไว้ที่
 * หัวแชท rail ไม่มีโลโก้" หัว rail จึงเหลือแค่ปุ่มปักหมุด สูงเท่า `--topbar-height` ให้เมนูแถวแรก
 * เริ่มเสมอกับเส้นใต้ของ ChatHeader พอดี
 *
 * ## ปุ่มปักหมุดต้องเห็นตลอดเวลา ห้ามโผล่เฉพาะตอนกาง
 *
 * `:hover` ไม่มีอยู่จริงบนทัช (แท็บเล็ต/โน้ตบุ๊กจอสัมผัส) — ถ้าปุ่มโผล่เฉพาะตอนกางอยู่ จะกลายเป็น
 * ทางตัน: ต้อง hover ก่อนถึงจะเห็นปุ่ม แต่ทัชไม่มี hover ⇒ ปุ่มอยู่ตำแหน่งคงที่ตลอด กดครั้งแรก =
 * กาง+ปักหมุดพร้อมกัน กดซ้ำ = หุบ (ต่างจาก `OnHoverToggle` ต้นแบบที่ธีมซ่อนตอนหุบ เพราะที่นั่น
 * เมนูกางค้างอยู่แล้วเป็นค่า default)
 */
import { useCallback, useEffect, useState } from 'react'
import { SimpleBar } from '@/components/wrappers/SimpleBar'
import Icon from '@/components/wrappers/Icon'
import AppMenu from '@/layouts/components/Sidenav/components/AppMenu'
import type { MenuItemType } from '@/types'

/** sessionStorage คีย์ของ rail นี้เท่านั้น — ห้ามใช้ `__THEME_CONFIG__` ของ useLayoutContext
 *  (นั่นเป็นค่าที่หน้า seller ทุกหน้าใช้ร่วมกัน เขียนทับ = ไปเปลี่ยนเมนูหน้าอื่น) */
const PIN_KEY = 'deep-chat-nav-rail-pinned'

export default function ChatNavRail({ items }: { items: MenuItemType[] }) {
  // อ่านค่าหลัง mount เท่านั้น — sessionStorage ไม่มีบน server, อ่านตอน render แรกจะ hydration mismatch
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    try {
      setPinned(sessionStorage.getItem(PIN_KEY) === '1')
    } catch {
      // โหมดที่เบราว์เซอร์บล็อก storage (Safari private ฯลฯ) — ปล่อยเป็นค่าเริ่มต้น "ไม่ปัก"
    }
  }, [])

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      try {
        sessionStorage.setItem(PIN_KEY, next ? '1' : '0')
      } catch {
        // เขียนไม่ได้ก็ยังสลับสถานะในหน้านี้ได้ แค่ไม่จำข้ามหน้า
      }
      return next
    })
  }, [])

  return (
    <aside
      // hidden lg:flex — rail เป็นของเดสก์ท็อปเท่านั้น (<1024px ใช้ SellerBottomNav เดิม ไม่แตะ)
      // ความกว้าง/การซ่อนป้าย/ไอคอนโต อยู่ใน .chat-nav-rail ทั้งหมด (ยกมาจาก _sidenav.css)
      className="chat-nav-rail hidden lg:flex"
      data-pinned={pinned ? 'true' : 'false'}
      // landmark ต้องมีชื่อ: หน้านี้มีทั้ง rail เมนู และคอลัมน์รายการแชท ถ้าไม่ตั้งชื่อ screen reader
      // จะอ่านว่า "complementary" เหมือนกันสองอันแยกไม่ออก
      aria-label="เมนูร้านค้า"
    >
      <div className="chat-nav-rail-head">
        <button
          type="button"
          onClick={togglePin}
          aria-pressed={pinned}
          aria-label={pinned ? 'ยกเลิกปักหมุดเมนู' : 'ปักหมุดเมนูให้กางค้างไว้'}
          title={pinned ? 'ยกเลิกปักหมุดเมนู' : 'ปักหมุดเมนูให้กางค้างไว้'}
          className="chat-nav-rail-pin"
        >
          {/* คู่ไอคอนตามที่ใช้อยู่แล้วทั้งรีโปสำหรับ "ปักหมุด/ปักแล้ว" (ProductCard.tsx,
              ProductsTable.tsx) — ยังไม่ปัก = เส้นขอบ, ปักแล้ว = ทึบ */}
          <Icon icon={pinned ? 'tabler:pin-filled' : 'pin'} aria-hidden="true" />
        </button>
      </div>

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
