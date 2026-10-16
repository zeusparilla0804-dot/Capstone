# LA Chef Package Catalog, Pricing, And Experience Design

## Status

Approved for implementation planning on October 12, 2026.

## Objective

Replace the product-like package catalog with a premium, service-led editorial experience and make package pricing accurately represent LA Chef's supplied promotional materials. Regular package bookings retain automatic pricing, use an editable estimated guest count, and remain separate from negotiated custom-event quotations.

## Source Of Truth

`docs/CLIENT_CATALOG_REFERENCE.md` is the catalog source until LA Chef supplies updated, approved data. The implementation must support:

- Standard catering tiers at PHP 480, PHP 580, and PHP 680 per guest.
- Amethyst at PHP 85,888 including 50 guests, then PHP 650 per excess guest.
- Diamond at PHP 138,888 including 100 guests, then PHP 750 per excess guest.
- Ruby at PHP 198,888 including 120 guests, then PHP 850 per excess guest.
- The documented add-on prices and package inclusions.

The client has not confirmed official maximum guest counts for these packages. The UI and booking validation must not present current sample ranges such as 30-80 as official facts. Date-capacity rules remain governed by the approved booking-capacity specification.

## Pricing Model

Each package uses exactly one pricing type:

- `PER_HEAD`: `packageTotal = pricePerGuest * estimatedGuestCount`.
- `BASE_PLUS_EXCESS`: `packageTotal = basePrice + max(estimatedGuestCount - includedGuests, 0) * excessGuestPrice`.

The package model includes `pricingType`, nullable `pricePerGuest`, nullable `basePrice`, nullable `includedGuests`, nullable `excessGuestPrice`, nullable `minGuests`, and nullable `maxGuests`. Database constraints enforce the fields required by each pricing type. Missing client-confirmed minimum or maximum values remain null rather than being invented.

Reservations snapshot the selected package name, pricing type, all applicable rate fields, estimated guest count, calculated package total, add-ons, subtotal, discount, and total. Later catalog edits must not change an existing reservation's financial record.

## Regular Package Booking

The customer chooses a published package and enters an **estimated number of guests**. The form recalculates pricing immediately using the package's pricing type. It shows the formula in plain language, including the number of guests already included for base-plus-excess packages.

The customer may also select add-ons and provide a special request. Add-ons remain separate line items and do not silently change package inclusions.

A customer may update the date, time, venue, estimated guest count, add-ons, and special request while the reservation is `PENDING`. Every update reruns package validation, authoritative date-capacity checking, and price calculation in a transaction. Once the reservation leaves `PENDING`, the interface directs the customer to contact LA Chef for changes; it does not mutate an approved financial commitment.

Package guest constraints apply only when a non-null, client-confirmed minimum or maximum exists. The universal input boundary remains 1 through 10,000 guests. Date availability remains a separate rule and is rechecked on submission and pending-booking edits.

## Package Discovery Experience

The packages page uses an editorial experience list instead of an ecommerce card grid:

- Each package occupies a full-width row with a large event gallery and a calm information column.
- Rows alternate image and content placement on wide screens and stack image-first on mobile.
- The category, package name, short story, pricing explanation, and selected inclusion highlights form the hierarchy.
- Pricing is described as planning information, not a sale badge or product price.
- Primary action: `Plan with this package`.
- Secondary actions: `View full inclusions` and `Customize this package`.
- `Customize this package` opens the custom-event request with the package recorded as inspiration; it does not enter automatic checkout.

The media interaction keeps subtle position dots. On touch devices, customers swipe. On pointer devices, clicking the left or right image region navigates the gallery. Visible boxed arrow buttons are not used. Keyboard controls and accessible labels remain available.

The `Custom Events` filter does not display a fictional fixed-price package. It presents the dedicated quotation route and explains that pricing follows LA Chef review.

## Responsive And Visual Direction

- Desktop rows use a stable two-column editorial grid with approximately 56 percent media and 44 percent content.
- Tablet layouts preserve readable proportions without shrinking controls below 44 CSS pixels.
- Mobile layouts use one column, stable image aspect ratios, full-width primary actions, and no horizontal page scroll.
- Cards are not nested inside cards. Borders and shadows are minimal.
- Use the existing warm neutral design tokens, restrained olive accents, serif display typography, and client imagery.
- Motion is limited to image transitions and small action feedback, respects reduced-motion preferences, and never delays navigation.

## Admin Catalog Management

The existing admin package form gains a pricing-type control. Fields change according to the selected type, and validation is performed in both Angular and Express. Guest minimum and maximum are optional. Admin list rows show the human-readable pricing formula rather than assuming every package is per-head.

Catalog changes continue to use existing admin authorization and audit logging. No public or customer endpoint can alter package prices.

## API Contract

Public package responses expose the complete typed pricing model and structured inclusions. Existing package identifiers remain stable.

Regular booking creation keeps `POST /api/bookings` and accepts the existing fields plus `specialRequest`. The server ignores client-computed totals and calculates all amounts from current active package and add-on records.

Add `PATCH /api/bookings/:id/details` for the owner of a `PENDING` reservation. It accepts the editable booking fields, revalidates them, recalculates pricing, and returns the updated booking. Ownership failures return 404, invalid state returns 409, and changed date capacity returns the existing safe capacity conflict code.

## Error Handling And Security

- The server remains authoritative for rates, included guests, excess rates, add-ons, and totals.
- All SQL is parameterized and updates use transactions.
- Invalid pricing combinations are rejected before persistence.
- Duplicate submission and update controls show pending state and prevent repeated requests.
- Failed updates preserve the customer's form and display actionable field or capacity errors.
- No package response exposes unpublished administrative data.

## Testing And Completion

Tests cover both formulas, boundary guests at and above included capacity, null guest limits, package snapshots, pending edits, rejected non-pending edits, capacity conflicts, admin pricing validation, editorial rendering, gallery keyboard/touch behavior, and responsive layouts at 390, 768, 1024, and 1440 pixels.

This feature is complete when the official supplied prices are represented without invented capacity claims, every automatic total is calculated identically by frontend preview and backend authority, pending estimates can be safely changed, and the package discovery UI reads as a catering-service portfolio rather than an online store.

## Out Of Scope

- Editing the approved paper
- Guessing client-unconfirmed package names or maximum capacities
- Customer changes after admin approval
- Negotiated menu, setup, or service pricing
- Online payment-gateway integration
