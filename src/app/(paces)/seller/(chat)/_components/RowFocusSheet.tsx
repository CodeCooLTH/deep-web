'use client'

/**
 * RowFocusSheet — "โหมดเพ่ง" ของการกดค้างบนแถวรายการ (มือถือ)
 *
 * เบลอฉากหลัง → ยกแถวที่กดขึ้นมาลอยเหนือฉาก → แผ่นคำสั่งเลื่อนขึ้นจากขอบล่าง
 * ผู้เรียกส่งแค่ "แถวไหน" กับ "เนื้อในแผ่น" ที่เหลือคอมโพเนนต์นี้จัดการเอง
 *
 * 🛑 **ยกออกมาจาก `ChatContextMenu.tsx` เมื่อ 2026-08-20 เพราะกำลังจะมีผู้ใช้รายที่สอง**
 * (เมนูกดค้างของแถวคอมเมนต์ — user สั่ง "เหมือน long press ใน chat lists") กลไกในนี้ไม่ใช่
 * โค้ดที่เขียนรอบเดียวจบ แต่เป็นผลของ bug fix บน prod หลายรอบ:
 *   - วัดขอบจอจาก `visualViewport` ไม่ใช่ `innerHeight` (คีย์บอร์ด iOS ไม่หด layout viewport
 *     ของ `position:fixed` — แผ่นจะไปนอนใต้คีย์บอร์ด)
 *   - ซ่อนแถวตัวจริงด้วย `visibility` ไม่ใช่ `display` (คง layout ของรายการ + กันขอบเบลอฟุ้ง
 *     รอบโคลนจนเห็นเป็นเงาสองชั้น)
 *   - วัดตำแหน่งใหม่เมื่อ **ความสูงแผ่นเปลี่ยนหลัง paint แรก** (ResizeObserver) ไม่ใช่ไล่เดา
 *     trigger รายตัว — ของที่ทำให้สูงขึ้นทีหลังมีทั้งแถบเตือนที่อ่าน localStorage ใน effect
 *     และฟอนต์ Anuphan ที่โหลดเสร็จช้า (user report 2026-08-06 พร้อมภาพ: แถวโดนแผ่นทับ)
 *   - `useLockBodyScroll` — `touch-none` ที่ฉากเบลอกันได้เฉพาะนิ้วที่แตะฉาก ไม่กันนิ้วที่ลาก
 *     บนตัวแผ่น และแผ่นถูก portal ไป body บรรพบุรุษที่รับ scroll จึงเป็น document เอง
 *     (user report 2026-08-07 พร้อมภาพ: "พอกดขึ้นมา มัน pull หรือ เลื่อนจอได้เฉยเลย")
 *   - scroll/resize ระหว่างเปิด = **วัดใหม่ ไม่ใช่ปิด** (ไม่งั้นคีย์บอร์ดยุบแล้วแผงหายเอง)
 * ปล่อยให้ก็อปไปวางที่สองแปลว่าบทเรียนพวกนี้จะ drift แยกกันทันทีที่มีใครแก้ฝั่งเดียว
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/{offcanvas,modals}/page.tsx (โครง sheet ผ่าน
 * CustomerPanelSheet.tsx) — โครงเดิมทั้งหมดยกมาจาก ChatContextMenu.tsx ไม่ได้ออกแบบใหม่
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'

const SHEET_SHELL = 'bg-card relative max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-lg' // HR7 carve-out: Paces ไม่มี token viewport-height/safe-area — precedent CustomerPanelSheet.tsx/OrderQrSheet.tsx บรรทัดเดียวกัน

/**
 * ระยะแถว↔แผ่นคำสั่ง (user สั่ง 2026-08-06 รอบสอง: "ขยับ chat ขึ้นไปด้านบนให้หน่อย เด่น ๆ")
 * กว้างกว่าระยะเมนูทั่วไปโดยตั้งใจ — แถวที่ยกลอยต้องอ่านออกว่าเป็น "ของที่ถูกเพ่ง" ไม่ใช่หัวของแผ่น
 */
const GAP = 24
/** กันชนขอบจอ */
const EDGE = 8

type Props = {
  /** แถวจริงในรายการที่ถูกกดค้าง — ใช้โคลนมาวางบนฉากเบลอ และซ่อนตัวจริงระหว่างเปิด */
  row: HTMLElement
  onClose: () => void
  /** ชื่อของแผงสำหรับ screen reader */
  ariaLabel: string
  /**
   * grip เส้นสั้นบนหัวแผ่น — บอกว่าแผ่นนี้มาจากขอบล่าง (precedent CustomerPanelSheet.tsx)
   * ปิดได้สำหรับแผ่นที่มีรายการเดียวจนไม่ต้องมี affordance อะไรเพิ่ม
   */
  grip?: boolean
  children: React.ReactNode
}

export default function RowFocusSheet({ row, onClose, ariaLabel, grip = true, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const cloneHostRef = useRef<HTMLDivElement>(null)
  const [clonePos, setClonePos] = useState<{ top: number; left: number; width: number } | null>(null)
  /** แยกจาก clonePos เพื่อให้ transition ได้วิ่ง (ตั้งใน rAF = หลัง paint แรกที่ยัง opacity-0) */
  const [shown, setShown] = useState(false)
  /** นับครั้งที่ "พื้นที่ที่มองเห็นจริง" เปลี่ยน (คีย์บอร์ดขึ้น-ลง / หมุนจอ) → บังคับวัดตำแหน่งใหม่ */
  const [viewportTick, setViewportTick] = useState(0)
  /** ความสูงคีย์บอร์ดที่กินขอบล่างจออยู่ตอนนี้ — แผ่นต้องยกขึ้นเท่านี้ */
  const [bottomInset, setBottomInset] = useState(0)

  // ── โคลนแถวมาวางบนฉากเบลอ + ซ่อนตัวจริง ─────────────────────────────────
  // ซ่อนตัวจริงด้วย visibility (ไม่ใช่ display) เพราะต้องคง layout ของรายการไว้เป๊ะ — ไม่งั้นแถวอื่น
  // ขยับตอนกดค้าง; และถ้าไม่ซ่อน แถวเดิมยังนอนอยู่ใต้ฉากเบลอตำแหน่งเดียวกัน ขอบเบลอจะฟุ้งรอบโคลน
  // ที่คมชัด เห็นเป็นเงาซ้อนสองชั้น (บทเรียน MessageActionBubble)
  useLayoutEffect(() => {
    const host = cloneHostRef.current
    if (!host) return
    const clone = row.cloneNode(true) as HTMLElement
    // id ซ้ำในหน้าเดียวกันทำให้ getElementById/label ชี้ผิดตัว — โคลนเป็นภาพนิ่ง ไม่ใช่ของที่กดได้
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
    host.replaceChildren(clone)
    const prev = row.style.visibility
    /**
     * 🛑 ปิด `react-hooks/immutability` ตรงนี้อย่างตั้งใจ — กฎนั้นกันการแก้ prop ซึ่งถูกในกรณีทั่วไป
     * แต่ prop ตัวนี้คือ **DOM node ที่มีชีวิตอยู่นอก React** ไม่ใช่ค่าที่ React เป็นเจ้าของ และการซ่อน
     * แถวตัวจริงชั่วคราวคือหน้าที่ทั้งหมดของคอมโพเนนต์นี้ (คืนค่าเดิมใน cleanup เสมอ ไม่ทิ้งร่องรอย)
     * ไม่มีทางเลี่ยงด้วยการ "ส่งค่ากลับขึ้นไปให้ผู้เรียกทำแทน" เพราะผู้เรียกคือรายการที่ render แถว
     * เป็นร้อยแถว การให้มันถือ state ว่าแถวไหนถูกซ่อนอยู่ = re-render ทั้งรายการทุกครั้งที่กดค้าง
     */
    // eslint-disable-next-line react-hooks/immutability
    row.style.visibility = 'hidden'
    return () => {
      row.style.visibility = prev
    }
  }, [row])

  // ── ตำแหน่งของแถวที่ยกลอย ────────────────────────────────────────────────
  // แถวอยู่ "ที่เดิม" เป็นค่าตั้งต้น (นั่นคือสิ่งที่ทำให้รู้ว่ากำลังจัดการแถวไหน) — ยกเว้นตอนที่มันจะ
  // ไปนอนใต้แผ่น: แถวล่าง ๆ ของจอกับแผ่นทับกันแน่นอน แล้วโหมดเพ่งจะเหลือแต่ฉากเบลอเปล่าไม่มีบริบท
  // จึงดันแถวขึ้นมาให้พ้นหลังคาแผ่นพอดี (ยังคง left/width เดิม)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { height: sheetH } = el.getBoundingClientRect()
    // ขอบเขต "ที่มองเห็นจริง" ไม่ใช่ innerHeight — บน iOS คีย์บอร์ดหด visual viewport แต่ไม่หด
    // layout viewport ของที่ position:fixed จึงไปนอนใต้คีย์บอร์ดได้
    const vv = window.visualViewport
    const minTop = (vv ? vv.offsetTop : 0) + EDGE
    const maxBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - EDGE

    const rect = row.getBoundingClientRect()
    const ceiling = maxBottom - sheetH - GAP - rect.height
    setClonePos({
      top: Math.max(minTop, Math.min(rect.top, ceiling)),
      left: rect.left,
      width: rect.width,
    })
    setBottomInset(vv ? Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)) : 0)
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [row, viewportTick])

  /**
   * แผ่นสูงขึ้น/เตี้ยลงหลังวัดครั้งแรก → ต้องวัดตำแหน่งแถวใหม่ ไม่งั้นแถวไปนอนใต้แผ่น
   * (user report 2026-08-06 พร้อมภาพ) — ผูกกับขนาดจริงของ element แทนการไล่เดา trigger รายตัว
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportTick((t) => t + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLockBodyScroll(true)

  useEffect(() => {
    function onDoc(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // touch: หน่วงหนึ่งเฟรมก่อนดัก ไม่งั้น touchend/click ที่ตามหลังการกดค้างครั้งนี้เอง
    // จะปิดแผงทันทีที่เพิ่งเปิด (บทเรียน MessageActionBubble)
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      document.addEventListener('touchstart', onDoc)
    }, 0)
    document.addEventListener('keydown', onKey)
    // overlay กิน touch ทั้งจอ (touch-none) ผู้ใช้เลื่อนรายการเองไม่ได้ — scroll/resize ที่เกิด
    // ตอนนี้คือคีย์บอร์ดปิดหรือหมุนจอ ต้อง **วัดตำแหน่งใหม่** ไม่ใช่ปิดทิ้ง (ไม่งั้นกลายเป็น
    // กดค้างแล้วแผงหายเอง)
    const onViewportChange = () => setViewportTick((t) => t + 1)
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    window.visualViewport?.addEventListener('resize', onViewportChange)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
      window.visualViewport?.removeEventListener('resize', onViewportChange)
    }
  }, [onClose])

  return createPortal(
    <div
      // top-0 + bottom แบบคำนวณ (ไม่ใช่ inset-0) — ขอบล่างต้องเป็นขอบล่าง "ที่มองเห็นจริง"
      // ไม่งั้นคีย์บอร์ดที่เปิดจากในแผ่นจะทับแผ่นทั้งใบ
      style={{ bottom: bottomInset }}
      className="fixed inset-x-0 top-0 z-80 flex items-end justify-center"
    >
      {/* ฉากเบลอ — Base CustomerPanelSheet.tsx. blur-sm ไม่ใช่ blur-xs: ต้องดันทั้งรายการให้ถอยไป
          เป็นพื้นหลังจริง ๆ ไม่ใช่แค่ลดความเด่น
          touch-none อยู่ที่ฉากเบลอ ไม่ใช่ที่ตัวครอบ: กัน scroll ทะลุไปเลื่อนรายการข้างหลัง แต่ไม่
          บล็อกการเลื่อน "ในแผ่น" ซึ่งจำเป็นเมื่อเนื้อในยาวจนชนเพดาน 85dvh — touch-action คิดจาก
          intersection ของ element ที่นิ้วแตะ *กับบรรพบุรุษทั้งสาย* */}
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className={`bg-default-900/40 absolute inset-0 touch-none backdrop-blur-sm transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* แถวที่กด — โคลนวางทับตำแหน่งเดิม ไม่ซูม (ต่างจากบับเบิลข้อความที่ซูม 5%): แถวกว้างเต็มจอ
          ซูมแล้วขอบซ้าย/ขวาล้นออกนอกจอโดนตัด ความเด่นมาจากฉากเบลอ + เงา + ขอบแทน
          pointer-events-none: แตะโดนแล้วต้องปิด (ปล่อยให้ event ตกไปถึงฉากเบลอที่อยู่ข้างล่าง) */}
      <div
        ref={cloneHostRef}
        aria-hidden="true"
        style={{ top: clonePos?.top ?? -9999, left: clonePos?.left ?? -9999, width: clonePos?.width }}
        className={`bg-card border-default-300 pointer-events-none fixed overflow-hidden rounded-lg border shadow-lg transition-opacity duration-200 ease-out ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`${SHEET_SHELL} transition-transform duration-200 ease-out ${
          shown ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {grip && <div className="bg-default-300 mx-auto mb-3 h-1 w-9 rounded-full" />}
        {children}
      </div>
    </div>,
    document.body,
  )
}
