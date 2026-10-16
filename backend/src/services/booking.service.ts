import type sql from 'mssql';
import { createBooking, findCustomerBookings, updatePendingBooking } from '../repositories/booking.repository.js';
import type { CreateBookingDto, UpdatePendingBookingDto } from '../types/domain.types.js';
import { AppError } from '../utils/app-error.js';
import { transitionBooking } from './booking-status.service.js';
import { bookingAvailabilityService } from './booking-availability.service.js';
export const bookingService={
  create(customerId:number,dto:CreateBookingDto){ return createBooking(customerId,dto); },
  updateDetails(customerId:number,id:number,dto:UpdatePendingBookingDto){ return updatePendingBooking(customerId,id,dto); },
  availability(date:string,guestCount:number){ return bookingAvailabilityService.preview(date,guestCount); },
  list(customerId:number){ return findCustomerBookings(customerId); },
  async byId(customerId:number,id:number){ const item=(await findCustomerBookings(customerId)).find(b=>b.id===id); if(!item) throw new AppError(404,'Booking not found.'); return item; },
  async dashboard(customerId:number){ const bookings=await findCustomerBookings(customerId); const today=new Date().toISOString().slice(0,10); const upcoming=bookings.filter(b=>b.eventDate>=today&&['pending','confirmed'].includes(b.status)).sort((a,b)=>a.eventDate.localeCompare(b.eventDate)); return {upcomingEvents:upcoming.length,totalBookings:bookings.length,outstandingBalance:bookings.reduce((sum,b)=>sum+Math.max(b.total-b.amountPaid,0),0),nextBookings:upcoming.slice(0,2),recentActivity:bookings.slice(0,3).map(b=>({id:`booking-${b.id}`,title:b.status==='confirmed'?'Booking confirmed':'Booking created',description:b.eventName,dateLabel:b.createdAt,type:'booking'}))}; },
  async cancel(customerId:number,id:number,reason:string,request?:sql.Request){ await transitionBooking({reservationId:id,nextStatus:'CANCELLED',actor:{type:'CUSTOMER',id:customerId},reason,expectedStatus:'PENDING',request}); },
};
