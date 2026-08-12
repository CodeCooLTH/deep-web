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
 *
 * feature 00025 (S-13): เพิ่มการ์ด "LINE Official Account" เป็น sibling .card ใหม่ (คนละการ์ดกับ
 * Messenger/IG — flow เชื่อมต่อต่างกันโดยพื้นฐาน paste-credential vs OAuth redirect) — filter
 * listChannels() ตาม provider ก่อนส่งเข้าแต่ละ client component (LINE ต้องไม่ไปโผล่ในการ์ด Messenger)
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { listChannels } from '@/services/shop-channel.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import type { Metadata } from 'next'
import { ChannelsClient } from './ChannelsClient'
import { LineChannelCard } from './LineChannelCard'
import { headers } from 'next/headers'
import { getLineChannelsHealth } from '@/services/line-channel-health.service'

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
  // แยก LINE ออกจาก Messenger/Instagram ตั้งแต่ตรงนี้ — คนละการ์ด คนละ client component
  const messengerChannels = channels.filter((c) => c.provider !== 'LINE')
  const lineChannels = channels.filter((c) => c.provider === 'LINE')

  /**
   * สุขภาพของช่องทาง LINE — ตรวจ **สด** ทุกครั้งที่เปิดหน้า ไม่เก็บลงคอลัมน์ (ดูเหตุผลเต็มที่
   * `getLineChannelsHealth`) ⇒ ยิง LINE 1 ครั้งต่อช่องทาง หน้านี้ traffic ต่ำจึงคุ้ม
   *
   * 🛑 host ต้องเป็น origin ที่ผู้ใช้กำลังเปิดอยู่จริง — ตัวเดียวกับที่หน้าเชื่อมต่อแสดงให้ร้าน
   * คัดลอกไปวาง (HR16) ตัวเทียบจะตัด `seller.`/`admin.` ทิ้งเองก่อนเทียบ เพราะ webhook ใช้ได้
   * จากทั้งโดเมนหลักและ subdomain
   */
  const host = (await headers()).get('host') ?? ''
  const proto = host.startsWith('localhost') || host.includes('.local') ? 'http' : 'https'
  const lineHealth =
    lineChannels.length > 0
      ? await getLineChannelsHealth({
          shopId: activeCtx.shopId,
          webhookUrl: `${proto}://${host}/api/channels/line/webhook`,
        })
      : []

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
          initialChannels={messengerChannels.map((c) => ({
            id: c.id,
            provider: c.provider,
            name: c.name,
            avatarUrl: c.avatarUrl,
            status: c.status,
          }))}
        />
      </div>

      {/* การ์ดใหม่ (feature 00025 S-13) — sibling .card คนละใบกับ Messenger/IG ด้านบน */}
      <div className="card mt-6">
        {/* header ไม่ใส่ uppercase (ต่างจากการ์ดบน) — "LINE Official Account" เป็นชื่อแบรนด์
            การบังคับ ALL CAPS จะขัด Impeccable "Sentence case" (การ์ดบนเป็นข้อความไทยล้วน uppercase
            จึงไม่มีผลภาพจริง แต่ตรงนี้มีผล) — ตาม design spec Theme Source Mapping ส่วน A ที่ไม่มี
            uppercase ในตัวอย่าง markup */}
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm w-full justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logos/line.svg" alt="" aria-hidden="true" width={16} height={16} />
            LINE Official Account
          </h5>
        </div>

        {/* basicId มาจาก listChannels() แล้ว (เพิ่มใน select ตอน S-13 — additive, MESSENGER/IG ได้ null)
            ทำให้ @handle ของ OA ขึ้นตั้งแต่โหลดหน้า ไม่ต้องรอ reconnect */}
        <LineChannelCard
          initialChannels={lineChannels.map((c) => {
            const h = lineHealth.find((x) => x.channelId === c.id)
            return {
              id: c.id,
              name: c.name,
              avatarUrl: c.avatarUrl,
              status: c.status,
              basicId: c.basicId,
              // สถานะสุขภาพคำนวณที่ server ด้วยฟังก์ชันบริสุทธิ์ตัวเดียว — client ไม่ตัดสินเอง
              // (AC-CH-25: ห้ามเทอร์นารีใน JSX) ไม่มีผล = ถือว่ายังไม่รู้ ให้การ์ดถอยไปใช้ status
              health: h?.health ?? null,
              tokenExpiresAt: h?.tokenExpiresAt ?? null,
            }
          })}
        />
      </div>
    </>
  )
}
