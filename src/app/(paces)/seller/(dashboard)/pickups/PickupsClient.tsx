'use client'

/**
 * PickupsClient — ปุ่มเรียกรถ + ชิปกรองสถานะ + ตาราง (desktop) / การ์ด (มือถือ) ของคำขอเรียกรถ (00087)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/CustomerTable.tsx
 *         (ผ่าน customers/components/CustomerTable.tsx — แถวชิป min-h-11 rounded-full · table-wrapper/table
 *          บน lg และรายการ divide-y บนมือถือแบบ DataTable)
 *       settings/FlashPickupModal.tsx · settings/IShipPickupModal.tsx (โมดัลเรียกรถใช้ตัวเดิม)
 *       theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx (ผ่าน pacesConfirm)
 *
 * ตัวกรอง/หน้าเป็น URL ล้วน (?status= &page=) ไม่มี client state · หลังเรียก/ยกเลิก router.refresh()
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { TONE_BADGE } from '@/components/safepay/iship/tone'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { formatDateTime } from '@/lib/format-date'
import { courierLabel, courierLogoUrl } from '@/lib/iship/courier'
import {
  PICKUP_FILTERS,
  canCancelPickup,
  pickupStatusView,
  type PickupFilterKey,
} from '@/lib/shipping/pickup-list-view'
import type { PickupListRow } from '@/services/pickup-list.service'
import type { FlashSettings } from '@/services/flash.service'
import SellerEmptyState from '../_shared/SellerEmptyState'
import FlashPickupModal from '../settings/FlashPickupModal'
import IShipPickupModal from '../settings/IShipPickupModal'

interface Props {
  rows: PickupListRow[]
  total: number
  page: number
  pageSize: number
  filter: PickupFilterKey
  /** null = iShip ไม่ได้เชื่อม/ใช้ไม่ได้ · courierCode null = ยังไม่ตั้งขนส่งเริ่มต้น */
  iship: { courierCode: string | null; courierName: string | null } | null
  /** null = Flash ไม่ได้เชื่อม/ไม่เปิดให้ร้านนี้ */
  flash: { sender: FlashSettings; senderComplete: boolean } | null
}

function hrefOf(filter: PickupFilterKey, page = 1) {
  const q = new URLSearchParams()
  if (filter !== 'all') q.set('status', filter)
  if (page > 1) q.set('page', String(page))
  const s = q.toString()
  return s ? `/pickups?${s}` : '/pickups'
}

function carrierOf(r: PickupListRow): { name: string; logo: string | null } {
  if (r.provider === 'FLASH') return { name: 'Flash Express', logo: courierLogoUrl('FLASH', 'Flash Express') }
  const name = courierLabel(r.courierCode) ?? r.courierCode
  return { name: `iShip · ${name}`, logo: courierLogoUrl(r.courierCode) }
}

function CarrierCell({ r }: { r: PickupListRow }) {
  const c = carrierOf(r)
  return (
    <span className="flex min-w-0 items-center gap-2">
      {c.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.logo} alt="" className="size-8 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-default-100">
          <Icon icon="truck" className="text-base text-default-600" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 break-words font-semibold text-default-900">{c.name}</span>
    </span>
  )
}

function StatusBadge({ r }: { r: PickupListRow }) {
  const v = pickupStatusView(r.status)
  return (
    <span className={`${TONE_BADGE[v.tone]} inline-flex items-center gap-1`}>
      <Icon icon={v.icon} className="text-xs" aria-hidden="true" />
      {v.label}
    </span>
  )
}

function FailedReason({ r }: { r: PickupListRow }) {
  if (r.status !== 'FAILED') return null
  return (
    <p className="mb-0 mt-1 break-words text-xs text-danger-ink">
      {r.lastErrorMessage || 'ขนส่งไม่รับคำขอนี้ ลองเรียกรถใหม่อีกครั้ง'}
    </p>
  )
}

export default function PickupsClient({ rows, total, page, pageSize, filter, iship, flash }: Props) {
  const router = useRouter()
  const [modal, setModal] = useState<'flash' | 'iship' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const hasCarrier = !!iship || !!flash

  function openIShip() {
    if (!iship?.courierCode) {
      pacesToast.warning('ตั้งขนส่งเริ่มต้นของ iShip ในหน้าการจัดส่งก่อน')
      return
    }
    setModal('iship')
  }

  async function copyId(v: string) {
    try {
      await navigator.clipboard.writeText(v)
      pacesToast.success('คัดลอกเลขคำขอแล้ว')
    } catch {
      pacesToast.error('คัดลอกไม่สำเร็จ ลองเลือกแล้วคัดลอกเอง')
    }
  }

  async function cancel(r: PickupListRow) {
    const ok = await pacesConfirm.danger(
      'ยกเลิกคำขอเรียกรถนี้?',
      'ขนส่งจะไม่ส่งรถมารับตามคำขอนี้ ต้องการเรียกใหม่ ทำได้จากปุ่ม เรียกรถ',
      { confirmButtonText: 'ยกเลิกคำขอ', cancelButtonText: 'ไม่ยกเลิก' },
    )
    if (!ok) return
    setBusyId(r.id)
    try {
      const base = r.provider === 'FLASH' ? 'flash' : 'iship'
      const res = await fetch(`/api/seller/${base}/pickups/${encodeURIComponent(r.id)}/cancel`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
        pacesToast.error(body.error?.message ?? 'ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success('ยกเลิกคำขอเรียกรถแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusyId(null)
    }
  }

  const ticket = (r: PickupListRow) =>
    r.ticketId ? (
      <span className="inline-flex items-center gap-1">
        <span className="tabular-nums text-default-800">{r.ticketId}</span>
        <button
          type="button"
          onClick={() => void copyId(r.ticketId!)}
          aria-label="คัดลอกเลขคำขอ"
          className="btn btn-icon size-11 text-default-600 lg:size-7">
          <Icon icon="copy" className="text-base" />
        </button>
      </span>
    ) : (
      <span className="text-default-600">—</span>
    )

  const staff = (r: PickupListRow) =>
    r.staffName || r.staffPhone ? (
      <span className="flex flex-col">
        {r.staffName && <span className="break-words text-default-800">{r.staffName}</span>}
        {r.staffPhone && (
          <a
            href={`tel:${r.staffPhone.replace(/[^0-9+]/g, '')}`}
            aria-label={`โทรหา ${r.staffName ?? 'พนักงาน'}`}
            className="inline-flex min-h-11 items-center gap-1 text-primary-ink underline lg:min-h-0">
            <Icon icon="phone" className="text-base" aria-hidden="true" />
            <span className="tabular-nums">{r.staffPhone}</span>
          </a>
        )}
      </span>
    ) : (
      <span className="text-default-600">รอขนส่งแจ้งพนักงาน</span>
    )

  const cancelBtn = (r: PickupListRow, full = false) =>
    canCancelPickup(r.status) ? (
      <button
        type="button"
        onClick={() => void cancel(r)}
        disabled={busyId !== null}
        className={`btn inline-flex min-h-11 items-center justify-center gap-1.5 bg-danger/15 text-danger-ink hover:bg-danger/25 disabled:opacity-60 lg:min-h-0 ${full ? 'w-full' : 'btn-sm'}`}>
        {busyId === r.id ? (
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-danger border-t-transparent" />
        ) : (
          <Icon icon="x" className="text-base" aria-hidden="true" />
        )}
        ยกเลิกคำขอ
      </button>
    ) : null

  const dryRun = (r: PickupListRow) =>
    r.isDryRun ? <span className="badge bg-default-100 text-default-700">ทดสอบ</span> : null

  // ── ไม่เชื่อมขนส่งและไม่มีประวัติเลย ──
  if (!hasCarrier && total === 0 && filter === 'all') {
    return (
      <SellerEmptyState
        icon="truck"
        title="ยังไม่ได้เชื่อมขนส่ง"
        description="เชื่อม Flash Express หรือ iShip ก่อน แล้วจึงเรียกรถจากหน้านี้ได้"
        action={{ label: 'ไปตั้งค่าการจัดส่ง', href: '/settings' }}
      />
    )
  }

  return (
    <>
      <div className="card">
        <div className="card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:pb-0">
            {PICKUP_FILTERS.map((f) => {
              const on = f.key === filter
              return (
                <Link
                  key={f.key}
                  href={hrefOf(f.key)}
                  aria-current={on ? 'page' : undefined}
                  className={`btn min-h-11 shrink-0 rounded-full text-xs font-semibold whitespace-nowrap lg:min-h-0 ${
                    on ? 'bg-primary text-white' : 'border border-default-300 text-default-800'
                  }`}>
                  {f.label}
                </Link>
              )
            })}
          </div>
          {hasCarrier ? (
            <div className="flex shrink-0 gap-2">
              {flash && (
                <button
                  type="button"
                  onClick={() => setModal('flash')}
                  className="btn inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 bg-primary text-white hover:bg-primary-hover sm:flex-none lg:min-h-0">
                  <Icon icon="truck" className="text-base" aria-hidden="true" />
                  {iship ? 'เรียกรถ Flash' : 'เรียกรถ'}
                </button>
              )}
              {iship && (
                <button
                  type="button"
                  onClick={openIShip}
                  className={`btn inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 sm:flex-none lg:min-h-0 ${
                    flash ? 'border border-default-300 text-default-800' : 'bg-primary text-white hover:bg-primary-hover'
                  }`}>
                  <Icon icon="truck" className="text-base" aria-hidden="true" />
                  {flash ? 'เรียกรถ iShip' : 'เรียกรถ'}
                </button>
              )}
            </div>
          ) : (
            <Link href="/settings" className="text-sm font-medium text-primary-ink underline">
              เชื่อมขนส่งเพื่อเรียกรถ
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          filter === 'all' ? (
            <SellerEmptyState
              compact
              icon="truck"
              title="ยังไม่เคยเรียกรถ"
              description="กด เรียกรถ เพื่อให้ขนส่งมารับพัสดุที่ร้าน คำขอที่ส่งแล้วจะอยู่ที่นี่พร้อมสถานะ"
            />
          ) : (
            <SellerEmptyState
              compact
              icon="filter-off"
              title="ไม่มีคำขอในสถานะนี้"
              action={{ label: 'ดูทั้งหมด', href: '/pickups' }}
            />
          )
        ) : (
          <>
            {/* desktop */}
            <div className="table-wrapper hidden lg:block">
              <table className="table table-hover">
                <thead className="thead-sm">
                  <tr className="bg-light/25 text-2xs">
                    <th>วันที่เรียก</th>
                    <th>ขนส่ง</th>
                    <th>เลขคำขอ</th>
                    <th>จำนวน</th>
                    <th>พนักงานรับงาน</th>
                    <th>ช่วงเวลาเข้ารับ</th>
                    <th>สถานะ</th>
                    <th>ผู้เรียก</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        <span className="tabular-nums text-default-800">{formatDateTime(r.createdAt)}</span>
                        {r.isDryRun && <div className="mt-1">{dryRun(r)}</div>}
                      </td>
                      <td><CarrierCell r={r} /></td>
                      <td>{ticket(r)}</td>
                      <td className="tabular-nums text-default-800">{r.parcelCount} ชิ้น</td>
                      <td>{staff(r)}</td>
                      <td className="text-default-800">{r.timeoutAtText ?? '—'}</td>
                      <td className="max-w-xs">
                        <StatusBadge r={r} />
                        <FailedReason r={r} />
                      </td>
                      <td className="text-default-800">{r.createdByName ?? '—'}</td>
                      <td className="text-end">{cancelBtn(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* มือถือ */}
            <div className="divide-y divide-default-100 lg:hidden">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <CarrierCell r={r} />
                    <StatusBadge r={r} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="tabular-nums text-default-600">{formatDateTime(r.createdAt)}</span>
                    {dryRun(r)}
                  </div>
                  <div className="text-sm">{ticket(r)}</div>
                  <p className="mb-0 text-sm text-default-800">
                    {r.parcelCount} ชิ้น
                    {r.createdByName ? ` · เรียกโดย ${r.createdByName}` : ''}
                  </p>
                  <div className="text-sm">{staff(r)}</div>
                  {r.timeoutAtText && (
                    <p className="mb-0 text-sm text-default-800">เข้ารับ {r.timeoutAtText}</p>
                  )}
                  <FailedReason r={r} />
                  {cancelBtn(r, true)}
                </div>
              ))}
            </div>

            <div className="card-footer flex flex-wrap items-center justify-between gap-2 text-sm text-default-600">
              <span>
                แสดง {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} จาก {total}
              </span>
              {lastPage > 1 && (
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={hrefOf(filter, page - 1)}
                      className="btn inline-flex min-h-11 items-center gap-1 border border-default-300 text-default-800 lg:min-h-0">
                      <Icon icon="chevron-left" className="text-base" aria-hidden="true" />
                      ก่อนหน้า
                    </Link>
                  )}
                  {page < lastPage && (
                    <Link
                      href={hrefOf(filter, page + 1)}
                      className="btn inline-flex min-h-11 items-center gap-1 border border-default-300 text-default-800 lg:min-h-0">
                      ถัดไป
                      <Icon icon="chevron-right" className="text-base" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {modal === 'flash' && flash && (
        <FlashPickupModal
          sender={flash.sender}
          senderComplete={flash.senderComplete}
          lastPickup={null}
          onOpenSender={() => router.push('/settings?flash=settings&tab=sender')}
          onClose={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}
      {modal === 'iship' && iship?.courierCode && (
        <IShipPickupModal
          courierCode={iship.courierCode}
          courierName={iship.courierName}
          onClose={() => setModal(null)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  )
}
