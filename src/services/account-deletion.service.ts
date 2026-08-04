/**
 * account-deletion.service — ลบบัญชีผู้ใช้ (App Store Guideline 5.1.1(v))
 *
 * Spec: docs/superpowers/specs/2026-08-04-account-deletion-design.md
 *
 * โครงทั้งไฟล์มิเรอร์ src/services/business-shop.service.ts (soft-delete ของ Shop):
 *   softDeleteBusinessShop → deleteAccount        (ตั้ง deletedAt ทันที)
 *   purgeExpiredShops      → purgeExpiredAccounts (cron ล้างเมื่อพ้น retention)
 * ต่างกันตรงที่ purge ของ Shop เป็น tombstone เปล่า ๆ (แค่ตั้ง purgedAt) แต่ของ User ต้อง
 * "ล้าง PII จริง" ด้วย เพราะสิ่งที่ผู้ใช้ขอลบคือตัวตนของเขา ไม่ใช่แค่สถานะร้าน
 *
 * 🛑 ห้าม prisma.user.delete() เด็ดขาด — schema มี onDelete:Cascade 85 จุด การลบแถว User
 * จะลากออเดอร์/รีวิว/แชทของ "คู่ค้า" หายไปด้วย ซึ่งเป็นข้อมูลของคนอื่นที่เราไม่มีสิทธิ์ลบ
 * (เหตุผลเดียวกับ comment ที่ purgeExpiredShops บรรทัด 96-99)
 */

import { prisma } from '@/lib/prisma'
import { SHOP_DELETE_REASON } from '@/lib/business-package'
import {
  ACCOUNT_DELETE_REASON,
  ACCOUNT_DELETE_RETENTION_DAYS,
  BLOCKING_ORDER_STATUSES,
  PURGED_DISPLAY_NAME,
  purgedUsername,
  type DeletionBlocker,
  type DeletionPreflight,
  type DeletionWarning,
} from '@/lib/account-deletion'

/** error ที่ผู้เรียก (API route) แปลงเป็น HTTP status เอง — ไม่ throw string ดิบ */
export class AccountDeletionError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'AccountDeletionError'
  }
}

/**
 * จำนวนบัญชีที่ล้างต่อรอบ cron — คุมเวลาให้จบใน maxDuration 60 วิ
 * 500 แถว × ~30ms/transaction ≈ 15 วิ เผื่อ headroom เท่าตัว
 */
const PURGE_BATCH_SIZE = 500

/** P2002 = unique constraint ชน (Prisma known error) — เช็คแบบไม่ต้อง import Prisma namespace เข้ามาทั้งก้อน */
function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002'
}

/**
 * เทียบข้อความยืนยัน — trim + case-insensitive
 *
 * ทำไมไม่เทียบตรงตัว: ชื่อร้านภาษาอังกฤษพิมพ์ใหญ่เล็กไม่ตรงเป็นเรื่องปกติ และเป้าหมายของ
 * ขั้นตอนนี้คือ "กันกดพลาด" ไม่ใช่ "กันคนแปลกหน้า" (คนที่ยึด session ไปแล้วก็อ่านชื่อร้าน
 * บนหน้าจอได้อยู่ดี) การบังคับให้ตรงเป๊ะทุกตัวอักษรทำให้คนที่ตั้งใจลบจริงทำไม่สำเร็จ
 */
function matchesConfirm(input: string, expected: string): boolean {
  return input.trim().toLocaleLowerCase('th') === expected.trim().toLocaleLowerCase('th')
}

/**
 * checkAccountDeletable — preflight ก่อนลบ
 *
 * blockers = ต้องเคลียร์ก่อนถึงจะลบได้ · warnings = ลบได้ แต่ต้องรู้ว่าจะเสียอะไร
 *
 * confirmLabel = ชื่อที่แสดงของเจ้าของบัญชี — server เป็นคนตัดสินและส่งค่าที่ต้องพิมพ์กลับไป
 * ห้ามให้ client เดาเอง ไม่งั้นสองฝั่ง (ผู้ขาย/ผู้ซื้อ) จะคาดหวังคนละอย่างทั้งที่เป็นบัญชีใบเดียวกัน
 */
export async function checkAccountDeletable(userId: string): Promise<DeletionPreflight> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, deletedAt: true },
  })
  if (!user) throw new AccountDeletionError('NOT_FOUND')
  if (user.deletedAt) throw new AccountDeletionError('ALREADY_DELETED')

  // ร้านที่ผู้ใช้เป็น "เจ้าของ" (ไม่ใช่ร้านที่ถูกเชิญไปเป็นพนักงาน) และยังไม่ถูกลบ
  const ownedShops = await prisma.shop.findMany({
    where: { userId, deletedAt: null },
    // ดึงเฉพาะที่ใช้จริง — ไม่ต้องมี shopName แล้วตั้งแต่เลิกใช้ชื่อร้านเป็นข้อความยืนยัน
    select: {
      id: true,
      kind: true,
      wallet: { select: { balance: true } },
    },
  })
  const ownedShopIds = ownedShops.map((s) => s.id)

  const businessShopIds = ownedShops.filter((s) => s.kind === 'BUSINESS').map((s) => s.id)

  /**
   * นับออเดอร์ค้าง + พนักงาน พร้อมกัน — ทั้งคู่ขึ้นกับ ownedShopIds เท่านั้น ไม่ขึ้นแก่กัน
   * (เดิมเรียงกันทำให้ผู้ใช้รอ round-trip เกินจำเป็นตอนเปิดโมดัล ซึ่งเป็นจังหวะที่เขาจ้องหน้าจอรอ)
   *
   * order.count ใช้ index `Order_shopId_status_createdAt` ที่มีอยู่แล้ว (schema บรรทัด ~140)
   * — prefix (shopId, status) ตรงกับ where ทุกประการ ไม่ต้องเพิ่ม index ใหม่
   *
   * ข้าม query ที่ไม่จำเป็น: ไม่มีร้าน = ไม่ต้องนับออเดอร์, ไม่มีร้าน Business = ไม่ต้องนับพนักงาน
   * (ผู้ซื้อทั่วไปที่ไม่เคยเปิดร้านจึงเหลือ query เดียวคือ user + shops)
   */
  const [pendingOrders, memberCount, pendingPurchases] = await Promise.all([
    ownedShopIds.length > 0
      ? prisma.order.count({
          where: { shopId: { in: ownedShopIds }, status: { in: [...BLOCKING_ORDER_STATUSES] } },
        })
      : Promise.resolve(0),
    businessShopIds.length > 0
      ? prisma.shopMember.count({
          where: { shopId: { in: businessShopIds }, userId: { not: userId } },
        })
      : Promise.resolve(0),
    // ของที่ "สั่งซื้อไว้" แล้วยังไม่ได้รับ — คนละด้านกับ pendingOrders ข้างบน (นั่นคือของที่ต้องส่ง)
    // ไม่มี index (buyerUserId, status) โดยเฉพาะ แต่ Order.buyerUserId มี FK index อยู่แล้วและ
    // ผู้ซื้อหนึ่งคนมีออเดอร์หลักสิบ ไม่ใช่หลักแสน — filter status ในหน่วยความจำจึงไม่แพง
    prisma.order.count({
      where: { buyerUserId: userId, status: { in: [...BLOCKING_ORDER_STATUSES] } },
    }),
  ])

  // ── blockers ────────────────────────────────────────────────────────────────
  const blockers: DeletionBlocker[] = []

  // ออเดอร์ค้าง = ผู้ซื้ออาจโอนเงินแล้วแต่ยังไม่ได้ของ — ปล่อยให้ร้านหายตอนนี้คือทิ้งคู่ค้า
  if (pendingOrders > 0) {
    blockers.push({
      code: 'PENDING_ORDERS',
      count: pendingOrders,
      // ระบุจำนวนจริงเสมอ — Apple ยอมรับการบล็อกถ้าบอกชัดว่าต้องทำอะไรก่อน
      // ข้อความลอย ๆ ว่า "ลบไม่ได้" คือสิ่งที่ทำให้โดนตีกลับ
      message: `มีคำสั่งซื้อที่ยังไม่ปิด ${pendingOrders} รายการ — ต้องจัดส่งให้ครบหรือยกเลิกก่อนจึงจะลบบัญชีได้`,
      // ⚠️ เป็น path ของ "แอปผู้ขาย" เท่านั้น — ฝั่ง buyer (โดเมนหลัก) ห้าม render เป็นลิงก์
      // เพราะ /orders ที่นั่นคือออเดอร์ที่ผู้ใช้ซื้อ คนละหน้ากัน (ดู DeleteAccountSection.tsx)
      actionHref: '/orders',
      actionLabel: 'ไปที่คำสั่งซื้อ',
    })
  }

  // ── warnings ────────────────────────────────────────────────────────────────
  const warnings: DeletionWarning[] = []

  // เครดิต SMS เป็นเงินที่ผู้ขายจ่ายมาแล้ว — ไม่บล็อก (เป็นสิทธิ์เขาที่จะทิ้ง) แต่ต้องบอกก่อน
  const totalBalance = ownedShops.reduce((sum, s) => sum + (s.wallet?.balance ?? 0), 0)
  if (totalBalance > 0) {
    warnings.push({
      code: 'WALLET_BALANCE',
      message: `เครดิต SMS คงเหลือ ฿${totalBalance.toLocaleString('th-TH')} จะหายไปและขอคืนไม่ได้`,
    })
  }

  // พนักงานในร้าน Business ที่ผู้ใช้เป็นเจ้าของ — ไม่นับตัวเอง (owner มีแถว ShopMember ของตัวเองด้วย)
  if (memberCount > 0) {
    warnings.push({
      code: 'BUSINESS_MEMBERS',
      message: `พนักงาน ${memberCount} คนจะเข้าใช้งานร้านของคุณไม่ได้อีก`,
    })
  }

  // ของที่สั่งซื้อไว้แล้วยังไม่ได้รับ — เตือนอย่างเดียว ไม่บล็อก (ดูเหตุผลที่ type DeletionWarning)
  // ต้องบอกเพราะหลังลบบัญชีแล้วผู้ซื้อจะกดยืนยันรับของไม่ได้ และติดต่อร้านผ่านแชทไม่ได้อีก
  if (pendingPurchases > 0) {
    warnings.push({
      code: 'PENDING_PURCHASES',
      message: `คุณมีคำสั่งซื้อที่ยังไม่ได้รับของ ${pendingPurchases} รายการ — หลังลบบัญชีจะติดตามหรือยืนยันรับของไม่ได้อีก`,
    })
  }

  return {
    canDelete: blockers.length === 0,
    blockers,
    warnings,
    // ชื่อที่แสดงเสมอ ไม่ใช่ชื่อร้าน — ทั้งสอง surface เป็นหน้าของ "ตัวคน" (ดู DeletionPreflight)
    confirmLabel: user.displayName,
  }
}

/**
 * deleteAccount — จังหวะที่ 1: ปิดบัญชีทันที
 *
 * ทุกอย่างอยู่ใน transaction เดียว — ถ้าขั้นใดล้มต้องไม่เหลือสภาพครึ่ง ๆ กลาง ๆ
 * (เช่น ร้านถูกลบแล้วแต่บัญชียังล็อกอินได้ = ผู้ใช้เข้ามาเจอแอปที่ไม่มีร้านโดยไม่รู้สาเหตุ)
 *
 * 🛑 ตรวจ blockers ซ้ำที่นี่เสมอ ไม่เชื่อผลจาก GET ที่ client ถืออยู่ — ระหว่างที่โมดัลเปิดค้าง
 * อาจมีออเดอร์ใหม่เข้ามา (fail-closed)
 */
export async function deleteAccount(
  userId: string,
  confirmText: string,
): Promise<{ deletedAt: Date; purgeAt: Date }> {
  const preflight = await checkAccountDeletable(userId)

  if (!matchesConfirm(confirmText, preflight.confirmLabel)) {
    throw new AccountDeletionError('CONFIRM_MISMATCH')
  }
  if (!preflight.canDelete) {
    throw new AccountDeletionError('HAS_BLOCKERS')
  }

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    // 1) ปิดบัญชี — ตัวนี้ตัวเดียวที่ทำให้ล็อกอินไม่ได้ (lib/auth.ts ตรวจ deletedAt ทุก provider)
    //    updateMany + where deletedAt:null = optimistic guard กันกดซ้ำสองแท็บพร้อมกัน
    const updated = await tx.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: { deletedAt: now, deletedReason: ACCOUNT_DELETE_REASON.USER_DELETED },
    })
    if (updated.count === 0) throw new AccountDeletionError('ALREADY_DELETED')

    // 2) soft-delete ร้านที่เป็นเจ้าของทุกใบ — ใช้ SHOP_DELETE_REASON เดิม ไม่ตั้งค่าใหม่
    //    เพื่อให้ cron/หน้า admin ที่อ่านค่านี้อยู่แล้วไม่ต้องรู้จักเหตุผลเพิ่ม
    await tx.shop.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: now, deletedReason: SHOP_DELETE_REASON.OWNER_DELETED },
    })

    // 3) ถอน push token ทุกเครื่อง — ถ้าไม่ถอน เครื่องที่เคยล็อกอินจะยังได้ noti ของบัญชีที่ปิดไปแล้ว
    //    (เหตุผลเดียวกับ revokePushToken ใน SignOutCard แต่ที่นี่ถอนทุกเครื่อง ไม่ใช่แค่เครื่องปัจจุบัน)
    await tx.pushToken.deleteMany({ where: { userId } })

    // 4) ออกจากร้านที่ถูกเชิญไป — ร้านของคนอื่นต้องไม่ค้างสมาชิกที่ล็อกอินไม่ได้แล้ว
    //    (ทั้งร้านตัวเองและร้านคนอื่น: ร้านตัวเองถูก soft-delete ไปแล้วในขั้น 2 จึงไม่ต้องแยก)
    await tx.shopMember.deleteMany({ where: { userId } })
  })

  return {
    deletedAt: now,
    purgeAt: new Date(now.getTime() + ACCOUNT_DELETE_RETENTION_DAYS * 86_400_000),
  }
}

/**
 * purgeExpiredAccounts — จังหวะที่ 2: cron ล้าง PII เมื่อพ้น retention
 *
 * มิเรอร์ purgeExpiredShops (loop ทีละแถว + นับ error แยก ไม่ให้แถวเดียวล้มทั้ง batch)
 * ต่างตรงที่ต้อง "ล้างค่าจริง" ไม่ใช่แค่ตั้ง purgedAt เพราะสิ่งที่ผู้ใช้ขอลบคือตัวตนของเขา
 *
 * ล้างอะไร: displayName / username / phone / email / avatar / passwordHash + AuthAccount
 * เหลืออะไร: Order / Review / WalletTransaction / ChatMessage — ผูกกับ userId ที่ไม่มีตัวตนแล้ว
 *            ประวัติของคู่ค้าจึงไม่พัง (ผู้ซื้อยังเห็นออเดอร์ตัวเองครบ)
 *
 * ทำไมต้องคืน username/phone/email เป็นค่าว่าง: ทั้งสามเป็น @unique — ถ้าไม่ปล่อย
 * เบอร์เดิมจะสมัครใหม่ไม่ได้ตลอดกาล ซึ่งไม่ใช่สิ่งที่ผู้ใช้ขอเมื่อกด "ลบบัญชี"
 */
export async function purgeExpiredAccounts(): Promise<{
  processed: number
  purged: number
  errors: number
}> {
  const cutoff = new Date(Date.now() - ACCOUNT_DELETE_RETENTION_DAYS * 86_400_000)
  const expired = await prisma.user.findMany({
    where: { deletedAt: { not: null, lte: cutoff }, purgedAt: null },
    select: { id: true },
    // เพดานต่อรอบ — cron มี maxDuration 60 วิ และแต่ละแถวเป็น transaction ของตัวเอง
    // ถ้าวันไหนมีบัญชีครบกำหนดพร้อมกันเป็นหมื่น (เช่นหลัง incident) การไม่จำกัดจะทำให้ cron
    // ถูกตัดกลางคัน แถวที่เหลือจึงไม่ถูกแตะเลย. จำกัดไว้แล้วรอบถัดไปเก็บต่อ — เลื่อนออกไป
    // อย่างมาก 1 วัน ซึ่งอยู่ในวิสัยที่ยอมรับได้ ดีกว่าเสี่ยง timeout ทั้งรอบ
    take: PURGE_BATCH_SIZE,
    orderBy: { deletedAt: 'asc' }, // คิวแบบมาก่อนได้ก่อน — ไม่มีแถวไหนอดตลอดกาล
  })

  let purged = 0
  let errors = 0
  for (const { id } of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        // ตัดการเชื่อม Facebook/LINE/IG ถาวร — ไม่งั้น provider เดิมล็อกอินกลับเข้ามาเจอแถวเปล่า
        await tx.authAccount.deleteMany({ where: { userId: id } })
        await tx.user.update({
          where: { id },
          data: {
            displayName: PURGED_DISPLAY_NAME,
            username: purgedUsername(id),
            phone: null,
            email: null,
            avatar: null,
            passwordHash: null,
            purgedAt: new Date(),
          },
        })
      })
      purged += 1
    } catch (e) {
      /**
       * username ชนกัน (P2002) — purgedUsername ใช้ 8 ตัวแรกของ uuid ซึ่งชนกันได้ในทางทฤษฎี
       * ถ้าไม่จัดการ แถวนี้จะล้มซ้ำ "ทุกคืนตลอดไป" และ PII ไม่เคยถูกล้างเลย ซึ่งเป็นผลลัพธ์
       * ที่แย่ที่สุด (ผู้ใช้สั่งลบแล้วแต่ข้อมูลค้างถาวรเพราะเหตุผลทางเทคนิคที่เขาไม่รู้)
       * → retry ด้วย id เต็มซึ่ง unique แน่นอน
       */
      if (isUniqueViolation(e)) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.authAccount.deleteMany({ where: { userId: id } })
            await tx.user.update({
              where: { id },
              data: {
                displayName: PURGED_DISPLAY_NAME,
                username: `deleted_${id}`,
                phone: null,
                email: null,
                avatar: null,
                passwordHash: null,
                purgedAt: new Date(),
              },
            })
          })
          purged += 1
          continue
        } catch (retryErr) {
          errors += 1
          console.error(`[cron] purgeAccount retry userId=${id}`, retryErr)
          continue
        }
      }
      errors += 1
      // ห้าม log ค่า PII ใด ๆ — id อย่างเดียวพอสำหรับสอบสวนย้อนหลัง (RC-8)
      console.error(`[cron] purgeAccount userId=${id}`, e)
    }
  }

  return { processed: expired.length, purged, errors }
}
