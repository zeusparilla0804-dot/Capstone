const fs=require('fs'),ts=require('../frontend/node_modules/typescript/lib/typescript.js');
function change(p,f){const a=fs.readFileSync(p,'utf8'),b=f(a);if(a!==b)fs.writeFileSync(p,b);}
function call(p,name,replacement=''){change(p,s=>{const sf=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true),ranges=[];function visit(n){if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.arguments[0]?.text===name)ranges.push([n.getStart(sf),n.end]);ts.forEachChild(n,visit);}visit(sf);if(!ranges.length)throw Error('No test '+name);for(const[a,b]of ranges.sort((a,b)=>b[0]-a[0]))s=s.slice(0,a)+replacement+s.slice(b);return s;});}
change('frontend/src/app/features/admin-payments/admin-payments.page.spec.ts',s=>s.replace(", receivedAt: '2026-10-31T14:30', confirmBooking: false",'').replace(/^    component.form.controls.confirmBooking[^\n]*\n/m,'').replace("toMatchObject({ receivedAt: '2026-10-31T06:30:00.000Z', confirmBooking: true })", "toMatchObject({ paymentDate: '2026-10-31', reference: 'CASH-RECEIPT-001', amount: 5000 })").replace(/^    pending.next\([^\n]*\n/m,"    pending.next({ success: true }); pending.complete();\n").replace("expect(component.error()).toContain('Payment recorded; confirmation needs review. Capacity requires review.');", "expect(component.error()).toBe('');"));
call('frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts','requires documented legacy payment approval and leaves capacity revalidation to the dedicated endpoint',`it('requires explicit capacity confirmation for a medium event before ordinary approval', () => {
 const component=fixture.componentInstance as any;
 component.booking.set({...detail,guestCount:250,capacity:{...detail.capacity,guestCount:250,status:'NEEDS_CONFIRMATION',requiresAdminConfirmation:true}});
 fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Approve and confirm capacity');
 component.chooseAction('APPROVED');expect(api.updateBookingStatus).not.toHaveBeenCalled();
 component.confirmAction();expect(api.updateBookingStatus).toHaveBeenCalledWith(42,'APPROVED',undefined,true);
});`);
change('frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts',s=>s.replaceAll('Review and approve payment exception','Approve reservation').replace('guestCount, bookingPolicy: savedPolicy(\'PENDING_REVIEW\'),','guestCount,').replace("action.status === 'AWAITING_PAYMENT').label)","action.status === 'APPROVED').label)").replace(".toBe('Approve for payment');",".toBe('Approve reservation');").replace("PENDING: ['AWAITING_PAYMENT', 'REJECTED', 'CANCELLED']", "PENDING: ['APPROVED', 'REJECTED', 'CANCELLED']").replace("AWAITING_PAYMENT: ['AWAITING_PAYMENT', 'CANCELLED'], PAYMENT_SUBMITTED: ['AWAITING_PAYMENT'], PAYMENT_VERIFIED: ['AWAITING_PAYMENT']", "AWAITING_PAYMENT: ['CANCELLED'], PAYMENT_SUBMITTED: [], PAYMENT_VERIFIED: []").replace("EXPIRED: ['AWAITING_PAYMENT']",'EXPIRED: []').replace('api.approveForPayment.mockReturnValueOnce','api.updateBookingStatus.mockReturnValueOnce').replace("component.booking.set({ ...detail, bookingPolicy: savedPolicy('PENDING_REVIEW') });","component.booking.set(detail);").replace("component.chooseAction('AWAITING_PAYMENT');", "component.chooseAction('APPROVED');"));
call('frontend/src/app/features/admin-bookings/admin-bookings.page.spec.ts','routes every payment approval to detail for policy and capacity revalidation',`it('requires capacity confirmation in the list before medium-event approval', async () => {
 const fixture=TestBed.createComponent(AdminBookingsPage);await fixture.whenStable();
 const component=fixture.componentInstance as any;
 const medium={...booking,guestCount:250,capacity:{...booking.capacity,guestCount:250,status:'NEEDS_CONFIRMATION',requiresAdminConfirmation:true}};
 component.data.set({items:[medium],page:1,pageSize:20,totalItems:1,totalPages:1});fixture.detectChanges();
 const select=fixture.nativeElement.querySelector('select[aria-label="Update LC-5 status"]') as HTMLSelectElement;
 expect(Array.from(select.options).find(o=>o.value==='APPROVED')?.textContent).toContain('Approve and confirm capacity');
 select.value='APPROVED';select.dispatchEvent(new Event('change'));fixture.detectChanges();expect(calls).toEqual([]);
 component.confirmAction();expect(calls).toEqual([{id:5,status:'APPROVED',capacityConfirmed:true}]);
});`);
// Removed policy query fixtures no longer participate in the flow.
change('frontend/src/app/features/booking/booking.page.spec.ts',s=>s.replace(/^    (?:policyDefaults|assessTiming): ReturnType[^\n]*\n/gm,'').replace(/^      (?:policyDefaults|assessTiming): vi.fn[^\n]*\n/gm,''));
change('frontend/src/app/features/checkout/checkout.page.spec.ts',s=>s.replace(/loadBookingById: vi.fn\(\(\) => of\(\{ status: 'pending', bookingPolicy: undefined as unknown }\)\), assessTiming: vi.fn\(\(\) => of\(\{ normalEligible: true, eventStartAt: '2098-06-15T04:00:00Z' }\)\), /,''));
change('frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts',s=>s.replace(/; approveForPayment: ReturnType<typeof vi.fn>; extendPaymentDeadline: ReturnType<typeof vi.fn>/,'').replace(/^      (?:approveForPayment|extendPaymentDeadline): vi.fn[^\n]*\n/gm,'').replace(/  function savedPolicy\([\s\S]*?\n  }\n/,''));
change('frontend/src/app/features/admin-bookings/admin-bookings.page.spec.ts',s=>s.replace(/^          policyAttention: [^\n]*\n/m,''));
call('backend/src/services/payment-verification.service.test.ts','rejecting one proof keeps the hold while another submitted proof remains unresolved');
change('backend/src/services/payment-verification.service.test.ts',s=>s.replace(/function expiredDeadlinePolicy\([\s\S]*?\n}\n/,''));
change('backend/src/repositories/manual-payment.repository.test.ts',s=>s.replace(/function policy\([\s\S]*?\n}\n/,''));
