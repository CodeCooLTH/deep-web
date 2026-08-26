'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * useDialogFocus — ทำให้ `role="dialog" aria-modal="true"` **พูดความจริง**
 *
 * 🛑 ปัญหาที่ hook นี้แก้ (วัดจากจอจริง 2026-08-26 บนชีตคืนของ):
 *   - เปิดชีตแล้ว `document.activeElement` ยังเป็น `<body>` — โฟกัสไม่เคยเข้าแผงเลย
 *   - กด Tab 60 ครั้ง **ไม่มีสักครั้งที่ตกลงในแผง** — มันเดินอยู่บนหน้าที่อยู่ *ข้างหลัง* ฉากเบลอ
 *     (กระดิ่งแจ้งเตือน, เมนูซ้าย) ขณะที่ `aria-modal="true"` บอก assistive tech ไปแล้วว่า
 *     ทุกอย่างข้างหลังถูกตัดออก ⇒ ผู้ใช้คีย์บอร์ด/screen reader หลงอยู่ในของที่ระบบบอกว่าไม่มี
 *   - Escape ไม่ปิด ทั้งที่ overlay อื่นในโปรเจกต์ปิดได้หมด
 *
 * **`aria-modal` ที่ไม่มีกับดักโฟกัสคือคำสัญญาที่ผิด ไม่ใช่แค่ฟีเจอร์ที่ขาด** — มันแย่กว่า
 * ไม่ใส่เลย เพราะ AT จะซ่อนพื้นหลังให้ตามที่เราบอก แล้วผู้ใช้จะไม่มีทางไปถึงอะไรได้เลย
 *
 * 🛑 โปรเจกต์นี้มี overlay ที่ประกอบเองด้วย React state อยู่ **10+ จุด** และทุกจุดมีอาการเดียวกัน
 * (มีแค่ Escape ที่ทำกันครบ) — hook นี้ตั้งใจให้เป็นที่รวมของท่านี้ ไม่ใช่ของเฉพาะชีตเดียว
 * ผู้เรียกรายต่อไปควรมาใช้ตัวนี้แทนการเขียน `useEffect` ซ้ำ
 *
 * @param open   แผงเปิดอยู่ไหม
 * @param ref    กล่องของแผง (ตัวที่มี `role="dialog"`)
 * @param onClose ให้ Escape เรียก — ผู้เรียกเป็นคนตัดสินว่า "ปิด" แปลว่าอะไร
 */
export function useDialogFocus(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose?: () => void,
) {
  /**
   * 🛑 `onClose` **ห้ามอยู่ใน dep ของ effect หลัก** — ผู้เรียกเกือบทุกรายส่ง arrow ใหม่ทุก render
   * (`onCloseSheet={() => setReturnOpen(false)}` คือท่ามาตรฐานของโปรเจกต์นี้) ⇒ effect จะ
   * cleanup+setup ใหม่ทุกครั้งที่พ่อ render และ **cleanup คือตัวที่คืนโฟกัสออกไปนอกแผง**
   *
   * ผลที่วัดได้จริง 2026-08-26: กด Tab 25 ครั้ง โฟกัสหลุดออกนอกแผง **8 ครั้ง** ทั้งที่มีกับดักแล้ว
   * — ไม่ใช่กับดักรั่ว แต่เป็นตัว effect เองที่ยกโฟกัสออกทุกครั้งที่ re-render
   * (คลาสเดียวกับ `docs/conventions/hook-return-identity-in-deps.md`: ค่าที่ identity ไม่นิ่ง
   *  อยู่ใน deps ของ effect ที่มี side effect)
   */
  const onCloseRef = useRef(onClose)
  // อัปเดตใน effect ไม่ใช่ระหว่าง render — `react-hooks/refs` ห้ามแตะ ref ตอน render
  // และ effect นี้ไม่มี dep ที่ทำให้ effect *หลัก* รันซ้ำ จึงไม่พาปัญหาเดิมกลับมา
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = ref.current
    if (!panel) return

    /**
     * จำว่าโฟกัสมาจากไหน เพื่อคืนกลับตอนปิด — ไม่งั้นผู้ใช้คีย์บอร์ดกดปิดแล้วโฟกัสตกไปที่
     * `<body>` แล้วต้อง Tab ไล่จากต้นหน้าใหม่ทุกครั้ง (ปุ่มที่เขาเพิ่งกดอยู่กลางหน้า)
     */
    const returnTo = document.activeElement as HTMLElement | null

    /**
     * ตัวที่โฟกัสได้ ณ วินาทีนั้น — คำนวณสดทุกครั้งที่กด Tab ไม่ใช่เก็บไว้ตอนเปิด
     * เพราะเนื้อหาในแผงเปลี่ยนตามขั้น (ชีตคืนของมี 3 ขั้น ปุ่มคนละชุด) และมีของที่ถูก
     * `disabled` สลับไปมา — รายการที่แช่ไว้จะพาโฟกัสไปลงปุ่มที่หายไปแล้ว
     */
    const focusables = () => {
      const all = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-hidden') !== 'true' &&
          // กล่องที่ถูกซ่อนอยู่ (เช่นส่วนที่ยังไม่กาง) ไม่ควรรับโฟกัส
          el.offsetParent !== null,
      )

      /**
       * 🛑 **radio ที่ชื่อกลุ่มเดียวกันคือ tab stop *เดียว* ตามสเปก** — Tab พาเข้ากลุ่มครั้งเดียว
       * แล้วลูกศรเลื่อนภายใน · ถ้านับทุกปุ่มเป็นคนละ stop ตัวที่อยู่ *กลางกลุ่ม* จะไม่ใช่ทั้ง
       * ตัวแรกและตัวสุดท้ายของรายการ ⇒ ไม่เข้าเงื่อนไข wrap ⇒ เบราว์เซอร์พาโฟกัสออกนอกแผง
       * (วัดจริง 2026-08-26: ก่อนเลือกวิธี Tab 30 ครั้ง **หลุดออก 10 ครั้ง** สลับหลุด-ดึงกลับ
       *  ส่วนหลังเลือกวิธีแล้วหลุด 0 ครั้ง เพราะมีตัวอื่นคั่นจนกลุ่มไปอยู่ท้ายพอดี)
       *
       * เก็บตัวที่ **ถูกเลือกอยู่** เป็นตัวแทนกลุ่ม (ยังไม่เลือก = ตัวแรก) ซึ่งตรงกับตัวที่
       * เบราว์เซอร์ให้ tabindex จริง ⇒ ลำดับ Tab ของเราตรงกับของเนทีฟ และลูกศรยังทำงานปกติ
       */
      const seenRadioGroup = new Set<string>()
      return all.filter((el) => {
        const input = el as HTMLInputElement
        if (input.type !== 'radio' || !input.name) return true
        if (seenRadioGroup.has(input.name)) return false
        const group = all.filter(
          (x) => (x as HTMLInputElement).type === 'radio' && (x as HTMLInputElement).name === input.name,
        ) as HTMLInputElement[]
        const representative = group.find((x) => x.checked) ?? group[0]
        if (el !== representative) return false
        seenRadioGroup.add(input.name)
        return true
      })
    }

    // โฟกัสตัวแรกในแผง — ถ้ายังไม่มีอะไรให้โฟกัส ให้ตัวแผงเองรับไปก่อน (มี tabIndex={-1})
    const first = focusables()[0]
    if (first) first.focus()
    else panel.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const firstEl = items[0]!
      const lastEl = items[items.length - 1]!
      const active = document.activeElement

      /**
       * โฟกัสหลุดออกไปนอกแผงแล้ว (เกิดได้จากการคลิกพื้นหลังก่อนหน้า หรือจากของที่ portal ออกไป)
       * ⇒ ดึงกลับเข้ามาแทนที่จะปล่อยให้เดินต่อ — นี่คือเคสที่ทำให้กด Tab 60 ครั้งแล้วไม่เข้าเลย
       */
      if (!panel.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? lastEl : firstEl).focus()
        return
      }
      if (e.shiftKey && active === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // คืนโฟกัสเฉพาะตอนที่ตัวเดิมยังอยู่บนหน้าจริง — ปุ่มในเมนู `⋮` ถูก unmount ไปแล้วได้
      if (returnTo && document.contains(returnTo)) returnTo.focus()
    }
  }, [open, ref])
}

export default useDialogFocus
