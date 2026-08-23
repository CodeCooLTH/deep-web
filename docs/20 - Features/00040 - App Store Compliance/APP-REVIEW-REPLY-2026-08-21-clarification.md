# คำตอบถึง App Review — ขอความชัดเจนเรื่อง 3.1.1 / 3.1.3(c)

**วันที่:** 2026-08-21 · **Submission ID:** `75e3886e-5361-4d07-bd31-aca00e38d051`

## วิธีใช้

ก็อปเฉพาะข้อความในบล็อก ``` ด้านล่าง ไปวางใน **App Store Connect → App Review → Reply**
(ไม่ต้อง build ใหม่ ไม่ต้องกด Resubmit — ข้อความนี้เป็นการ *ถามให้ชัด* ก่อนตัดสินใจแก้)

## 🛑 กติกาที่ยึดตอนเขียน

**ห้ามอ้างสิ่งที่ระบบไม่ได้บังคับจริง** — ตรวจโค้ดแล้วพบว่า `subscribeBusinessPackage()`
มีเงื่อนไขเดียวคือ "มีร้านส่วนตัว" ไม่มีด่านไหนบังคับว่าต้องเป็นนิติบุคคล ⇒ **ห้ามเขียนว่า
"ผู้ใช้ของเราทุกคนเป็นองค์กร"** เพราะไม่จริง และถ้าเขาขอหลักฐานเราจะตอบไม่ได้

สิ่งที่เขียนได้เพราะตรวจแล้วว่าจริง:
- แอป iOS **ไม่มีช่องทางจ่ายเงิน ไม่มีราคา ไม่มีปุ่มซื้อ และไม่มีลิงก์ไปหน้าซื้อทุกชนิด
  รวมลิงก์ไปเว็บของเราเอง** — บังคับด้วย `isPaymentRestricted()` + ด่าน `[blocker]` 15 เคส
  (`src/lib/__tests__/no-payment-entry-in-app.test.ts`)
- สิ่งที่ขายบนเว็บมี 2 อย่าง: Business Package (โควตาจำนวนธุรกิจ/แอดมิน) และ Deep Stock
  (ระบบสต๊อกสินค้า)
- แอปนี้เป็นเครื่องมือให้ผู้ขายบริหารร้าน (ออเดอร์ · การจัดส่งสินค้าจริง · แชทลูกค้า)

---

```
Hello,

Thank you for the detailed feedback. We have addressed the Guideline 4 (Design)
issue and will include the fix in our next build.

Regarding Guidelines 3.1.1 and 3.1.3(c), we would like to make sure we resolve
this correctly rather than guess, so we would appreciate your clarification on
the points below.

WHAT THE APP IS

Deep Seller is a business operations tool for merchants. Its functions are order
management, physical goods shipping, customer messaging, and sales reporting. It
is not a consumer content or entertainment app.

WHAT WE SELL (ON OUR WEBSITE ONLY)

1. Business Package - a quota-based plan that controls how many separate business
   accounts a merchant can operate and how many staff administrators can be added
   to each one. Tiers: 1 business / 1 admin, 3 businesses / 3 admins, and
   unlimited.

2. Deep Stock - an inventory management add-on.

To be transparent: our sign-up flow does not currently require a merchant to be a
registered legal entity. An individual sole proprietor can create an account and
purchase these plans on our website. We understand this is the point your review
identified, and we are not claiming otherwise.

WHAT THE APP CONTAINS TODAY

The iOS app does not display any prices, plan names with prices, purchase buttons,
upgrade prompts, or links of any kind to a purchase page - including links to our
own website. This is enforced in code and covered by automated tests that block
release if any purchase entry point reappears.

The app does display the merchant's remaining account credit and its usage history,
because the same credit balance is also consumed by SMS delivery charges. Without
it, a merchant would have SMS notifications fail with no explanation. We can remove
this as well if you consider it a purchase-related element.

OUR QUESTIONS

1. Which specific item does the review consider to require In-App Purchase - the
   Business Package, Deep Stock, or both?

2. Guideline 3.1.3(c) refers to services sold to organizations or groups of
   employees. If we restricted these plans so that only verified registered legal
   entities (companies, partnerships) can purchase them, and individual sole
   proprietors could not, would that satisfy the enterprise services exception?

3. Alternatively, if we removed the paid functionality itself from the iOS app -
   so that the app never exposes any feature unlocked by a paid plan - would that
   resolve the issue without In-App Purchase?

We want to make one change that is correct rather than several that are not, so
your guidance on which direction to take would be very helpful.

Thank you for your time.

Deep Thailand
```

---

## หลังส่งแล้วคาดหวังอะไร

- Apple ตอบใน ASC ปกติ **1–3 วันทำการ**
- คำตอบที่ได้จะบอกว่าให้เดินทางไหน ⇒ ค่อยตัดสินใจ A (จำกัดเฉพาะนิติบุคคล) / B (เพิ่ม IAP) /
  C (ซ่อนตัวฟีเจอร์ในแอป)
- 🛑 **ยังไม่ต้อง build ใหม่และยังไม่ต้องกด Resubmit** จนกว่าจะรู้คำตอบ — ส่งไปตอนนี้ = โดนตีกลับ
  ข้อเดิมเป็นรอบที่ 3

## ถ้าเขาตอบแบบกำกวม

ขอ **App Review Appointment** (นัดคุยกับทีมรีวิว มีทุกอังคาร/พฤหัส) หรือกด
*"Request a phone call from App Review"* ที่อยู่ท้ายจดหมายฉบับที่เขาส่งมา — เร็วกว่าตอบไปมา
