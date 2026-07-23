'use client'

/**
 * ChannelsClient — UI ของหน้า "ช่องทางแชท" (/settings/channels, feature 00018 T6)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/ConnectedAccountsClient.tsx
 *   — แถวช่องทาง (icon+label+badge สถานะ+ปุ่ม action), pattern toast จาก query param,
 *     Sweet Alerts confirm ก่อน disconnect
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   — confirmButton/cancelButton pattern + Swal.fire + buttonsStyling: false + customClass
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/BuyerAvatar.tsx
 *   — avatar + fallback icon 'user' (ไม่ใช่ตัวอักษรแรก)
 *
 * ต่างจาก ConnectedAccountsClient ตรง semantic: ที่นี่ 1 แถว = 1 ShopChannel (ไม่ใช่ 1 ต่อ provider)
 * — ร้านเดียวมีได้หลาย Page + IG ที่ผูกมาด้วย จึงเห็นได้หลายแถวต่อ provider เดียวกัน
 *
 * Toast: pacesToast (Hard Rule 9 — ห้าม react-toastify ใน (paces))
 * Modal: Sweet Alerts (Hard Rule 8 — confirm dialog ที่ต้องกดตอบใช้ Swal)
 * สี brand ของ Messenger/Instagram (Hard Rule 6 exception — brand asset color ใช้ตาม ref ได้
 * พร้อม comment กำกับตรงจุดที่ใช้จริงใน PROVIDER_CONFIG ด้านล่าง — ค่า Instagram ตรงกับที่ใช้อยู่แล้ว
 * ใน ConnectedAccountsClient.tsx, ค่า Messenger เป็น default ชั่วคราวตาม design spec Open Question #1)
 * Paces primitive เท่านั้น — ห้าม arbitrary value (Hard Rule 7)
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import BuyerAvatar from '../../orders/components/BuyerAvatar'
import SellerEmptyState from '../../_shared/SellerEmptyState'

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * shape ตรงกับ ChannelView (src/services/shop-channel.service.ts) — คัดลอก field ที่ใช้จริงเท่านั้น
 * (ไม่ import type ข้ามจาก service ที่ import prisma/token-crypto — client component ต้องไม่ผูกกับ
 * server-only module แม้จะเป็นแค่ type-only import ก็ตาม กันความเข้าใจผิดว่าเรียก service ได้)
 */
interface ChannelRow {
  id: string
  provider: string // 'MESSENGER' | 'INSTAGRAM'
  name: string
  avatarUrl: string | null
  status: string // 'ACTIVE' | 'TOKEN_INVALID' — 'DISCONNECTED' ถูกกรองออกที่ listChannels() แล้ว
}

interface ChannelsClientProps {
  initialChannels: ChannelRow[]
}

// ─── Provider display config ────────────────────────────────────────────────

type ProviderVisual = { label: string; icon: string; colorHex?: string }

const PROVIDER_CONFIG: Record<string, ProviderVisual> = {
  MESSENGER: { label: 'Messenger', icon: 'tabler:brand-messenger', colorHex: '#0084FF' }, // Hard Rule 6 exception: Messenger brand blue (design spec Open Question #1, default ชั่วคราว)
  INSTAGRAM: { label: 'Instagram', icon: 'tabler:brand-instagram', colorHex: '#E1306C' }, // Hard Rule 6 exception: Instagram brand color (ค่าเดียวกับ ConnectedAccountsClient.tsx)
}

// fallback provider ที่ไม่รู้จัก — ไม่ควรเกิดจริง (contract รับประกัน MESSENGER/INSTAGRAM เท่านั้น)
// ไม่ใช้สี brand (ไม่มี colorHex) — badge overlay จะ fallback ไปใช้ Paces token bg-default-400 แทน
function providerConfig(provider: string): ProviderVisual {
  return PROVIDER_CONFIG[provider] ?? { label: provider, icon: 'tabler:message-circle' }
}

// ─── Status → toast mapping (จาก query param ?status= ที่ callback ส่งกลับ) ───
// ตาม Content outline ของสเปก "หน้า: ตั้งค่าช่องทางแชท" — no_code ไม่มี copy แยกในสเปก
// จึงใช้ข้อความเดียวกับ 'error' (เคสเดียวกันในเชิงผลลัพธ์: เชื่อมต่อไม่สำเร็จ)
const CALLBACK_STATUS_MESSAGE: Record<string, string> = {
  cancelled: 'ยกเลิกการเชื่อมต่อแล้ว',
  state_mismatch: 'เซสชันหมดอายุ กรุณาลองใหม่',
  no_code: 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่',
  no_shop: 'ไม่พบร้านค้าของคุณ',
  no_eligible_page: 'ไม่พบเพจที่คุณมีสิทธิ์จัดการข้อความ',
  error: 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่',
}

export function ChannelsClient({ initialChannels }: ChannelsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)

  // ─── อ่าน query params จาก OAuth callback ──────────────────────────────────
  // ทำไม useEffect: searchParams read หลัง mount เท่านั้น (client-only) — pattern เดียวกับ
  // ConnectedAccountsClient.tsx
  useEffect(() => {
    const status = searchParams.get('status')
    if (!status) return

    if (status === 'connected') {
      const connected = Number(searchParams.get('connected') ?? '0')
      const skipped = searchParams.get('skipped')
      if (connected > 0) {
        pacesToast.success(`เชื่อมต่อสำเร็จ ${connected} ช่องทาง`)
      }
      // เพจที่ถูกร้านอื่นเชื่อม active อยู่ → ถาม user ว่าจะย้ายมาร้านนี้ไหม (ตัดร้านเดิมให้เลย)
      // user เป็นเจ้าของเพจ (Meta ยืนยันตอน OAuth) จึงย้ายได้โดยไม่ต้องไปสลับร้านเอง
      if (skipped) {
        router.replace('/settings/channels') // ลบ query ก่อนเปิด dialog กัน re-trigger ตอน reload
        Swal.fire({
          title: 'เพจนี้เชื่อมอยู่กับร้านอื่น',
          html: `<div class="text-start">${skipped}<br/><br/>ต้องการย้ายมาที่ร้านนี้ไหม? การเชื่อมที่ร้านเดิมจะถูกตัด (ข้อความเก่ายังอยู่ครบ)</div>`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'ย้ายมาที่นี่',
          cancelButtonText: 'ยกเลิก',
          buttonsStyling: false,
          customClass: { confirmButton: 'btn bg-primary text-white', cancelButton: 'btn bg-light text-default-700 ms-2' },
        }).then((r) => {
          // re-OAuth พร้อม force=1 — Facebook อนุญาตทันทีเพราะเคย grant แล้ว, callback ตัดร้านเดิมให้
          if (r.isConfirmed) window.location.href = '/api/channels/facebook/connect?force=1'
        })
        return
      }
      if (connected === 0) pacesToast.info('ไม่มีเพจใหม่ที่เชื่อมเพิ่ม')
    } else {
      const message = CALLBACK_STATUS_MESSAGE[status] ?? 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่'
      pacesToast.error(message)
    }
    // ลบ query string เพื่อกัน toast ซ้ำเมื่อ user reload
    router.replace('/settings/channels')
  }, [searchParams, router])

  // ─── Disconnect handler ─────────────────────────────────────────────────────
  async function handleDisconnect(channel: ChannelRow) {
    const providerLabel = providerConfig(channel.provider).label

    // Sweet Alert ยืนยัน — pattern จาก ConnectedAccountsClient.handleDisconnect (ตัดขั้น OTP ออก
    // เพราะช่องทางแชทไม่ใช่ login-linked account — ตามสเปก "ไม่ต้องมีขั้น OTP เพิ่ม")
    const confirmResult = await Swal.fire({
      title: `ยกเลิกการเชื่อมต่อ ${channel.name}?`,
      text: 'ข้อความเก่ายังอยู่ แต่จะไม่ได้รับข้อความใหม่จากเพจนี้อีก',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยกเลิกการเชื่อมต่อ',
      cancelButtonText: 'ปิด',
      showCloseButton: true,
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
        cancelButton: 'btn bg-light text-default-700 hover:bg-light-hover mt-2',
      },
    })

    if (!confirmResult.isConfirmed) return

    setDisconnectingId(channel.id)
    try {
      const res = await fetch(`/api/channels/${channel.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        pacesToast.error(body?.error ?? 'ถอดการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      setChannels((prev) => prev.filter((c) => c.id !== channel.id))
      pacesToast.success(`ถอดการเชื่อมต่อ ${providerLabel} สำเร็จ`)
      router.refresh()
    } catch {
      pacesToast.error('ถอดการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setDisconnectingId(null)
    }
  }

  // edge state: ทุกช่องทาง TOKEN_INVALID → banner สรุปด้านบน
  const allTokenInvalid = channels.length > 0 && channels.every((c) => c.status === 'TOKEN_INVALID')

  return (
    <div className="card-body">
      {/* description + CTA เชื่อม Page — บนสุดเสมอไม่ว่าจะมีช่องทางอยู่แล้วหรือไม่ */}
      <div className="flex flex-col gap-3 pb-4 border-b border-default-200 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-default-500 text-sm">
          เชื่อม Facebook Page เพื่อรับข้อความ Messenger และ Instagram เข้ามาที่ Deep โดยตรง
        </p>
        {/* endpoint นี้ตอบ 302 redirect ไป Facebook OAuth ตรง ๆ — ต้องเป็น <a> ธรรมดา
            ห้าม fetch/onClick (จุดที่พลาดง่าย #1 ของ T6) */}
        <a
          href="/api/channels/facebook/connect"
          className="btn bg-primary text-white hover:bg-primary-hover shrink-0 inline-flex items-center gap-2"
        >
          <Icon icon="tabler:brand-facebook" className="text-base" aria-hidden="true" />
          เชื่อม Facebook Page
        </a>
      </div>

      {allTokenInvalid && (
        <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg bg-danger/15 text-danger text-sm">
          <Icon icon="tabler:alert-triangle" className="text-base shrink-0" aria-hidden="true" />
          มี {channels.length} ช่องทางที่โทเคนหมดอายุ ต้องเชื่อมต่อใหม่
        </div>
      )}

      {/* รายการช่องทาง — 1 แถวต่อ 1 ShopChannel (ไม่ใช่ 1 ต่อ provider เหมือน ConnectedAccountsClient) */}
      {channels.length === 0 ? (
        <SellerEmptyState compact icon="brand-facebook" title="ยังไม่ได้เชื่อมช่องทางแชท" />
      ) : (
        <div className="mt-2">
          {channels.map((channel) => {
            const config = providerConfig(channel.provider)
            const isDisconnecting = disconnectingId === channel.id
            const isActive = channel.status === 'ACTIVE'
            const isTokenInvalid = channel.status === 'TOKEN_INVALID'

            return (
              <div
                key={channel.id}
                className="flex flex-col gap-3 py-4 border-b border-default-200 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* ซ้าย: avatar + provider badge overlay + ชื่อ + badge สถานะ */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="relative shrink-0">
                    <BuyerAvatar src={channel.avatarUrl} name={channel.name} className="size-10" />
                    {/* channel badge overlay — token size-4 rounded-full ring-2 ring-card
                        (Theme Source Mapping ของสเปก "Channel badge (avatar overlay)")
                        ไม่มี colorHex (fallback provider แปลกปลอม) → ใช้ Paces token bg-default-400 แทน hex */}
                    <span
                      className={`absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full ring-2 ring-card ${config.colorHex ? '' : 'bg-default-400'}`}
                      style={config.colorHex ? { backgroundColor: config.colorHex } : undefined}
                    >
                      <Icon icon={config.icon} className="text-2xs text-white" aria-hidden="true" />
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-default-800 truncate">{channel.name}</p>
                    <p className="text-xs text-default-400">{config.label}</p>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded mt-1">
                        <Icon icon="tabler:check" className="text-xs" aria-hidden="true" />
                        เชื่อมแล้ว
                      </span>
                    )}
                    {isTokenInvalid && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-danger bg-danger/15 px-2 py-0.5 rounded mt-1">
                        <Icon icon="tabler:alert-triangle" className="text-xs" aria-hidden="true" />
                        โทเคนหมดอายุ
                      </span>
                    )}
                  </div>
                </div>

                {/* ขวา: ปุ่ม action — stack แนวตั้งบนมือถือถ้าจำเป็น (flex-wrap) */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isTokenInvalid && (
                    <a
                      href="/api/channels/facebook/connect"
                      className="btn btn-sm bg-primary/15 text-primary hover:bg-primary/25 inline-flex items-center gap-1.5"
                    >
                      <Icon icon="tabler:refresh" className="text-sm" aria-hidden="true" />
                      เชื่อมต่อใหม่
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={isDisconnecting}
                    onClick={() => handleDisconnect(channel)}
                    className="btn btn-sm bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-50"
                  >
                    {isDisconnecting ? (
                      <span className="size-4 border-2 border-danger border-t-transparent rounded-full animate-spin inline-block" />
                    ) : (
                      'ถอด'
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
