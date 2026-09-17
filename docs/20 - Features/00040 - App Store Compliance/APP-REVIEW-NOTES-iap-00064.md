# App Review Notes — รอบเปิด In-App Purchase (feature 00064)

> วางข้อความในกล่อง **App Review Information → Notes** ของ App Store Connect
> เขียนเป็นภาษาอังกฤษเพราะทีมรีวิวอ่านอังกฤษ · ช่องนี้จำกัด **4,000 ตัวอักษร**
>
> 🛑 **รอบนี้กลับทิศจาก `APP-REVIEW-NOTES-resubmit.md`** — รอบก่อนเราบอกว่า "เอาทางซื้อ
> ออกหมดแล้ว" (3.1.3(b)) รอบนี้เราบอกว่า "ทำ IAP แล้ว" · อย่าส่งโน้ตเก่าซ้ำเด็ดขาด
> เพราะสองข้อความนี้ขัดกันเอง และคนตรวจเห็นประวัติทุกรอบ

---

## 🛑 ก่อนวางโน้ต ต้องเสร็จ 3 ข้อนี้ก่อน

| # | ต้องทำ | ไม่ทำแล้วเป็นยังไง |
|---|---|---|
| 1 | สินค้าสมาชิกทั้ง 3 ตัวต้องมี screenshot แล้วกด **Add for Review** | สินค้าไม่ถูกส่งไปพร้อมบิลด์ ⇒ คนตรวจกดซื้อแล้วไม่มีอะไรขึ้น = ตีกลับข้อเดิม |
| 2 | env `APPLE_IAP_KEY_ID` / `APPLE_IAP_ISSUER_ID` / `APPLE_IAP_PRIVATE_KEY` บน Vercel prod | ตัวเดินตรวจซ้ำตอบ 503 · สิทธิ์ที่หลุดจะไม่มีใครตามเก็บ |
| 3 | บัญชี `appreview` ต้อง **ไม่มีแพ็กเกจที่ใช้งานอยู่** | หน้าจะขึ้น "คุณใช้แพ็กเกจ ... อยู่แล้ว" แทนปุ่มซื้อ ⇒ คนตรวจสรุปว่าไม่มี IAP |

ข้อ 3 ตรวจเร็ว ๆ ได้โดยล็อกอิน `appreview` ในแอปแล้วกดตามทางในโน้ต — ต้องเห็นปุ่มซื้อ 3 ปุ่ม

---

## ข้อความที่ให้ก็อปไปวาง

```
Hello App Review Team,

This build adds In-App Purchase for our subscription plans, which was the
issue raised in the previous review. Everything below is new in this build.

── Guideline 3.1.1 — In-App Purchase ───────────────────────────────────────

Subscriptions are now sold through StoreKit as auto-renewable in-app
purchases. There is no other purchase path anywhere in the iOS app: no
account top-up, no payment-slip upload, and no link pointing to a purchase
page outside the app.

Purchases are validated on our server using the App Store Server API and
App Store Server Notifications V2, so entitlements are granted only after
Apple confirms the transaction.

── Where to find the purchase screen ───────────────────────────────────────

From the bottom tab bar:

  Shop  ->  Manage shop  ->  My package

That screen lists the three plans with the price supplied by StoreKit, the
renewal period, a Restore Purchases button, and links to our Terms of Service
and Privacy Policy.

To change or cancel a plan, the screen directs the user to the iOS
Subscriptions settings, as required.

── Demo account ────────────────────────────────────────────────────────────

Username: appreview
Password: (as provided in the App Review Information fields)

This account intentionally has NO active subscription, so the purchase
buttons are visible and can be exercised. The demo shop also contains sample
products, orders and chat threads.

── Testing notes ───────────────────────────────────────────────────────────

The app is a business tool for merchants in Thailand. Its interface is in
Thai. The purchase screen is titled "แพ็กเกจธุรกิจ" (Business packages) and
the purchase buttons read "สมัคร" (Subscribe).

Purchases made from a TestFlight or sandbox environment are accepted by our
server and grant the entitlement, so the full flow can be verified end to end.

If a purchase is confirmed but the entitlement does not appear immediately,
the app recovers it automatically the next time it is opened; the Restore
Purchases button on the same screen also recovers it on demand.

── If you sign in with your own Apple ID ───────────────────────────────────

Creating a NEW merchant account is intentionally not available inside the app.
We removed it in response to your earlier guidance ("Remove the account
registration features for business and organizations").

So if you sign in with an Apple ID that has never been used with Deep, you will
reach a screen saying the account has not joined any shop yet. That screen is the
expected result, not an error. Please use the demo account above to review the
app's functionality.

── Sign in with Apple ──────────────────────────────────────────────────────

Sign in with Apple remains available and is presented as the first login
option on the sign-in screen, on the staff invitation screen, and in Account
Settings.

Thank you for your time.
```

---

## ข้อควรระวังตอนกรอก

- **อย่าเอ่ยถึงราคาบนเว็บ หรือบอกว่าซื้อที่อื่นถูกกว่า** — เชิญให้เทียบราคาคือเชิญปัญหา
  ราคาที่แสดงในแอปมาจาก StoreKit ตรง ๆ ตามที่ตั้งใน App Store Connect
- **อย่าใส่ลิงก์เว็บไซต์ในโน้ต** (คลาสเดียวกับข้อห้ามใน `OAuthErrorNotice` — ดู
  `app-no-account-notice.test.ts` ที่บังคับกฎนี้กับข้อความบนจอ)
- ทางกดต้องเขียนเป็น **ลำดับการกดจริงบนมือถือ** ไม่ใช่ชื่อ URL — แอปเป็น WebView
  คนตรวจพิมพ์ URL เองไม่ได้ (นี่คือสาเหตุที่ถูกตีกลับรอบที่ผ่านมา)
- ถ้าคนตรวจใช้ iPad ให้ยืนยันเองก่อนว่า Sign in with Apple บน iPad ผ่านจริง
  (`TestCase.md` TC-IAP-49 ยังไม่เคยยืนยัน)

## หลังกดส่งแล้ว

🛑 **ห้าม deploy deep-web และห้าม `eas update`** จนกว่ารีวิวจะจบ — คนตรวจจะได้โค้ด
คนละชุดกับที่เราทดสอบ (ดู memory `appstore-review-freeze`)
