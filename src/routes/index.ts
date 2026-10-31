import { Router } from 'express';
import { authRoutes } from './authRoutes.js';
import { userRoutes } from './userRoutes.js';
import { unitRoutes } from './unitRoutes.js';
import { leaseRoutes } from './leaseRoutes.js';
import { adjustmentRoutes } from './adjustmentRoutes.js';
import { paymentRoutes } from './paymentRoutes.js';
import { maintenanceRoutes } from './maintenanceRoutes.js';
import { expenseRoutes } from './expenseRoutes.js';
import { notificationRoutes } from './notificationRoutes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/units', unitRoutes);
apiRouter.use('/', leaseRoutes);
apiRouter.use('/', adjustmentRoutes);
apiRouter.use('/', paymentRoutes);
apiRouter.use('/', maintenanceRoutes);
apiRouter.use('/', expenseRoutes);
apiRouter.use('/notifications', notificationRoutes);

export { apiRouter };
