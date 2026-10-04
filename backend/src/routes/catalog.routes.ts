import { Router } from 'express'; import { getAddOn,getAddOns,getPackage,getPackages } from '../controllers/catalog.controller.js';
export const packageRoutes=Router().get('/',getPackages).get('/:id',getPackage);
export const addOnRoutes=Router().get('/',getAddOns).get('/:id',getAddOn);
