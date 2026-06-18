# Scope Baseline — Feature #00001 Login & Onboarding (Modal redesign)

> วันที่: 2026-06-18 · สถานะ: **SIGNED-OFF (implemented)** · เจ้าของ scope: safepay-product
> Feature docs (SSOT): `docs/20 - Features/00001 - Login & Onboarding/` (PRD/BRD/SRS/SDS/DATABASE/API/Tests)
> baseline นี้สรุป S-id เพื่อ traceability commit ↔ scope (agent-team-phase Gate 0)

## Resolved Decisions (PRD §10.3, user 2026-06-18)
Leaflet/OSM (ฟรี) · ตรวจพิกัดระดับจังหวัด warn-not-block · achievement "สมาชิกผู้ก่อตั้ง 2026" (SIGNUP_YEAR) · category ≤5 · รูป ≤5MB/≤5 · checklist รวม optional ซ่อนเมื่อครบ · seller เก่าไม่เด้ง modal

## Scope items (S-id ↔ FR ↔ commit)

| S-id | งาน | FR (BRD) / TFR (SRS) | commit | สถานะ |
|------|-----|----------------------|--------|-------|
| **S-001** | DB migration: Shop +categories[]/+salesChannels[]/+lat/lng, Product +sku, GIN, backfill; badge rename | DATABASE.md | `c01b1b2` | ✅ |
| **S-002** | Validation schemas (sales channels/categories≤5/geo/shop-update) | TFR-007/008/009/010 §9 | `a5833de` | ✅ |
| **S-003** | API: sales-channels, categories | FR-LO-07/08 · TFR-007/008 | `a5833de` | ✅ |
| **S-004** | API: shops/update (+lat/lng XOR), geo/reverse (Nominatim proxy) | FR-LO-09 · TFR-009/010 | `a5833de` | ✅ |
| **S-005** | API: onboarding-checklist (derived), badge-progress | FR-LO-12/13/11 · TFR-013/012 | `a5833de`,`609a34f` | ✅ |
| **S-006** | Leaf UI: SalesChannelPicker, CategoryMultiSelect, ProductImageDropzone, MapPicker | FR-LO-07/08/10/09 | `7e39bae` | ✅ |
| **S-007** | ThaiAddressSearch onSelect (expose province) | FR-LO-09 (verify พิกัด) | `7e39bae` | ✅ |
| **S-008** | OnboardingModal 5-step + state machine + wire API + summary achievement | FR-LO-06/11 · TFR-006/012 | `609a34f` | ✅ |
| **S-009** | ChecklistSidebar + OnboardingGate + dashboard integration (auto-open localStorage) | FR-LO-12/14 · TFR-014/006 · OD-6/7 | `609a34f` | ✅ |
| **S-010** | E2E Playwright (TC-LO) | Tests/00001-login-onboarding-e2e.md | — | ⏳ QA |

## Out of scope (Phase 2+)
sales channels บน public profile · admin onboarding analytics · Redis (in-memory cache) · S3 presigned preview URL (carry: ProductImageDropzone ใช้ /api/files/{fileId}) · Facebook provider session-detect (pre-tick — fallback ไม่ pre-tick)

## Carry / known
- `/api/upload` คืน fileId; preview `/api/files/{fileId}` (local OK; prod S3 private อาจต้อง patch route ให้คืน url)
- isNewSeller = localStorage flag (seller เก่าอาจเห็น modal ครั้งเดียวต่อ device — gated ด้วย checklist isComplete)
- E2E ต้อง restart dev server ก่อน (stale Prisma client หลัง migrate)
