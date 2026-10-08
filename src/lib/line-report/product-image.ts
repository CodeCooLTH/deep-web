/**
 * รูปสินค้าในรายงาน LINE (Top 3) — server-only
 *
 * LINE ดึงรูปเองจาก URL https สาธารณะ และรับแค่ JPEG/PNG แต่รูปสินค้าในระบบมีทั้ง webp/gif
 * → ส่งผ่าน `/api/line-report/product-image` ที่แปลงเป็น JPEG เล็ก
 * 🛑 ลายเซ็น HMAC บังคับ: route นี้อ่านไฟล์จาก storage ตรง ๆ ไม่ผ่านด่านสิทธิ์ของ /api/files
 * (KYC/สลิป/เอกสารแชท) — ไม่มีลายเซ็นจะกลายเป็นช่องอ่านไฟล์ใดก็ได้ ลายเซ็นออกให้เฉพาะคีย์รูปสินค้าที่ service ดึงจาก Product.images
 * URL คงที่ต่อคีย์ (ไม่มีเวลาหมดอายุ) — retry ต้องส่ง payload เดิมทุกไบต์
 */
import crypto from 'crypto'

const sign = (key: string, secret: string) => crypto.createHmac('sha256', secret).update(`line-report-img:${key}`).digest('base64url').slice(0, 22)

/** คีย์ในบัคเก็ตเท่านั้น (URL ภายนอก/พาธในเว็บ = ไม่มีรูป — ponytail: proxy รูปภายนอกเมื่อมีร้านใช้จริง) */
const isBucketKey = (k: string) => !k.startsWith('http') && !k.startsWith('/') && !k.includes('..') && /^[\w\-./]+$/.test(k)

export function lineProductImageUrl(key: string | undefined): string | undefined {
  const base = process.env.NEXT_PUBLIC_SELLER_URL
  const secret = process.env.NEXTAUTH_SECRET
  if (!key || !base || !secret || !isBucketKey(key)) return undefined
  return `${base}/api/line-report/product-image?k=${encodeURIComponent(key)}&s=${sign(key, secret)}`
}

export function verifyProductImageSig(key: string, sig: string): boolean {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret || !isBucketKey(key)) return false
  const want = Buffer.from(sign(key, secret))
  const got = Buffer.from(sig)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}
