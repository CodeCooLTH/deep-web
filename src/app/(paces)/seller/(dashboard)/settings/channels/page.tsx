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
 *
 * bug fix (แชทไม่แยกตามร้าน, user report prod — พบเพิ่มนอกลิสต์เดิมของ task แต่เป็นบั๊กเดียวกัน
 * ในฟีเจอร์แชทเป๊ะ ๆ: หน้านี้คือที่มาปุ่ม "เชื่อม Facebook Page" + list ช่องทางที่เชื่อมแล้ว):
 * เดิมใช้ getShopByUserId ซึ่งคืนร้าน PERSONAL เสมอ ไม่สนว่ากำลัง active ร้านไหนอยู่ — สลับไปร้าน B
 * แล้วหน้านี้ยังโชว์ช่องทางของ PERSONAL. เปลี่ยนเป็น resolveActiveShopContext (re-verify membership
 * เสมอ) — resolve ไม่ได้ (ร้านถูกลบ/หลุดสิทธิ์) → null (เดิมก็ return null defensive fallback อยู่แล้ว
 * ไม่เปลี่ยนพฤติกรรมส่วนนี้ — auth guard เต็มอยู่ที่ (dashboard)/layout.tsx แล้ว)
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listChannels } from '@/services/shop-channel.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import type { Metadata } from 'next'
import { ChannelsClient } from './ChannelsClient'

export const metadata: Metadata = { title: 'ช่องทางแชท' }

export default async function ChannelsSettingsPage() {
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({ user: { id: user.id, activeShopId: user.activeShopId ?? null } })
  // ทุก seller ควรมี active shop อยู่แล้ว (layout.tsx auto-create Personal + resolve เสมอมี fallback) —
  // defensive fallback เท่านั้น (ร้านถูกลบ/หลุดสิทธิ์กลางอากาศ)
  if (!activeCtx) return null

  const channels = await listChannels(activeCtx.shopId)

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
