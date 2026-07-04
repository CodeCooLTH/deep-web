/**
 * AdminSubscriptionRow — type + mapper สำหรับตาราง /admin/subscriptions
 *
 * Base: src/app/(paces)/admin/(dashboard)/users/components/data.ts (row-type pattern เดียวกัน)
 *
 * แยก mapping ออกจาก page.tsx เพื่อให้ test ง่าย (ตาม plan Task 4 §data.ts)
 */

import { formatDate } from '@/lib/format-date'

export type AdminSubscriptionRow = {
  shopId: string
  shopName: string
  kind: 'PERSONAL' | 'BUSINESS'
  logo: string | null
  ownerName: string
  ownerUsername: string
  ownerProfileUrl: string // absolute URL ไปหน้า /u/{username} บน buyer domain (resolve โดย caller)
  stockStatus: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'
  stockPackage: 'BASIC' | 'PRO' | null
  stockRenewalTh: string // formatDate | '—'
  bizTier: 'GROWTH' | 'PRO' | 'BUSINESS' | null
  bizStatus: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED_RENEWAL_FAILED'
  bizRenewalTh: string // formatDate | '—' (Change Log 2026-07-04 #2 — เพิ่มใหม่ เพื่อ symmetry กับ stockRenewalTh)
  walletBalance: number
}

// input = shop row จาก prisma query ใน page.tsx (select ตรงกับ shape นี้ — ไม่ดึง phone/email เจ้าของ, S-15)
//
// resolveProfileUrl: รับมาจาก caller (page.tsx) แทนที่จะ hardcode "/u/{username}" ในนี้ — เพราะ admin
// รันบน subdomain admin.<host> ที่ไม่ serve /u/* ตรง ๆ (เหมือน admin/users/page.tsx resolveProfileUrl:
// ต้อง resolve เป็น absolute URL ไปยัง buyer domain มิฉะนั้นคลิกแล้ว 404). แยก param ออกจาก mapper
// เพื่อให้ mapper ยัง pure/testable ตาม intent ของ plan (data.ts แยกจาก page เพื่อ test ง่าย)
export function toAdminSubscriptionRow(
  s: {
    id: string
    shopName: string
    kind: string
    logo: string | null
    wallet: { balance: number } | null
    inventoryEntitlement: { status: string; package: string | null; nextRenewalAt: Date | null } | null
    user: {
      displayName: string
      username: string
      businessPackageSubscription: { tier: string; status: string; nextRenewalAt: Date | null } | null
    }
  },
  resolveProfileUrl: (username: string) => string,
): AdminSubscriptionRow {
  const ent = s.inventoryEntitlement
  const biz = s.user.businessPackageSubscription
  return {
    shopId: s.id,
    shopName: s.shopName,
    kind: s.kind as 'PERSONAL' | 'BUSINESS',
    logo: s.logo,
    ownerName: s.user.displayName,
    ownerUsername: s.user.username,
    ownerProfileUrl: resolveProfileUrl(s.user.username),
    stockStatus: (ent?.status ?? 'NOT_SUBSCRIBED') as AdminSubscriptionRow['stockStatus'],
    stockPackage: (ent?.package ?? null) as 'BASIC' | 'PRO' | null,
    stockRenewalTh: ent?.nextRenewalAt ? formatDate(ent.nextRenewalAt) : '—',
    bizTier: (biz?.tier ?? null) as AdminSubscriptionRow['bizTier'],
    bizStatus: (biz ? biz.status : 'NOT_SUBSCRIBED') as AdminSubscriptionRow['bizStatus'],
    bizRenewalTh: biz?.nextRenewalAt ? formatDate(biz.nextRenewalAt) : '—',
    walletBalance: s.wallet?.balance ?? 0,
  }
}
