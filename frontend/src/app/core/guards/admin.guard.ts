import {inject} from '@angular/core';import {CanActivateFn,Router} from '@angular/router';import {AdminAuthService} from '../services/admin-auth.service';
export const adminGuard:CanActivateFn=async(_r,state)=>await inject(AdminAuthService).ensure()||inject(Router).createUrlTree(['/admin/login'],{queryParams:{returnUrl:state.url}});
