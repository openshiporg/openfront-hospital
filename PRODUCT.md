# Product

<!-- impeccable:product-schema 1 -->

> Inferred on 2026-10-25 from the README, routes, storefront data and the owner's redesign brief (`~/Code/Euler/state/briefs/batches-2-6-full-redesign-2026-10-25.md`). The owner ordered the work without an interview round; every fact below is read from the repository, not confirmed in conversation.

## Platform

web

## Users

- **Clinic and hospital staff** (inferred): front desk and registration, schedulers, nurses working the care queue and inpatient beds, clinical fulfilment (orders, results, referrals), billing/claims staff and administrators.
- **Patients and families** (inferred): choosing a service or clinician, requesting a visit time, and completing pre-visit intake from a private link, usually on a phone.

## Product Purpose

Openfront Hospital is a self-hostable care-booking and hospital-operations application. Visitors explore care services and providers, request appointments and complete intake. Staff coordinate registration, scheduling, patient records, encounters, inpatient capacity, clinical fulfilment, claims, communication and reporting.

## Positioning

A practice-owned, open-source front door and operations desk in one codebase: requests, intake and the day's operational work without a separate portal vendor.

## Operating Context

- Demo practice: **Northstar Family Care**, Northstar Downtown Clinic (fictional), with primary care and behavioral health, three clinicians, two facilities, visit types and a provider schedule.
- Requests are confirmed by staff; online requests are not emergency care.

## Capabilities and Constraints

- Shared dashboard shell must stay byte-identical to Openfront E-commerce. No new environment variables. Onboarding and seed files are not changed by design work.
- Fixture, non-clinical and readiness provenance copy must be kept (it is a deliberate non-claim).

## Evidence on Hand

- Photography in `public/images/` (hero, care, clinicians, departments, facilities). No testimonials, outcomes or ratings exist; none may be invented.

## Product Principles

1. Staff see the day's patients and the next step for each within the first screen.
2. Patient identity is unmistakable wherever a record is acted on.
3. The public site is honest about what a request is: staff confirm every time, and it is not emergency care.
