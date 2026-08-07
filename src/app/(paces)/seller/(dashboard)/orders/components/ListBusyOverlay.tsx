'use client'

/**
 * ListBusyOverlay + useListBusy — แผงโหลดที่ขึ้น "ทับ" พื้นที่รายการทุกครั้งที่กรองหรือดึงข้อมูลใหม่
 * (user สั่ง 2026-08-07: "ทุกการ filter หรือ load ข้อมูลใหม่ มี preloading ขึ้นมาทับเสมอ ตามเวลาที่ใช้")
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/layouts/preloader/components/Preloader.tsx
 *       (สปินเนอร์วงกลม `animate-spin rounded-full border-* border-primary border-t-transparent`
 *        บนพื้นทึบที่กินเต็มกล่อง)
 *
 * ต่างจากธีม 2 ข้อ พร้อมเหตุผล:
 *
 * 1. `absolute` ทับเฉพาะกล่องผลลัพธ์ ไม่ใช่ `fixed` ทับทั้งจอ — แถบเครื่องมือ/ชิป/ช่องค้นหา คือ
 *    สิ่งที่ผู้ใช้เพิ่งกดและกำลังจะกดต่อ ถ้าโดนทับด้วยจะกดรัวไม่ได้ และช่องค้นหาจะหายไปใต้แผง
 *    ตั้งแต่ตัวอักษรแรกที่พิมพ์ · การทับผลลัพธ์อย่างเดียวยังกันคลิกแถวที่กำลังจะถูกแทนที่ได้ครบ
 *
 * 2. มี "เวลาขั้นต่ำ" (minMs) — ตัวกรองฝั่ง client จบใน 1 เฟรม ถ้าโชว์ตามเวลาจริงล้วน ๆ แผงจะ
 *    กะพริบ ~16ms ซึ่งอ่านเป็นจอกระตุก ไม่ใช่การโหลด · ส่วนงานที่นานกว่านั้น (กด ?stage= แล้ว
 *    ต้องรอ RSC payload ใหม่จาก server) แผงอยู่ยาว **ตามเวลาที่ใช้จริง** เพราะ
 *    `busy = isPending || floor` — ตัวไหนยังจริงอยู่ก็ยังโชว์ พื้นขั้นต่ำไม่ได้ตัดของที่นานกว่าทิ้ง
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/utils/helpers'

/** เวลาขั้นต่ำที่แผงต้องอยู่บนจอ (ms) — กันกะพริบ ดูเหตุผลข้อ 2 ข้างบน */
const MIN_VISIBLE_MS = 350

export type ListBusy = {
  /** true = ต้องมีแผงทับอยู่ตอนนี้ */
  busy: boolean
  /**
   * ห่อการกระทำที่ทำให้ข้อมูลเปลี่ยน — ใช้กับทั้ง `router.push`/`router.refresh` (รอ server)
   * และ setState ของตัวกรองฝั่ง client (รอ React render) ตัวเดียวกัน เพราะ `useTransition`
   * คา isPending ไว้จนกว่างานจะเสร็จทั้งสองแบบ
   */
  run: (fn: () => void) => void
  /**
   * เปิดแผงเฉย ๆ โดยไม่ห่อ transition — สำหรับ input ที่ต้องพิมพ์ลื่น (ห้ามเอา setState ของ
   * controlled input ไปใส่ transition ไม่งั้นตัวอักษรจะตามนิ้วไม่ทัน) ตัวจับเวลาถูกรีเซ็ตทุกครั้ง
   * ที่เรียก แผงจึงอยู่ตลอดที่ยังพิมพ์ แล้วหุบหลังหยุดพิมพ์
   */
  begin: () => void
}

export function useListBusy(minMs: number = MIN_VISIBLE_MS): ListBusy {
  const [isPending, startTransition] = useTransition()
  const [floor, setFloor] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const begin = useCallback(() => {
    setFloor(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFloor(false), minMs)
  }, [minMs])

  const run = useCallback(
    (fn: () => void) => {
      begin()
      startTransition(fn)
    },
    [begin],
  )

  // กันตั้งเวลาค้างหลัง unmount (สลับหน้าระหว่างที่แผงยังอยู่)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return { busy: isPending || floor, run, begin }
}

type Props = {
  busy: boolean
  /** ข้อความใต้สปินเนอร์ — ค่าตั้งต้นตรงกับ sentinel ของ lazy-load ในหน้าเดียวกัน */
  label?: string
  className?: string
}

/**
 * ต้องวางเป็นลูกของกล่องที่มี `relative` และครอบเฉพาะ "พื้นที่ผลลัพธ์" เท่านั้น
 * (mount ค้างไว้เสมอแล้วสลับ opacity — ไม่ใช่ mount/unmount — เพื่อให้ได้ fade ทั้งขาเข้าและขาออก
 *  ของที่ unmount ทันทีจะกระตุกตอนหาย)
 */
export default function ListBusyOverlay({ busy, label = 'กำลังโหลด...', className }: Props) {
  return (
    <div
      aria-hidden={!busy}
      className={cn(
        'absolute inset-0 z-20 flex items-start justify-center transition-opacity duration-150',
        // bg-card/75 = พื้นการ์ดโปร่ง 75% — ยังเห็นเค้าโครงรายการเดิมอยู่ข้างหลัง ทำให้รู้ว่า
        // "ของเดิมกำลังถูกแทน" ไม่ใช่ "หน้าว่างแล้ว"
        'bg-card/75',
        busy ? 'opacity-100' : 'pointer-events-none opacity-0',
        className,
      )}
    >
      {/* mt-16 = ตำแหน่งตั้งต้น ใต้แถบเครื่องมือ/ชิปพอดี — จุดที่สายตาอยู่หลังกดกรอง
          sticky top-28 = เมื่อผู้ใช้เลื่อนลงไปไกลแล้วกดกรองจากหัวสติกกี้ ตัวสปินเนอร์ต้องยังอยู่ในจอ
          ไม่ใช่ค้างอยู่บนสุดของรายการซึ่งเลื่อนพ้นตาไปแล้ว (เห็นแต่ฝ้าโปร่งเฉย ๆ = ไม่รู้ว่าโหลดอยู่) */}
      <span
        role="status"
        aria-live="polite"
        className="sticky top-28 mt-16 inline-flex items-center gap-2 rounded-lg bg-card px-4 py-2.5 text-sm font-medium text-default-700 shadow"
      >
        <span
          className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden="true"
        />
        {busy ? label : ''}
      </span>
    </div>
  )
}
