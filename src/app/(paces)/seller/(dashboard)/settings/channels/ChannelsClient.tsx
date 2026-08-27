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
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import type { Dictionary } from '@/i18n/dictionaries/th'
import BuyerAvatar from '../../orders/components/BuyerAvatar'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import IceBreakerChip from './IceBreakerChip'

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
//
// feature 00047: เป็นฟังก์ชันไม่ใช่ค่าคงที่ระดับ module เพราะข้อความต้องเปลี่ยนตามภาษา
// ถ้าปล่อยไว้นอก component มันจะถูกผูกกับภาษาที่โหลดตอน bundle แล้วค้างเป็นไทยตลอดไป
function callbackStatusMessage(t: Dictionary): Record<string, string> {
  const c = t.channels
  return {
    cancelled: c.errCancelled,
    state_mismatch: c.errStateMismatch,
    no_code: c.errGeneric,
    no_shop: c.errNoShop,
    no_eligible_page: c.errNoEligiblePage,
    error: c.errGeneric,
  }
}

export function ChannelsClient({ initialChannels }: ChannelsClientProps) {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [resyncing, setResyncing] = useState(false)

  // ─── อ่าน query params จาก OAuth callback ──────────────────────────────────
  // ทำไม useEffect: searchParams read หลัง mount เท่านั้น (client-only) — pattern เดียวกับ
  // ConnectedAccountsClient.tsx
  useEffect(() => {
    const status = searchParams.get('status')
    if (!status) return

    if (status === 'connected') {
      // สรุปผลมาจากหน้าเลือกเพจ (/settings/channels/select) หลังกดยืนยัน — callback ไม่เชื่อมทันที
      // อีกต่อไป จึงไม่มีเคส "เพจติดร้านอื่น" เด้ง Swal ที่นี่แล้ว (ย้ายรายเพจทำในหน้า select)
      const connected = Number(searchParams.get('connected') ?? '0')
      const moved = Number(searchParams.get('moved') ?? '0')
      const subscribeFailed = searchParams.get('subscribeFailed')
      if (connected > 0) {
        pacesToast.success(
          moved > 0
            ? fmt(t.channels.connectSuccessMoved, { n: connected, moved })
            : fmt(t.channels.connectSuccess, { n: connected }),
        )
      } else {
        pacesToast.info(t.channels.connectNoNew)
      }
      if (subscribeFailed) {
        pacesToast.warning(fmt(t.channels.connectSubscribeFailed, { n: subscribeFailed }))
      }
    } else {
      pacesToast.error(callbackStatusMessage(t)[status] ?? t.channels.errGeneric)
    }
    // ลบ query string เพื่อกัน toast ซ้ำเมื่อ user reload
    router.replace('/settings/channels')
    // `t` ใส่ได้ปลอดภัย — เป็น module-level constant ต่อภาษา identity จึงไม่เปลี่ยนทุก render
    // (ต่างจากอ็อบเจกต์ที่ hook สร้างใหม่ทุกครั้ง ซึ่งเคยทำให้ /inbox/comments ยิง API ไม่หยุด —
    //  docs/conventions/hook-return-identity-in-deps.md) และถ้า locale เปลี่ยนจริง effect จะรันซ้ำ
    // แล้วออกที่ `if (!status) return` เพราะ query string ถูกลบไปแล้วบรรทัดบน
  }, [searchParams, router, t])

  // ─── Disconnect handler ─────────────────────────────────────────────────────
  // ซิงก์ subscription ของทุกเพจในร้าน — Meta ล็อกชุด event ไว้ตั้งแต่ตอนเชื่อมครั้งแรก เพจเก่า
  // จึงไม่ได้รับ event ที่เพิ่มมาทีหลัง (read receipt "อ่านแล้ว" — user report 2026-07-23)
  // idempotent ฝั่ง Meta กดซ้ำได้ ไม่กระทบข้อความ/การเชื่อมต่อเดิม จึงไม่ต้องมี Swal ยืนยัน
  async function handleResync() {
    if (resyncing) return
    setResyncing(true)
    try {
      const res = await fetch('/api/channels', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        pacesToast.error(body?.error ?? t.channels.resyncError)
        return
      }
      if (body?.failed > 0) {
        pacesToast.warning(fmt(t.channels.resyncPartial, { ok: body.ok, failed: body.failed }))
      } else {
        // บอกจำนวนร้านด้วย (2026-08-08) — ปุ่มนี้ครอบ "ทุกร้านที่คุณเข้าถึงได้" แล้ว ไม่ใช่ร้านเดียว
        // ถ้าไม่บอก ผู้ใช้หลายร้านจะยังเข้าใจว่าต้องสลับร้านไปกดซ้ำอยู่ดี
        pacesToast.success(
          body?.shops > 1
            ? fmt(t.channels.resyncSuccessShops, { ok: body?.ok ?? 0, shops: body.shops })
            : fmt(t.channels.resyncSuccess, { ok: body?.ok ?? 0 }),
        )
      }
    } catch {
      pacesToast.error(t.channels.resyncError)
    } finally {
      setResyncing(false)
    }
  }

  async function handleDisconnect(channel: ChannelRow) {
    const providerLabel = providerConfig(channel.provider).label

    // Sweet Alert ยืนยัน — pattern จาก ConnectedAccountsClient.handleDisconnect (ตัดขั้น OTP ออก
    // เพราะช่องทางแชทไม่ใช่ login-linked account — ตามสเปก "ไม่ต้องมีขั้น OTP เพิ่ม")
    const confirmResult = await Swal.fire({
      title: fmt(t.channels.disconnectTitle, { name: channel.name }),
      text: t.channels.disconnectText,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t.channels.disconnectConfirm,
      cancelButtonText: t.channels.disconnectCancel,
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
        pacesToast.error(body?.error ?? t.channels.disconnectError)
        return
      }

      setChannels((prev) => prev.filter((c) => c.id !== channel.id))
      pacesToast.success(fmt(t.channels.disconnectSuccess, { provider: providerLabel }))
      router.refresh()
    } catch {
      pacesToast.error(t.channels.disconnectError)
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
          {t.channels.intro}
        </p>
        {/* endpoint นี้ตอบ 302 redirect ไป Facebook OAuth ตรง ๆ — ต้องเป็น <a> ธรรมดา
            ห้าม fetch/onClick (จุดที่พลาดง่าย #1 ของ T6) */}
        {/* 🛑 ต้อง stack แนวตั้งที่ <640px (feature 00047 — พบโดย safepay-ux audit)
            งบพื้นที่ที่ 320px: card-body padding 20px×2 เหลือ 280px แต่ปุ่ม 2 ตัวเมื่อแปลเป็น
            อังกฤษ ("Sync notifications" + "Connect Facebook Page") รวมกัน ~390px ⇒ ดันกล่อง
            จนทั้งหน้าเลื่อนแนวนอนได้ ภาษาไทยพอดีมาตลอดจึงไม่มีใครเห็น
            ยกท่าเดียวกับแถวแม่ (บรรทัดเหนือขึ้นไป) ที่ทำ flex-col sm:flex-row อยู่แล้ว */}
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {/* ซิงก์การแจ้งเตือน — Meta ล็อกชุด event ที่ส่งมาให้เราไว้ตั้งแต่ตอนกดเชื่อมเพจครั้งแรก
              เพจที่เชื่อมไว้นานแล้วจึงไม่ได้รับ event ที่เพิ่มมาทีหลัง (เช่น "ลูกค้าอ่านข้อความแล้ว")
              ปุ่มนี้สั่ง subscribe ใหม่ด้วยชุดล่าสุด — ปลอดภัย กดซ้ำได้ ไม่กระทบข้อความเดิม */}
          {channels.length > 0 && (
            <button
              type="button"
              onClick={handleResync}
              disabled={resyncing}
              className="btn border-default-300 inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Icon
                icon={resyncing ? 'tabler:loader-2' : 'tabler:refresh'}
                className={`text-base ${resyncing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {t.channels.resync}
            </button>
          )}
          <a
            href="/api/channels/facebook/connect"
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2"
          >
            <Icon icon="tabler:brand-facebook" className="text-base" aria-hidden="true" />
            {t.channels.connectPage}
          </a>
        </div>
      </div>

      {allTokenInvalid && (
        <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg bg-danger/15 text-danger text-sm">
          <Icon icon="tabler:alert-triangle" className="text-base shrink-0" aria-hidden="true" />
          {fmt(t.channels.tokenExpiredBanner, { n: channels.length })}
        </div>
      )}

      {/* รายการช่องทาง — 1 แถวต่อ 1 ShopChannel (ไม่ใช่ 1 ต่อ provider เหมือน ConnectedAccountsClient) */}
      {channels.length === 0 ? (
        <SellerEmptyState compact icon="brand-facebook" title={t.channels.emptyTitle} />
      ) : (
        <div className="mt-2">
          {channels.map((channel) => {
            const config = providerConfig(channel.provider)
            const isDisconnecting = disconnectingId === channel.id
            const isActive = channel.status === 'ACTIVE'
            const isTokenInvalid = channel.status === 'TOKEN_INVALID'

            // Ice Breakers (Meta) เป็นของ Messenger/Instagram เท่านั้น — ช่องทางอื่นไม่มี chip นี้
            // (ChannelsClient รับเฉพาะช่องทางที่ provider !== 'LINE' อยู่แล้วจาก page.tsx แต่เช็คซ้ำ
            // ที่นี่ให้ fail-closed หาก provider อื่นเข้ามาในอนาคต)
            const showIceBreaker = channel.provider === 'MESSENGER' || channel.provider === 'INSTAGRAM'

            return (
              <div key={channel.id} className="border-b border-default-200 last:border-0">
                <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                      {/* title= จำเป็นเพราะชื่อถูกตัด และหางของชื่อคือที่ที่เพจของร้านเดียวกันต่างกัน
                          (พบโดย safepay-ux audit 2026-08-13) */}
                      <p className="text-sm font-medium text-default-800 truncate" title={channel.name}>
                        {channel.name}
                      </p>
                      <p className="text-xs text-default-400">{config.label}</p>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded mt-1">
                          <Icon icon="tabler:check" className="text-xs" aria-hidden="true" />
                          {t.channels.connected}
                        </span>
                      )}
                      {isTokenInvalid && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-danger bg-danger/15 px-2 py-0.5 rounded mt-1">
                          <Icon icon="tabler:alert-triangle" className="text-xs" aria-hidden="true" />
                          {t.channels.tokenExpired}
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
                        {t.channels.reconnect}
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
                        t.channels.disconnect
                      )}
                    </button>
                    {/* คำถามแนะนำก่อนเริ่มแชท — ขวาสุดของแถว action (user สั่งย้ายเข้ามาจากแถวแยก
                        2026-08-27: "อยากให้ปุ่มตั้ง อยู่แถวเดียว มุมขวาสุด จะได้ตั้งค่าง่ายๆ")
                        กล่องนี้เป็น flex-wrap อยู่แล้ว ⇒ เคส token หมดอายุที่มีปุ่มครบ 3 ตัว
                        (338px > 280px ที่ 320px) จะตกบรรทัดเองโดยไม่หลุดออกนอกกล่อง action */}
                    {showIceBreaker && (
                      <IceBreakerChip channelId={channel.id} tokenInvalid={isTokenInvalid} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
