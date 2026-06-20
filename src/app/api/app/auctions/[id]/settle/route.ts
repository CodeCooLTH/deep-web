import { NextRequest, NextResponse } from 'next/server'
import { settleAuction } from '@/services/auction.service'

// POST /api/app/auctions/[id]/settle — ปิดประมูล + ออก order ให้ผู้ชนะ (ถ้าหมดเวลาแล้ว)
// ใช้สำหรับ cron/manual; ปกติระบบ settle อัตโนมัติตอน browse/orders อยู่แล้ว (lazy).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await settleAuction(id)
  return NextResponse.json(result)
}
