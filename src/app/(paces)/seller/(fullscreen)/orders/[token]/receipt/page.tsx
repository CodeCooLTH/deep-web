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
import { requireActiveShop } from '@/lib/shop-context'
import { formatDateTH } from '@/lib/format-date'
import { toFileUrl } from '@/lib/file-url'
import { thaiBahtText } from '@/lib/thai-baht-text'
import { formatReceiptAmount, receiptPaymentMarks, resolveReceiptHeader } from '@/lib/receipt'
import { getReceiptView } from '@/services/receipt.service'
import { getAppShell } from '@/lib/app-shell-server'
import { buildBreakdown } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/order-detail-shared'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'
import Icon from '@/components/wrappers/Icon'

import PrintButton from './PrintButton'
import ReceiptSheet, { type ReceiptSheetData } from './ReceiptSheet'
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

/**
 * ป้ายของใบเสร็จตามใบจริงของร้าน — ตัวเลขมาจาก `buildBreakdown` ตัวเดียวกับหน้าออเดอร์ (HR16)
 * เปลี่ยนแค่คำเรียกของแถวแรก/แถวสุดท้าย
 */
const RECEIPT_LABEL: Record<string, string> = {
  subtotal: 'รวมเป็นเงิน',
  total: 'จำนวนเงินรวมทั้งสิ้น',
}
/** VAT บนเอกสารไทยใช้คำเต็ม — อัตราอ่านจากออเดอร์ ไม่ hardcode 7 */
const vatLabel = (pct: number) => `ภาษีมูลค่าเพิ่ม${pct > 0 ? ` ${pct}%` : ''}`

export default async function ReceiptPage({ params }: PageProps) {
  const { token } = await params
  const view = await loadView(token)
  if (!view) redirect(`/orders/${token}`)
  // แอปผู้ขาย (WebView) ไม่มี window.print — ปุ่มที่กดแล้วเงียบแย่กว่าบอกตรง ๆ
  const inApp = (await getAppShell()) !== 'web'

  const num = (v: unknown) => Number(v ?? 0)
  const items = view.items.map((it) => ({
    name: it.name,
    description: it.description,
    qty: it.qty,
    unitPrice: formatReceiptAmount(num(it.price)),
    lineTotal: formatReceiptAmount(num(it.price) * it.qty),
  }))
  const total = num(view.totalAmount)
  const vatPct = parseFloat((num(view.vatRate) * 100).toFixed(2))
  const rows = buildBreakdown({
    subtotal: view.items.reduce((s, it) => s + num(it.price) * it.qty, 0),
    discount: num(view.discount),
    vatAmount: num(view.vatAmount),
    vatPct,
    total,
  })
  // เงินที่บันทึกรับจริง (ไม่นับที่ยกเลิก) — ใบเสร็จออกได้ก่อนรับเงิน จึงต้องเตือนร้านบนจอ (ไม่พิมพ์)
  const received = view.payments.filter((p) => !p.voidedAt).reduce((s, p) => s + num(p.amount), 0)
  const outstanding = Math.max(0, total - received)
  const header = resolveReceiptHeader(view.shop, view.shop.receiptProfile)

  const data: ReceiptSheetData = {
    receiptNo: view.receipt.receiptNo,
    issuedDateLabel: formatDateTH(view.receipt.issuedAt),
    sellerName: view.createdBy?.displayName ?? '',
    header: { ...header, logoUrl: toFileUrl(view.shop.logo) },
    stampUrl: toFileUrl(view.shop.receiptProfile?.stamp),
    customer: { name: view.buyerName ?? '', contact: view.buyerContact },
    items,
    breakdown: rows
      .filter((r) => r.key !== 'total')
      .map((r) => ({ key: r.key, label: r.key === 'vat' ? vatLabel(vatPct) : (RECEIPT_LABEL[r.key] ?? r.label), value: `${r.prefix ?? ''}${formatReceiptAmount(r.value)}` })),
    totalLabel: RECEIPT_LABEL.total,
    totalValue: formatReceiptAmount(total),
    totalWords: thaiBahtText(total),
    marks: receiptPaymentMarks({ paymentMethod: view.paymentMethod, payments: view.payments }),
    cancelled: view.status === 'CANCELLED',
  }

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
            ออเดอร์นี้ถูกยกเลิกแล้ว ใบเสร็จจะพิมพ์ออกมาพร้อมลายน้ำ &ldquo;ยกเลิก&rdquo;
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
