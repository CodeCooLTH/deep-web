'use client'

/**
 * 🧪 PROTOTYPE — แถบสลับ variant (throwaway)
 *
 * 🛑 ซ่อนใน production build เสมอ — prototype ที่หลุด merge ต้องไม่โผล่ให้ผู้ใช้จริงเห็น
 * ตั้งใจให้ "หน้าตาไม่เข้าพวก" กับดีไซน์ที่กำลังประเมิน (พิลล์ดำคอนทราสต์สูง) จะได้ไม่มีใคร
 * เผลอตัดสินดีไซน์รวมแถบนี้เข้าไปด้วย
 */

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export const PROTO_VARIANTS = ['A', 'B', 'C'] as const
export type ProtoVariant = (typeof PROTO_VARIANTS)[number]

export const VARIANT_NAME: Record<ProtoVariant, string> = {
  A: 'วิธีคืนก่อน (wizard การ์ด)',
  B: 'จอเดียวจบ (ลิสต์)',
  C: 'เลือกของก่อน (แถบสรุปล่าง)',
}

export function useProtoVariant(): ProtoVariant {
  const sp = useSearchParams()
  const v = sp.get('variant')?.toUpperCase()
  return (PROTO_VARIANTS as readonly string[]).includes(v ?? '') ? (v as ProtoVariant) : 'A'
}

export default function PrototypeSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const current = useProtoVariant()

  const go = (dir: 1 | -1) => {
    const i = PROTO_VARIANTS.indexOf(current)
    const next = PROTO_VARIANTS[(i + dir + PROTO_VARIANTS.length) % PROTO_VARIANTS.length]
    const params = new URLSearchParams(sp.toString())
    params.set('variant', next)
    // replace ไม่ใช่ push — ไม่อยากให้ประวัติเบราว์เซอร์เต็มไปด้วยการสลับ variant
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ห้ามแย่งลูกศรตอนโฟกัสอยู่ในช่องกรอก — ผู้ใช้กำลังเลื่อน cursor อยู่
      const el = document.activeElement
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement | null)?.isContentEditable) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-100 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full bg-black/85 px-2 py-1.5 text-white shadow-lg">
        <button type="button" onClick={() => go(-1)} className="px-2 py-1 text-lg leading-none" aria-label="variant ก่อนหน้า">
          ←
        </button>
        {/* ตั้งใจไม่ใช้ icon ของธีมตรงนี้ — แถบนี้ต้อง "ไม่เข้าพวก" กับดีไซน์ที่กำลังประเมิน
            จะได้ไม่มีใครเผลอตัดสินดีไซน์รวมแถบนี้เข้าไปด้วย · [TEST] เป็นตัวอักษร ไม่ใช่ emoji (HR12) */}
        <span className="px-2 text-xs whitespace-nowrap">
          [TEST] {current} — {VARIANT_NAME[current]}
        </span>
        <button type="button" onClick={() => go(1)} className="px-2 py-1 text-lg leading-none" aria-label="variant ถัดไป">
          →
        </button>
      </div>
    </div>
  )
}
