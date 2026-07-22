/**
 * ตั้งค่าช่องทางแชท — /settings/channels (feature 00018 T6)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/page.tsx (SafePay-adapted,
 *   Base เดิม theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx)
 *   — card + card-header border-dashed section header pattern
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว
 * ดึงรายการ ShopChannel ตรงผ่าน listChannels() service (ไม่ self-fetch GET /api/channels
 * ของตัวเอง — pattern เดียวกับ inbox/page.tsx ที่เรียก listConversationsForShop ตรง)
 *
 * หน้านี้แก้ 404 ที่ seller เจอหลัง connect Facebook Page สำเร็จ (callback redirect
 * มาที่ /settings/channels — ดู src/app/api/channels/facebook/callback/route.ts)
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getShopByUserId } from '@/services/shop.service'
import { listChannels } from '@/services/shop-channel.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import type { Metadata } from 'next'
import { ChannelsClient } from './ChannelsClient'

export const metadata: Metadata = { title: 'ช่องทางแชท' }

export default async function ChannelsSettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string } } | null)?.user
  if (!user) return null

  const shop = await getShopByUserId(user.id)
  // ทุก seller ควรมีร้านอยู่แล้ว (layout.tsx auto-create) — defensive fallback เท่านั้น
  if (!shop) return null

  const channels = await listChannels(shop.id)

  return (
    <>
      <PageBreadcrumb
        title="ช่องทางแชท"
        trail={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'ช่องทางแชท' }]}
      />

      <div className="card">
        {/* section header — Paces border-dashed pattern จาก account-settings theme */}
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm uppercase w-full justify-center">
            <Icon icon="message-circle" className="text-base" aria-hidden="true" />
            ช่องทางแชท
          </h5>
        </div>

        {/* ChannelsClient รับ ChannelView[] เท่านั้น — ไม่มี accessTokenEnc (allow-list select ที่ service) */}
        <ChannelsClient
          initialChannels={channels.map((c) => ({
            id: c.id,
            provider: c.provider,
            name: c.name,
            avatarUrl: c.avatarUrl,
            status: c.status,
          }))}
        />
      </div>
    </>
  )
}
