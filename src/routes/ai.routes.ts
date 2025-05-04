import { Router } from 'express';
import { accessTokenValidation } from '~/middlewares/auth.middlewares';
import { FEATURES } from '~/config/roles';
import { wrapRequestHandler } from '~/utils/wrapHandler';
import aiController from '~/controllers/ai.controller';
import { checkFeatureAccess, trackFeatureUsage } from '~/middlewares/access-control.middleware';

const router = Router();

// Middleware xác thực chung cho tất cả AI routes
router.use(accessTokenValidation);

// Route sử dụng AI cơ bản (có sẵn cho cả free và premium users)
router.post(
    '/basic/generate-summary',
    checkFeatureAccess(FEATURES.BASIC_AI),
    trackFeatureUsage('aiRequestsCount'),
    wrapRequestHandler(aiController.generateSummary)
);

// Route sử dụng AI nâng cao (chỉ dành cho premium users)
router.post(
    '/advanced/refine-content',
    checkFeatureAccess(FEATURES.ADVANCED_AI),
    trackFeatureUsage('aiRequestsCount'),
    wrapRequestHandler(aiController.refineContent)
);

// Route sử dụng AI nâng cao (chỉ dành cho premium users)
router.post(
    '/advanced/tailor-for-job',
    checkFeatureAccess(FEATURES.ADVANCED_AI),
    trackFeatureUsage('aiRequestsCount'),
    wrapRequestHandler(aiController.tailorForJobDescription)
);

// Route tạo keywords (premium)
router.post(
    '/advanced/generate-keywords',
    checkFeatureAccess(FEATURES.ADVANCED_AI),
    trackFeatureUsage('aiRequestsCount'),
    wrapRequestHandler(aiController.generateKeywords)
);

// Route phân tích CV với ATS (premium)
router.post(
    '/advanced/analyze-ats',
    checkFeatureAccess(FEATURES.ADVANCED_AI),
    trackFeatureUsage('aiRequestsCount'),
    wrapRequestHandler(aiController.analyzeWithATS)
);

export default router; 