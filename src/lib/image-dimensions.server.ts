import sharp from 'sharp'

import { normalizeImageSize, type ImageSize } from './image-dimensions'
import { prisma } from './prisma'

/**
 * image-dimensions.server — อ่าน/บันทึกขนาดรูป (M3) · **server เท่านั้น** (sharp เป็น native)
 * แยกจาก image-dimensions.ts เพราะไฟล์นั้นถูก import ฝั่ง client
 */

/** ไม่ใช่รูป/อ่านไม่ได้ = null ห้าม throw */
export async function readImageSize(buffer: Buffer | ArrayBuffer): Promise<ImageSize | null> {
  try {
    const meta = await sharp(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)).metadata()
    return normalizeImageSize(meta)
  } catch {
    return null
  }
}

/**
 * best-effort — ล้มเงียบ ห้ามทำให้ mirror/upload ล้ม (ไม่มีขนาด = แค่จองที่ไม่ได้ ไม่ใช่ข้อมูลเสีย)
 */
export async function recordImageSize(fileId: string, buffer: Buffer | ArrayBuffer): Promise<void> {
  try {
    const size = await readImageSize(buffer)
    if (!size) return
    await prisma.mediaImageSize.upsert({
      where: { fileId },
      create: { fileId, ...size },
      update: size,
    })
  } catch (e) {
    console.warn('[recordImageSize] ล้มเหลว', fileId, e)
  }
}
