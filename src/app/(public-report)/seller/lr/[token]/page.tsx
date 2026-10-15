// Base: theme/paces/Admin/TS/src/app/error/404/page.tsx (state เต็มหน้า) · ส่วนรายงานดู components/ReportView.tsx
import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { getSnapshotView } from '@/services/line-report-snapshot.service'
import ReportView from './components/ReportView'
import StateCard from './components/StateCard'
import { expiryDayText } from './components/view-model'

// cache() ให้ generateMetadata กับ page อ่านฐานครั้งเดียวต่อ request (ไม่นับโควตา/ไม่ query ซ้ำ)
const load = cache((token: string) => getSnapshotView(token))

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const view = await load(token)
  // ไม่ใส่ข้อมูลร้าน/ลูกค้าใน <title> เมื่อไม่ใช่ OK
  return { title: view.kind === 'OK' ? `สรุปรายละเอียด · ${view.snapshot.title}` : 'สรุปรายละเอียด' }
}

export default async function LinkReportPage({ params }: Props) {
  await connection() // ห้าม cache ทั้งหน้า — หมดอายุ/ถูกถอนต้องมีผลทันที
  const { token } = await params
  const view = await load(token)

  if (view.kind === 'NOT_FOUND') notFound()

  if (view.kind === 'EXPIRED') {
    const cmd = view.reportKind === 'MONTHLY' ? 'สรุปเดือนนี้' : 'สรุปวันนี้'
    return (
      <StateCard
        icon="history"
        title="ลิงก์สรุปนี้หมดอายุแล้ว"
        body={`ลิงก์ใช้ได้ถึงสิ้นวันที่ ${expiryDayText(view.expiresAt)} เพื่อไม่ให้ข้อมูลลูกค้าค้างอยู่นาน`}
        box={`พิมพ์ “${cmd}” ในกลุ่ม LINE เพื่อรับสรุปใหม่ แล้วกดปุ่มบนการ์ดอีกครั้ง`}
      />
    )
  }

  return <ReportView snapshot={view.snapshot} />
}
