/**
 * หน้าพิมพ์ใบเสร็จรับเงิน (feature 00065) — ต้นฉบับ + สำเนา บนกระดาษ A4
 *
 * Base: src/app/(paces)/seller/(fullscreen)/orders/[token]/edit/page.tsx (fetch + ownership + FullscreenPageHeader)
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/invoice/details/page.tsx (print:hidden + ปุ่ม Print)
 *
 * หน้านี้ "อ่าน" อย่างเดียว ไม่ออกเลขเอง — ออกได้ทางเดียวคือ POST /api/orders/[token]/receipt
 * จากหน้ารายละเอียดออเดอร์ (การเปิดลิงก์ซ้ำ/prefetch ต้องไม่เผลอจองเลข) ยังไม่เคยออก → กลับหน้าออเดอร์
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { authOptions } from '@/lib/auth'
import { gatePage } from '@/lib/shop-capability'
import { viewerRolesOf } from '@/lib/viewer-roles'
import NoPermissionScreen from '@/app/(paces)/seller/(dashboard)/_shared/NoPermissionScreen'
import { requireActiveShop } from '@/lib/shop-context'
import { formatReceiptAmount, resolveReceiptHeader } from '@/lib/receipt'
import { getReceiptView } from '@/services/receipt.service'
import { ORDER_VOCAB } from '@/lib/seller-menu'
import { getAppShell } from '@/lib/app-shell-server'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import Icon from '@/components/wrappers/Icon'

import PrintButton from './PrintButton'
import ReceiptSheet from './ReceiptSheet'
import { buildReceiptSheet } from './receipt-data'
import styles from './receipt.module.css'

type PageProps = { params: Promise<{ token: string }> }

async function loadView(token: string) {
  const session = await getServerSession(authOptions)
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return null
  return getReceiptView({ shopId: active.shop.id, orderToken: token })
}

/**
 * ชื่อหน้า = ชื่อไฟล์ตั้งต้นตอน "บันทึกเป็น PDF" — ตามรูปแบบไฟล์ใบจริงของร้าน
 * (`{ร้าน}_{เลขที่}_{ลูกค้า}.pdf`) ไม่งั้นทุกใบได้ชื่อไฟล์เดียวกัน
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const view = await loadView(token)
  if (!view) return { title: 'ใบเสร็จรับเงิน' }
  const name = resolveReceiptHeader(view.shop, view.shop.receiptProfile).name
  return { title: { absolute: [name, view.receipt.receiptNo, view.buyerName].filter(Boolean).join('_') } }
}

export default async function ReceiptPage({ params }: PageProps) {
  const { token } = await params
  // 00071 P3 (D1): ใบเสร็จ = เจ้าของ/ผู้ดูแล/ตอบแชท/เปิดบิล — ช่างและบทบาทอื่นเห็นการ์ดบอกเหตุผล
  const session = await getServerSession(authOptions)
  const gate = await gatePage(session, 'D1')
  if (!gate.ok && gate.reason === 'FORBIDDEN_ROLE') {
    return <NoPermissionScreen capability="D1" viewerRoles={await viewerRolesOf(session)} backTo={`/orders/${token}`} backLabel="กลับไปหน้ารายละเอียด" />
  }
  const view = await loadView(token)
  if (!view) redirect(`/orders/${token}`)
  // แอปผู้ขาย (WebView) ไม่มี window.print — ปุ่มที่กดแล้วเงียบแย่กว่าบอกตรง ๆ
  const inApp = (await getAppShell()) !== 'web'

  const { data, outstanding, header } = buildReceiptSheet(view)

  return (
    <>
      {/* header เดิมเป็น sticky — ห่อด้วย print:hidden แล้วเสีย sticky ได้ หน้านี้สั้นพอ */}
      <div className="print:hidden">
        <FullscreenPageHeader
          title="ใบเสร็จรับเงิน"
          subtitle={`เลขที่ ${data.receiptNo}`}
          backFallbackHref={`/orders/${token}`}
        />
        <div className="mt-4 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-default-700 mb-0 text-sm">
            จะพิมพ์ออกมา 2 แผ่น: ต้นฉบับให้ลูกค้า สำเนาเก็บไว้ที่ร้าน
          </p>
          {inApp ? (
            <p className="text-default-800 mb-0 text-sm font-semibold">
              แอปพิมพ์ไม่ได้ — เปิดหน้านี้ในเบราว์เซอร์เพื่อพิมพ์หรือบันทึก PDF
            </p>
          ) : (
            <PrintButton />
          )}
        </div>
        {data.cancelled ? (
          <Notice icon="ban" tone="danger">
            {ORDER_VOCAB.SERVICE_QUEUE.noun}นี้ถูกยกเลิกแล้ว ใบเสร็จจะพิมพ์ออกมาพร้อมลายน้ำ &ldquo;ยกเลิก&rdquo;
          </Notice>
        ) : outstanding > 0 ? (
          <Notice icon="alert-triangle" tone="warning">
            ยังไม่มีบันทึกรับเงินครบ: ค้างชำระ {formatReceiptAmount(outstanding)} บาท — ตรวจให้แน่ใจว่าได้รับเงินแล้วก่อนมอบใบเสร็จ
          </Notice>
        ) : null}
        {header.isFallback ? (
          <Notice icon="alert-triangle" tone="warning">
            ร้านยังไม่ได้ตั้งข้อมูลออกใบเสร็จ — ใบนี้ใช้
            {header.address ? 'ชื่อและที่อยู่ของร้านแทน และไม่มี' : 'ชื่อร้านแทน ไม่มีที่อยู่และ'}
            เลขประจำตัวผู้เสียภาษี{' '}
            <Link href="/shop#receipt-profile" className="text-primary-ink font-semibold underline">
              ตั้งค่าข้อมูลออกใบเสร็จ
            </Link>
          </Notice>
        ) : null}
      </div>

      <div className={styles.stack}>
        <ReceiptSheet data={data} copyLabel="ต้นฉบับ" pageNo={1} />
        <ReceiptSheet data={data} copyLabel="สำเนา" pageNo={2} />
      </div>
    </>
  )
}

/** แถบแจ้งบนจอ (ไม่ถูกพิมพ์ — อยู่ใต้กล่อง print:hidden) · Base: แถบเตือนใน OrderDetailClient.tsx */
function Notice({ icon, tone, children }: { icon: string; tone: 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      className={`${tone === 'danger' ? 'bg-danger/15' : 'bg-warning/15'} text-default-800 mb-4 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm`}
    >
      <Icon
        icon={icon}
        className={`${tone === 'danger' ? 'text-danger-ink' : 'text-warning-ink'} mt-0.5 shrink-0 text-lg`}
        aria-hidden="true"
      />
      <p className="mb-0">{children}</p>
    </div>
  )
}
