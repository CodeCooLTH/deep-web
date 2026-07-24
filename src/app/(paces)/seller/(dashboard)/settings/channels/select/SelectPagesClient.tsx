'use client'

/**
 * SelectPagesClient — เลือกเพจที่จะเชื่อมหลัง OAuth (feature 00018)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx
 *   — avatar + provider badge overlay, badge สถานะ (bg-{semantic}/15), pacesToast, Swal confirm,
 *     ปุ่ม btn bg-primary, empty state ผ่าน SellerEmptyState (หน้าพี่น้อง — ต้องดูเป็นชุดเดียวกัน)
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx L147
 *   — checkbox Paces primitive: form-checkbox form-checkbox-light size-4.5
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/BuyerAvatar.tsx — avatar + fallback icon
 * Base: src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx — empty / error state
 *
 * flow: fetch GET /api/channels/facebook/pages → ติ๊กเลือก → (ยืนยันย้ายรายเพจถ้า other-shop) →
 *   POST /api/channels/facebook/confirm → เด้งกลับ /settings/channels พร้อมสรุปผลใน query
 *
 * Paces primitive เท่านั้น — ห้าม arbitrary value (Hard Rule 7); toast = pacesToast (HR9);
 * confirm dialog = Sweet Alerts (HR8); ห้าม emoji ใช้ icon (HR12); primary = น้ำเงิน token bg-primary
 */

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import BuyerAvatar from '../../../orders/components/BuyerAvatar'
import SellerEmptyState from '../../../_shared/SellerEmptyState'

// ─── Types (shape ตรงกับ GET /api/channels/facebook/pages) ───────────────────
type PageState = 'available' | 'connected-here' | 'other-shop'

interface FbPage {
  id: string
  name: string
  avatarUrl: string | null
  hasInstagram: boolean
  state: PageState
  occupiedBy: string | null
}

// สถานะโหลดของทั้งหน้า — แยก session_expired ออกจาก error ทั่วไปเพื่อชวนเริ่มเชื่อมใหม่
type LoadPhase = 'loading' | 'ready' | 'expired' | 'error'

// ─── สี brand ของ Instagram badge — ค่าเดียวกับ ChannelsClient.PROVIDER_CONFIG.INSTAGRAM ──
const INSTAGRAM_BRAND = '#E1306C' // Hard Rule 6/7 exception: Instagram brand color (asset color ใช้ตาม ref ได้ — ไม่มี Paces token สำหรับสี brand ภายนอก)

export function SelectPagesClient() {
  const router = useRouter()
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [shopName, setShopName] = useState<string | null>(null)
  const [pages, setPages] = useState<FbPage[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  // ─── โหลดรายการเพจ ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/channels/facebook/pages', { cache: 'no-store' })
        if (!alive) return
        if (res.status === 410) return setPhase('expired')
        if (!res.ok) return setPhase('error')
        const body = (await res.json()) as { shopName: string | null; pages: FbPage[] }
        setShopName(body.shopName)
        setPages(body.pages)
        // preselect เพจที่ว่าง + เพจที่เชื่อมกับร้านนี้อยู่แล้ว (กดยืนยัน = refresh ปลอดภัย);
        // เพจที่ติดร้านอื่นไม่ preselect — ต้องให้ user ตั้งใจติ๊กเอง (มีขั้นยืนยันย้ายต่อ)
        setSelected(new Set(body.pages.filter((p) => p.state !== 'other-shop').map((p) => p.id)))
        setPhase('ready')
      } catch {
        if (alive) setPhase('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const selectableIds = useMemo(() => pages.map((p) => p.id), [pages])
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  // ─── ยืนยันเชื่อม ───────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (submitting) return
    const pageIds = [...selected]
    if (pageIds.length === 0) {
      pacesToast.warning('กรุณาเลือกอย่างน้อย 1 เพจ')
      return
    }

    // เพจที่ user เลือกทั้งที่ติดร้านอื่น → ต้องยืนยันย้ายอีกชั้น (Swal) ก่อนส่ง forceIds
    const movingPages = pages.filter((p) => selected.has(p.id) && p.state === 'other-shop')
    if (movingPages.length > 0) {
      const list = movingPages
        .map((p) => `<li class="mt-1">${p.name}${p.occupiedBy ? ` <span class="text-default-500">(ร้าน ${p.occupiedBy})</span>` : ''}</li>`)
        .join('')
      const confirm = await Swal.fire({
        title: movingPages.length === 1 ? 'ย้ายเพจนี้มาที่ร้านนี้?' : `ย้าย ${movingPages.length} เพจมาที่ร้านนี้?`,
        html: `<div class="text-start text-sm">เพจต่อไปนี้เชื่อมอยู่กับร้านอื่น การเชื่อมที่ร้านเดิมจะถูกตัด (ข้อความเก่ายังอยู่ครบ):<ul class="list-disc ps-5 mt-2">${list}</ul></div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ย้ายมาที่นี่',
        cancelButtonText: 'ยกเลิก',
        buttonsStyling: false,
        customClass: { confirmButton: 'btn bg-primary text-white', cancelButton: 'btn bg-light text-default-700 ms-2' },
      })
      if (!confirm.isConfirmed) return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/channels/facebook/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds, forceIds: movingPages.map((p) => p.id) }),
      })
      if (res.status === 410) {
        setSubmitting(false)
        return setPhase('expired')
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.error(body?.error ?? 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
        setSubmitting(false)
        return
      }

      // สรุปผลเป็น query ให้หน้า /settings/channels เด้ง toast (pattern เดียวกับ callback เดิม)
      const params = new URLSearchParams({ status: 'connected', connected: String(body.connected ?? 0) })
      if (movingPages.length > 0) params.set('moved', String(movingPages.length))
      if (Array.isArray(body.subscribeFailed) && body.subscribeFailed.length > 0) {
        params.set('subscribeFailed', body.subscribeFailed.join(', '))
      }
      router.replace(`/settings/channels?${params.toString()}`)
    } catch {
      pacesToast.error('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
      setSubmitting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="card-body">
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-4 border-b border-default-200 last:border-0">
              <span className="size-10 shrink-0 rounded-full bg-default-100 animate-pulse" />
              <div className="flex-1 min-w-0">
                <span className="block h-3.5 w-40 rounded bg-default-100 animate-pulse" />
                <span className="block h-2.5 w-24 rounded bg-default-100 animate-pulse mt-2" />
              </div>
              <span className="size-4.5 shrink-0 rounded bg-default-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (phase === 'expired') {
    return (
      <div className="card-body">
        <SellerEmptyState
          compact
          icon="clock-exclamation"
          title="เซสชันหมดอายุ"
          description="ลิงก์เลือกเพจหมดอายุแล้ว กรุณาเริ่มเชื่อม Facebook Page ใหม่อีกครั้ง"
        />
        <div className="flex justify-center">
          <a
            href="/api/channels/facebook/connect"
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2"
          >
            <Icon icon="tabler:brand-facebook" className="text-base" aria-hidden="true" />
            เริ่มเชื่อมใหม่
          </a>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="card-body">
        <SellerEmptyState
          compact
          icon="alert-triangle"
          title="โหลดรายการเพจไม่สำเร็จ"
          description="เกิดข้อผิดพลาดในการดึงเพจจาก Facebook กรุณาลองใหม่อีกครั้ง"
        />
        <div className="flex justify-center">
          <a
            href="/api/channels/facebook/connect"
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2"
          >
            <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
            ลองใหม่
          </a>
        </div>
      </div>
    )
  }

  // phase === 'ready'
  if (pages.length === 0) {
    return (
      <div className="card-body">
        <SellerEmptyState
          compact
          icon="brand-facebook"
          title="ไม่พบเพจที่มีสิทธิ์จัดการข้อความ"
          description="บัญชี Facebook ของคุณต้องเป็นแอดมินของเพจ และเปิดสิทธิ์จัดการข้อความ (Messaging)"
        />
      </div>
    )
  }

  return (
    <div className="card-body">
      <div className="flex flex-col gap-3 pb-3 border-b border-default-200 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-default-500 text-sm">
          เลือกเพจที่จะเชื่อมเข้า
          {shopName ? <span className="font-medium text-default-800"> {shopName}</span> : ' ร้านนี้'} — เฉพาะเพจที่เลือกเท่านั้นที่จะรับข้อความเข้ามาที่ Deep
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="btn btn-sm border-default-300 shrink-0 inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Icon icon={allSelected ? 'tabler:square-off' : 'tabler:checks'} className="text-sm" aria-hidden="true" />
          {allSelected ? 'ล้างที่เลือก' : 'เลือกทั้งหมด'}
        </button>
      </div>

      {/* รายการเพจ — 1 แถวต่อ 1 เพจ; คลิกทั้งแถวเพื่อ toggle (label ครอบ) */}
      <div className="mt-1 pb-24 sm:pb-20">
        {pages.map((page) => {
          const isSelected = selected.has(page.id)
          return (
            <label
              key={page.id}
              className="flex items-center gap-3 py-4 border-b border-default-200 last:border-0 cursor-pointer"
            >
              <input
                type="checkbox"
                className="form-checkbox form-checkbox-light size-4.5 shrink-0"
                checked={isSelected}
                onChange={() => toggle(page.id)}
              />
              <span className="relative shrink-0">
                <BuyerAvatar src={page.avatarUrl} name={page.name} className="size-10" />
                {/* Instagram badge overlay — เฉพาะเพจที่มี IG ผูก (Hard Rule 6 exception: brand color) */}
                {page.hasInstagram && (
                  <span
                    className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card"
                    style={{ backgroundColor: INSTAGRAM_BRAND }}
                    title="เพจนี้มี Instagram ผูกอยู่"
                  >
                    <Icon icon="tabler:brand-instagram" className="text-2xs text-white" aria-hidden="true" />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-default-800 truncate">{page.name}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {page.state === 'connected-here' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded">
                      <Icon icon="tabler:check" className="text-xs" aria-hidden="true" />
                      เชื่อมกับร้านนี้อยู่แล้ว
                    </span>
                  )}
                  {page.state === 'other-shop' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/15 px-2 py-0.5 rounded">
                      <Icon icon="tabler:alert-triangle" className="text-xs" aria-hidden="true" />
                      {page.occupiedBy ? `เชื่อมกับร้าน ${page.occupiedBy}` : 'เชื่อมกับร้านอื่น'}
                    </span>
                  )}
                  {page.hasInstagram && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-default-500 bg-default-100 px-2 py-0.5 rounded">
                      <Icon icon="tabler:brand-instagram" className="text-xs" aria-hidden="true" />
                      มี Instagram
                    </span>
                  )}
                </div>
              </div>
            </label>
          )
        })}
      </div>

      {/* action bar — ติดล่างจอ (fixed) กันรายการยาวแล้วปุ่มยืนยันหลุดพ้นจอ
          safe-area-inset สำหรับ iOS notch (Hard Rule 7 carve-out: token Paces ไม่มี env(safe-area)) */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-default-200 bg-card px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm text-default-500">
            เลือกแล้ว <span className="font-semibold text-default-800">{selected.size}</span> เพจ
          </span>
          <div className="flex items-center gap-2">
            <a href="/settings/channels" className="btn bg-light text-default-700 hover:bg-light-hover">
              ยกเลิก
            </a>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || selected.size === 0}
              className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Icon icon="tabler:loader-2" className="text-base animate-spin" aria-hidden="true" />
                  กำลังเชื่อม
                </>
              ) : (
                <>
                  <Icon icon="tabler:plug-connected" className="text-base" aria-hidden="true" />
                  เชื่อมเพจที่เลือก
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
