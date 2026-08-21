import NextAuth from "next-auth";
import { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  parseAppleUserField,
  rememberAppleSignupName,
  subFromIdToken,
} from "@/lib/apple-signup-name";

const handler = NextAuth(authOptions);

export { handler as GET };

/**
 * POST — ห่อ handler ของ next-auth ไว้ชั้นหนึ่ง **เฉพาะ callback ของ Apple**
 *
 * 🛑 Apple ส่ง "ชื่อจริง" ของผู้ใช้มาเป็น form field ชื่อ `user` ในตัว POST นี้ **ครั้งเดียว
 * ตลอดชีวิตของบัญชี** (ครั้งแรกที่กดอนุญาต) และ **ไม่ได้ใส่ไว้ใน ID token** ส่วน
 * `next-auth/providers/apple` อ่านจาก `profile.name` ซึ่งเป็น claim ที่ไม่มีอยู่จริง ⇒ ชื่อหายทุกครั้ง
 * ⇒ ผู้ใช้ที่สมัครด้วย Apple ได้ชื่อว่า "User" เหมือนกันหมด แล้วระบบต้องไปถามชื่อทีหลัง
 * ซึ่งคือข้อที่ Apple ตีกลับมา **2 รอบ** (Guideline 4 - Design · 2026-08-19 และ 2026-08-21)
 *
 * ที่นี่คือ **จุดเดียว** ที่มองเห็น body ดิบก้อนนั้นได้ — พอเข้าไปใน next-auth แล้วมันถูก
 * แปลงเป็น profile ที่ไม่มีชื่อไปเรียบร้อย
 *
 * 🛑 การอ่าน body ทำให้สตรีมถูกใช้ไปแล้ว ส่งต่อ `req` ตัวเดิมไม่ได้ ต้องประกอบ `Request`
 * ใหม่จากข้อความที่อ่านมา ไม่งั้น next-auth จะได้ body ว่างแล้วล็อกอิน Apple พังทั้งเส้น
 *
 * 🛑 ถ้าอะไรพังในชั้นนี้ **ต้องปล่อยผ่านไปให้ next-auth เสมอ** ห้าม throw — ชั้นนี้มีไว้เก็บ
 * "ชื่อ" ซึ่งเป็นของแถม ส่วนตัวล็อกอินคือของหลัก การทำให้ล็อกอินพังเพื่อแลกชื่อไม่คุ้มเลย
 */
export async function POST(req: Request, ctx: unknown) {
  if (!new URL(req.url).pathname.endsWith("/callback/apple")) {
    return handler(req, ctx);
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    // อ่านไม่ได้ = ส่งต่อตัวเดิมไปเลย (สตรีมยังไม่ถูกใช้เมื่อ text() โยน)
    return handler(req, ctx);
  }

  try {
    const form = new URLSearchParams(body);
    const name = parseAppleUserField(form.get("user"));
    const sub = subFromIdToken(form.get("id_token"));
    if (name && sub) rememberAppleSignupName(sub, name);
  } catch {
    /* เก็บชื่อไม่ได้ก็ไม่เป็นไร — ผู้ใช้ยังล็อกอินได้ แล้วค่อยตั้งชื่อเองทีหลัง */
  }

  /**
   * ประกอบใหม่ให้เหมือนเดิมทุกอย่าง เหลือแค่ body ที่กลับมาอ่านได้
   *
   * 🛑 ต้องเป็น **`NextRequest`** ไม่ใช่ `Request` ธรรมดา — `NextAuthRouteHandler` ของ next-auth
   * อ่าน `req.nextUrl.searchParams` (ดู `node_modules/next-auth/next/index.js`) ซึ่งเป็นสมบัติ
   * ของ `NextRequest` เท่านั้น ส่ง `Request` เปล่าไปจะได้ `undefined.searchParams`
   * ⇒ **ล็อกอิน Apple พังทั้งเส้น** โดย tsc มองไม่เห็นเลย (พารามิเตอร์ของ handler เป็น any)
   *
   * ส่วนคุกกี้/เฮดเดอร์ที่ next-auth ใช้จริงมาจาก `next/headers` ไม่ได้มาจากอ็อบเจกต์นี้
   * (ตรวจแล้วในซอร์สเดียวกัน) การประกอบใหม่จึงไม่ทำให้ session/CSRF หาย
   */
  const replay = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body,
    /* undici ต้องการ duplex เมื่อมี body — type ของ NextRequest รับให้แล้ว ไม่ต้อง ts-expect-error
       (ต่างจาก `Request` ของ lib.dom ที่ยังไม่มีฟิลด์นี้) */
    duplex: "half",
  });

  return handler(replay, ctx);
}
