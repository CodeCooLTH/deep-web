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
          } catch (err: unknown) {
            // P2002 = unique constraint on username or phone; surface as auth failure
            if (err && typeof err === "object" && "code" in err && err.code === "P2002") return null;
            throw err;
          }
          // best-effort badge evaluation — ต้องอยู่นอก try ข้างบนเพื่อไม่ให้ badge error
          // ถูก rethrow เป็น auth failure (security must-fix Phase-3)
          try { await evaluateSignupYearBadge(user.id) } catch (e) { console.error('[auth] evaluateSignupYearBadge (phone) failed', e) }
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
