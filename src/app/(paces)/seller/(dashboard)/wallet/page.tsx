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
import { getShopByUserId } from '@/services/shop.service'
import { getBalance, getTransactions } from '@/services/wallet.service'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import WalletCard from './components/WalletCard'
import WalletTransactionTable from './components/WalletTransactionTable'

export const metadata: Metadata = { title: 'เครดิต SMS' }

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

  // ดึง shop — layout auto-create ให้แล้ว แต่ทำ try/catch กัน edge case
  let shop: { id: string } | null = null
  try {
    shop = await getShopByUserId(user.id)
  } catch {
    shop = null
  }

  // no-shop case: balance = 0, transactions = [] — ตาม spec "no-shop → balance 0 + empty table"
  let balance = 0
  let transactions: TransactionRow[] = []
  // hasError: true เมื่อ service throw — ห้าม silent ฿0 ที่ทำให้ seller เข้าใจผิดว่าเครดิตหาย
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
    } catch {
      // service throw → บอก WalletCard ให้แสดง error banner ชัด ๆ
      // ไม่ silent ฿0 เพราะ seller อาจเข้าใจผิดว่าเครดิตจริงหาย (financial trust issue)
      hasError = true
      balance = 0
      transactions = []
    }
  }

  // lowBalance: เครดิตเคยมีและกำลังจะหมด (> 0 && ≤ 10)
  // balance=0 ไม่นับ — seller ใหม่ที่ยังไม่ซื้อเครดิตไม่ควรเห็น warning "เครดิตเหลือน้อย"
  const lowBalance = balance > 0 && balance <= 10

  return (
    <>
      {/* Breadcrumb: Business → เครดิต SMS (ตาม Design Spec) */}
      <PageBreadcrumb
        title="เครดิต SMS"
        trail={[{ label: 'Business' }]}
      />

      {/* Balance card — full-width บนสุด (Controller decision 1 LOCKED) */}
      <div className="mb-6">
        <WalletCard
          balance={balance}
          lowBalance={lowBalance}
          hasError={hasError}
        />
      </div>

      {/* Transaction table — แสดงเฉพาะเมื่อไม่มี error (error → ไม่แสดง table ปลอม) */}
      {!hasError && <WalletTransactionTable transactions={transactions} />}
    </>
  )
}
