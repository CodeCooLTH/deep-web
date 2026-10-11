---
title: "ส่วนขยาย 00040 — เปิดการสมัครบัญชีในแอป iOS ตั้งแต่ 1.0.3"
date: 2026-10-11
scope: แอปผู้ขาย iOS เท่านั้น (Android/เว็บ สมัครได้อยู่แล้ว ไม่เปลี่ยน)
---

# เปิดการสมัครในแอป iOS ตั้งแต่ 1.0.3

## ที่มา
- **2026-08-23:** Apple ตีกลับด้วยข้อ 3.1.1 ว่า *"account registration feature for businesses … = access to external mechanisms for purchases"* เราจึงปิดการสมัครในแอป iOS (`isSignUpRestricted`)
- **ผลที่ตามมา:** ผู้ใช้ใหม่กด Facebook/Apple/LINE ในแอปแล้วได้ "ไม่พบบัญชี"
- **2026-09-01 (feature 00064):** แพ็กเกจธุรกิจขายผ่าน **IAP ในแอป**แล้ว และช่องทางจ่ายเงินนอกแอปยังปิดทั้งหมด ข้อห้ามเดิมจึงไม่มีเหตุผลรองรับแล้ว
- **user สั่ง 2026-10-11:** ยื่นรีวิวรุ่นใหม่พร้อมการสมัคร ถ้าไม่ผ่านก็เอากลับ

## มติ
| # | มติ |
|---|---|
| D1 | **กั้นตามรุ่นแอป:** `IOS_SIGNUP_MIN_APP_VERSION = '1.0.3'` |
| D2 | **รุ่นบนสโตร์ห้ามเปลี่ยน:** ≤ 1.0.2 (ส่ง `DeepSellerApp/1.0` ตายตัว) หรือไม่รู้รุ่น ⇒ ห้ามสมัครเหมือนเดิมทุกประการ (fail-closed) |
| D3 | **Apple ในแอปสร้างบัญชีได้** (รุ่น ≥ 1.0.3) ผ่าน `upsertAppleNativeUser` ซึ่งเป็นตัวสร้างเดียวกับทางเว็บ ชื่อมาจากแผ่นของระบบ จึงไม่ถามชื่อซ้ำ (Guideline 4) อีเมลมาจากโทเคนที่ตรวจแล้ว |
| D4 | **ไม่เปลี่ยน:** `isPaymentRestricted` / `isPaidFeatureRestricted` / IAP — ในแอปยังไม่มีช่องทางจ่ายเงินนอกแอปเลย |

**ทำไมต้องกั้นตามรุ่น:** แอปเป็น WebView ถ้าเปิดที่เว็บ แอป 1.0.2 ที่ Apple อนุมัติไปแล้วจะได้การสมัครทันที ทั้งที่ยังไม่ได้รับอนุมัติ ถ้ารุ่น 1.0.3 ไม่ผ่านรีวิว จะไม่มีผู้ใช้คนไหนได้รุ่นนั้น จึงไม่เสียอะไร

## สิ่งที่เปลี่ยน
**deep-web:**
- `app-shell.ts`: `parseAppVersion` · `isAppVersionAtLeast` · `isSignUpRestricted(shell, appVersion)`
  - `shouldBlockOAuthSignup` และ `shouldBlockAppRegistration` บังคับให้ส่ง `appVersion` (ลืมส่งจะคอมไพล์ไม่ผ่าน)
- จุดที่ส่งรุ่นเข้าเกณฑ์: `app-shell-server` (`getAppVersion`) · `proxy.ts` · `auth.ts` (`currentAppVersion`)
- `/api/login/apple-native`:
  - บัญชีถูกลบ ⇒ ตอบ `NO_ACCOUNT` เสมอ
  - ยังไม่เคยผูก + รุ่นที่สมัครได้ ⇒ สร้างบัญชีพร้อมชื่อ
  - รุ่นที่ยังห้าม ⇒ ตอบ `NO_ACCOUNT` เหมือนเดิม
- `apple-native-signin.ts`: ส่ง `fullName` ไปกับโทเคน

**deep-seller-app (1.0.3):**
- User-Agent ส่งรุ่นจริง `DeepSellerApp/${Constants.expoConfig.version}`

**หน้าจอในแอป iOS ≥ 1.0.3 (เหมือนบนเว็บ):**
- ลิงก์ "สมัครสมาชิก" กลับมา
- หน้า `/auth/sign-up` เปิดได้
- ปุ่ม "เปิดร้านของฉัน" ที่ `/choose-shop` กลับมา
- Facebook/LINE/Apple พาไปสมัครต่อได้ และ proxy ปล่อยให้ไป `/register` และ `/onboarding`

## เทส `[blocker]`
- `ios-app-signup-from-version.test.ts` (13)
- `apple-native-signup.route.test.ts` (7) เรียก route จริง
- แก้เทสเดิม 5 ไฟล์ให้ส่งรุ่นเก่า (`'1.0'`)
- mutation 7 แบบ แดงครบ
- ชุดเทสที่เกี่ยวกับล็อกอิน/สมัคร 41 ไฟล์ 456 เทส เขียว · tsc 0 · eslint ไม่มี error ใหม่
- dev server: แอป iOS 1.0 ไม่มีลิงก์สมัคร และ `/auth/sign-up` redirect (เท่ากับ main) · 1.0.3 มีลิงก์และเปิดฟอร์มได้ · Safari และแอป Android ไม่เปลี่ยน

## ⚠️ ถ้า Apple ไม่ผ่าน
- อย่าปล่อย 1.0.3
- ถ้าจะยื่นรุ่นถัดไป **โดยไม่มี** การสมัคร ต้องขยับ `IOS_SIGNUP_MIN_APP_VERSION` ขึ้นไปพ้นรุ่นนั้นก่อน ไม่งั้นรุ่นนั้นจะได้การสมัครทั้งที่ไม่ได้ขอ

## ข้อแลกที่รู้ตัว
ผู้ขายที่เคยผูก Apple ทางเว็บ ถ้า `sub` ไม่ตรงกับในแอป (identifier ยังไม่ถูกจัดกลุ่มในพอร์ทัล Apple) จะได้บัญชีใหม่แทนข้อความ "ไม่พบบัญชี" ซึ่งเป็นพฤติกรรมเดียวกับการสมัครด้วย Facebook/LINE บนเว็บ และมีทางผูกบัญชีคืนอยู่แล้ว (`/api/account/link/reclaim`)
