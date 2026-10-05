'use client'

/**
 * GroupMenu — เมนู ⋯ ของหน้ากลุ่ม (รายการเดียว: ยกเลิกการผูก) · React-controlled ไม่ใช้ dropdown ของ Preline
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx (.dropdown-item / .dropdown-divider)
 *   + src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx (React-controlled: useState + click-outside, `dots-vertical`)
 *   + theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (ผ่าน `pacesConfirm.danger`)
 *
 * 🛑 ไม่ผูกกับ `canEdit` — ยกเลิกการผูกได้แม้แพ็กเกจหมด (มติ #11 · API §4.8 ไม่ต้องมีแพ็กเกจ ACTIVE)
 * เมนูวางใน action-bar (sticky ไม่ใช่ scroll container ที่ตัด) เปิดลงล่าง `top-full` · ปิดด้วย Esc/คลิกนอก (scroll-container-clips-popovers: ไม่มี overflow ครอบ)
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'

const LIST_HREF = '/business/line-reports'

export default function GroupMenu({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function remove() {
    setOpen(false)
    if (busy) return
    const ok = await pacesConfirm.danger(`ยกเลิกการผูกกลุ่ม “${groupName}”?`, 'บอทจะหยุดส่งรายงานเข้ากลุ่มนี้ทันที ถ้าจะใช้กลุ่มนี้อีก ต้องสร้างโค้ดผูกใหม่', {
      confirmButtonText: 'ยกเลิกการผูก',
      cancelButtonText: 'ปิด',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/line-report/groups/${groupId}`, { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.error(data.message ?? 'ยกเลิกการผูกไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      pacesToast.success('ยกเลิกการผูกกลุ่มแล้ว')
      router.push(LIST_HREF)
    } catch {
      pacesToast.error('เชื่อมต่อไม่ได้ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-icon border-default-300 text-default-700 hover:bg-default-100 min-h-11 min-w-11 border"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เมนูเพิ่มเติม"
        disabled={busy}
        onClick={() => setOpen((p) => !p)}
      >
        <Icon icon="dots-vertical" className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="border-default-300 bg-card absolute top-full right-0 z-30 mt-1 min-w-48 overflow-hidden rounded border shadow-lg" role="menu" aria-orientation="vertical">
          <div className="space-y-0.5 p-1">
            <button type="button" role="menuitem" className="dropdown-item text-danger-ink hover:bg-danger/10 min-h-11 w-full text-sm" onClick={remove}>
              <Icon icon="link-off" className="size-4" aria-hidden="true" />
              ยกเลิกการผูก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
