/**
 * ใบเสร็จรับเงินฝั่งลูกค้า (feature 00073 FR-013 · มติ user 2026-10-11 รอบ 2)
 *
 * ใบเดียวกับที่ร้านพิมพ์ (เลขเดียวกัน · ข้อมูลจาก `buildReceiptSheet` ตัวเดียวกัน — HR16)
 * แสดงเฉพาะ "ต้นฉบับ" — สำเนาเป็นของร้าน
 *
 * ด่าน: ต้องล็อกอิน + เป็นเจ้าของงาน + ปิดงานแล้ว/ไม่ใช่ไม่มาตามนัด/ค้าง 0 (`getReceiptViewForBuyer`)
 * ไม่ผ่าน/ยังไม่เคยออกเลข → กลับหน้างาน · หน้านี้ไม่ออกเลขเอง (ออกได้ทางเดียวคือ POST
 * `/api/orders/[token]/receipt/buyer` จากปุ่ม "ดูใบเสร็จ" — เปิดลิงก์ซ้ำ/prefetch ต้องไม่จองเลข)
 *
 * Base: src/app/(paces)/seller/(fullscreen)/orders/[token]/receipt/page.tsx (โครงหน้า + กระดาษ)
 *   chrome รอบกระดาษใช้ MUI ของฝั่งลูกค้า · กระดาษเป็น ReceiptSheet ตัวเดียวกับฝั่งร้าน
 */
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'

import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { resolveReceiptHeader } from '@/lib/receipt'
import { getAppShell } from '@/lib/app-shell-server'
import { getReceiptViewForBuyer } from '@/services/receipt.service'
import ReceiptSheet from '@/app/(paces)/seller/(fullscreen)/orders/[token]/receipt/ReceiptSheet'
import { buildReceiptSheet } from '@/app/(paces)/seller/(fullscreen)/orders/[token]/receipt/receipt-data'
import styles from '@/app/(paces)/seller/(fullscreen)/orders/[token]/receipt/receipt.module.css'

import PrintReceiptButton from './PrintReceiptButton'

type PageProps = { params: Promise<{ token: string }> }

async function loadView(token: string) {
  const buyerUserId = sessionUserId(await getServerSession(authOptions))
  if (!buyerUserId) return null
  return getReceiptViewForBuyer({ orderToken: token, buyerUserId })
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const view = await loadView(token)
  if (!view) return { title: 'ใบเสร็จรับเงิน', robots: { index: false } }
  const name = resolveReceiptHeader(view.shop, view.shop.receiptProfile).name
  // ชื่อไฟล์ตอนบันทึก PDF รูปแบบเดียวกับฝั่งร้าน
  return { title: { absolute: [name, view.receipt.receiptNo, view.buyerName].filter(Boolean).join('_') }, robots: { index: false } }
}

export default async function BuyerReceiptPage({ params }: PageProps) {
  const { token } = await params
  const view = await loadView(token)
  if (!view) redirect(`/o/${token}`)
  // แอป (WebView) ไม่มี window.print — บอกตรง ๆ ดีกว่าปุ่มที่กดแล้วเงียบ (ท่าเดียวกับฝั่งร้าน)
  const inApp = (await getAppShell()) !== 'web'
  const { data } = buildReceiptSheet(view)

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', py: { xs: 3, sm: 5 }, px: 2 }}>
      {/* กว้างเท่ากระดาษพอดีทุกจอ (styles.chrome ใช้ตัวคูณเดียวกับ .sheet) — เดิมปุ่มพิมพ์ไม่ตรงขอบกระดาษ */}
      <Box className={`print:hidden ${styles.chrome}`} sx={{ mb: 3 }}>
        {/* HR2 — server component ห้าม component={Link} → LinkButton */}
        <LinkButton
          href={`/o/${token}`}
          color='secondary'
          startIcon={<Icon icon='tabler-arrow-left' fontSize={18} />}
          sx={{ minHeight: 44, mb: 2 }}
        >
          กลับไปหน้างาน
        </LinkButton>
        <Typography variant='h5' sx={{ fontWeight: 700 }}>
          ใบเสร็จรับเงิน
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          เลขที่ {data.receiptNo}
        </Typography>
        {inApp ? (
          <Typography variant='body2' sx={{ fontWeight: 600 }}>
            แอปพิมพ์ไม่ได้ — เปิดหน้านี้ในเบราว์เซอร์เพื่อพิมพ์หรือบันทึก PDF
          </Typography>
        ) : (
          <PrintReceiptButton />
        )}
      </Box>

      <div className={styles.stack}>
        <ReceiptSheet data={data} copyLabel='ต้นฉบับ' pageNo={1} />
      </div>
    </Box>
  )
}
