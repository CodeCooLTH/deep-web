import { Prisma } from '@prisma/client'

/**
 * findOrCreateCustomer (feat 00014) — dedup ลูกค้าด้วย phone (unique global) → คืน customerId.
 * เจอ = ใช้ id เดิม (cross-shop identity); ไม่เจอ = สร้างใหม่. P2002-safe (concurrent create race → re-find).
 * ⚠️ phone ต้อง normalize (src/lib/phone.ts) มาก่อนเสมอ. เรียกใน $transaction (ใช้ tx เดียวกับ order.create).
 */
export async function findOrCreateCustomer(
  tx: Prisma.TransactionClient,
  phone: string,
): Promise<string> {
  const existing = await tx.customer.findUnique({ where: { phone }, select: { id: true } })
  if (existing) return existing.id
  try {
    const created = await tx.customer.create({ data: { phone }, select: { id: true } })
    return created.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await tx.customer.findUnique({ where: { phone }, select: { id: true } })
      if (again) return again.id
    }
    throw e
  }
}
