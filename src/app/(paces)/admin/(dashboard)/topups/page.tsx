/**
 * Admin top-up queue — คิว TopUpRequest รอ review (admin gate)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/issue-tracker/page.tsx
 *   (PageBreadcrumb + RSC wrapper pattern สำหรับ Paces admin page)
 *
 * Auth pattern: requireAdmin() จาก @/lib/auth — mirror pattern จาก
 *   src/app/api/admin/topups/route.ts:29 + src/app/(paces)/admin/(dashboard)/verifications/[id]/page.tsx:76
 *   (getServerSession + isAdmin flag; คืน null → redirect sign-in)
 *
 * RSC data pattern: เรียก getPendingTopUps() โดยตรง (service-direct DAL) —
 *   mirror src/app/(paces)/admin/(dashboard)/verifications/page.tsx ที่ query prisma ตรง
 *   MVP queue = PENDING only (getPendingTopUps); ถ้าต้องการ all-status ต้องสร้าง getTopUpsByAdmin
 *   ที่ scan ทุก shop — note: ไม่มี service นั้น, defer ถ้าต้องการ
 *
 * Plain props: createdAt → ISO string (serializable ข้ามขอบ RSC→client)
 * RC-8: ไม่ log PII; error path log "[topups/page] DB error" เท่านั้น
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { requireAdmin } from '@/lib/auth'
import { getPendingTopUps } from '@/services/topup.service'
import TopUpQueueTable from './components/TopUpQueueTable'
import type { TopUpRow } from './components/TopUpQueueTable'

export const metadata: Metadata = { title: 'คำขอเติมเงิน' }

export default async function AdminTopUpsPage() {
  // Admin gate — pattern เดียวกับ requireAdmin() ใน route + [id]/page.tsx
  const admin = await requireAdmin()
  if (!admin) {
    // path admin สั้น (/admin/auth/sign-in) — ตาม proxy map
    redirect('/admin/auth/sign-in')
  }

  let topups: TopUpRow[] = []
  let hasError = false

  try {
    // Service-direct DAL (ไม่ fetch API — RSC ไม่ต้องการ HTTP round-trip ไป self)
    const records = await getPendingTopUps()

    // แปลง Date → ISO string เพื่อให้ serializable ข้ามขอบ RSC→client
    // RC-8: payload มีแค่ id, shopId, shopName, amount, slipFileId, status, createdAt
    //        ไม่มี buyer PII ตาม getPendingTopUps select
    topups = records.map((r) => ({
      id: r.id,
      shopId: r.shopId,
      shopName: r.shop.shopName,
      amount: r.amount,
      slipFileId: r.slipFileId,
      status: r.status as TopUpRow['status'],
      createdAt: r.createdAt.toISOString(),
    }))
  } catch (e) {
    // RC-8: log ไม่มี PII — ไม่ include payload
    console.error('[topups/page] DB error', e)
    hasError = true
  }

  return (
    <>
      {/* Breadcrumb: Business → "เติมเงิน" — ตาม Design Spec */}
      <PageBreadcrumb
        title="คำขอเติมเงิน"
        trail={[{ label: 'ธุรกิจ' }]}
      />

      <TopUpQueueTable
        topups={topups}
        hasError={hasError}
        isLoading={false}
      />
    </>
  )
}
