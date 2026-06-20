import { NextResponse } from 'next/server'
import { listCategories } from '@/services/auction.service'

// GET /api/app/categories — หมวดหมู่ที่มีจริงในรายการประมูล (public)
export async function GET() {
  return NextResponse.json(await listCategories())
}
