import { NextAuthOptions, Account, User } from "next-auth";
import FacebookProvider from "next-auth/providers/facebook";
import LineProvider from "next-auth/providers/line";
import InstagramProvider from "next-auth/providers/instagram";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { evaluateSignupYearBadge } from "@/services/badge.service";
import bcrypt from "bcryptjs";
import { verifyLinkIntent, signReclaimTicket, LINK_INTENT_COOKIE } from "@/lib/link-intent";
import { classifyLinkConflict } from "@/lib/link-conflict";
import { getPersonalShop, isShopMember } from "@/lib/shop-context";
import { resolveOnboardingGate } from "@/lib/onboarding-gate";
// ลบบัญชี (App Store 5.1.1(v)) — ทุก provider ต้องปฏิเสธบัญชีที่ deletedAt มีค่า
// 🛑 ใช้ helper ตัวนี้ที่เดียว ห้ามเขียนเงื่อนไข deletedAt เองซ้ำ: มีทางเข้า 6 ทาง
// (phone-otp / seller / buyer / admin credentials / mobile-ticket / OAuth) พลาดทางเดียว
// = บัญชีที่ผู้ใช้สั่งลบยังกลับเข้ามาได้ ซึ่งผิดข้อกำหนดของ Apple ตรง ๆ
import { isDeletedUser } from "@/lib/account-deletion";
import { createAppleClientSecret, isApplePrivateRelayEmail } from "@/lib/apple-client-secret";

// Rate-limit store สำหรับ admin login — singleton pattern เหมือน otp.ts
// ป้องกัน Next.js สร้าง instance ใหม่ต่อ module load ใน multi-route environment
// key = username, value = timestamps[] ใน sliding window 10 นาที
const globalForAdminAuth = globalThis as unknown as {
  adminLoginTimestamps?: Map<string, number[]>;
};
const adminLoginTimestamps =
  globalForAdminAuth.adminLoginTimestamps ??
  (globalForAdminAuth.adminLoginTimestamps = new Map<string, number[]>());

// feature 00015 (Order Claim & Forced Login) TD-002 — skip-window หลัง sign-in ด้วย phone-otp
// ที่ session.user.justAuthedViaPhoneOtp ใช้ตัดสิน PHONE_MATCH_AUTO_CLAIM vs OTP_CLAIM_REQUIRED
const PHONE_OTP_CLAIM_SKIP_WINDOW_MS = 5 * 60 * 1000;

// upsertOAuthUser — helper รวม logic upsert สำหรับทุก OAuth provider (FB/LINE/IG)
// แยกออกมาจาก jwt callback เพื่อให้ reuse ได้ (FR-LO-14/15) ลอจิกเหมือน FB block เดิมเป๊ะ
async function upsertOAuthUser(
  account: Account,
  user: User | undefined,
  providerEnum: "FACEBOOK" | "LINE" | "INSTAGRAM" | "APPLE",
  usernamePrefix: string,
  linkEmail: boolean,
): Promise<string> {
  let dbUser = await prisma.user.findFirst({
    where: {
      authAccounts: {
        some: {
          provider: providerEnum,
          providerAccountId: account.providerAccountId,
        },
      },
    },
  });
  // backstop ของ signIn callback (ซึ่งเป็นด่านหลัก) — ถ้าวันไหนมีคนแก้ signIn จนหลุด
  // ต้องไม่กลายเป็นว่าบัญชีที่ผู้ใช้สั่งลบถูกปลุกกลับมาเงียบ ๆ ยอมให้ throw ดังกว่าปล่อยผ่าน
  if (isDeletedUser(dbUser)) throw new Error("ACCOUNT_DELETED");

  if (!dbUser) {
    // linkEmail=true เฉพาะ provider ที่ email ถูก platform ยืนยัน + user consent (FB graph).
    // LINE/IG=false: LINE email claim ไม่ verified + ไม่ขอ scope → ห้ามเก็บ/ใช้ link history
    // (security R1 — กัน auto-link buyer history ผิดคนถ้ามีใครเพิ่ม email scope ภายหลัง)
    /**
     * 🛑 การสมัครผ่าน OAuth ชนคอลัมน์ `@unique` ได้ **ทั้งที่ไม่มีใครล็อกอินอยู่ตอนนั้น**
     *
     * `User` มีคอลัมน์ unique 3 ตัว: `username` · `email` · `phone` และ 2 ตัวแรกถูกกำหนดจาก
     * ข้อมูลที่ผู้ให้บริการส่งมา ซึ่ง **คงที่ตลอดกาลต่อบัญชีหนึ่งใบ** ⇒ ถ้ามีแถวเก่าถือไว้อยู่
     * (บัญชีที่ถูกปิดแล้วยังถือทั้งชื่อและอีเมลจนกว่าจะถึงรอบล้างข้อมูลจริง) จะชนทุกครั้งไป
     *
     * เคสจริง 2026-08-15 — เจอ 2 รอบติดกันเพราะรอบแรกผมแก้แค่คอลัมน์เดียว:
     *   เชื่อม Apple → กดยกเลิกการเชื่อม (AuthAccount ถูกลบ) → ออกจากระบบ → ล็อกอิน Apple เดิม
     *   ⇒ ไม่เจอ AuthAccount → สร้าง user ใหม่ → P2002 ที่ `username` (รอบแรก)
     *   ⇒ แก้ให้สุ่มชื่อใหม่ → ยังค้าง เพราะชนต่อที่ `email` (รอบสอง)
     * ตัวดักเดิมเหมาว่า P2002 = race เสมอ พอหา AuthAccount ที่ชนไม่เจอก็ `throw`
     * → NextAuth ตาย → **ค้างที่หน้าล็อกอิน มีวงกลมหมุน แต่ไม่พาไปไหนเลย**
     *
     * ⇒ ต้อง **อ่านว่าชนคอลัมน์ไหน** แล้วจัดการตามชนิด ไม่ใช่ไล่ปะทีละอาการ:
     *   AuthAccount → แข่งกันล็อกอินครั้งแรกจริง ๆ → คืน user ที่อีก request สร้างไปแล้ว
     *   username    → ตั้งชื่อใหม่ (ชื่อเป็นแค่ค่าตั้งต้น ผู้ใช้เปลี่ยนเองได้ทีหลัง)
     *   email       → **ทิ้งอีเมลไป** เพราะมันเป็นของแถวอื่น เราไปยึดมาไม่ได้
     *                 (`email` nullable และระบบนี้ยึด "เบอร์" เป็นตัวตนหลัก ไม่ใช่อีเมล
     *                  ผลข้างเคียงคือไม่ auto-link ประวัติผู้ซื้อเก่า ซึ่งถูกแล้ว —
     *                  อีเมลนั้นผูกกับบัญชีอื่นอยู่ จะเอามาจับคู่ประวัติไม่ได้)
     *   อื่น ๆ       → `throw` ให้ดัง ห้ามกลืน (คอลัมน์ unique ใหม่ที่ยังไม่มีใครคิดถึง)
     */
    const baseUsername = `${usernamePrefix}${account.providerAccountId}`;
    // linkEmail=true เฉพาะ provider ที่ email ถูก platform ยืนยัน + user consent (FB graph/Apple).
    // LINE/IG=false: LINE email claim ไม่ verified + ไม่ขอ scope → ห้ามเก็บ/ใช้ link history
    // (security R1 — กัน auto-link buyer history ผิดคนถ้ามีใครเพิ่ม email scope ภายหลัง)
    let username = baseUsername;
    let trustedEmail = linkEmail ? user?.email || undefined : undefined;

    // 4 ครั้งพอ: ชนได้มากสุด 2 คอลัมน์ (username/email) + เผื่อสุ่มชื่อชนซ้ำ — ถ้ายังไม่ผ่าน
    // แปลว่ามีอย่างอื่นผิด ควรดังออกมาให้เห็น ไม่ใช่วนไปเรื่อย ๆ
    for (let attempt = 0; ; attempt++) {
      try {
        dbUser = await prisma.user.create({
          data: {
            displayName: user?.name || "User",
            username,
            avatar: user?.image,
            email: trustedEmail,
            authAccounts: {
              create: {
                provider: providerEnum,
                providerAccountId: account.providerAccountId,
                accessToken: account.access_token,
              },
            },
          },
        });
        break;
      } catch (err: unknown) {
        const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
        if (code !== "P2002") throw err;

        // ชนที่ AuthAccount = อีก request ล็อกอินคนเดียวกันสร้างไปแล้ว → ใช้ของเขา
        const existing = await prisma.user.findFirst({
          where: { authAccounts: { some: { provider: providerEnum, providerAccountId: account.providerAccountId } } },
        });
        if (existing) return existing.id;

        /**
         * `meta.target` บอกว่าชนคอลัมน์ไหน — Prisma ส่งมาเป็น `string[]` หรือ `string`
         * (ชื่อ constraint) แล้วแต่ไดรเวอร์ ⇒ แปลงเป็นสตริงเดียวแล้วค้นคำ ปลอดภัยกว่าเดารูปแบบ
         */
        const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
        const hitUsername = target.includes("username");
        const hitEmail = target.includes("email");
        if (!hitUsername && !hitEmail) throw err; // unique ตัวอื่นที่ยังไม่รู้จัก — ห้ามกลืน

        if (hitUsername) username = `${baseUsername}-${Math.random().toString(36).slice(2, 8)}`;
        if (hitEmail) trustedEmail = undefined;

        if (attempt >= 3) throw err;
      }
    }
    // Auto-link guest history by email (PRD FR-8) — เฉพาะ provider ที่ email เชื่อถือได้ (linkEmail)
    if (dbUser.email) {
      const { linkBuyerHistory } = await import("@/services/user.service");
      await linkBuyerHistory(dbUser.id, undefined, dbUser.email);
    }
    // best-effort badge evaluation — new user only (ไม่กระทบ jwt refresh path)
    try {
      await evaluateSignupYearBadge(dbUser.id);
    } catch (e) {
      console.error(`[auth] evaluateSignupYearBadge (${providerEnum.toLowerCase()}) failed`, e);
    }
  } else if (user?.image && dbUser.avatar !== user.image) {
    // refresh รูปโปรไฟล์ทุก login (เผื่อเปลี่ยนรูป / user เก่าที่ avatar ยัง null)
    await prisma.user.update({ where: { id: dbUser.id }, data: { avatar: user.image } });
  }
  return dbUser.id;
}

/**
 * appleProvider — Sign in with Apple (App Store Guideline 4.8, rejection 2026-08-04)
 *
 * คืนเป็น array เพื่อให้ spread ลงรายการ providers ได้ — **ตั้งค่าไม่ครบ = ไม่เปิด provider เลย**
 * ไม่ใช่เปิดแล้วปล่อยให้พังตอนกด (ต่างจาก FB/LINE ที่ใส่ `|| ""` ไว้) เพราะปุ่ม Apple ที่กดแล้ว
 * เด้ง error คือสิ่งที่คนตรวจของ Apple จะเจอเป็นอย่างแรก แล้วตีกลับด้วยเหตุผลที่แย่กว่าเดิม
 *
 * clientId = **Services ID** (`com.deepthailand.seller.web`) ไม่ใช่ bundle id ของแอป —
 * เป็นจุดที่สลับกันบ่อยที่สุด และ Apple ตอบแค่ `invalid_client` โดยไม่บอกว่าอะไรผิด
 */
function appleProvider() {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!clientId || !teamId || !keyId || !privateKey) return [];

  try {
    return [
      AppleProvider({
        clientId,
        clientSecret: createAppleClientSecret({ clientId, teamId, keyId, privateKey }),
      }),
    ];
  } catch (e) {
    // คีย์เสีย/รูปแบบผิด — ดังไว้ใน log แต่ไม่ล้มทั้งระบบ auth (FB/LINE/รหัสผ่าน ต้องใช้ได้ต่อ)
    console.error("[auth] เปิด Sign in with Apple ไม่ได้ — ตรวจ APPLE_PRIVATE_KEY", e);
    return [];
  }
}

/**
 * คุกกี้ระหว่างขั้นตอน OAuth — ต้องเป็น SameSite=None เพราะ Apple ส่งกลับแบบ POST ข้ามเว็บ
 *
 * 🛑 ถ้าไม่แก้ ล็อกอิน Apple **พังทุกครั้ง** โดยไม่มีอะไรบอกสาเหตุ:
 * Apple ใช้ `response_mode=form_post` (ดู next-auth/providers/apple) = ยิง POST จาก
 * appleid.apple.com มาที่ callback ของเรา ซึ่งเป็น cross-site request — เบราว์เซอร์จะ
 * **ไม่แนบคุกกี้ SameSite=Lax** ที่ next-auth ตั้งไว้เป็น default ทุกตัว ผลคือ code_verifier
 * หายไป NextAuth จึงตอบ error `OAuthCallback` ทั้งที่ทุกอย่างฝั่ง Apple ถูกหมด
 * (next-auth v4 ไม่มีการจัดการพิเศษให้ Apple — ตรวจแล้วใน core/lib/cookie.js ตั้ง lax ล้วน)
 *
 * ทับเฉพาะ 3 ตัวที่ใช้ "ระหว่างเดินทาง" ของ OAuth (อายุ 15 นาที ใช้ครั้งเดียวทิ้ง) —
 * **ไม่แตะคุกกี้ session** ซึ่งยังเป็น SameSite=Lax ตามเดิม ความปลอดภัยของ session จึงไม่ลดลง
 *
 * เฉพาะ production: SameSite=None บังคับต้องมี Secure ซึ่งต้องเป็น https — dev รันบน
 * http://seller.deepth.local จึงตั้งไม่ได้ (และ Apple ไม่รับ http อยู่แล้ว เทสได้บน prod เท่านั้น
 * เหมือน Facebook login ที่โปรเจกต์นี้บันทึกไว้ตั้งแต่ 2026-06-17)
 */
const OAUTH_FLOW_COOKIE_MAX_AGE = 60 * 15;
function crossSiteOAuthCookies(): NextAuthOptions["cookies"] {
  if (process.env.NODE_ENV !== "production") return undefined;
  const options = {
    httpOnly: true,
    sameSite: "none" as const,
    path: "/",
    secure: true,
  };
  return {
    pkceCodeVerifier: {
      name: "__Secure-next-auth.pkce.code_verifier",
      options: { ...options, maxAge: OAUTH_FLOW_COOKIE_MAX_AGE },
    },
    state: {
      name: "__Secure-next-auth.state",
      options: { ...options, maxAge: OAUTH_FLOW_COOKIE_MAX_AGE },
    },
    nonce: { name: "__Secure-next-auth.nonce", options },
    /**
     * 🛑 ตัวที่ 4 ที่ตกสำรวจรอบแรก — คุกกี้นี้เก็บ "ปลายทางหลังล็อกอินสำเร็จ" และถูกอ่าน
     * ตอน callback เหมือน pkce ทุกประการ ⇒ มันคือคุกกี้ "ระหว่างเดินทาง" ตัวหนึ่ง ไม่ใช่คุกกี้
     * ของหน้าเว็บ. ปล่อยเป็น Lax ไว้ = POST ข้ามเว็บของ Apple ไม่ส่งมันมา ⇒ next-auth ถอยไปใช้
     * origin ของเว็บแทน (`core/lib/callback-url.js`) ผู้ใช้จึงไปโผล่หน้าแรกแทนปลายทางที่ตั้งไว้
     *
     * ปลอดภัยเพราะ `redirect` callback ตรวจ origin ทุกครั้งอยู่แล้ว — ค่าที่ข้ามเว็บมาชี้ออก
     * นอกโดเมนไม่ได้ (ดู callbacks.redirect) และคุกกี้ยัง httpOnly + Secure เหมือนเดิม
     *
     * FB/LINE/IG ไม่ได้รับผลกระทบ: ขากลับของทั้งสามเป็น **GET redirect** ซึ่ง Lax ส่งอยู่แล้ว
     */
    callbackUrl: {
      name: "__Secure-next-auth.callback-url",
      options: { ...options, maxAge: OAUTH_FLOW_COOKIE_MAX_AGE },
    },
  };
}

export const authOptions: NextAuthOptions = {
  cookies: crossSiteOAuthCookies(),
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_ID || "",
      clientSecret: process.env.FACEBOOK_SECRET || "",
      // ใช้ picture.data.url จาก OAuth userinfo (URL ที่ FB ออกให้ — ใช้งานได้จริง บน fbsbx/fbcdn).
      // ห้ามใช้ graph.facebook.com/{providerAccountId}/picture เพราะ providerAccountId = app-scoped ID
      // ต้องมี token ถึงจะดึงรูปได้ (ดึงตรงไม่มี token → 400 รูปไม่ขึ้น). คง userinfo default (appsecret_proof ไม่หาย)
      profile(profile) {
        const p = profile as { id: string; name?: string; email?: string; picture?: { data?: { url?: string } } };
        return {
          id: p.id,
          name: p.name,
          email: p.email ?? null,
          image: p.picture?.data?.url ?? null,
        };
      },
    }),
    // FR-LO-14: LINE OAuth — อิสระจาก Meta (LINE Developers Console แยกต่างหาก) → ใช้งานได้ทันทีในตลาดไทย
    LineProvider({
      clientId: process.env.LINE_CHANNEL_ID || "",
      clientSecret: process.env.LINE_CHANNEL_SECRET || "",
    }),
    ...appleProvider(),
    // FR-LO-15: Instagram OAuth — เตรียมโค้ดไว้ ปิด flag (ติด Meta Business Verification เหมือน FB)
    // ใช้งานจริงได้เมื่อผ่าน App Review + business verification แล้ว
    // คำเตือน security R2: flag NEXT_PUBLIC_ENABLE_IG_LOGIN คุมแค่การ "render ปุ่ม" เท่านั้น —
    // provider นี้ active ที่ backend เสมอ. ตราบใดที่ INSTAGRAM_CLIENT_ID ว่าง flow จะ fail ที่ IG เอง.
    // อย่าตั้ง INSTAGRAM_CLIENT_ID ใน prod จนกว่าจะตั้งใจเปิด IG login (ไม่งั้น endpoint ใช้ได้ทั้งที่ปุ่มซ่อน)
    InstagramProvider({
      clientId: process.env.INSTAGRAM_CLIENT_ID || "",
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || "",
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

        // บัญชีที่ถูกลบยัง "จอง" เบอร์ไว้ตลอด 30 วัน retention (User.phone @unique ยังไม่ถูกล้าง)
        // ต้อง return null ที่นี่ ไม่ปล่อยให้หล่นไปสาขา !user ด้านล่างแล้วสร้างบัญชีใหม่ —
        // จะชน unique constraint กลายเป็น 500 และ (ร้ายกว่า) ถ้าชนไม่โดนก็เท่ากับปลุกบัญชีที่สั่งลบไปแล้ว
        if (isDeletedUser(user)) return null;

        if (!user) {
          const displayName =
            credentials.displayName?.trim() ||
            `User_${credentials.phone.slice(-4)}`;
          const username =
            credentials.username?.trim() || `user_${Date.now()}`;

          // password (optional): buyer signup ก็ตั้งรหัสได้ (เดิม logic นี้อยู่เฉพาะ branch seller/shopName)
          // ต้อง strong เสมอถ้าส่งมา — server guard กัน Yup bypass
          let signupPasswordHash: string | undefined;
          if (credentials.password) {
            const { isStrongPassword, hashPassword } = await import("@/lib/password");
            if (!isStrongPassword(credentials.password)) return null;
            signupPasswordHash = await hashPassword(credentials.password);
          }

          try {
            user = await prisma.user.create({
              data: {
                phone: credentials.phone,
                displayName,
                username,
                passwordHash: signupPasswordHash,
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

              // password ถูกตั้งไปแล้วตอน user.create ข้างบน (signupPasswordHash) — ไม่ต้อง hash ซ้ำที่นี่
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
        // บัญชีถูกลบแล้ว → ปฏิเสธเงียบ ๆ เหมือนกรณี "ไม่เจอ user"/"รหัสผิด" ทุกประการ
        // ห้ามแยกข้อความ — ไม่งั้นกลายเป็นช่องให้เดาว่า username ไหนมีตัวตน (account enumeration)
        if (isDeletedUser(user)) return null;
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
      id: "buyer-credentials",
      name: "Buyer",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        if (credentials.password.length > 1000) return null;

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
        // บัญชีถูกลบแล้ว → ปฏิเสธเงียบ ๆ (เหตุผลเดียวกับ seller-credentials ด้านบน)
        if (isDeletedUser(user)) return null;
        // buyer login ฝั่ง main site: ทุก user ที่ไม่ใช่ admin + ตั้ง password แล้ว
        // (seller ก็ login ที่ main ได้ — บัญชีเดียวกัน — จึงไม่ตรวจ isShop; admin ใช้ provider แยก)
        if (user.isAdmin) return null;
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

        // (e2) บัญชีถูกลบแล้ว → ปฏิเสธเงียบ ๆ เหมือน (e) ทุกประการ (กัน enumeration)
        //      แอดมินลบบัญชีตัวเองได้ในทางทฤษฎี — ต้องกันไว้ให้ครบเหมือน provider อื่น
        if (isDeletedUser(user)) return null;

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
    CredentialsProvider({
      id: "mobile-ticket",
      name: "Mobile Ticket",
      credentials: {
        ticket: { label: "Ticket", type: "text" },
      },
      // แอปมือถือส่ง single-use ticket (จาก /api/app/session-handoff) → เผา ticket แล้ว
      // คืน user ให้ NextAuth ตั้ง session cookie เอง (jwt callback ด้านล่างจัดการ userId/
      // activeShopId/needsRegistration/needsOnboarding ครบ — ไม่ mint JWT เองเพื่อกัน flag หลุด)
      async authorize(credentials) {
        if (!credentials?.ticket) return null;
        const { burnMobileTicket } = await import("@/lib/mobile-ticket");
        const uid = await burnMobileTicket(credentials.ticket, "enter");
        if (!uid) return null;
        const user = await prisma.user.findUnique({ where: { id: uid } });
        if (!user) return null;
        // ticket ที่ออกก่อนผู้ใช้กดลบบัญชียังเผาได้อยู่ (อายุสั้นแต่ไม่เป็นศูนย์) — ต้องกันซ้ำที่นี่
        if (isDeletedUser(user)) return null;
        // shape เดียวกับ phone-otp/admin-credentials — jwt callback อ่าน user.id → token.userId
        return { id: user.id, name: user.displayName, email: user.email };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    /**
     * signIn callback — Account Linking (FR-LO-16)
     *
     * เมื่อ OAuth flow เสร็จ NextAuth เรียก signIn ก่อน jwt เสมอ
     * อ่าน deep_link_intent cookie (ถ้ามี) → ถ้า valid = LINK MODE:
     *   - AuthAccount(provider,providerAccountId) ถูกใช้โดย userId อื่น → block (AC-03) redirect error
     *   - ว่างอยู่ → create AuthAccount ผูกกับ intent.userId (ไม่ใช่ user ที่ provider ส่งมา)
     *   - jwt callback ถัดไปจะ findFirst เจอ AuthAccount ใหม่ → token.userId = intent.userId → session คงเดิม (AC-01/02)
     * ถ้าไม่มี intent → return true (login ปกติ — ไม่กระทบ FB/LINE login เดิม)
     *
     * คำเตือน: cookies() จาก next/headers ทำงานได้ใน signIn callback เพราะ NextAuth OAuth callback
     *    รันใน App Router API route context (มี request scope) — ยืนยันจาก callback.js source
     */
    async signIn({ account }) {
      // ไม่ใช่ OAuth provider → login ปกติ (Credentials provider ไม่ใช้ link flow)
      if (!account || !["facebook", "line", "instagram", "apple"].includes(account.provider)) return true;

      // oauthMap เหมือน jwt callback — ใช้ตรวจ provider ที่รองรับ linking
      const oauthMap = {
        facebook: "FACEBOOK",
        line: "LINE",
        instagram: "INSTAGRAM",
        apple: "APPLE",
      } as const;
      type OAuthProvider = keyof typeof oauthMap;
      if (!(account.provider in oauthMap)) return true;

      /**
       * บัญชีถูกลบแล้ว → ห้าม OAuth พากลับเข้ามา (App Store 5.1.1(v))
       *
       * ต้องเช็คที่ signIn ไม่ใช่ jwt: signIn ทำงาน "ก่อน" jwt เสมอ และ return false ที่นี่
       * ทำให้ NextAuth หยุด flow อย่างสะอาด (พาไปหน้า error) ส่วนการ throw ใน jwt จะกลายเป็น
       * 500 ที่ผู้ใช้อ่านไม่รู้เรื่อง
       *
       * เช็คทั้งสองโหมด (login ปกติ + link mode) เพราะวางไว้ก่อนแยกสาขา link-intent —
       * บัญชีที่ถูกลบต้องผูก provider ใหม่ไม่ได้ด้วย ไม่ใช่แค่ล็อกอินไม่ได้
       *
       * AuthAccount ยังอยู่จนกว่าจะ purge (วันที่ 31) จึง lookup เจอในช่วง retention —
       * นั่นคือจุดที่ต้องกัน หลัง purge แถวถูกลบไปแล้วจะกลายเป็น "สมัครใหม่" ตามปกติ
       */
      const deletedCheckProvider = oauthMap[account.provider as OAuthProvider];
      const linkedAccount = await prisma.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: deletedCheckProvider,
            providerAccountId: account.providerAccountId,
          },
        },
        select: { user: { select: { deletedAt: true } } },
      });
      if (isDeletedUser(linkedAccount?.user)) return false;

      // อ่าน link-intent cookie — ถ้าไม่มีหรือ verify ไม่ผ่าน = login ปกติ
      let intent: { userId: string; provider: string } | null = null;
      try {
        const { cookies } = await import("next/headers");
        const raw = (await cookies()).get(LINK_INTENT_COOKIE)?.value;
        intent = raw ? verifyLinkIntent(raw) : null;
      } catch {
        // cookies() อาจ throw ถ้าเรียกนอก request context (edge case) → fail-open = login ปกติ
        intent = null;
      }

      // ไม่มี intent หรือ provider ไม่ตรง = login ปกติ (ไม่ใช่ link mode)
      if (!intent || intent.provider !== account.provider) return true;

      /**
       * === LINK MODE ===
       *
       * 🛑 ปลายทางต้องเป็น `/account` ไม่ใช่ `/settings` — การ์ด "วิธีเข้าสู่ระบบ" ย้ายจาก
       * /settings ไป /account ตั้งแต่ feature 00026 (2026-08-02) และ /settings กลายเป็นหน้า
       * "การจัดส่ง" ไปแล้ว ปลายทางเก่าจึงพาผู้ใช้ไปหน้าที่ไม่เกี่ยวข้องและ **ไม่มีใครอ่าน
       * ?linked= / ?link_error= ที่นั่น** = เชื่อมสำเร็จก็เงียบ ล้มเหลวก็เงียบ
       * (เจอจริง 2026-08-12: กดเชื่อม Apple แล้วเด้งไปหน้า "การจัดส่ง" เฉย ๆ ไม่มีอะไรบอก
       * ทั้งที่ backend คืน link_error=taken มาแล้ว) — บั๊กนี้กระทบ Facebook/LINE ด้วยมาตลอด
       */
      // === LINK MODE ===
      const providerEnum = oauthMap[account.provider as OAuthProvider];

      // consume link-intent (single-use) — clear cookie ทันที กัน replay (security R3); read-only context → TTL คุมแทน
      try {
        const { cookies } = await import("next/headers");
        (await cookies()).delete(LINK_INTENT_COOKIE);
      } catch {
        /* mutate cookie ไม่ได้ใน context นี้ → พึ่ง TTL 5 นาที + exp ใน payload */
      }

      // ตรวจว่า AuthAccount(provider,providerAccountId) นี้มีใครถืออยู่แล้วไหม
      const existing = await prisma.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: providerEnum,
            providerAccountId: account.providerAccountId,
          },
        },
        select: { userId: true },
      });

      if (existing) {
        if (existing.userId !== intent.userId) {
          /**
           * มีคนถืออยู่แล้ว — แต่ "ใครถือ" สำคัญกว่า "ถืออยู่ไหม"
           *
           * 🛑 เดิมตอบ `link_error=taken` ทุกกรณี ซึ่งสร้างทางตันถาวรบน prod (2026-08-15):
           * ผู้ใช้กดปุ่ม Apple ที่หน้าล็อกอินโดยไม่ตั้งใจ (บนมือถือ Face ID ผ่านให้ในวินาทีเดียว
           * โดยไม่ต้องกรอกอะไร) ได้บัญชีค้างที่ไม่มีเบอร์ ⇒ ถอดการเชื่อมไม่ได้ (ต้อง OTP ทางเบอร์)
           * · ใส่เบอร์ไม่ได้ (เบอร์อยู่กับบัญชีจริง) · ลบบัญชีเองไม่ได้ (proxy ขังไว้ที่ /register)
           * · เอา Apple ID ไปเชื่อมบัญชีจริงไม่ได้ (ตกมาที่บรรทัดนี้)
           * ⇒ **Apple ID นั้นใช้กับ Deep ไม่ได้อีกเลยตลอดกาล**
           *
           * คนที่มายืนตรงนี้เพิ่งพิสูจน์กับผู้ให้บริการเมื่อกี้ว่าคุม id นั้นจริง — ถ้าปลายทาง
           * ไม่มีตัวตนอะไรเลย การให้เขาย้ายตัวตนของตัวเองกลับมาไม่ใช่การยึดของคนอื่น
           * เกณฑ์ตัดสินอยู่ใน `classifyLinkConflict()` (ฟังก์ชันบริสุทธิ์ + เทส [blocker] +
           * พิสูจน์ด้วย mutation) — ห้ามย้ายตรรกะนี้กลับเข้ามาเขียนสดตรงนี้
           */
          const holder = await prisma.user.findUnique({
            where: { id: existing.userId },
            select: {
              deletedAt: true,
              phone: true,
              passwordHash: true,
              _count: { select: { shopMemberships: true } },
              shops: { where: { deletedAt: null }, select: { slug: true, _count: { select: { orders: true } } } },
              authAccounts: { where: { provider: { not: providerEnum } }, select: { id: true } },
            },
          });

          // หา user ไม่เจอทั้งที่ AuthAccount ชี้อยู่ = ข้อมูลไม่สอดคล้อง → fail-closed
          if (!holder) return "/account?link_error=taken";

          const verdict = classifyLinkConflict({
            deletedAt: holder.deletedAt,
            phone: holder.phone,
            passwordHash: holder.passwordHash,
            completedShopCount: holder.shops.filter((s) => s.slug !== null).length,
            orderCount: holder.shops.reduce((n, s) => n + s._count.orders, 0),
            shopMemberCount: holder._count.shopMemberships,
            otherAuthAccountCount: holder.authAccounts.length,
          });

          if (verdict === "BLOCKED") {
            // บัญชีปลายทางมีตัวตนจริง — ห้ามแตะ ให้เจ้าตัวไปถอด/ลบเอง (ข้อความอยู่ฝั่ง UI)
            return "/account?link_error=taken";
          }

          /**
           * ยึดคืนได้ — **แต่ห้ามทำตรงนี้ ต้องถามผู้ใช้ก่อน**
           *
           * 🛑 ตรงนี้คือจุดที่ผมออกแบบพลาดรอบแรกแล้ว user ทักท้วง (2026-08-15): ตอนแรกให้
           * ปิดบัญชีค้างอัตโนมัติเลยเพราะ "มันว่างเปล่า ไม่มีข้อมูลอะไรจะเสีย" ซึ่งผิด 2 ชั้น —
           *   1. เราไม่มีทางรู้ว่าเขา *ตั้งใจ* ทิ้งบัญชีนั้นจริงไหม (อาจกำลังสมัครค้างไว้อีกเครื่อง)
           *   2. การลบของผู้ใช้โดยไม่ถาม คือสิ่งที่แพลตฟอร์มซึ่งขายเรื่องความน่าเชื่อถือทำไม่ได้
           * "ข้อมูลว่างเปล่า" ตอบว่า *ความเสียหายน้อย* ไม่ได้ตอบว่า *มีสิทธิ์ทำโดยไม่ถามไหม*
           *
           * จึงคืนสถานะ `reclaimable` พร้อม **ตั๋วเซ็นชื่อ** ให้ฝั่ง UI ถามยืนยัน แล้วค่อยยิง
           * `POST /api/account/link/reclaim` ตอนผู้ใช้กดตกลง — ที่นั่นตรวจซ้ำทุกอย่างอีกรอบ
           *
           * ตั๋วต้องเซ็น ไม่ใช่ส่ง providerAccountId เปล่า ๆ ใน URL — ไม่งั้นใครก็ยิง endpoint
           * ด้วย id ของคนอื่นเพื่อยึดบัญชีค้างของเขาได้ (มูลค่าต่ำแต่ก็ยังผิด) และตั๋วผูกกับ
           * `userId` ผู้ขอ ⇒ ต่อให้ตั๋วหลุด คนอื่นเอาไปใช้ไม่ได้เพราะ session ไม่ตรง
           */
          const ticket = signReclaimTicket({
            userId: intent.userId,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            holderUserId: existing.userId,
          });
          return `/account?link_error=reclaimable&ticket=${encodeURIComponent(ticket)}`;
        }
        // AuthAccount มีอยู่แล้วและเป็นของ intent.userId → ผูกแล้ว (idempotent) → ok
        return "/account?linked=" + account.provider;
      }

      // AuthAccount ว่าง → สร้างผูกกับ intent.userId (ไม่ใช่ user ที่ OAuth ส่งมา)
      try {
        await prisma.authAccount.create({
          data: {
            userId: intent.userId,
            provider: providerEnum,
            providerAccountId: account.providerAccountId,
            accessToken: account.access_token ?? null,
          },
        });
      } catch (err: unknown) {
        // P2002 = race: อีก request สร้าง AuthAccount เดียวกันระหว่างนี้ (security R1) → ตรวจเจ้าของ
        if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
          const raced = await prisma.authAccount.findUnique({
            where: { provider_providerAccountId: { provider: providerEnum, providerAccountId: account.providerAccountId } },
            select: { userId: true },
          });
          // เป็นของ user อื่น → block; เป็นของ intent.userId เอง → idempotent ผ่าน
          if (raced && raced.userId !== intent.userId) return "/account?link_error=taken";
        } else {
          throw err;
        }
      }

      return "/account?linked=" + account.provider;
    },

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
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.userId = user.id;
        // feature 00015 TD-002 — จำ provider/เวลา sign-in ล่าสุดไว้ใน JWT (ไม่เพิ่ม DB round-trip)
        // เพื่อคำนวณ justAuthedViaPhoneOtp ที่ session callback ด้านล่าง
        token.authProvider = account?.provider ?? (token.authProvider as string | undefined);
        token.authAt = Date.now();
      }
      // รวม OAuth provider ทุกตัว (FB/LINE/IG) ไว้ใน map เดียว — เพิ่ม provider ใหม่ได้โดยแค่เพิ่ม entry
      // key = next-auth provider id, value = [AuthAccount.provider enum, username prefix]
      // key = next-auth provider id, value = [AuthAccount.provider enum, username prefix, linkEmail]
      // linkEmail=true เฉพาะ FB (email ผ่าน graph + consent); LINE/IG=false (ไม่ trust email claim — security R1)
      const oauthMap = {
        facebook: ["FACEBOOK", "fb", true],
        line: ["LINE", "line", false],
        instagram: ["INSTAGRAM", "ig", false],
        // Apple: อีเมล verified จริง (Apple ยืนยันให้) จึง trust ได้ — แต่ต้องผ่านด่าน relay ด้านล่างก่อน
        apple: ["APPLE", "apple", true],
      } as const;
      if (account && account.provider in oauthMap) {
        const [providerEnum, prefix, linkEmail] = oauthMap[account.provider as keyof typeof oauthMap];
        /**
         * 🛑 อีเมลซ่อนของ Apple (`…@privaterelay.appleid.com`) ห้ามใช้จับคู่ประวัติลูกค้าเก่า
         *
         * มันไม่ใช่อีเมลจริงของผู้ใช้ และเป็นคนละค่ากันในแต่ละแอป — เก็บเป็น User.email แล้ว
         * ระบบจะเชื่อว่าติดต่อเขาได้ทั้งที่เขากดตัดการส่งต่อทิ้งเมื่อไหร่ก็ได้ และหน้าโปรไฟล์จะโชว์
         * อีเมลที่เจ้าตัวเองไม่รู้จัก. isApplePrivateRelayEmail คืน false ให้ provider อื่นเสมอ
         * บรรทัดนี้จึงไม่กระทบ FB/LINE/IG
         */
        const trustEmail = linkEmail && !isApplePrivateRelayEmail(user?.email);
        token.userId = await upsertOAuthUser(account, user, providerEnum, prefix, trustEmail);
      }
      // เก็บ needsOnboarding ลง JWT ให้ proxy บังคับ redirect ได้ที่ edge — คำนวณเฉพาะตอน
      // sign-in (user/account) หรือ session.update() ไม่ใช่ทุก getToken (กัน query DB ทุก request)
      if (token.userId && (user || account || trigger === "update")) {
        const u = await prisma.user.findUnique({
          where: { id: token.userId as string },
          // P2-4 (feature 00008 Phase 2 cutover): User.shop (1:1) → User.shops (1:N) — needsOnboarding
          // ยึด Personal shop เดิมเป็นฐานเสมอ (ไม่ใช่ shop แรกที่เจอ)
          select: { phone: true, deletedAt: true, shops: { where: { kind: "PERSONAL" }, select: { id: true, slug: true } } },
        });

        /**
         * บัญชีถูกลบระหว่างที่ยังมี session ค้างอยู่ → ตัด token ทิ้ง (App Store 5.1.1(v))
         *
         * เกิดได้จริง 2 กรณี: ผู้ใช้กดลบจากอีกเครื่อง/อีกแท็บ, หรือกดลบแล้วเบราว์เซอร์
         * ยังไม่ทัน signOut (เน็ตหลุดกลางทาง). คืน token เปล่า = getToken() ได้ค่าไม่มี userId
         * → layout/proxy พาไป /auth/sign-in ตามปกติ ไม่ต้องมีทางออกพิเศษ
         *
         * ทำงานเฉพาะจังหวะ sign-in / session.update() เท่านั้น (อยู่ใน if เดิม) — ไม่ query DB
         * ทุก request ตามเจตนาเดิมของบล็อกนี้ ผู้ใช้ที่ถือ JWT เก่าจึงยังใช้ได้จนกว่าจะ refresh
         * ซึ่งรับได้: การกดลบฝั่ง client เรียก signOut() ต่อทันทีอยู่แล้ว นี่เป็นแค่ตาข่ายรอง
         */
        if (u?.deletedAt) return {};

        const personal = u?.shops[0] ?? null;

        // activeShopId (feat 00008 TFR-012, ปรับ 00012) — trigger==='update' + client ส่ง activeShopId มา
        // (AccountSwitcher / หลัง accept invite) → ห้าม trust ตรง ๆ ต้อง re-verify membership (หรือ personal
        // ของ user เอง) ก่อนเชื่อ — กัน client ปลอม shopId
        if (trigger === "update" && (session as { activeShopId?: string } | undefined)?.activeShopId) {
          const requestedShopId = (session as { activeShopId?: string }).activeShopId as string;
          const ok =
            (await isShopMember(requestedShopId, token.userId as string)) ||
            requestedShopId === personal?.id;
          token.activeShopId = ok
            ? requestedShopId
            : ((token.activeShopId as string | undefined) ?? personal?.id ?? null);
        } else if (!token.activeShopId) {
          // sign-in แรก, ยังไม่เคยตั้ง → default = Personal; ถ้าไม่มี Personal (ผู้ถูกเชิญ 00012) →
          // business shop แรกที่เป็นสมาชิก; ไม่มีเลย (nobody) → null → layout พาไป /choose-shop
          let defaultActive: string | null = personal?.id ?? null;
          if (!defaultActive) {
            const firstBiz = await prisma.shopMember.findFirst({
              where: {
                userId: token.userId as string,
                shop: { kind: "BUSINESS", deletedAt: null, purgedAt: null },
              },
              select: { shopId: true },
              orderBy: { createdAt: "asc" },
            });
            defaultActive = firstBiz?.shopId ?? null;
          }
          token.activeShopId = defaultActive;
        }

        // กฎเต็ม + เหตุผลอยู่ที่ lib/onboarding-gate.ts (SSOT ร่วมกับ session callback ด้านล่าง)
        // สำคัญ: ต้องเรียก "หลัง" block activeShopId ด้านบนเสมอ — รอบ sign-in แรก token.activeShopId
        // ยังเป็น undefined ถ้าเรียกก่อนจะได้ผลผิด (เดิมโค้ดนี้อยู่ก่อนหน้า block นั้น)
        const gate = resolveOnboardingGate({
          personalShopId: personal?.id ?? null,
          personalShopSlug: personal?.slug ?? null,
          activeShopId: (token.activeShopId as string | null | undefined) ?? null,
          hasPhone: !!u?.phone,
        });
        token.needsRegistration = gate.needsRegistration;
        token.needsOnboarding = gate.needsOnboarding;
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
            // P2-4 (feature 00008 Phase 2 cutover): User.shop (1:1) → User.shops (1:N)
            shops: { where: { kind: "PERSONAL" }, select: { id: true, slug: true } },
          },
        });
        if (user) {
          const personal = user.shops[0] ?? null;
          const shopSlug = personal?.slug ?? null;
          // needsPhoneVerify/needsOnboarding ย้ายไปคำนวณท้ายสุด (หลัง resolvedActiveShopId) —
          // feature 00026 ต้องรู้ว่า active อยู่ร้านไหนก่อนถึงจะตัดสินได้ ดูคอมเมนต์เต็มตรงจุดคำนวณ

          // active-shop-context (feat 00008 TFR-012) — additive; re-verify membership ทุก render
          // (ไม่ trust JWT เพียงอย่างเดียว — JWT อายุ 30 วัน, admin อาจถูก remove ระหว่างทาง)
          // fail-closed: error ใด ๆ ระหว่าง resolve → fallback Personal (null ถ้าไม่มี Personal — ผู้ถูกเชิญ)
          let resolvedActiveShopId: string | null = personal?.id ?? null; // Personal fallback
          let activeShopRole: "OWNER" | "ADMIN" = "OWNER";
          let hasBusinessMembership = false;
          try {
            const tokenActiveShopId = (token as { activeShopId?: string | null }).activeShopId ?? null;
            if (tokenActiveShopId && tokenActiveShopId !== resolvedActiveShopId) {
              // filter shop.deletedAt/purgedAt ด้วย — กัน soft-deleted business ยัง resolve เป็น active
              // (สอดคล้องกับ resolveActiveShopContext + hasBusinessMembership count; ป้องกัน display drift
              // ที่ topbar/sidebar โชว์ชื่อ/โลโก้ร้านที่ถูกลบ — security review Low finding)
              const m = await prisma.shopMember.findFirst({
                where: {
                  shopId: tokenActiveShopId,
                  userId: user.id,
                  shop: { deletedAt: null, purgedAt: null },
                },
                select: { role: true },
              });
              if (m) {
                resolvedActiveShopId = tokenActiveShopId;
                activeShopRole = m.role as "OWNER" | "ADMIN";
              }
              // ไม่เจอ (ถูก remove/soft-delete ระหว่างทาง) → resolvedActiveShopId คง Personal fallback ที่ตั้งไว้ข้างบน
            }
            hasBusinessMembership =
              (await prisma.shopMember.count({
                where: { userId: user.id, shop: { kind: "BUSINESS", deletedAt: null, purgedAt: null } },
              })) > 0;
          } catch (e) {
            console.error("[auth] session activeShopContext resolve failed — fallback Personal", e);
            resolvedActiveShopId = personal?.id ?? null;
            activeShopRole = "OWNER";
            hasBusinessMembership = false;
          }

          // active shop identity (FB switcher) — query เฉพาะเมื่อ active เป็น BUSINESS
          // (resolvedActiveShopId != Personal id). PERSONAL → null → consumer fallback avatar/displayName
          // สำคัญ: ต้องอยู่ใน try/catch — query นี้รันทุก session resolve; ถ้า throw ต้อง fail-closed
          //    (คง PERSONAL/null) ไม่ใช่ปล่อยให้ session callback พัง = session 500 ทุก seller business-active
          const personalShopId = user.shops[0]?.id ?? null;
          let activeShopKind: "PERSONAL" | "BUSINESS" = "PERSONAL";
          let activeShopName: string | null = null;
          let activeShopLogo: string | null = null;
          // active shop slug (feature: ปุ่ม "เปิดหน้าร้าน" ต้องชี้ร้านที่ switch อยู่ = /b/{slug} ไม่ใช่ /u/{ตัวเอง})
          let activeShopSlug: string | null = null;
          try {
            if (resolvedActiveShopId && resolvedActiveShopId !== personalShopId) {
              const activeShop = await prisma.shop.findUnique({
                where: { id: resolvedActiveShopId },
                select: { shopName: true, logo: true, slug: true },
              });
              if (activeShop) {
                activeShopKind = "BUSINESS";
                activeShopName = activeShop.shopName;
                activeShopLogo = activeShop.logo;
                activeShopSlug = activeShop.slug;
              }
            }
          } catch (e) {
            console.error("[auth] session activeShop identity resolve failed — fallback Personal display", e);
            activeShopKind = "PERSONAL";
            activeShopName = null;
            activeShopLogo = null;
            activeShopSlug = null;
          }

          // กฎเดียวกับ jwt callback เป๊ะ ๆ (เรียก helper ตัวเดียวกัน — ดู lib/onboarding-gate.ts)
          // jwt เป็นตัวที่ proxy.ts อ่านไปบังคับ redirect ที่ edge, อันนี้เป็นตัวที่ UI อ่านไปแสดงสถานะ
          // ต้องเรียกหลัง resolvedActiveShopId เสมอ
          // needsPhoneVerify = bool (ไม่ leak phone จริงเข้า session)
          const gate = resolveOnboardingGate({
            personalShopId: personal?.id ?? null,
            personalShopSlug: shopSlug,
            activeShopId: resolvedActiveShopId,
            hasPhone: !!user.phone,
          });
          const needsPhoneVerify = gate.needsRegistration; // เฟส 1 /register
          const needsOnboarding = gate.needsOnboarding; // เฟส 2 /onboarding

          // feature 00015 TD-002 — skip-window 5 นาทีหลัง sign-in ด้วย phone-otp เท่านั้น
          // (ใช้ที่ order-access.service.ts::resolveOrderAccess ตัดสิน PHONE_MATCH_AUTO_CLAIM)
          const justAuthedViaPhoneOtp =
            (token as { authProvider?: string }).authProvider === "phone-otp" &&
            Date.now() - ((token as { authAt?: number }).authAt ?? 0) < PHONE_OTP_CLAIM_SKIP_WINDOW_MS;

          (session as any).user = {
            id: user.id, displayName: user.displayName, username: user.username,
            email: user.email, avatar: user.avatar, isShop: user.isShop,
            isAdmin: user.isAdmin, trustScore: user.trustScore,
            shopSlug, needsOnboarding, needsPhoneVerify,
            activeShopId: resolvedActiveShopId, activeShopRole, hasBusinessMembership,
            // FB switcher (origin/main): active shop identity สำหรับ topbar/sidebar
            activeShopKind, activeShopName, activeShopLogo, activeShopSlug,
            // feature 00012 (Lazy Personal shop): ให้ layout/choose-shop รู้ว่า user มีร้านของตัวเองไหม
            // (ผู้ถูกเชิญ = false แม้เป็น ADMIN business) — ใช้ตัดสิน 0-shop/invited-only state
            hasPersonalShop: !!personal,
            justAuthedViaPhoneOtp,
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

// Helper สำหรับ route ที่ต้อง login (buyer/seller/admin คนใดก็ได้) — เช่น แจ้งมิจฉาชีพ
export async function requireAuth() {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return null;
  }
  return session.user as any;
}
