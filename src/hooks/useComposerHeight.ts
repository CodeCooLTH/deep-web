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

/** ต่ำสุด = min-h-11 (44px) ของเดิม — ต่ำกว่านี้พิมพ์ไม่เห็นบรรทัดตัวเอง */
export const COMPOSER_MIN_H = 44
/** สูงสุด — กันทั้งการลากและ auto-grow ไม่ให้บังรายการข้อความจนอ่านบริบทไม่ได้ */
export const COMPOSER_MAX_H = 420
/** ก้าวต่อการกดลูกศร 1 ครั้ง (ปรับด้วยคีย์บอร์ดได้ ไม่ใช่เมาส์อย่างเดียว) */
const KEY_STEP = 24

const clamp = (v: number) => Math.min(COMPOSER_MAX_H, Math.max(COMPOSER_MIN_H, Math.round(v)))

/**
 * @param content ค่าปัจจุบันในช่องพิมพ์ — ใช้เป็น trigger ให้วัดความสูงใหม่ทุกครั้งที่เนื้อหาเปลี่ยน
 *   (รวมถึงตอนถูกเติมจากข้อความสำเร็จรูป/AI ซึ่งไม่ได้ผ่าน onChange ของผู้ใช้)
 */
export function useComposerHeight(content: string) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // null = ผู้ใช้ยังไม่เคยลากตั้งค่า → พื้นขั้นต่ำเป็น COMPOSER_MIN_H
  const [userHeight, setUserHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

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
    const prevBoxHeight = box?.style.height ?? ''
    if (box) box.style.height = `${box.offsetHeight}px`
    el.style.height = 'auto'
    const fitsContent = el.scrollHeight
    el.style.height = `${clamp(Math.max(userHeight ?? COMPOSER_MIN_H, fitsContent))}px`
    if (box) box.style.height = prevBoxHeight
  }, [content, userHeight])

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
    // ลากขึ้น (clientY ลดลง) = สูงขึ้น
    setUserHeight(clamp(start.h + (start.y - e.clientY)))
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
      setUserHeight((h) => {
        const base = h ?? textareaRef.current?.offsetHeight ?? COMPOSER_MIN_H
        const next = clamp(base + (e.key === 'ArrowUp' ? KEY_STEP : -KEY_STEP))
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
