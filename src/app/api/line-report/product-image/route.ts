import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { getFile } from '@/lib/storage'
import { verifyProductImageSig } from '@/lib/line-report/product-image'

/** รูปสินค้า Top 3 ในรายงาน LINE → JPEG 160px (LINE รับแค่ JPEG/PNG) · ต้องมีลายเซ็น — ดู lib/line-report/product-image.ts */
export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k') ?? ''
  const s = req.nextUrl.searchParams.get('s') ?? ''
  if (!verifyProductImageSig(k, s)) return new NextResponse(null, { status: 404 })
  const file = await getFile(k)
  if (!file) return new NextResponse(null, { status: 404 })
  try {
    const jpg = await sharp(file.buffer, { animated: false }).rotate().resize(160, 160, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer()
    return new NextResponse(new Uint8Array(jpg), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
