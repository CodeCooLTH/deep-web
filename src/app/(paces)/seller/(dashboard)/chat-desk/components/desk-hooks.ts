'use client'

// hook เล็ก ๆ ของหน้าโต๊ะแชท — ทุกตัวอ่านค่าภายนอกผ่าน useSyncExternalStore (ไม่ setState ใน effect, server snapshot คงที่กัน hydration mismatch)
import { useCallback, useSyncExternalStore, type RefObject } from 'react'

const noopSub = () => () => {}

/** วินาทีปัจจุบัน (epoch sec) — tick ทุก 1 วินาที เฉพาะ component ที่เรียก · server = 0 (UI ต้องแสดง "--" ไม่ใช่เวลาเพี้ยน) */
// cache ค่าไว้ใน module: getSnapshot ต้องคืนค่าเดิมระหว่างสองครั้งที่ React เรียกติดกัน (ข้ามขอบวินาทีแล้วจะเตือน)
let tickSec = 0
const readTick = () => tickSec || (tickSec = Math.floor(Date.now() / 1000))
export function useSecondTick(): number {
  return useSyncExternalStore(
    (cb) => {
      tickSec = Math.floor(Date.now() / 1000)
      const t = setInterval(() => { tickSec = Math.floor(Date.now() / 1000); cb() }, 1000)
      return () => clearInterval(t)
    },
    readTick,
    () => 0,
  )
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

/** แท็บซ่อน → ฉากหยุดวาด (frameloop never) */
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener('visibilitychange', cb)
      return () => document.removeEventListener('visibilitychange', cb)
    },
    () => document.visibilityState === 'hidden',
    () => false,
  )
}

/** Fullscreen API บน element ของเวที — supported=false (เช่น iPhone) → ผู้เรียกซ่อนปุ่ม ไม่ทำเป็นปุ่ม disabled */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const supported = useSyncExternalStore(noopSub, () => document.fullscreenEnabled === true, () => false)
  const active = useSyncExternalStore(
    (cb) => {
      document.addEventListener('fullscreenchange', cb)
      return () => document.removeEventListener('fullscreenchange', cb)
    },
    () => !!ref.current && document.fullscreenElement === ref.current,
    () => false,
  )
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void ref.current?.requestFullscreen?.()
  }, [ref])
  return { supported, active, toggle }
}
