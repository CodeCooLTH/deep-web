'use client'

/**
 * useComposerHeight — ความสูงของช่องพิมพ์ในแชท: ลากปรับเองได้ + จำค่าล่าสุด + ขยายตามเนื้อหาเอง
 *
 * user request 2026-07-30 (2 เรื่องที่เป็นเรื่องเดียวกัน):
 *   1. "ช่องพิมพ์เล็กไป อยากขยับความสูงเองได้ และบันทึกไว้เสมอว่าล่าสุดเท่าไหร่"
 *   2. "กด quick message ลงมาแล้ว textarea ไม่ auto ความสูงให้เหมาะกับข้อความ"
 *
 * ทั้งคู่แย่งกันคุมความสูงถ้าทำแยกกัน จึงรวมเป็นกติกาเดียว (แบบ Slack/Messenger):
 *   **ความสูงที่ใช้จริง = max(ค่าที่ผู้ใช้ลากไว้, ความสูงที่พอดีกับเนื้อหา) แล้ว clamp**
 *   → ลากเอง = ตั้ง "พื้นขั้นต่ำ" ที่อยากเห็นตลอด; เนื้อหายาวกว่านั้นก็ยังขยายให้อ่านได้เอง
 *   → ข้อความสำเร็จรูปยาว ๆ ที่เพิ่งเติมเข้ามาจึงเห็นเต็มทันที ไม่ต้องลากเอง
 *
 * ทำไมเป็นแถบลากด้านบน ไม่ใช่ `resize-y` ของเบราว์เซอร์:
 *   1. กล่องนอกของช่องพิมพ์เป็น `overflow-hidden` (ต้องมี เพราะรูปที่แนบอยู่ในกล่องเดียวกัน) —
 *      มุมลากของ native อยู่ขวาล่าง จะโดนตัดหายไปเลย
 *   2. ช่องพิมพ์อยู่ล่างสุดของจอ การขยายคือ "ลากขึ้น" native บังคับให้ลากลง = สวนสัญชาตญาณ
 *   3. native resize ทับ height ที่เราตั้งให้ตามเนื้อหา → auto-grow จะพังทันทีที่ผู้ใช้ลากครั้งแรก
 *
 * เก็บค่าเดียวใช้ทุกเธรด (ไม่ใช่ต่อเธรด) เพราะเป็นความชอบเรื่องพื้นที่ทำงานของคน ไม่ใช่ของบทสนทนา.
 * localStorage = ความชอบระดับอุปกรณ์ (pattern เดียวกับ mute รายเธรด/แบนเนอร์โฆษณาใน ChatThread)
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'deep:composer-height'

/** ต่ำสุด = min-h-11 (44px) ของเดิม — ต่ำกว่านี้พิมพ์ไม่เห็นบรรทัดตัวเอง (tap target ด้วย) */
export const COMPOSER_MIN_H = 44
/** เพดานบนสุดของจอที่พื้นที่เหลือเฟือ — เพดานจริงต่อจังหวะคือ `ceiling` ที่วัดสดจาก DOM (ดูล่าง) */
export const COMPOSER_MAX_H = 420
/** ก้าวต่อการกดลูกศร 1 ครั้ง (ปรับด้วยคีย์บอร์ดได้ ไม่ใช่เมาส์อย่างเดียว) */
const KEY_STEP = 24
/** กันชนขอบล่างการ์ดเธรด = padding ล่างของแถบ composer (py-3 ≈ 12px) + buffer 8px */
const SAFE_MARGIN = 20

const clampTo = (v: number, max: number) => Math.min(max, Math.max(COMPOSER_MIN_H, Math.round(v)))
const clamp = (v: number) => clampTo(v, COMPOSER_MAX_H)

/**
 * @param content ค่าปัจจุบันในช่องพิมพ์ — ใช้เป็น trigger ให้วัดความสูงใหม่ทุกครั้งที่เนื้อหาเปลี่ยน
 *   (รวมถึงตอนถูกเติมจากข้อความสำเร็จรูป/AI ซึ่งไม่ได้ผ่าน onChange ของผู้ใช้)
 */
export function useComposerHeight(content: string) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // null = ผู้ใช้ยังไม่เคยลากตั้งค่า → พื้นขั้นต่ำเป็น COMPOSER_MIN_H
  const [userHeight, setUserHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  /**
   * เพดานจริง ณ ตอนนี้ — วัดสดจาก DOM ไม่ใช่ค่าตายตัว (user report 2026-08-05: quick message
   * ยาว + รูปแนบ ทำ textarea โตชนเพดาน 420 ตายตัว ทั้งที่การ์ดเธรดบนจอนั้นมีที่ไม่พอ →
   * แถวปุ่ม "ส่ง" ถูกการ์ด (overflow-hidden) ตัดหลุดจอเงียบ ๆ กดส่งไม่ได้)
   *
   * สูตร: ceiling = ความสูงปัจจุบันของ textarea + ที่ว่างที่เหลือจริงใต้กล่องถึงขอบล่างการ์ด
   * (`slack`) — วัดจากผลลัพธ์ layout จริงจึงนับ toolbar/แถบ reply/คิวรูปแนบให้เองหมด
   * ไม่ต้องไล่บวก pixel รายชิ้น และ self-correct ทุกรอบ layout effect: ล้นอยู่ = slack ติดลบ
   * = เพดานต่ำกว่าความสูงปัจจุบัน → หดกลับจนพอดี. เก็บใน ref เพราะ handler ลาก/คีย์บอร์ด
   * ต้องอ่านค่าสดโดยไม่ผูก re-render
   */
  const ceilingRef = useRef(COMPOSER_MAX_H)
  // ตัวกระตุ้นให้วัดใหม่เมื่อพื้นที่เปลี่ยนโดยเนื้อหาไม่เปลี่ยน (ย่อหน้าต่าง/หมุนจอ/คีย์บอร์ดมือถือ)
  const [measureTick, setMeasureTick] = useState(0)
  /** true = ผู้ใช้เพิ่งลาก/กดลูกศรปรับเองในเนื้อหาชุดนี้ → ค่าที่ปรับชนะเนื้อหา (ดู comment ในการตั้งความสูง) */
  const manualRef = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const n = Number(raw)
        // ค่าเพี้ยน (คนแก้มือ/เวอร์ชันเก่า) → ไม่ใช้ ดีกว่าได้ช่องพิมพ์สูงผิดปกติ
        if (Number.isFinite(n) && n > 0) setUserHeight(clamp(n))
      }
    } catch {
      // localStorage ปิด (โหมดส่วนตัวบางเบราว์เซอร์) — ปรับได้แต่ไม่ถูกจำ
    }
  }, [])

  const persist = useCallback((v: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(v))
    } catch {
      // เขียนไม่ได้ = ปรับได้เฉพาะรอบนี้ ดีกว่าลากแล้วไม่ขยับ
    }
  }, [])

  /**
   * ตั้งความสูงจริงบน DOM — useLayoutEffect ไม่ใช่ useEffect เพราะถ้าวัดหลัง paint ผู้ใช้จะเห็น
   * ช่องพิมพ์กระพริบจากสูงเดิมไปสูงใหม่ทุกครั้งที่เติมข้อความสำเร็จรูป
   *
   * เขียนผ่าน ref ไม่ใช่ style prop ของ React เพราะต้อง "ยุบเป็น auto ก่อนวัด" — scrollHeight
   * ไม่มีวันลดลงถ้า element ยังสูงค้างอยู่ (ลบข้อความออกแล้วช่องจะไม่หดกลับ)
   */
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    /**
     * bug fix 2026-08-03 (user report: "พิมพ์ใน mobile chat แล้วมันเด้งไปเด้งมา"):
     *
     * การ "ยุบเป็น auto ก่อนวัด" ทำให้ช่องพิมพ์เตี้ยลงชั่วขณะเท่ากับ (ความสูงจริง − 1 บรรทัด)
     * แล้วอ่าน `scrollHeight` = บังคับให้เบราว์เซอร์คำนวณ layout ใหม่ *ทันที* ตรงนั้น ระหว่างนั้น
     * รายการข้อความ (พี่น้องใน flex column เดียวกัน) สูงขึ้นชั่วขณะเท่ากัน — WebKit (Safari/iOS)
     * หนีบ (clamp) `scrollTop` ของกล่องที่ปักอยู่ล่างสุดลงตามทันทีที่คำนวณ layout รอบนั้น
     * พอคืนความสูงช่องพิมพ์ ค่า scrollTop ที่ถูกหนีบไปแล้วไม่ถูกคืน → เธรดลอยขึ้นจากล่างสุด
     * ~1 ความสูงช่องพิมพ์ ทุกตัวอักษรที่พิมพ์ แล้วเด้งกลับลงล่างสุดเมื่อ scrollToBottom ตัวถัดไป
     * ทำงาน (poll/realtime) = อาการ "เด้งไปเด้งมา". Chrome ไม่หนีบตรงนั้นจึงไม่เห็นบนเดสก์ท็อป
     * (วัดจริงด้วยหน้าจำลอง: Safari 18.3 เพี้ยน 130px ต่อการพิมพ์ 1 ตัว, ล็อกกล่องแล้วเหลือ 0px)
     *
     * แก้ด้วยการล็อกความสูงของ "กล่องนอก" ไว้เท่าเดิมตลอดช่วงวัด → ความสูงที่ลิสต์ได้รับไม่เปลี่ยน
     * เลยแม้ชั่วขณะ จึงไม่มีการหนีบ. ทั้งหมดอยู่ใน layout effect เดียว (ก่อน paint) ผู้ใช้ไม่เห็น
     * ทั้งการล็อกและการปลด — และช่องพิมพ์ยังขยาย/หดตามเนื้อหาได้เหมือนเดิม
     */
    const box = el.parentElement
    /**
     * วัดเพดานจริงก่อนแตะความสูงใด ๆ (ขณะ layout ยังเป็นผลลัพธ์จริงของรอบก่อน):
     * slack = ระยะจากขอบล่างกล่องพิมพ์ถึงขอบล่างการ์ดเธรด (ลบกันชน) — ติดลบได้ถ้ากำลังล้น
     * เนื้อหาที่โดนการ์ด clip ทิ้งยังมีพิกัด layout จริง getBoundingClientRect จึงเห็นการล้น
     */
    const card = el.closest('.card')
    if (box && card) {
      /**
       * bug fix 2026-08-05 รอบสอง (user report: "drag ขยายความสูงไม่ได้"): ช่องว่างใต้กล่องพิมพ์
       * อย่างเดียว **เป็นศูนย์เสมอ** ในสภาวะปกติ — รายการข้อความเป็น flex `grow` ที่กินพื้นที่
       * เหลือทั้งหมด กล่องพิมพ์จึงชิดขอบล่างการ์ดตลอด วัดแค่ gap = เพดานติดความสูงปัจจุบัน
       * → ลาก/auto-grow ถูกล็อกที่ ~44px. พื้นที่ที่ composer ขยายได้จริงคือ **ความสูงปัจจุบัน
       * ของรายการข้อความ** (.card-body ประกาศ min-h-0 ยุบได้ถึง 0 — ส่วนเดียวที่ยืดหยุ่นในการ์ด)
       * บวก gap ซึ่งติดลบเมื่อกำลังล้น (เคสปุ่มส่งหลุดจอ) — สองพจน์รวมกันครอบทั้งสองอาการ
       */
      const list = card.querySelector('.card-body')
      const listH = list ? list.getBoundingClientRect().height : 0
      const gap = card.getBoundingClientRect().bottom - SAFE_MARGIN - box.getBoundingClientRect().bottom
      ceilingRef.current = clampTo(el.offsetHeight + gap + listH, COMPOSER_MAX_H)
    }
    const prevBoxHeight = box?.style.height ?? ''
    if (box) box.style.height = `${box.offsetHeight}px`
    el.style.height = 'auto'
    const fitsContent = el.scrollHeight
    /**
     * bug fix 2026-08-05 รอบสาม (user report: "เลือก quick message ปุ๊บ drag ไม่ได้อีกเลย"):
     * กติกาเดิม `max(ค่าที่ลาก, เนื้อหา)` ให้เนื้อหายาวชนะการลากเสมอ — เมื่อ quick message
     * ยาวจนชนเพดาน ลากลงโดนเนื้อหาดันกลับ ลากขึ้นก็ชนเพดานอยู่แล้ว = ลากตายทั้งสองทาง
     *
     * กติกาใหม่: **เหตุการณ์ล่าสุดชนะ** —
     *   - เนื้อหาเปลี่ยน (พิมพ์/เติม quick message/AI) และยังไม่ได้ลากรอบนี้ → auto-grow
     *     แบบเดิม (ค่าที่ persist ไว้เป็นพื้นขั้นต่ำตาม request 2026-07-30)
     *   - ลาก/ลูกศรคีย์บอร์ด → ค่านั้นชนะ "เป๊ะ" ทั้งขึ้นและลง เนื้อหาที่เกิน scroll ในช่องเอง
     *   - ช่องถูกล้าง (ส่งข้อความ/ลบหมด) → กลับสู่โหมด auto สำหรับเนื้อหาชุดถัดไป
     * เพดานสด (ceiling) ยังชนะทุกอย่างเหมือนเดิม — ปุ่มส่งต้องไม่หลุดจอไม่ว่าโหมดไหน
     */
    const wanted = manualRef.current && userHeight != null
      ? userHeight
      : Math.max(userHeight ?? COMPOSER_MIN_H, fitsContent)
    el.style.height = `${clampTo(wanted, ceilingRef.current)}px`
    if (box) box.style.height = prevBoxHeight
  }, [content, userHeight, measureTick])

  useEffect(() => {
    // ช่องว่าง = จบรอบเขียนข้อความ (ส่งแล้ว/ลบหมด) → เนื้อหาชุดถัดไปกลับไป auto-grow ได้
    if (content === '') manualRef.current = false
  }, [content])

  /**
   * พื้นที่เปลี่ยนโดยที่เนื้อหาไม่เปลี่ยน → กระตุ้นให้ layout effect วัดเพดานใหม่:
   *   - ResizeObserver บนการ์ดเธรด: ย่อหน้าต่าง/หมุนจอ/dvh ขยับตอนคีย์บอร์ดมือถือเปิด
   *   - ResizeObserver บนกล่องพิมพ์: คิวรูปแนบโผล่/หาย (กล่องสูงขึ้นแต่การ์ดเท่าเดิม)
   *   - visualViewport resize: belt-and-suspenders สำหรับ Safari เก่าที่ dvh ตามคีย์บอร์ดไม่ทัน
   *     (convention iOS: docs/conventions/ เรื่อง fixed overlay + visualViewport)
   * แถบ reply ที่โผล่เหนือกล่อง (ขยับตำแหน่งแต่ไม่ขยับขนาดกล่อง) จับด้วย observer ไม่ได้ —
   * ยอมรับได้: รอบพิมพ์ตัวถัดไป (content เปลี่ยน) วัดใหม่และ self-correct ทันที
   */
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const bump = () => setMeasureTick((t) => t + 1)
    const ro = new ResizeObserver(bump)
    const card = el.closest('.card')
    if (card) ro.observe(card)
    if (el.parentElement) ro.observe(el.parentElement)
    window.visualViewport?.addEventListener('resize', bump)
    return () => {
      ro.disconnect()
      window.visualViewport?.removeEventListener('resize', bump)
    }
  }, [])

  // ค่าตั้งต้นตอนเริ่มลาก — ref ไม่ใช่ state เพราะ handler ต้องอ่านค่าสด ๆ ระหว่างลาก
  const dragStart = useRef<{ y: number; h: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault()
    // setPointerCapture — ลากเลยขอบ element แล้วยังตามต่อ (ไม่งั้นเมาส์หลุดออกนอกแถบแล้วหยุดกลางคัน)
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStart.current = {
      y: e.clientY,
      // เริ่มจากความสูง "ที่เห็นอยู่จริง" ไม่ใช่ค่าที่เก็บไว้ — ถ้าตอนนั้นช่องกำลังขยายตามเนื้อหาอยู่
      // แล้วเริ่มนับจากค่าเก่า ช่องจะกระโดดหดทันทีที่แตะแถบลาก
      h: textareaRef.current?.offsetHeight ?? userHeight ?? COMPOSER_MIN_H,
    }
    setDragging(true)
  }, [userHeight])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const start = dragStart.current
    if (!start) return
    // ลากขึ้น (clientY ลดลง) = สูงขึ้น — เพดานคือ ceiling ที่วัดสด ไม่ใช่ 420 ตายตัว
    // (กติกาเดียวกับ auto-grow ตามที่ user สั่ง 2026-08-05: ปุ่มส่งต้องไม่หลุดจอไม่ว่าทางไหน)
    manualRef.current = true // ลากแล้ว = ค่าที่ลากชนะเนื้อหา (ทั้งขึ้นและลง) จนกว่าช่องจะถูกล้าง
    setUserHeight(clampTo(start.h + (start.y - e.clientY), ceilingRef.current))
  }, [])

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragStart.current) return
      dragStart.current = null
      setDragging(false)
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      // บันทึกตอนปล่อยมือ ไม่ใช่ทุก pointermove — ไม่งั้นเขียน localStorage เป็นร้อยครั้งต่อการลากหนึ่งที
      setUserHeight((h) => {
        if (h != null) persist(h)
        return h
      })
    },
    [persist],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      manualRef.current = true // ปรับด้วยคีย์บอร์ด = manual เหมือนการลาก
      setUserHeight((h) => {
        const base = h ?? textareaRef.current?.offsetHeight ?? COMPOSER_MIN_H
        // เพดานเดียวกับการลาก/auto-grow — ดู comment ที่ ceilingRef
        const next = clampTo(base + (e.key === 'ArrowUp' ? KEY_STEP : -KEY_STEP), ceilingRef.current)
        persist(next)
        return next
      })
    },
    [persist],
  )

  /** props สำหรับแถบลาก — spread ลงบน element ที่จะให้ลากได้ */
  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown,
    role: 'separator' as const,
    'aria-orientation': 'horizontal' as const,
    'aria-label': 'ปรับความสูงช่องพิมพ์ (ลาก หรือกดลูกศรขึ้น/ลง)',
    tabIndex: 0,
  }

  return { textareaRef, dragging, handleProps }
}
