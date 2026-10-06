import { Router } from 'express';
import { publicController } from './public.controller';

const router = Router();

// Public routes accessible without authentication
router.get('/shops/:slug', publicController.getShop);
router.get('/shops/:slug/menu', publicController.getMenu);

export default router;
