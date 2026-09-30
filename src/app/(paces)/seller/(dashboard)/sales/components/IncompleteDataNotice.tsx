'use client'

/**
 * IncompleteDataNotice — ป้ายเตือน + ทางลัดไปเติมข้อมูล เมื่อกำไรที่แสดงยังไม่ใช่กำไรจริง
 * (feature 00067 FR-FIN-10/11)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts (โครง .alert ของ Paces)
 *   ผ่าน precedent ในรีโป: expenses/components/ExpenseLockedCard.tsx (การ์ดที่อธิบาย + พาไปทำต่อ)
 *
 * 🛑 **นี่คือส่วนที่สำคัญที่สุดของทั้งฟีเจอร์** — ร้านบริการไม่มีต้นทุนสินค้าโดยธรรมชาติและถูกล็อก
 * ไม่ให้มีค่าส่ง ถ้าไม่มีทั้งราคาทุนและรายการค่าใช้จ่าย **กำไรจะเท่ากับยอดขายเป๊ะทุกบาท**
 * ซึ่งเป็นเหตุผลที่ทีมถอดคำว่า "กำไร/ขาดทุน" ออกจากหน้านี้ไปเมื่อ 2026-08-23
 * (ดู SalesChartSheet.tsx หัวไฟล์ v9 ข้อ 1) — การ์ดนี้คือเงื่อนไขที่ทำให้เอาคำนั้นกลับมาได้
 */
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { shouldOfferCostSetup, shouldOfferExpenseSetup, type DataCompleteness } from '@/lib/finance-tabs'

type Props = {
  completeness: DataCompleteness
  /** คำเรียกต้นทุนของประเภทกิจการนี้ — ORDER_VOCAB[vertical].costNoun */
  costNoun: string
  /** ลิงก์ไปหน้ารายการสินค้า/บริการ ที่กรองเฉพาะรายการที่ยังไม่ตั้งราคาทุนแล้ว */
  costSetupHref: string
  /** ลิงก์ไปแท็บค่าใช้จ่ายพร้อมเปิดฟอร์มบันทึก */
  expenseSetupHref: string
}

export default function IncompleteDataNotice({
  completeness,
  costNoun,
  costSetupHref,
  expenseSetupHref,
}: Props) {
  if (completeness.complete) return null

  const offerCost = shouldOfferCostSetup(completeness)
  const offerExpense = shouldOfferExpenseSetup(completeness)

  return (
    <div className="card mb-1.25">
      <div className="card-body">
        <div className="badge bg-warning/15 text-warning-ink mb-3 gap-1.5">
          <Icon icon="alert-triangle" className="text-sm" aria-hidden="true" />
          ตัวเลขนี้ยังไม่ใช่กำไรจริง
        </div>

        <p className="text-default-700 mb-4 text-sm leading-relaxed">
          ยังไม่ได้หักครบทุกอย่าง กำไรที่แสดงจึงเป็น <strong>เพดานบน</strong> — ตัวเลขจริงจะน้อยกว่านี้เสมอ
          {completeness.missingCost && completeness.missingExpense
            ? ' เพราะยังไม่ได้ตั้งราคาทุนและยังไม่ได้บันทึกค่าใช้จ่ายเลย'
            : completeness.missingCost
              ? ` เพราะยังมีรายการที่ยังไม่ได้ตั้ง${costNoun}`
              : ' เพราะยังไม่มีรายการค่าใช้จ่ายของร้านในช่วงนี้'}
        </p>

        {/* สรุปว่าตอนนี้หักอะไรไปแล้วบ้าง — ตอบคำถาม "แล้วมันขาดตรงไหน" โดยไม่ต้องเดา */}
        <ul className="border-default-200 mb-4 divide-y divide-dashed rounded border border-dashed">
          <li className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-default-700">{costNoun}</span>
            <span className={completeness.missingCost ? 'text-warning-ink font-medium' : 'text-default-800'}>
              {completeness.missingCost ? 'ยังไม่ครบ' : 'หักแล้ว'}
            </span>
          </li>
          <li className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-default-700">ค่าใช้จ่ายร้าน</span>
            <span className={completeness.missingExpense ? 'text-warning-ink font-medium' : 'text-default-800'}>
              {completeness.missingExpense ? 'ยังไม่มีรายการ' : 'หักแล้ว'}
            </span>
          </li>
        </ul>

        {(offerCost || offerExpense) && (
          <div className="flex flex-col gap-2">
            {offerCost && (
              <Link
                href={costSetupHref}
                className="border-default-200 hover:border-primary flex min-h-11 items-center gap-3 rounded border px-4 py-2.5"
              >
                <span className="bg-primary/15 flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon icon="box" className="text-primary-ink text-lg" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-default-800 block text-sm font-medium">ตั้งราคาทุน</span>
                  <span className="text-default-700 block text-xs">
                    ยังไม่ได้ตั้ง {completeness.uncostedItemCount} จาก {completeness.soldItemCount} รายการที่ขายในช่วงนี้
                  </span>
                </span>
                <Icon icon="chevron-right" className="text-default-400 shrink-0 text-base" aria-hidden="true" />
              </Link>
            )}

            {offerExpense && (
              <Link
                href={expenseSetupHref}
                className="border-default-200 hover:border-primary flex min-h-11 items-center gap-3 rounded border px-4 py-2.5"
              >
                <span className="bg-danger/15 flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon icon="receipt" className="text-danger-ink text-lg" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-default-800 block text-sm font-medium">บันทึกค่าใช้จ่ายของร้าน</span>
                  <span className="text-default-700 block text-xs">ค่าเช่า ค่าจ้าง โฆษณา ค่าน้ำ-ค่าไฟ</span>
                </span>
                <Icon icon="chevron-right" className="text-default-400 shrink-0 text-base" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
