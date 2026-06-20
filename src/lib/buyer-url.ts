/**
 * buyer-url.ts — canonical helper สำหรับ resolve buyer base URL
 *
 * ใช้ใน client component ที่ต้องสร้าง URL ผู้ซื้อ (CopyLinkButton, OrderCopyLink, OrderCard ฯลฯ)
 * เหตุผลที่รวมไว้ที่นี่: ก่อนหน้ามี 3 สำเนา (OrderCopyLink, OrderCard, CustomerTable)
 * ทำให้ logic drift ได้ — ย้ายมาที่เดียวเพื่อ single source of truth
 *
 * ลำดับ resolve:
 * 1. env NEXT_PUBLIC_BUYER_URL (เซ็ตใน .env.local dev หรือ .env.production)
 * 2. strip "seller." prefix จาก window.location.host (runtime — ใช้ได้ทั้ง dev/prod subdomain)
 * 3. fallback prod domain "https://deepthailand.app"
 *
 * ผล dev: seller.deepth.local:4000 → deepth.local:4000 → /o/{token} = deepth.local:4000/o/{token}
 * ผล prod: seller.deepthailand.app → deepthailand.app → /o/{token} = deepthailand.app/o/{token}
 */

'use client'

export function resolveBuyerBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_BUYER_URL
  // .trim() กัน env ที่มี trailing newline/space (กัน URL พังกลางทาง); ตัด trailing slash ซ้ำ
  if (envUrl) return envUrl.trim().replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location
    // Seller อยู่บน `seller.<buyerHost>` — ตัด prefix ออกเพื่อได้ buyer domain
    const buyerHost = host.replace(/^seller\./, '')
    return `${protocol}//${buyerHost}`
  }
  return 'https://deepthailand.app'
}
