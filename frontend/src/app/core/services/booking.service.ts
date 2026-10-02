import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, finalize } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Booking, BookingDraft, BookingStatus, BookingTab, CateringPackage } from '../models';
interface ApiBooking extends Omit<Booking,'id'|'customerId'|'thumbnailUrl'|'package'|'addOns'>{readonly id:number;readonly total:number;readonly package:{packageId:number;packageName:string;pricePerGuest:number};readonly addOns:readonly {id:number;name:string;description?:string;price:number}[];}
@Injectable({providedIn:'root'})
export class BookingService{
 private readonly http=inject(HttpClient);private readonly state=signal<readonly Booking[]>([]);readonly bookings=this.state.asReadonly();readonly loading=signal(false);readonly error=signal('');
 loadMine():void{this.loading.set(true);this.error.set('');this.http.get<ApiResponse<readonly ApiBooking[]>>(`${environment.apiBaseUrl}/bookings/my`,{withCredentials:true}).pipe(finalize(()=>this.loading.set(false))).subscribe({next:r=>this.state.set(r.data.map(x=>this.map(x))),error:()=>this.error.set('Unable to load your bookings.')});}
 getBookingById(id:string){return this.state().find(x=>x.id===id);}
 getBookingsByTab(tab:BookingTab){const statuses:Record<BookingTab,readonly BookingStatus[]>={upcoming:['confirmed','pending'],past:['completed'],cancelled:['cancelled']};return [...this.state().filter(x=>statuses[tab].includes(x.status))].sort((a,b)=>a.eventDate.localeCompare(b.eventDate)*(tab==='upcoming'?1:-1));}
 async cancelBooking(id:string,reason:string){try{await firstValueFrom(this.http.patch<void>(`${environment.apiBaseUrl}/bookings/${id}/cancel`,{reason:reason.trim()},{withCredentials:true}));this.state.update(items=>items.map(item=>item.id===id?{...item,status:'cancelled' as const,cancelledAt:new Date().toISOString()}:item));return true;}catch{return false;}}
 async submitDraft(draft:BookingDraft,pkg:CateringPackage,addOns:Booking['addOns']){const r=await firstValueFrom(this.http.post<ApiResponse<ApiBooking>>(`${environment.apiBaseUrl}/bookings`,{eventType:draft.eventType,eventDate:draft.eventDate,eventTime:this.time(draft.eventTime),venue:draft.venue,guestCount:draft.guestCount,packageId:Number(pkg.id),addOnIds:addOns.map(x=>Number(x.id)),paymentMethod:draft.paymentMethod},{withCredentials:true}));this.state.update(items=>[this.map(r.data),...items]);return r.data.reference;}
 private map(x:ApiBooking):Booking{return {...x,id:String(x.id),customerId:'',package:{...x.package,packageId:String(x.package.packageId)},addOns:x.addOns.map(a=>({...a,id:String(a.id)})),thumbnailUrl:`assets/images/packages/${x.eventType==='wedding'?'premium':x.eventType==='debut'?'deluxe':'basic'}-package.png`};}
 private time(v:string){const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return v;let h=Number(m[1]);if(m[3]!.toUpperCase()==='PM'&&h<12)h+=12;if(m[3]!.toUpperCase()==='AM'&&h===12)h=0;return `${String(h).padStart(2,'0')}:${m[2]}`;}
}
