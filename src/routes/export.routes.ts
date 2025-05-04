import { Router } from 'express';
import { FEATURES } from '~/config/roles';
import { accessTokenValidation } from '~/middlewares/auth.middlewares';
import * as exportController from '~/controllers/export.controller';
import { wrapRequestHandler } from '~/utils/wrapHandler';
import { checkFeatureAccess, trackFeatureUsage, checkExportAccess } from '~/middlewares/access-control.middleware';

const router = Router();

// Middleware xác thực chung cho tất cả export routes
router.use(accessTokenValidation);

// Route export định dạng PDF (có sẵn cho cả free và premium)
router.post(
    '/pdf',
    checkExportAccess('pdf'),
    trackFeatureUsage('exportsCount.pdf'),
    wrapRequestHandler(exportController.exportPdf)
);

// Route export định dạng DOCX (chỉ dành cho premium)
router.post(
    '/docx',
    checkExportAccess('docx'),
    trackFeatureUsage('exportsCount.docx'),
    wrapRequestHandler(exportController.exportDocx)
);

// Route export định dạng PNG (chỉ dành cho premium)
router.post(
    '/png',
    checkExportAccess('png'),
    trackFeatureUsage('exportsCount.png'),
    wrapRequestHandler(exportController.exportPng)
);

// Route export định dạng JSON (chỉ dành cho premium)
router.post(
    '/json',
    checkExportAccess('json'),
    // No tracking for JSON export as it's not counted in quota
    wrapRequestHandler(exportController.exportJson)
);

export default router; 