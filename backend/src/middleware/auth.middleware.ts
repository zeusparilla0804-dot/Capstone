import type { NextFunction, Request, Response } from 'express';
import { findAdminBySession, findCustomerBySession } from '../repositories/auth.repository.js';
import { AppError } from '../utils/app-error.js';
import { ADMIN_SESSION_COOKIE, hashSessionToken, readCookie, SESSION_COOKIE } from '../utils/session.js';
export async function requireCustomer(req:Request,_res:Response,next:NextFunction){ try { const token=readCookie(req.headers.cookie,SESSION_COOKIE); if(!token) throw new AppError(401,'Authentication required.'); const customer=await findCustomerBySession(hashSessionToken(token)); if(!customer) throw new AppError(401,'Your session has expired.'); req.customer=customer; next(); } catch(error){ next(error); } }
export async function requireAdmin(req:Request,_res:Response,next:NextFunction){try{const token=readCookie(req.headers.cookie,ADMIN_SESSION_COOKIE);if(!token)throw new AppError(401,'Administrator authentication required.');const admin=await findAdminBySession(hashSessionToken(token));if(!admin)throw new AppError(401,'Your administrator session has expired.');req.admin=admin;next();}catch(error){next(error);}}

export async function requireProofActor(req: Request, _res: Response, next: NextFunction) {
  try {
    const adminToken = readCookie(req.headers.cookie, ADMIN_SESSION_COOKIE);
    if (adminToken) {
      const admin = await findAdminBySession(hashSessionToken(adminToken));
      if (admin) { req.admin = admin; next(); return; }
    }
    const customerToken = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (customerToken) {
      const customer = await findCustomerBySession(hashSessionToken(customerToken));
      if (customer) { req.customer = customer; next(); return; }
    }
    throw new AppError(401, 'Authentication required.');
  } catch (error) { next(error); }
}
