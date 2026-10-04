import type { NextFunction,Request,Response } from 'express'; import { catalogService } from '../services/catalog.service.js';
export async function getPackages(_req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await catalogService.packages()});}catch(e){next(e);}}
export async function getPackage(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await catalogService.packageById(Number(req.params['id']))});}catch(e){next(e);}}
export async function getAddOns(_req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await catalogService.addOns()});}catch(e){next(e);}}
export async function getAddOn(req:Request,res:Response,next:NextFunction){try{res.json({success:true,data:await catalogService.addOnById(Number(req.params['id']))});}catch(e){next(e);}}
