/**
 * activity.service.ts — getRecentActivity สำหรับ Command Center V3 (S-12)
 *
 * ทำไม: Prisma ไม่รองรับ SQL UNION → query 4 source แยกกัน แล้ว merge + sort ใน JS
 * ทำไม: buyerPhone mask ที่ service layer (RSC PII neutralize-at-source rule)
 *       ห้ามส่ง raw phone ผ่าน RSC boundary ไม่ว่าจะเป็น ActivityItem หรือ prop ใดก็ตาม
 *
 * Re-home: type ActivityItem ย้ายจาก _constants/command-center.ts มาที่นี่ (T6 re-home spec)
 *          _constants import type จากที่นี่แทน
 */

import { prisma } from '@/lib/prisma'
import { maskPhone } from '@/lib/phone-mask'
import { getTransactions } from '@/services/wallet.service'

// ─── Type ─────────────────────────────────────────────────────────────────────
// NOTE: type นี้เป็น source of truth หลังจาก T6 re-home
// _constants/command-center.ts import type จากที่นี่
export type ActivityItem = {
  type: 'ORDER_CREATED' | 'ORDER_CONFIRMED' | 'SMS_SENT' | 'REVIEW_RECEIVED' | 'TOPUP'
  label: string  // Thai copy, PII masked แล้วก่อนส่งออก
  at: Date
  href?: string  // short path (/orders/[token]) ถ้ามี; ไม่มี /seller prefix ตาม Paces convention
}

// ─── maskBuyerPhone ───────────────────────────────────────────────────────────
// ทำไม: SmsCode.buyerPhone เก็บเป็น raw phone string; ต้อง mask ก่อนเข้า label
// reuse maskPhone จาก lib/phone-mask (format: 081-xxx-5678)
// ถ้า phone ไม่ใช่ 10 หลัก maskPhone คืน '***' (fail-safe ไม่ throw)
function maskBuyerPhone(phone: string): string {
  return maskPhone(phone)
}

// ─── getRecentActivity ────────────────────────────────────────────────────────
/**
 * Aggregate activity จาก 4 source (Order, SmsCode, Review, WalletTransaction)
 * merge → sort desc by at → slice take
 *
 * ครอบ try/catch รอบนอกทั้งหมด → คืน [] ถ้า error ใดก็ตาม
 * เพื่อไม่ให้ Command Center crash เมื่อ fetch ล้ม
 *
 * @param shopId  - Shop.id ที่ resolve จาก server (ไม่ใช่ user input — กัน IDOR)
 * @param take    - จำนวน item สูงสุดที่คืน (default 10)
 */
export async function getRecentActivity(shopId: string, take = 10): Promise<ActivityItem[]> {
  try {
    // ─── Source 1: Orders ──────────────────────────────────────────────────
    // query แยก take รายการล่าสุด เพื่อกัน payload ใหญ่เกิน
    const orders = await prisma.order.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        publicToken: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // ORDER_CREATED: ทุก order 1 item
    // ORDER_CONFIRMED: เฉพาะ order ที่ status=CONFIRMED เพิ่มอีก 1 item (at=updatedAt)
    const orderItems: ActivityItem[] = []
    for (const o of orders) {
      // label ใช้ 8 char แรกของ publicToken เพื่อให้ seller จำได้ (UUID สั้น)
      const shortToken = o.publicToken.slice(0, 8).toUpperCase()
      orderItems.push({
        type: 'ORDER_CREATED',
        label: `สร้างคำสั่งซื้อ ${shortToken}`,
        at: o.createdAt,
        href: `/orders/${o.publicToken}`,
      })
      if (o.status === 'CONFIRMED') {
        orderItems.push({
          type: 'ORDER_CONFIRMED',
          label: `ผู้ซื้อยืนยัน ${shortToken}`,
          // updatedAt น่าเชื่อถือกว่า createdAt สำหรับ CONFIRMED event
          at: o.updatedAt,
          href: `/orders/${o.publicToken}`,
        })
      }
    }

    // ─── Source 2: SmsCode ─────────────────────────────────────────────────
    // ทำไม: where ผ่าน relation order.shopId — scoped ด้วย shopId เสมอ (กัน cross-shop leak)
    const smsCodes = await prisma.smsCode.findMany({
      where: { order: { shopId } },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        createdAt: true,
        buyerPhone: true,
      },
    })

    const smsItems: ActivityItem[] = smsCodes.map((s) => ({
      type: 'SMS_SENT',
      // mask buyerPhone ก่อนใส่ label เสมอ — ห้ามส่ง raw phone เข้า ActivityItem
      label: `ส่ง SMS ลิงก์ ${maskBuyerPhone(s.buyerPhone)}`,
      at: s.createdAt,
    }))

    // ─── Source 3: Reviews ─────────────────────────────────────────────────
    // query โดยตรงผ่าน relation Order.shopId แทน getReviewsByShopUser(userId)
    // เหตุผล: service รับ shopId ไม่ใช่ userId; avoid extra query หา userId ก่อน
    // pattern เดียวกับ getReviewsByShopUser แต่ใช้ shopId (ดู review.service.ts L66)
    const reviews = await prisma.review.findMany({
      where: { order: { shopId } },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        rating: true,
        createdAt: true,
      },
    })

    const reviewItems: ActivityItem[] = reviews.map((r) => ({
      type: 'REVIEW_RECEIVED',
      label: `ได้รับรีวิว ${r.rating} ดาว`,
      at: r.createdAt,
    }))

    // ─── Source 4: WalletTransaction (TOPUP only) ──────────────────────────
    // reuse getTransactions จาก wallet.service — คืน [] ถ้าไม่มี wallet
    const transactions = await getTransactions(shopId, take)
    const topupItems: ActivityItem[] = transactions
      .filter((t) => t.type === 'TOPUP')
      .map((t) => ({
        type: 'TOPUP',
        label: `เติมเครดิต SMS ฿${t.amount}`,
        at: t.createdAt,
      }))

    // ─── Merge + sort + slice ──────────────────────────────────────────────
    const all: ActivityItem[] = [
      ...orderItems,
      ...smsItems,
      ...reviewItems,
      ...topupItems,
    ]

    // sort desc by at (ใหม่สุดก่อน)
    all.sort((a, b) => b.at.getTime() - a.at.getTime())

    return all.slice(0, take)
  } catch (err) {
    // ไม่ throw ไม่ block render — Command Center แสดง empty state แทน crash
    console.error('[activity.service] getRecentActivity failed', err)
    return []
  }
}
