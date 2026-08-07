/**
 * หน้าตั้งค่าโปรไฟล์สาธารณะ (/public-profile) — 2026-07-26
 *
 * รวมสิ่งที่กำหนดว่า "คนนอกเห็นร้านเราเป็นยังไง" ไว้ที่เดียว ต่างจาก /shop ที่เป็นข้อมูล
 * ตั้งต้นของร้าน (ชื่อ โลโก้ ปก หมวดหมู่ ที่อยู่) — ที่นี่คือส่วนที่เลือกได้ว่าจะเอาอะไรไปโชว์
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/page.tsx
 *   — โครง PageBreadcrumb + card + card-header ของ Paces
 *
 * ขยาย 2026-08-07 (feature 00035 "ตัวจัดหน้าร้าน" Task 10 — mockup
 * docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html หัวข้อ "2 · มือถือ"):
 *   - การ์ด "ลิงก์หน้าร้านของคุณ" (คัดลอก + ดูหน้าร้านของฉัน) — reuse CopyLinkButton
 *   - การ์ด "การมองเห็นหน้าร้าน" (PublishToggleClient — สวิตช์เผยแพร่ ผูก PATCH .../publish)
 *   - ปุ่ม "จัดหน้าร้าน" → /public-profile/builder โชว์เฉพาะ desktop (breakpoint `xl`, ตาม TD-007
 *     SDS — ตัวจัดเรียงเป็น desktop-only ในเฟสนี้ ผู้ใช้ตัดสิน 2026-08-07) + แถบ info มือถือคู่กัน
 *   - แก้บั๊กเดิม: "ดูหน้าร้านจริง" hardcode /b/{slug} ใช้กับร้าน PERSONAL ไม่ได้ (ร้าน PERSONAL ไม่มี
 *     /b/[slug] — ใช้ /u/{username ของเจ้าของร้าน} เท่านั้น) → resolve ตาม active.kind แล้ว
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว
 * สิทธิ์: requireActiveShop คืน role ได้แค่ OWNER/ADMIN เท่านั้น (re-verify ผ่าน canAccessShop/
 * ShopMember เสมอ — src/lib/shop-context.ts) หน้านี้และ PATCH .../publish (ผ่าน
 * requireBuilderShopContext ใน API route) จึงตรวจสิทธิ์ที่ server ทั้งคู่ ไม่ใช่ซ่อนปุ่มอย่างเดียว
 */
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { prisma } from '@/lib/prisma'
import { getShopPageLayout } from '@/services/shop-page-layout.service'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'

import ShopVideosClient from './components/ShopVideosClient'
import PublishToggleClient from './components/PublishToggleClient'

export const metadata: Metadata = { title: 'โปรไฟล์สาธารณะ' }

export default async function PublicProfileSettingsPage() {
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active?.shop) return null

  // ลิงก์ดูหน้าจริง — ต้องเป็น URL เต็มที่ชี้ไปโดเมนหลัก ไม่ใช่ path เปล่า
  //
  // หน้านี้อยู่บน subdomain seller ซึ่ง proxy เติม /seller นำหน้าทุก path (proxy.ts "Everything
  // else: rewrite to the internal /seller/* path tree") ถ้าใส่ href เป็น /b/{slug} เบราว์เซอร์
  // จะต่อกับ host เดิมได้ seller.<domain>/b/{slug} → โดน rewrite เป็น /seller/b/{slug} → 404
  // (บั๊กจริงที่ user เจอตอนกดปุ่มนี้)
  const host = (await headers()).get('host') ?? ''
  const rootHost = host.replace(/^seller\./, '')
  const proto = host.startsWith('localhost') || host.includes('.local') ? 'http' : 'https'

  // ร้าน PERSONAL ไม่มี /b/[slug] (route นั้น resolve เฉพาะ Shop.kind==='BUSINESS') — ต้องใช้
  // /u/{username ของเจ้าของร้าน} แทน ของเดิม hardcode /b/{slug} จึงพาร้าน PERSONAL ไปหน้า 404 เสมอ
  const ownerUsernamePromise =
    active.kind === 'PERSONAL'
      ? prisma.user.findUnique({ where: { id: active.shop.userId }, select: { username: true } })
      : Promise.resolve(null)

  const [owner, layout] = await Promise.all([ownerUsernamePromise, getShopPageLayout(active.shop.id)])

  const publicUrl =
    active.kind === 'PERSONAL'
      ? owner?.username
        ? `${proto}://${rootHost}/u/${owner.username}`
        : null
      : active.shop.slug
        ? `${proto}://${rootHost}/b/${active.shop.slug}`
        : null

  return (
    <>
      <PageBreadcrumb
        title="โปรไฟล์สาธารณะ"
        trail={[{ label: 'ภาพรวม' }]}
        action={
          // desktop-only (TD-007) — ตัวจัดเรียงบล็อกต้องเห็นคลัง/พื้นที่จัด/พรีวิวพร้อมกัน บีบลง
          // จอมือถือแล้วเสียเหตุผลของเครื่องมือ (มติผู้ใช้ 2026-08-07); มือถือมีแถบ info แทนด้านล่าง
          <a
            href="/public-profile/builder"
            className="btn bg-primary text-white hover:bg-primary-hover hidden min-h-11 items-center gap-1.5 xl:inline-flex"
          >
            <Icon icon="layout-grid" className="text-base" />
            จัดหน้าร้าน
          </a>
        }
      />

      <div className="card mb-base">
        <div className="card-header">
          <h4 className="card-title">หน้าร้านที่คนนอกเห็น</h4>
        </div>
        <div className="card-body">
          <p className="text-default-500 text-sm">
            ชื่อร้าน โลโก้ ภาพหน้าปก และหมวดหมู่ ตั้งค่าได้ที่หน้าตั้งค่าร้านค้า
            ส่วนหน้านี้ใช้เลือกว่าจะเอาอะไรไปโชว์เพิ่ม
          </p>
          <div className="mt-base flex flex-wrap gap-2">
            <a
              className="btn bg-default-100 text-default-900 hover:bg-default-200 inline-flex min-h-11 items-center"
              href="/shop"
            >
              ตั้งค่าร้านค้า
            </a>
          </div>
        </div>
      </div>

      <div className="card mb-base">
        <div className="card-header">
          <h4 className="card-title">ลิงก์หน้าร้านของคุณ</h4>
        </div>
        <div className="card-body">
          {publicUrl ? (
            <>
              <CopyLinkButton value={publicUrl} showPreview label="คัดลอก" />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn bg-primary text-white hover:bg-primary-hover mt-3 flex min-h-11 w-full items-center justify-center gap-1.5"
              >
                <Icon icon="external-link" className="text-base" />
                ดูหน้าร้านของฉัน
              </a>
            </>
          ) : (
            <p className="text-default-500 text-sm">
              ร้านยังไม่มีชื่อผู้ใช้/ลิงก์สำหรับหน้าร้าน — ตั้งค่าได้ที่หน้าตั้งค่าร้านค้า
            </p>
          )}
        </div>
      </div>

      <PublishToggleClient initial={layout.isPublished} />

      <ShopVideosClient />

      {/* มือถือเท่านั้น (xl:hidden) — คู่กับปุ่ม "จัดหน้าร้าน" ที่ซ่อนบนมือถือใน PageBreadcrumb ด้านบน */}
      <div
        className="bg-info/15 text-info-ink mt-base flex items-start gap-2.5 rounded-lg p-3 text-sm xl:hidden"
        role="alert"
      >
        <Icon icon="info-circle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
        <div>
          <div className="font-medium">จัดเรียงบล็อกบนหน้าร้าน ใช้บนคอมพิวเตอร์</div>
          <p className="mt-1">
            การสลับลำดับและเลือกเนื้อหาที่จะโชว์ ต้องใช้พื้นที่จอกว้าง เปิดหน้านี้บนคอมพิวเตอร์เมื่อสะดวก
            — การตั้งค่าอื่นบนหน้านี้ใช้บนมือถือได้ตามปกติ
          </p>
        </div>
      </div>
    </>
  )
}
