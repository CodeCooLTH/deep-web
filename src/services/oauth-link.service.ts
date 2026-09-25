/**
 * oauth-link.service — ผูกบัญชีของผู้ให้บริการภายนอกเข้ากับบัญชี Deep ที่มีอยู่แล้ว
 *
 * ## ทำไมสกัดออกมา (2026-09-25 · feature 00040 ภาคผนวก 7)
 *
 * ตรรกะนี้เคยอยู่ใน `signIn` callback ของ `lib/auth.ts` ที่เดียว — พอ Apple สั่งให้แอป iOS
 * ใช้ **แผ่นของระบบ** แทนหน้าเว็บ (Guideline 4 · ตีกลับ 2026-09-24) ก็มีผู้เรียกรายที่สอง
 * คือ `POST /api/account/link/apple-native` ซึ่งไม่ได้เดินผ่าน OAuth callback เลย
 *
 * 🛑 **ห้ามก็อปไปเขียนซ้ำ** (Hard Rule 16): เกณฑ์ตัดสินว่า "ยึดคืนได้ไหม" กับ "ใครถือ id นี้อยู่"
 * เป็นเรื่องที่ตัดสินผิดแล้วลบร้านที่มีออเดอร์จริงของคนอื่นได้ · สองก้อนที่ drift กันจะไม่มี
 * gate ไหนฟ้อง เพราะทั้งคู่เป็นโค้ดที่ "ถูก" ในตัวเอง
 *
 * ## ผลลัพธ์เป็นชนิดข้อมูล ไม่ใช่ URL
 *
 * ผู้เรียกสองรายต้องการคนละรูป: `signIn` callback ต้องคืน **สตริง URL** ให้ next-auth
 * ส่วน endpoint ต้องคืน **JSON** ให้หน้าจอ ⇒ คืนผลเป็นชนิดข้อมูล แล้วให้ `linkOutcomeRedirect`
 * เป็นที่เดียวที่รู้ว่าปลายทางหน้าตายังไง (ไม่งั้นสตริง `/account?...` จะกระจายสองที่)
 */
import { classifyLinkConflict } from '@/lib/link-conflict'
import type { LinkOutcome, OAuthProviderEnum } from '@/lib/oauth-link-outcome'
import { signReclaimTicket } from '@/lib/link-intent'
import { prisma } from '@/lib/prisma'

export { linkOutcomeRedirect } from '@/lib/oauth-link-outcome'
export type { LinkOutcome, OAuthProviderEnum } from '@/lib/oauth-link-outcome'

/**
 * ผูก `providerAccountId` เข้ากับ `userId` — ตรวจว่าใครถืออยู่ก่อนเสมอ
 *
 * @param accessToken เก็บไว้เฉพาะ provider ที่มีให้ (Apple ทาง native ไม่มี — ส่ง `null` ได้)
 */
export async function linkOAuthAccount(input: {
  userId: string
  provider: OAuthProviderEnum
  providerAccountId: string
  accessToken?: string | null
}): Promise<LinkOutcome> {
  const { userId, provider, providerAccountId } = input

  const existing = await prisma.authAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { userId: true },
  })

  if (existing) {
    /* ผูกไว้แล้วกับบัญชีนี้เอง → idempotent ผ่าน */
    if (existing.userId === userId) return { kind: 'already-linked' }

    /**
     * มีคนถืออยู่แล้ว — **"ใครถือ" สำคัญกว่า "ถืออยู่ไหม"**
     *
     * เดิมตอบ `taken` ทุกกรณี ซึ่งสร้างทางตันถาวรบน prod (2026-08-15): ผู้ใช้กดปุ่ม Apple
     * ที่หน้าล็อกอินโดยไม่ตั้งใจ (Face ID ผ่านให้ในวินาทีเดียว) ได้บัญชีค้างที่ไม่มีเบอร์
     * ⇒ ถอดการเชื่อมไม่ได้ · ใส่เบอร์ไม่ได้ · ลบบัญชีเองไม่ได้ · เอาไปเชื่อมบัญชีจริงไม่ได้
     * ⇒ **Apple ID นั้นใช้กับ Deep ไม่ได้อีกเลยตลอดกาล**
     *
     * เกณฑ์ตัดสินอยู่ใน `classifyLinkConflict()` (ฟังก์ชันบริสุทธิ์ + เทส [blocker] +
     * พิสูจน์ด้วย mutation) — **ห้ามย้ายตรรกะนั้นกลับมาเขียนสดตรงนี้**
     */
    const holder = await prisma.user.findUnique({
      where: { id: existing.userId },
      select: {
        deletedAt: true,
        phone: true,
        passwordHash: true,
        _count: { select: { shopMemberships: true } },
        shops: { where: { deletedAt: null }, select: { slug: true, _count: { select: { orders: true } } } },
        authAccounts: { where: { provider: { not: provider } }, select: { id: true } },
      },
    })

    /* หา user ไม่เจอทั้งที่ AuthAccount ชี้อยู่ = ข้อมูลไม่สอดคล้อง → fail-closed */
    if (!holder) return { kind: 'taken' }

    const verdict = classifyLinkConflict({
      deletedAt: holder.deletedAt,
      phone: holder.phone,
      passwordHash: holder.passwordHash,
      completedShopCount: holder.shops.filter((s) => s.slug !== null).length,
      orderCount: holder.shops.reduce((n, s) => n + s._count.orders, 0),
      shopMemberCount: holder._count.shopMemberships,
      otherAuthAccountCount: holder.authAccounts.length,
    })

    if (verdict === 'BLOCKED') return { kind: 'taken' }

    /**
     * ตั๋วต้องเซ็น ไม่ใช่ส่ง `providerAccountId` เปล่า ๆ ใน URL — ไม่งั้นใครก็ยิง endpoint
     * ด้วย id ของคนอื่นเพื่อยึดบัญชีค้างของเขาได้ · และตั๋วผูกกับ `userId` ผู้ขอ
     * ⇒ ต่อให้ตั๋วหลุด คนอื่นเอาไปใช้ไม่ได้เพราะ session ไม่ตรง
     */
    return {
      kind: 'reclaimable',
      ticket: signReclaimTicket({
        userId,
        provider: provider.toLowerCase(),
        providerAccountId,
        holderUserId: existing.userId,
      }),
    }
  }

  try {
    await prisma.authAccount.create({
      data: { userId, provider, providerAccountId, accessToken: input.accessToken ?? null },
    })
  } catch (err: unknown) {
    /* P2002 = race: อีก request สร้าง AuthAccount เดียวกันระหว่างนี้ → ตรวจเจ้าของ */
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      const raced = await prisma.authAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { userId: true },
      })
      if (raced && raced.userId !== userId) return { kind: 'taken' }
    } else {
      throw err
    }
  }

  return { kind: 'linked' }
}
