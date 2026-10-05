/**
 * SampleBubble — พรีวิวตัวอย่างข้อความของหน้าว่าง/หน้าล็อก (ยังไม่มีร้านที่เลือก → ใช้ร้านตัวอย่างคงที่) · RSC
 *
 * สร้างจาก builder จริง (`buildSummaryReportFlex`) + ข้อมูลคงที่ใน `preview-sample` → ข้อความตรงกับที่บอทส่งจริงเสมอ
 * `now` มาจาก server (page) — ไม่อ่านนาฬิกาที่นี่ · ไม่เรียก `fitToLimits` (ใช้ Buffer — ตัวอย่างเล็กไม่ต้องตัด)
 */
import { buildSummaryReportFlex } from '@/lib/line/flex-summary-report'
import { todayThaiIsoDate } from '@/lib/date-range'
import { buildStaticSampleSummary } from '@/lib/line-report/preview-sample'
import FlexBubbleView from './FlexBubbleView'

export default function SampleBubble({ now }: { now: Date }) {
  const summary = buildStaticSampleSummary(todayThaiIsoDate(now), now.toISOString())
  const [message] = buildSummaryReportFlex({ summary, kind: 'DAILY', flags: { showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false } })
  return (
    <div>
      <p className="text-default-700 mb-2 text-center text-xs">ตัวอย่างข้อความที่จะไปโผล่ในกลุ่ม</p>
      <FlexBubbleView contents={message.contents} />
    </div>
  )
}
