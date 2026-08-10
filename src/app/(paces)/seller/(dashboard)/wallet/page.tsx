/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx
 * (page shell + breadcrumb + card wrapper pattern)
 *
 * Adaptations:
 * - stat cards: stripped (wallet page ใช้ balance card เดี่ยว full-width แทน stat grid)
 * - data fetching: getBalance + getTransactions จาก wallet.service (service-direct ไม่ self-HTTP)
 *   — pattern เดียวกับ orders/page.tsx ที่เรียก getOrdersByShop ตรง ๆ
 * - RSC boundary: createdAt → toISOString() ก่อนส่ง; transactions.slice(0,50)
 * - no-shop case: layout จัดการ auto-create shop แล้ว แต่ทำ null-guard เพิ่มป้องกัน type error
 * - RC-8: ไม่ log balance/transactions ใน RSC; ส่งเฉพาะ serializable payload ลง client
 * - low-balance warning > 0 && ≤ 10 (D2 spec OQ-9) — balance=0 ไม่นับเป็น low-balance
 * - hasError flag: service throw → ส่ง hasError=true ลง WalletCard แทนการ silent ฿0
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { authOptions } from '@/lib/auth'
import { requireActiveShop } from '@/lib/shop-context'
import { getTopUpsByShop } from '@/services/topup.service'
import { getBalance, getTransactions } from '@/services/wallet.service'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { shouldHidePayments } from '@/lib/app-shell-server'
import WalletCard from './components/WalletCard'
import TopUpRequestTable, { type TopUpRequestRow } from './components/TopUpRequestTable'
import WalletTransactionTable from './components/WalletTransactionTable'

export const metadata: Metadata = { title: 'กระเป๋าเงิน' }

// TransactionRow type — serializable (no Date object ข้าม RSC boundary)
export type TransactionRow = {
  id: string
  type: 'TOPUP' | 'DEDUCT'
  amount: number
  balanceAfter: number
  description: string | null
  refId: string | null
  createdAtISO: string
}

export default async function WalletPage() {
  const session = await getServerSession(authOptions)
  const user = (session as any)?.user
  // layout guard คือ primary redirect; null-return นี้เป็น fallback สำหรับ type safety
  if (!user?.id) return null

  // ดึง active shop (Personal หรือ Business ตาม session.activeShopId) — layout auto-create Personal ให้แล้ว
  // แต่ทำ try/catch กัน edge case; Business มี wallet แยกต่อ shop.id (คนละอันกับ billing package)
  let shop: { id: string } | null = null
  try {
    const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } })
    shop = active?.shop ?? null
  } catch {
    shop = null
  }

  /**
   * เปิดจากในแอป iOS → ต้องไม่มีช่องทางเติมเงินอยู่ในหน้านี้ (App Store Guideline 3.1.1)
   *
   * ยอดคงเหลือกับประวัติเงินเข้า-ออกยังแสดงตามปกติ — ตัดเฉพาะ "ทางจ่าย" (ปุ่มเติมเงิน
   * โมดัลอัปสลิป และตารางคำขอเติมเงิน) ดูเหตุผลเต็มที่ src/lib/app-shell.ts
   */
  const hidePayments = await shouldHidePayments()

  // no-shop case: balance = 0, transactions = [] — ตาม spec "no-shop → balance 0 + empty table"
  let balance = 0
  let transactions: TransactionRow[] = []
  // topUpRequests: ประวัติคำขอเติมเงินของ shop (รวม PENDING ที่รออนุมัติ)
  let topUpRequests: TopUpRequestRow[] = []
  // hasError: true เมื่อ service throw — ห้าม silent ฿0 ที่ทำให้ seller เข้าใจผิดว่ายอดเงินหาย
  let hasError = false

  if (shop) {
    try {
      // เรียก service layer ตรง ๆ (pattern เดียวกับ orders/page.tsx ที่เรียก getOrdersByShop โดยตรง)
      // ทำไมไม่ self-HTTP fetch: server→server HTTP ใน RSC ใช้ relative URL ไม่ได้ + ช้ากว่า
      // service call ตรง ๆ ไม่มี serialization overhead
      balance = await getBalance(shop.id)
      const raw = await getTransactions(shop.id, 50) // limit 50 ตาม spec
      // แปลง Date → ISO string ที่ RSC boundary; slice ป้องกัน payload เกิน
      transactions = raw.slice(0, 50).map((t) => ({
        id: t.id,
        type: t.type as 'TOPUP' | 'DEDUCT',
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
        description: t.description,
        refId: t.refId,
        // RC-8: ไม่ log ค่า; แปลง Date → string เพื่อ RSC serialization
        createdAtISO: t.createdAt instanceof Date
          ? t.createdAt.toISOString()
          : String(t.createdAt),
      }))
      // ดึง TopUpRequest ทั้งหมดของ shop (รวม PENDING ที่ยังรออนุมัติ)
      // S-C7: ใช้ shop.id จาก session (getShopByUserId ด้านบน) ไม่รับ param จาก client
      // RC-8: ไม่ log; ไม่ส่ง slipFileId ลง client; แปลง Date → ISO string
      const rawTopUps = await getTopUpsByShop(shop.id)
      topUpRequests = rawTopUps.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
        rejectedReason: r.rejectedReason,
        // RC-8: ไม่ expose slipFileId ใน payload (seller เห็นสถานะเท่านั้น)
        createdAtISO: r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
        reviewedAtISO: r.reviewedAt
          ? (r.reviewedAt instanceof Date
              ? r.reviewedAt.toISOString()
              : String(r.reviewedAt))
          : null,
      }))
    } catch {
      // service throw → บอก WalletCard ให้แสดง error banner ชัด ๆ
      // ไม่ silent ฿0 เพราะ seller อาจเข้าใจผิดว่ายอดเงินจริงหาย (financial trust issue)
      hasError = true
      balance = 0
      transactions = []
      topUpRequests = []
    }
  }

  // lowBalance: ยอดเงินเคยมีและกำลังจะหมด (> 0 && ≤ 10)
  // balance=0 ไม่นับ — seller ใหม่ที่ยังไม่เติมเงินไม่ควรเห็น warning "ยอดเงินเหลือน้อย"
  const lowBalance = balance > 0 && balance <= 10

  return (
    <>
      {/* Breadcrumb: Business → กระเป๋าเงิน (ตาม Design Spec) */}
      <PageBreadcrumb
        title="กระเป๋าเงิน"
        trail={[{ label: 'การขาย' }]}
      />

      {/* Balance card — full-width บนสุด (Controller decision 1 LOCKED) */}
      <div className="mb-6">
        <WalletCard
          balance={balance}
          lowBalance={lowBalance}
          hasError={hasError}
          hidePayments={hidePayments}
        />
      </div>

      {/* TopUpRequest section — วางระหว่าง balance card กับ ledger table */}
      {/* แยก section นี้ออกจาก "ประวัติรายการเงินเข้า-ออก" (WalletTransactionTable ด้านล่าง) */}
      {/* เหตุผล: ledger แสดงเฉพาะที่ approve แล้ว; section นี้แสดง PENDING ที่รออยู่ด้วย */}
      {/* 🛑 ซ่อนทั้ง section ในแอป iOS (Guideline 3.1.1): ตารางนี้คือ "คำขอเติมเงิน" พร้อม
          สถานะสลิป = เป็นส่วนหนึ่งของกระบวนการจ่ายเงินโดยตรง ไม่ใช่แค่ประวัติการใช้
          (ประวัติเงินเข้า-ออกที่เป็นบันทึกย้อนหลังล้วน ๆ ยังแสดงอยู่ด้านล่าง) */}
      {!hasError && !hidePayments && (
        <div className="mb-6">
          <TopUpRequestTable topups={topUpRequests} />
        </div>
      )}

      {/* Transaction table — แสดงเฉพาะเมื่อไม่มี error (error → ไม่แสดง table ปลอม) */}
      {!hasError && <WalletTransactionTable transactions={transactions} />}
    </>
  )
}
