import { NextAuthOptions } from "next-auth";
import FacebookProvider from "next-auth/providers/facebook";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { evaluateSignupYearBadge } from "@/services/badge.service";

export const authOptions: NextAuthOptions = {
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_ID || "",
      clientSecret: process.env.FACEBOOK_SECRET || "",
    }),
    CredentialsProvider({
      id: "phone-otp",
      name: "Phone OTP",
      credentials: {
        phone: { label: "Phone", type: "text" },
        otp: { label: "OTP", type: "text" },
        mode: { label: "Mode", type: "text" },
        displayName: { label: "DisplayName", type: "text" },
        username: { label: "Username", type: "text" },
        // shopName ส่งมาจาก VerifyOtpForm เฉพาะ mode=signup (seller onboarding)
        // signin path จะส่ง empty string — authorize() ตรวจ mode+shopName ก่อนใช้
        shopName: { label: "ShopName", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.otp) return null;

        const { verifyOtp } = await import("@/lib/otp");
        if (!verifyOtp(credentials.phone, credentials.otp)) return null;

        let user = await prisma.user.findFirst({
          where: { phone: credentials.phone },
        });

        if (!user) {
          const displayName =
            credentials.displayName?.trim() ||
            `User_${credentials.phone.slice(-4)}`;
          const username =
            credentials.username?.trim() || `user_${Date.now()}`;

          try {
            user = await prisma.user.create({
              data: {
                phone: credentials.phone,
                displayName,
                username,
                authAccounts: {
                  create: {
                    provider: "PHONE",
                    providerAccountId: credentials.phone,
                  },
                },
                // PRD FR-2.2: phone OTP = L1 auto-approved. สร้าง
                // VerificationRecord เลยเพื่อให้ calcVerificationScore +
                // BADGE_CHECKS.Fully_Verified เจอ L1 ได้ (ก่อนหน้านี้ UI
                // fake L1 chip ด้วย user.phone truthy แต่ไม่มี record →
                // Fully Verified badge เป็นไปไม่ได้)
                verifications: {
                  create: {
                    type: "PHONE_OTP",
                    level: 1,
                    status: "APPROVED",
                    reviewedAt: new Date(),
                  },
                },
              },
            });
            // Auto-link any orders/reviews placed as a guest with this phone (PRD FR-8, B-4)
            const { linkBuyerHistory } = await import("@/services/user.service");
            await linkBuyerHistory(user.id, credentials.phone);

            // สร้าง Shop ทันทีที่ signup seller ถ้า shopName ถูกส่งมา
            // (mode=signup + shopName ไม่ว่าง) — ป้องกัน layout fallback override ชื่อที่ผู้ใช้ตั้ง.
            // ไม่ใช้ createShop service เพราะ service ต้องการ businessType ซึ่งยังไม่มีใน onboarding นี้
            // — prisma direct create เหมือน layout fallback แต่ใช้ชื่อที่ผู้ใช้ตั้ง + set isShop=true.
            // Layout fallback ยังคงอยู่เป็น safety net สำหรับ Facebook signup / buyer ที่เปิดร้านทีหลัง
            const trimmedShopName = credentials.shopName?.trim();
            if (credentials.mode === "signup" && trimmedShopName) {
              // server-side guard — credentials เป็น untrusted input (Yup frontend bypass ได้); ตรงสัญญา CreateShopSchema maxLength 100
              if (trimmedShopName.length > 100) return null;
              // ห่อทั้ง shop.create + user.update ใน transaction เดียว —
              // ถ้า user.update ล้มเหลว Prisma จะ rollback shop.create อัตโนมัติ
              // ป้องกัน orphan shop + isShop stuck false ซึ่ง layout fallback ไม่สามารถแก้ไขได้ (userId unique constraint)
              await prisma.$transaction(async (tx) => {
                await tx.shop.create({
                  data: {
                    userId: user!.id,
                    shopName: trimmedShopName,
                    businessType: "INDIVIDUAL",
                  },
                });
                await tx.user.update({
                  where: { id: user!.id },
                  data: { isShop: true },
                });
              });
            }
          } catch (err: unknown) {
            // P2002 = unique constraint on username or phone; surface as auth failure
            if (err && typeof err === "object" && "code" in err && err.code === "P2002") return null;
            throw err;
          }
          // best-effort badge evaluation — ต้องอยู่นอก try ข้างบนเพื่อไม่ให้ badge error
          // ถูก rethrow เป็น auth failure (security must-fix Phase-3)
          try { await evaluateSignupYearBadge(user.id) } catch (e) { console.error('[auth] evaluateSignupYearBadge (phone) failed', e) }
        }

        // ensure L1 PHONE_OTP record สำหรับ user ที่มีอยู่แล้ว (seeded / สร้างก่อน logic นี้มี):
        // — user ใหม่มี record จาก nested create ข้างบนแล้ว → findFirst เจอ → ไม่ create ซ้ำ (idempotent)
        // — user เก่าที่ไม่มี record → findFirst ไม่เจอ → create ให้ครั้งเดียว
        // ห่อ try/catch best-effort: DB error ของ ensure ไม่ควรทำให้ login พัง
        try {
          const existing = await prisma.verificationRecord.findFirst({
            where: { userId: user.id, type: "PHONE_OTP", level: 1 },
          });
          if (!existing) {
            await prisma.verificationRecord.create({
              data: {
                userId: user.id,
                type: "PHONE_OTP",
                level: 1,
                status: "APPROVED",
                reviewedAt: new Date(),
              },
            });
          }
        } catch (e) {
          console.error("[auth] ensure L1 VerificationRecord failed", e);
        }

        return { id: user.id, name: user.displayName, email: user.email };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    // Multi-subdomain redirect: NextAuth's default redirect prefixes relative
    // URLs with NEXTAUTH_URL which doesn't fit our setup (deepth.local +
    // seller.deepth.local + admin.deepth.local share the auth config but live
    // on different origins in both dev and prod). Keep relative URLs as-is so
    // the browser resolves them against the current origin; same-origin
    // absolute URLs pass through; cross-origin URLs fall back to baseUrl to
    // prevent open-redirect abuse.
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return url;
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url;
      } catch {
        /* invalid URL — fall through */
      }
      return baseUrl;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.userId = user.id;
      }
      if (account?.provider === "facebook") {
        let dbUser = await prisma.user.findFirst({
          where: {
            authAccounts: {
              some: {
                provider: "FACEBOOK",
                providerAccountId: account.providerAccountId,
              },
            },
          },
        });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              displayName: user?.name || "User",
              username: `user_${Date.now()}`,
              avatar: user?.image,
              email: user?.email || undefined,
              authAccounts: {
                create: {
                  provider: "FACEBOOK",
                  providerAccountId: account.providerAccountId,
                  accessToken: account.access_token,
                },
              },
            },
          });
          // Auto-link any guest history that used this email (PRD FR-8)
          if (dbUser.email) {
            const { linkBuyerHistory } = await import("@/services/user.service");
            await linkBuyerHistory(dbUser.id, undefined, dbUser.email);
          }
          // best-effort badge evaluation — อยู่ใน if (!dbUser) branch เท่านั้น
          // (new-user only) ไม่กระทบ jwt refresh path (security must-fix Phase-3)
          try { await evaluateSignupYearBadge(dbUser.id) } catch (e) { console.error('[auth] evaluateSignupYearBadge (facebook) failed', e) }
        }
        token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        const user = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: {
            id: true,
            displayName: true,
            username: true,
            avatar: true,
            isShop: true,
            isAdmin: true,
            trustScore: true,
          },
        });
        if (user) {
          (session as any).user = user;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/sign-in",
  },
};

// Helper for admin-only routes
export async function requireAdmin() {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  if (!session?.user || !(session.user as any).isAdmin) {
    return null;
  }
  return session.user as any;
}
