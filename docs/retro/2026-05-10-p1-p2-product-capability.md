# Retro — P1+P2: Product capability flags

## Result
- Schema + registry SSOT พร้อม + data migration map type เดิมตรง semantic
- Form V2 มี 4 type presets + advanced override + per-period billing
- Backward compat — product เก่าทุกชิ้นทำงานต่อได้
- 13 commits (P1+P2 baseline + 7 feature commits with amends): registry, validations, schema, service, form bundle, preview panel
- Service tests: 23 PASS (15 existing + 8 new capability combos)
- Type-check clean ทั้ง P1+P2

## Coverage
✅ Schema migrated (local Docker + Supabase dev)
✅ Registry SSOT — 4 presets, single import for FE+BE+UI
✅ Validations — Valibot picklist derived from registry
✅ Service — capability fields persisted + serialized
✅ API routes — clean pass-through (no changes needed)
✅ Form V2 — 4 pills, capability override, billing period card, dynamic price label
✅ Preview panel — capability badges, per-cycle price label
✅ Backward compat (PHYSICAL existing rows preserved)
⚠️ UI rendering smoke test — DEFERRED (Chrome DevTools MCP unavailable mid-session)

## Issues encountered + fixes

1. **Task 1 (registry)** — `as const satisfies Record<string, ProductTypeMeta>` narrows union, ทำให้ `meta.defaults.billingPeriod` access fail บน PHYSICAL/DIGITAL/SERVICE union. Fix: type annotation `: ProductTypeMeta` widen back ใน `deriveCapabilityDefaults`.

2. **Task 2 (validations)** — `[...readonly_tuple]` spread → readonly tuple ถูก widen เป็น string[], Valibot literal union หาย. Fix: ใช้ readonly tuple ตรงๆ ใน v.picklist (Valibot รองรับ MaybeReadonly).

3. **Task 4 (service)** — DTO ใช้ loose `string` แทน registry narrow unions. Fix: import + use FulfillmentMode/BillingMode/BillingPeriod ใน Create/UpdateProductInput.

4. **Bundle 6-11 (form)** — Stale billingPeriod state เมื่อ user manually เปลี่ยน billingMode ใน CapabilityCard (RHF เก็บค่าเก่าหลัง BillingPeriodCard unmount). Fix: useEffect ใน ProductFormV2 reset billingPeriod + billingPeriodDays เมื่อ billingMode !== RECURRING.

5. **Bundle 6-11** — Yup `.max(365)` + `.integer()` ขาด Thai error message. Fix: เพิ่ม message.

6. **Task 12 (preview panel)** — commit Base path ชี้ src/app/ แทน theme/ (ผิด Hard Rule #3). Fix: amend ใช้ theme/paces/.../product-details/components/ProductDetails.tsx (ตามที่ ProductPreviewPanel.tsx file header cite อยู่แล้ว).

## Convention adopted (promote ไหน?)

- **Registry-driven enum** pattern (registry → derive Valibot picklist + Yup oneOf + UI options) — useful pattern ที่ scale ได้. ถ้า project มี enum หลายตัวที่ทำแบบนี้ น่าจะ promote ขึ้น CLAUDE.md เป็น default ของ feature ที่มี enum-with-config.
- **Bundle commits ตาม atomic unit** — Tasks 6-11 ใน plan แยก task แต่ commit รวม (เพราะ tsc ไม่ผ่านจนกว่าจะ wire ครบ). Subagent workflow รองรับ bundle ได้ดี — ก่อน dispatch ตรวจ atomic boundary ก่อน split tasks.

## Action items

- [ ] เขียน plan P3 (order flow NO_SHIPPING — hide address conditional ใน OrderCreateForm + PublicOrderClient)
- [ ] เขียน plan P4 (recurring dashboard — subscription helper service + RecurringDashboardCard widget + next-cycle endpoint)
- [ ] Browser-level UI QA ผ่าน Chrome DevTools MCP — เมื่อ MCP available
- [ ] User flow validation: ป้าๆ ลองสร้าง subscription/insurance product ครั้งแรก — ใช้ได้ไหม? พบประเด็น UX ใหม่?
