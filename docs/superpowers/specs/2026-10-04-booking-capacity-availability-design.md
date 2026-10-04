# LA Chef Booking Capacity And Date Availability Design

## Status

Approved for implementation planning on October 4, 2026.

## Objective

Add reliable date-availability checking to the existing LA Chef reservation flow so customers can see whether an event date can still accept their requested guest count and administrators can make informed approval decisions. The system must enforce the capacity rules documented in the approved project paper without inventing an exact limit for the undocumented 150-499 guest range.

The feature extends the existing Angular booking flow, Express API, SQL Server reservation model, and admin booking workflow. It does not replace the established architecture or change the project paper.

## Source Business Rules

The approved paper establishes these operating limits:

- LA Chef can generally handle three to six events per day depending on attendance.
- Events below 150 guests permit up to six events on the same date.
- Events from 500 through 999 guests permit up to three events on the same date.
- An event with 1,000 or more guests occupies the date by itself.
- The paper does not define an exact automatic capacity for events from 150 through 499 guests. LA Chef staff must confirm whether these requests can be accommodated.

These rules govern daily event count. They are not a single cumulative daily guest limit.

## Capacity-Consuming Statuses

The following active reservation statuses consume date capacity:

- `PENDING`
- `APPROVED`
- `AWAITING_PAYMENT`
- `PAYMENT_SUBMITTED`
- `PAYMENT_VERIFIED`
- `CONFIRMED`

The following statuses do not consume capacity:

- `REJECTED`
- `CANCELLED`
- `COMPLETED`

A newly submitted request becomes `PENDING` and consumes capacity immediately. Rejecting or cancelling it releases that capacity without a separate cleanup operation.

## Mixed-Size Date Rule

The largest active or proposed event on a date determines the documented hard ceiling for that date:

| Largest event on the date | Daily hard ceiling | Customer availability behavior |
| --- | ---: | --- |
| Below 150 guests | 6 active events | Automatic availability result |
| 150-499 guests | 6 active requests | `NEEDS_CONFIRMATION`; admin makes the accommodation decision |
| 500-999 guests | 3 active events | Automatic availability result |
| 1,000 or more guests | 1 active event | Automatic availability result |

The six-request ceiling for the 150-499 range is the paper's overall maximum event count, not a claim that all six can be fulfilled. Every request in this range still requires explicit admin capacity confirmation before approval.

Examples:

- Five active events below 150 guests leave one request slot.
- Two active events plus a proposed 600-guest event produce a three-event ceiling and leave no further slot after submission.
- Any active or proposed 1,000-guest event requires the date to contain no other active reservation.
- A 250-guest request may be submitted below the six-request ceiling, but the system does not claim that LA Chef can accommodate it until an admin confirms capacity.

## Customer Experience

The existing first booking step remains the entry point. Once both event date and a valid guest count are present, the frontend requests an availability result. It displays one of four states next to the date and guest fields:

- `AVAILABLE`: the documented hard ceiling has available capacity.
- `LIMITED`: the proposed request would occupy the final available request slot under the applicable hard ceiling.
- `NEEDS_CONFIRMATION`: the request or an active event on that date is in the 150-499 range and requires staff judgment.
- `FULL`: the proposed request would exceed the applicable hard ceiling.

The interface includes a short explanation and the remaining request slots without exposing other customers, venues, event types, or reservation details.

The customer may continue when the result is `AVAILABLE`, `LIMITED`, or `NEEDS_CONFIRMATION`. The form is blocked while checking or when the result is `FULL`. A failed availability request provides a retry action and does not falsely label the date available.

Availability shown in the browser is advisory. The backend always performs the authoritative check again when the booking is submitted.

## Admin Experience

Admin booking list and detail data include a compact capacity summary for the reservation date:

- Active booking count and applicable hard ceiling
- Requested guest-size band
- Availability state
- Whether explicit capacity confirmation is required

For a `PENDING` reservation with 150-499 guests, the normal approval action is replaced with `Approve and confirm capacity`. The admin must explicitly confirm that LA Chef can accommodate the event. The confirmation is recorded with the status transition for auditability.

The backend rechecks the date inside the approval transaction. Approval is rejected with a conflict response if another reservation has made the date exceed a documented hard ceiling. Admin judgment may approve a 150-499 guest request within the six-request ceiling, but it cannot override the documented ceilings for dates containing 500-999 or 1,000-plus guest events.

Rejecting or cancelling a reservation immediately changes subsequent availability results.

No capacity-settings page, blocked-date calendar, staff scheduler, equipment scheduler, or manual hard-limit override is included in this phase.

## API Contract

### Customer Availability

Add an authenticated customer endpoint:

`GET /api/bookings/availability?date=YYYY-MM-DD&guestCount=NUMBER`

The response contains:

```json
{
  "success": true,
  "data": {
    "date": "2026-11-15",
    "guestCount": 250,
    "status": "NEEDS_CONFIRMATION",
    "activeBookingCount": 2,
    "capacityLimit": 6,
    "remainingRequestSlots": 3,
    "requiresAdminConfirmation": true,
    "message": "LA Chef will confirm whether this date can accommodate your event."
  }
}
```

The endpoint validates ISO date format, requires a future date, and accepts guest counts from 1 through 10,000. It returns no customer or reservation-identifying data.

### Booking Submission

The existing `POST /api/bookings` contract remains compatible. Before inserting the reservation, the backend performs the same capacity calculation under a date-scoped database lock. If capacity is no longer available, it returns `409 Conflict` with a safe code such as `BOOKING_DATE_FULL` and a user-actionable message.

### Admin Approval

The existing admin status-transition endpoint accepts an optional `capacityConfirmed` boolean. It is required and must be `true` when approving a 150-499 guest reservation. Missing confirmation returns `400 Bad Request`. A date-capacity conflict returns `409 Conflict`.

Existing admin booking list/detail responses are extended with typed capacity summary data rather than adding a separate duplicate booking endpoint.

## Backend Architecture

Add a focused availability domain service responsible for:

- Mapping guest counts to documented capacity bands
- Determining the hard ceiling from the largest active or proposed event
- Calculating availability status and remaining request slots
- Indicating whether admin confirmation is required

Repository functions are responsible only for querying active reservations for a date and obtaining the required lock. Booking creation and admin approval call the same domain service so preview, submission, and approval cannot drift into separate rule implementations.

Controllers validate request boundaries and map expected domain errors to safe HTTP responses. They do not duplicate capacity calculations.

## Database And Concurrency

Add migration `010_booking_capacity_availability.sql` with a supporting index beginning with `event_date` and `status`, including `guest_count` where appropriate.

Booking creation and approval run the availability query in their existing SQL transactions using SQL Server update and serializable-range locking (`UPDLOCK`, `HOLDLOCK`) against the selected date. The supporting index ensures an empty date range can also be locked. This prevents two simultaneous requests from both claiming the final slot.

The transaction order is:

1. Validate package, event, add-ons, and request fields.
2. Lock and read capacity-consuming reservations for the event date.
3. Calculate availability including the proposed reservation.
4. Reject conflicts or continue.
5. Insert or approve the reservation and related records.
6. Commit.

No cached availability result is trusted for writes.

## Error Handling

Expected errors use stable codes and specific messages:

- `BOOKING_DATE_FULL`: the date cannot accept the request under the documented ceiling.
- `CAPACITY_CONFIRMATION_REQUIRED`: admin approval requires explicit confirmation for 150-499 guests.
- `CAPACITY_CHANGED`: availability changed before submission or approval completed.
- `AVAILABILITY_UNAVAILABLE`: the preview could not be loaded; the UI offers retry and does not assume availability.

Mutation controls show pending state and prevent duplicate clicks. A conflict preserves the customer's completed form and returns them to the event-detail step with the selected date highlighted.

## Security And Privacy

- Availability requires an authenticated customer session because the booking flow is protected.
- Admin capacity data remains behind existing admin authentication and authorization.
- Public/customer responses expose counts only, never other customers' identities or event details.
- All SQL remains parameterized.
- Server-side checks are authoritative; frontend disabling is usability support only.
- Capacity confirmation is accepted only from an authenticated administrator and is written to existing status history/audit records.

## Responsive And Accessible UI

- Availability feedback appears inline without changing form width or causing layout shifts.
- Status is communicated by text and icon, not color alone.
- Loading feedback is announced through an appropriate live region.
- Error and confirmation text is associated with the event-date controls.
- Controls remain at least 44 CSS pixels on touch screens.
- Customer and admin layouts are verified at 390, 768, 1024, and 1440 pixel widths.

## Testing Strategy

### Capacity Domain Tests

- Below 150 guests permits up to six active events.
- A sixth qualifying request succeeds and a seventh fails.
- A 150-499 guest request returns `NEEDS_CONFIRMATION` below the hard ceiling.
- Admin approval for 150-499 guests fails without explicit confirmation and succeeds with it when capacity remains.
- A date containing a 500-999 guest event permits no more than three active events total.
- A 1,000-plus guest request succeeds only on a date with no active reservation.
- Adding a large request to a mixed date recalculates the ceiling from the largest event.
- Rejected, cancelled, and completed reservations do not consume capacity.

### Backend And SQL Tests

- Query/date/guest validation
- Safe response shape without customer data
- Booking submission recheck and `409` conflicts
- Admin approval recheck
- Status changes release capacity correctly
- Concurrent attempts for the last slot allow only one transaction to succeed
- Migration index exists and is idempotent

### Frontend Tests

- Availability checks run after valid date and guest-count changes.
- Loading, available, limited, confirmation, full, failure, and retry states render correctly.
- Continue is blocked only while checking or when full.
- Draft values survive capacity conflicts.
- Admin confirmation control appears only for the 150-499 range.
- API conflict messages are presented next to the affected action.

### Browser Verification

- Customer checks a date and submits each supported availability state.
- Two sessions compete for a final slot and only one succeeds.
- Admin confirms and approves a 150-499 guest booking.
- Cancelling or rejecting a booking restores availability.
- Customer and admin screens have no overlap or horizontal page scrolling at the required viewports.

## Out Of Scope

- Editing the approved project paper or creating a paper change log
- Inventing a narrower numeric limit for 150-499 guests
- Time-slot capacity or overlapping-event duration calculations
- Staff, vehicle, equipment, inventory, or venue capacity
- Admin-configurable capacity rules or date overrides
- Automated expiration of pending reservations
- Changes to payment percentage or payment-gateway behavior

## Completion Definition

The feature is complete when customers receive truthful date guidance, all booking writes and approvals enforce the same documented hard ceilings transactionally, medium-size events require explicit admin confirmation, capacity is released by terminal non-consuming statuses, no private booking data is exposed, and backend, frontend, SQL-backed concurrency, and responsive browser tests pass.
