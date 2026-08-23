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
import { listProfileVisibilityItems } from '@/services/profile-visibility.service'
import { getT } from '@/i18n/server'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'

import ShopVideosClient from './components/ShopVideosClient'
import PublishToggleClient from './components/PublishToggleClient'
import PriceVisibilityToggleClient from './components/PriceVisibilityToggleClient'
import ProfileItemVisibilityClient from './components/ProfileItemVisibilityClient'

/**
 * title ของแท็บต้องผันตามภาษา (feature 00047) — reviewer เปิดหน้านี้ค้างไว้ทั้งฉากในคลิป C
 * ต้องเป็น generateMetadata ไม่ใช่ `export const metadata` เพราะค่าคงที่คำนวณตอน build
 * ซึ่งยังไม่รู้ว่า request นี้เป็นภาษาอะไร
 * Base: src/app/(paces)/seller/auth/sign-in/page.tsx
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t.publicProfile.pageTitle }
}

export default async function PublicProfileSettingsPage() {
  const t = await getT()
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active?.shop) return null

  // 🛑 ผู้กระทำคือ "คนที่ล็อกอินอยู่" ไม่ใช่เจ้าของร้าน — ส่ง active.shop.userId เข้าไปแทนจะทำให้
  // guard ใน listProfileVisibilityItems ผ่านเสมอ (เจ้าของเข้าถึงร้านตัวเองได้อยู่แล้ว) = ถอดด่านทิ้ง
  // โดยที่ tsc ไม่มีทางเห็น เพราะทั้งคู่เป็น string เหมือนกัน (feedback_session_exists_is_not_identity)
  const actorUserId = (session?.user as { id?: string } | undefined)?.id
  if (!actorUserId) return null

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

  const [owner, layout, visibilityGroups] = await Promise.all([
    ownerUsernamePromise,
    getShopPageLayout(active.shop.id),
    // feature 00053 — รายการที่ร้านเลือกแสดง/ซ่อนได้ · guard อยู่ในบริการ (ไม่ใช่ public read)
    listProfileVisibilityItems(active.shop.id, actorUserId),
  ])

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
        title={t.publicProfile.pageTitle}
        trail={[{ label: t.publicProfile.breadcrumbOverview }]}
        action={
          // desktop-only (TD-007) — ตัวจัดเรียงบล็อกต้องเห็นคลัง/พื้นที่จัด/พรีวิวพร้อมกัน บีบลง
          // จอมือถือแล้วเสียเหตุผลของเครื่องมือ (มติผู้ใช้ 2026-08-07); มือถือมีแถบ info แทนด้านล่าง
          <a
            href="/public-profile/builder"
            className="btn bg-primary text-white hover:bg-primary-hover hidden min-h-11 items-center gap-1.5 xl:inline-flex"
          >
            <Icon icon="layout-grid" className="text-base" />
            {t.publicProfile.builderCta}
          </a>
        }
      />

      <div className="card mb-base">
        <div className="card-header">
          <h4 className="card-title">{t.publicProfile.visibleCardTitle}</h4>
        </div>
        <div className="card-body">
          <p className="text-default-500 text-sm">{t.publicProfile.visibleCardBody}</p>
          <div className="mt-base flex flex-wrap gap-2">
            <a
              className="btn bg-default-100 text-default-900 hover:bg-default-200 inline-flex min-h-11 items-center"
              href="/shop"
            >
              {t.publicProfile.shopSettingsCta}
            </a>
          </div>
        </div>
      </div>

      <div className="card mb-base">
        <div className="card-header">
          <h4 className="card-title">{t.publicProfile.linkCardTitle}</h4>
        </div>
        <div className="card-body">
          {publicUrl ? (
            <>
              {/* successMessage ต้องส่งเสมอ — ค่า default ใน CopyLinkButton เป็นไทยตายตัว
                  ไม่ส่ง = ปุ่มเป็นอังกฤษแต่ toast ตอนกดคัดลอกโผล่เป็นไทย */}
              <CopyLinkButton
                value={publicUrl}
                showPreview
                label={t.publicProfile.copy}
                successMessage={t.publicProfile.copiedToast}
              />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn bg-primary text-white hover:bg-primary-hover mt-3 flex min-h-11 w-full items-center justify-center gap-1.5"
              >
                <Icon icon="external-link" className="text-base" />
                {t.publicProfile.viewMyStorefront}
              </a>
            </>
          ) : (
            <p className="text-default-500 text-sm">{t.publicProfile.noLinkYet}</p>
          )}
        </div>
      </div>

      <PublishToggleClient initial={layout.isPublished} />

      {/* feature 00053 — สองการ์ดนี้อยู่ต่อจากสวิตช์เผยแพร่โดยตั้งใจ: เรียงจาก "เห็นหน้าร้านไหม"
          → "เห็นราคาไหม" → "เห็นอะไรบ้าง" คือลำดับจากกว้างไปแคบ ซึ่งตรงกับลำดับที่ร้านตัดสินใจจริง */}
      <PriceVisibilityToggleClient initial={layout.showPrices} />

      <ProfileItemVisibilityClient groups={visibilityGroups} />

      <ShopVideosClient />

      {/* มือถือเท่านั้น (xl:hidden) — คู่กับปุ่ม "จัดหน้าร้าน" ที่ซ่อนบนมือถือใน PageBreadcrumb ด้านบน */}
      <div
        className="bg-info/15 text-info-ink mt-base flex items-start gap-2.5 rounded-lg p-3 text-sm xl:hidden"
        role="alert"
      >
        <Icon icon="info-circle" className="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
        <div>
          <div className="font-medium">{t.publicProfile.mobileBuilderNoticeTitle}</div>
          <p className="mt-1">{t.publicProfile.mobileBuilderNoticeBody}</p>
        </div>
      </div>
    </>
  )
}
