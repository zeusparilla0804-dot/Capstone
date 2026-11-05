const fs=require('fs'),ts=require('../frontend/node_modules/typescript/lib/typescript.js');
function change(p, f){const a=fs.readFileSync(p,'utf8'),b=f(a);if(a!==b)fs.writeFileSync(p,b);}
function calls(p, match, replacement=''){change(p,s=>{const sf=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);const ranges=[];function visit(n){if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)){const c=n.expression;const a=c.arguments[0];if(a&&ts.isStringLiteral(a)&&match(a.text))ranges.push([n.getStart(sf),n.end,replacement]);}ts.forEachChild(n,visit);}visit(sf);for(const [a,b,r]of ranges.sort((a,b)=>b[0]-a[0]))s=s.slice(0,a)+r+s.slice(b);return s;});}
calls('backend/src/controllers/booking.controller.test.ts',n=>/normal booking window|short-notice request|availability previews near/.test(n));
change('backend/src/controllers/booking.controller.test.ts',s=>s+`
 test('booking and availability enforce three Manila calendar days, including month rollover', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T15:59:59Z') });
  for (const eventDate of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) {
    assert.throws(() => parseBooking({ ...validBookingBody, paymentMethod: 'e-wallet', eventDate }), /at least 3 days/);
    assert.throws(() => parseAvailabilityQuery({ date: eventDate, guestCount: '100' }), /at least 3 days/);
  }
  assert.equal(parseBooking({ ...validBookingBody, paymentMethod: 'e-wallet', eventDate: '2026-11-01' }).eventDate, '2026-11-01');
  assert.throws(() => parsePendingBookingUpdate({ ...validBookingBody, paymentMethod: 'e-wallet', eventDate: '2026-10-31' }), /at least 3 days/);
 });
 test('cash keeps its two office-day allowance plus three or five preparation days', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T04:00:00Z') });
  for (const [guestCount, earliest, earlier] of [[499,'2026-11-03','2026-11-02'],[500,'2026-11-05','2026-11-04']]) {
    assert.equal(parseBooking({ ...validBookingBody, guestCount, eventDate: earliest }).eventDate, earliest);
    assert.throws(() => parseBooking({ ...validBookingBody, guestCount, eventDate: earlier }), /cash/i);
  }
 });
`);
change('backend/src/repositories/booking-availability.repository.test.ts',s=>s.replace(/  assert.match\(request.command, \/(?:NOT EXISTS|hold_status)[^\n]*\n/g,'').replace('  assert.doesNotMatch(request.command, /UPDLOCK|HOLDLOCK/i);', '  assert.doesNotMatch(request.command, /BOOKING_POLICY|UPDLOCK|HOLDLOCK/i);'));
change('backend/src/repositories/booking-submission.repository.test.ts',s=>s.replace(/^    assert.equal\(db.committed.policies[^\n]*\n/gm,'').replace('a new keyed request enforces full processing and preparation allowances before pricing','a new keyed request enforces calendar-day and cash windows before pricing').replaceAll('/short-notice/i','/3 days|cash/i'));
calls('backend/src/repositories/booking-submission.repository.test.ts',n=>/historical submission hash accepts omitted|explicit short-notice submission|direct booking creation cannot bypass/.test(n));
calls('backend/src/repositories/manual-payment.repository.test.ts',n=>/actual timestamp|v2 |late cash expires/.test(n));
calls('backend/src/services/payment-proof.service.test.ts',n=>/expired v2 booking/.test(n));
calls('backend/src/services/payment-verification.service.test.ts',n=>/saved deadline expires the v2|v2 booking|expired v2/.test(n));
change('backend/src/services/notification-domain.service.test.ts',s=>s.replace("          if (kind === 'booking') assert.ok(domain.includes('booking-policy'));\n",''));
calls('backend/src/services/booking-status.service.test.ts',n=>n==='generic admin payment approval requires the dedicated workflow for every method',`test('ordinary admin approval and payment request remain available for every method', async () => {
 for (const paymentMethod of ['CASH','BANK_TRANSFER','E-WALLET']) {
  const db=new BookingDb();db.paymentMethod=paymentMethod;db.eventDate='2098-06-15';
  for(const nextStatus of ['APPROVED','AWAITING_PAYMENT'] as const) {
   await transitionBooking({reservationId:5,nextStatus,actor:{type:'ADMIN',id:2},mode:'GENERIC_ADMIN',request:db.request});
   assert.equal(db.status,nextStatus);
  }
  assert.equal(db.amountPaid,0);assert.equal(db.history.length,2);
  assert.equal(db.queries.some(query=>/BOOKING_POLICY/.test(query)),false);
 }
});`);
calls('backend/src/services/booking-status.service.test.ts',n=>n==='capacity confirmation stays strictly boolean while generic approval requires the dedicated endpoint',`test('capacity confirmation remains strictly boolean and is required before medium-event approval', async () => {
 const db=new BookingDb();db.guestCount=250;db.hasMediumEvent=true;db.largestGuestCount=250;
 await assert.rejects(transitionBooking({reservationId:5,nextStatus:'APPROVED',actor:{type:'ADMIN',id:3},capacityConfirmed:'true' as never,request:db.request}),e=>assertStatus(e,400));
 assert.equal(db.queries.length,0);
 await assert.rejects(transitionBooking({reservationId:5,nextStatus:'APPROVED',actor:{type:'ADMIN',id:3},mode:'GENERIC_ADMIN',request:db.request}),e=>assertCodedStatus(e,400,'CAPACITY_CONFIRMATION_REQUIRED'));
 await transitionBooking({reservationId:5,nextStatus:'APPROVED',actor:{type:'ADMIN',id:3},mode:'GENERIC_ADMIN',capacityConfirmed:true,request:db.request});
 assert.equal(db.status,'APPROVED');
});`);
// Remove tests of the explicitly reverted API/UI, retaining the earlier validation and payment coverage.
calls('frontend/src/app/core/services/admin.service.spec.ts',n=>n==='uses explicit approval and deadline endpoints with saved exception details');
calls('frontend/src/app/core/services/booking.service.spec.ts',n=>/timing|preparation|short-notice/i.test(n));
calls('frontend/src/app/features/booking/booking.page.spec.ts',n=>/fails closed for loading or failed timing|requests an explicit short-notice|uses central preparation defaults|clears eligibility immediately on payment selection|resolves v2 metadata/.test(n));
change('frontend/src/app/features/booking/booking.page.spec.ts',s=>s.replace('blocks cash submission when the backend processing assessment is ineligible and preserves all selections','blocks cash outside its calendar window and preserves all selections').replace(/^    bookingService.assessTiming.mockReturnValue[^\n]*\n/m,'').replace("toContain('normal allowances do not fit')","toContain('too soon for cash payment')").replace('preserves legacy editing advance-date validation without imposing it on new policy requests','enforces three calendar days for all new bookings and pending edits').replace('revalidates legacy editing on every Continue click after Philippine midnight','revalidates on every Continue click after Philippine midnight').replace(/^.*component.legacyEditing.set\([^\n]*\n/gm,''));
calls('frontend/src/app/features/checkout/checkout.page.spec.ts',n=>/revalidates versioned|fails closed when edit-policy/.test(n));
calls('frontend/src/app/features/payment-proof/payment-proof.page.spec.ts',n=>/expired|legacy.*approval|saved deadline|policy/i.test(n));
calls('frontend/src/app/core/utils/customer-payment-status.spec.ts',n=>/policy|expired|saved deadline|pending.*claim/i.test(n));
calls('frontend/src/app/features/booking/components/booking-success/booking-success.spec.ts',n=>/short-notice/i.test(n));
calls('frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts',n=>/requires renewed approval|uses dedicated approval|uses dedicated payment approval|short-notice approval|extends a saved deadline/.test(n));


