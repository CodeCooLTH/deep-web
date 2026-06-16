import { NextAuthOptions } from "next-auth";
import FacebookProvider from "next-auth/providers/facebook";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { evaluateSignupYearBadge } from "@/services/badge.service";
import bcrypt from "bcryptjs";

// Rate-limit store สำหรับ admin login — singleton pattern เหมือน otp.ts
// ป้องกัน Next.js สร้าง instance ใหม่ต่อ module load ใน multi-route environment
// key = username, value = timestamps[] ใน sliding window 10 นาที
const globalForAdminAuth = globalThis as unknown as {
  adminLoginTimestamps?: Map<string, number[]>;
};
const adminLoginTimestamps =
  globalForAdminAuth.adminLoginTimestamps ??
  (globalForAdminAuth.adminLoginTimestamps = new Map<string, number[]>());

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
        password: { label: "Password", type: "password" },
        category: { label: "Category", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.otp) return null;

        const { verifyOtp } = await import("@/lib/otp");
        if (!(await verifyOtp(credentials.phone, credentials.otp))) return null;

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
              if (trimmedShopName.length > 100) return null;

              // password (optional ตอน signup — FB user ตั้งทีหลังใน onboarding ได้)
              let passwordHash: string | undefined;
              if (credentials.password) {
                const { isStrongPassword, hashPassword } = await import("@/lib/password");
                if (!isStrongPassword(credentials.password)) return null; // server guard (Yup bypass ได้)
                passwordHash = await hashPassword(credentials.password);
              }
              // category (optional) — ต้องเป็น key ที่รู้จัก
              const { isShopCategory } = await import("@/lib/shop-categories");
              const category =
                credentials.category && isShopCategory(credentials.category)
                  ? credentials.category
                  : undefined;

              // ห่อทั้ง shop.create + user.update ใน transaction เดียว —
              // ถ้า user.update ล้มเหลว Prisma จะ rollback shop.create อัตโนมัติ
              // ป้องกัน orphan shop + isShop stuck false ซึ่ง layout fallback ไม่สามารถแก้ไขได้ (userId unique constraint)
              await prisma.$transaction(async (tx) => {
                await tx.shop.create({
                  data: {
                    userId: user!.id,
                    shopName: trimmedShopName,
                    businessType: "INDIVIDUAL",
                    ...(category ? { category } : {}),
                  },
                });
                await tx.user.update({
                  where: { id: user!.id },
                  data: { isShop: true, ...(passwordHash ? { passwordHash } : {}) },
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
    CredentialsProvider({
      id: "seller-credentials",
      name: "Seller",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        // bcrypt DoS guard (pattern เดียวกับ admin-credentials)
        if (credentials.password.length > 1000) return null;

        // rate-limit 5/10min ต่อ username — reuse store เดียวกับ admin (username @unique ทั้งระบบ ไม่ชน)
        const WINDOW_MS = 10 * 60 * 1000;
        const MAX_ATTEMPTS = 5;
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        const prev = adminLoginTimestamps.get(credentials.username) ?? [];
        const recent = prev.filter((t) => t > cutoff);
        if (recent.length >= MAX_ATTEMPTS) {
          adminLoginTimestamps.set(credentials.username, recent);
          return null;
        }
        recent.push(now);
        adminLoginTimestamps.set(credentials.username, recent);

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user) return null;
        // seller = ไม่ใช่ admin (admin ใช้ provider แยก) + ต้องเปิดร้านแล้ว (isShop) + ตั้ง password แล้ว
        // buyer ที่ตั้ง password แต่ยังไม่เปิดร้าน → เป็น seller ผ่าน signup/onboarding ไม่ใช่ login ตรงนี้ (S-P1-9)
        if (user.isAdmin) return null;
        if (!user.isShop) return null;
        if (user.passwordHash == null) return null;

        const { verifyPassword } = await import("@/lib/password");
        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.displayName, email: user.email };
      },
    }),
    CredentialsProvider({
      id: "admin-credentials",
      name: "Admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // (a) empty-credentials guard — username/password falsy → null ทันที
        if (!credentials?.username || !credentials?.password) return null;

        // (b) password maxLength guard — กัน CPU DoS จาก bcryptjs (pure-JS ต้อง process ทั้ง string ก่อน truncate ที่ 72 bytes)
        // threshold 1000 ตามที่ security แนะนำ: ยาวกว่านี้ไม่มีผู้ใช้จริง แต่ทำ bcrypt ช้ามาก
        if (credentials.password.length > 1000) return null;

        // (c) rate-limit: 5 attempts / 10 นาที per username (sliding window)
        // ต้องอยู่ก่อน DB call — กัน attacker probe username ที่ไม่มี/ไม่ใช่ admin ได้ไม่จำกัด
        // บันทึก attempt ทุกชนิด (รวม fail) เพื่อ gate DB load ด้วย
        const WINDOW_MS = 10 * 60 * 1000;
        const MAX_ATTEMPTS = 5;
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        const prev = adminLoginTimestamps.get(credentials.username) ?? [];
        const recent = prev.filter((t) => t > cutoff);
        if (recent.length >= MAX_ATTEMPTS) {
          // trim stale แล้วปฏิเสธ — ไม่บันทึก attempt เพิ่ม (นับเกินแล้ว)
          adminLoginTimestamps.set(credentials.username, recent);
          return null;
        }
        // บันทึก attempt ก่อนตรวจ password — นับทุก attempt ไม่ว่าจะสำเร็จหรือไม่
        recent.push(now);
        adminLoginTimestamps.set(credentials.username, recent);

        // (d) หา user จาก username — ใช้ findUnique (username เป็น @unique ใน schema) แทน findFirst
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        // (e) ไม่เจอ user → return null (ห้ามบอก error ละเอียด — กัน user enumeration)
        if (!user) return null;

        // (f) ต้องเป็น admin เท่านั้น — buyer/seller ที่รู้รหัส login เข้าไม่ได้
        if (!user.isAdmin) return null;

        // (g) ยังไม่มี passwordHash → reject (account ยังไม่ได้ตั้งรหัส)
        if (user.passwordHash == null) return null;

        // (h) ตรวจ password ด้วย bcrypt — ใช้ bcryptjs (pure JS ไม่มี native addon)
        // ป้องกัน bcrypt throw ไม่ให้กลายเป็น 500 — catch แล้ว return null แทน
        try {
          const valid = await bcrypt.compare(
            credentials.password,
            user.passwordHash,
          );
          if (!valid) return null;
        } catch (e) {
          // log best-effort เพื่อ debug — ไม่ log credentials หรือ hash
          console.error("[auth] admin bcrypt.compare failed", e);
          return null;
        }

        // (i) สำเร็จ — return shape เดียวกับ phone-otp ให้ jwt callback รับ token.userId ได้
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
            id: true, displayName: true, username: true, email: true,
            avatar: true, isShop: true, isAdmin: true, trustScore: true, phone: true,
            shop: { select: { slug: true } },
          },
        });
        if (user) {
          const shopSlug = user.shop?.slug ?? null;
          // ต้อง onboard เมื่อ: ยังไม่มี slug ร้าน หรือ ยังไม่มีเบอร์ (FB user)
          // needsPhoneVerify = bool (ไม่ leak phone จริงเข้า session) — ให้ onboarding รู้ว่าต้องโชว์ step ยืนยันเบอร์ไหม
          const needsPhoneVerify = !user.phone;
          const needsOnboarding = !shopSlug || needsPhoneVerify;
          (session as any).user = {
            id: user.id, displayName: user.displayName, username: user.username,
            email: user.email, avatar: user.avatar, isShop: user.isShop,
            isAdmin: user.isAdmin, trustScore: user.trustScore,
            shopSlug, needsOnboarding, needsPhoneVerify,
          };
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
