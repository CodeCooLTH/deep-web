# App Review Notes — ส่งรีวิวรอบใหม่ (แก้ 3.1.1 + 4.8)

> วางข้อความในกล่อง **App Review Information → Notes** ของ App Store Connect
> เขียนเป็นภาษาอังกฤษเพราะทีมรีวิวอ่านอังกฤษ

---

## ข้อความที่ให้ก็อปไปวาง

```
Hello App Review Team,

Thank you for the detailed feedback on Submission ID 75e3886e-5361-4d07-bd31-aca00e38d051.
We have addressed both issues. Details below.

── Guideline 4.8 — Login Services ──────────────────────────────────────────

We have implemented Sign in with Apple. It is now offered wherever any
third-party login is offered, and it is presented as the FIRST and most
prominent option, above Facebook and LINE:

  1. Seller sign-in screen
  2. Staff invitation acceptance screen
  3. Account Settings → "Sign-in methods" (existing users can link Apple
     to an account they already have)

── Guideline 3.1.1 — In-App Purchase ───────────────────────────────────────

We have removed ALL purchasing paths from the iOS app. Inside the app there
is now no way to buy a subscription, no way to add funds, no pricing, and no
link or call-to-action pointing anywhere a purchase could be made.

Specifically, when the app is opened these are not present:
  • Top-up / add funds buttons and the payment-slip upload form
  • Subscription plan pages and any plan pricing
  • Upgrade prompts and package badges
  • Any link to a purchase page, including links to our own website

The app is a business management tool for merchants (order management,
customer chat, shipping labels, inventory). Merchants who already have an
active subscription can continue using the features they previously
purchased, which we understand is permitted under 3.1.3(b).

The account credit balance is still displayed as read-only account status.
It is not a purchase mechanism and offers no way to add funds. We show it
because the same balance is consumed when a merchant sends an SMS to their
own customer — without it, merchants cannot tell why an SMS failed to send.
Please let us know if you would prefer this removed as well.

── Demo account ────────────────────────────────────────────────────────────

Username: appreview
Password: (as provided in the App Review Information fields)

The demo shop contains sample products, orders and chat threads so all
features can be exercised.

── Note on testing Sign in with Apple ──────────────────────────────────────

Sign in with Apple works correctly. However, creating a BRAND NEW account
through any sign-in method (including Apple) requires verifying a Thai
mobile number via SMS, which is not practical from outside Thailand.

To review the app's functionality, please sign in with the demo account
above. If you would like to verify the Sign in with Apple flow itself, you
can tap the button and complete Apple's authentication — you will then reach
our phone verification step, which confirms the flow is working end to end.

Thank you for your time. We are happy to provide any further information.
```

---

## ข้อควรระวังตอนกรอก

**รหัสผ่านบัญชีทดสอบ** — ใช้ตัวที่กรอกไว้ในช่อง App Review Information อยู่แล้วตั้งแต่ build 2
(สคริปต์ `create-appstore-review-account.ts` สุ่มรหัสใหม่ทุกครั้งที่รัน **อย่ารันซ้ำ**
ก่อนส่งรีวิว ไม่งั้นรหัสที่ทีมรีวิวถืออยู่จะใช้ไม่ได้)

**ต้องอัปภาพหน้าจอใหม่ด้วย** — Apple เขียนสั่งไว้เองในจดหมาย:
> "it would be appropriate to update the screenshots in the app's metadata to
> accurately reflect the revised app once another login service has been implemented"

อย่างน้อยภาพหน้าล็อกอินต้องเห็นปุ่ม **"เข้าสู่ระบบด้วย Apple"**

**ย่อหน้าเรื่องยอดเครดิต** เขียนแบบเปิดช่องให้เขาบอกได้ว่าอยากให้เอาออก — ตั้งใจ
ถ้าเขาติดใจจะได้ตอบกลับสั้น ๆ แล้วแก้ ดีกว่าโดนตีกลับทั้งรอบแล้วเสียเวลาอีก 1-2 วัน

---

## 🛑 ทดสอบ Sign in with Apple บน localhost ไม่ได้

ไม่ใช่ของเสีย — Apple บังคับ **https + โดเมนที่ลงทะเบียนไว้** เท่านั้น

Return URL ที่ลงทะเบียนไว้คือ `https://seller.deepthailand.app/api/auth/callback/apple`
ถ้ากดจาก `http://seller.deepth.local:4000` ค่า redirect ที่ส่งไปจะไม่ตรง Apple ปฏิเสธทันที

เหมือน Facebook login ทุกประการ (โปรเจกต์บันทึกไว้ตั้งแต่ 2026-06-17 ว่า "เทส FB ได้บน prod เท่านั้น")

| ทดสอบที่ | Apple login | ผูก Apple ที่ /account |
|---|---|---|
| `seller.deepth.local:4000` (เครื่องตัวเอง) | ไม่ได้ | ไม่ได้ |
| `seller.deepthailand.app` (เบราว์เซอร์) | ได้ | ได้ |
| แอปใน TestFlight | ได้ | ได้ |

แอปโหลดเว็บ prod อยู่แล้ว → ทดสอบใน TestFlight ได้ผลเหมือนเปิดเบราว์เซอร์บนเว็บจริงทุกอย่าง
