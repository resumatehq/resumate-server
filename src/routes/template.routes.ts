import { Router } from 'express'
import templateController from '~/controllers/template.controller'
import { accessTokenValidation } from '~/middlewares/auth.middlewares'
import { wrapRequestHandler } from '~/utils/wrapHandler'
// import { premiumRateLimiter } from '~/middlewares/rate-limiter.middleware'
import { FEATURES } from '~/config/roles'
import { checkTemplateAccess } from '~/middlewares/abac.middleware'
import { checkFeatureAccess } from '~/middlewares/access-control.middleware'
// import HTTP_STATUS_CODES from '~/core/statusCodes'

const templateRouter = Router()

// ======= Public Routes (No authentication required) =======
// Get all templates with pagination, filtering, and search
templateRouter.get('/public', wrapRequestHandler(templateController.getAllTemplates))

// Search templates by keyword
templateRouter.get('/search', wrapRequestHandler(templateController.searchTemplates))

// Get templates by tags
templateRouter.get('/tags/:tags', wrapRequestHandler(templateController.getTemplatesByTags))

// Get basic (free) templates
templateRouter.get(
    '/basic',
    wrapRequestHandler(templateController.getBasicTemplates)
)

// ======= User Routes (Authentication required) =======
templateRouter.use(accessTokenValidation)

// Get premium templates (requires premium access)
templateRouter.get(
    '/premium',
    checkFeatureAccess(FEATURES.PREMIUM_TEMPLATES),
    wrapRequestHandler(templateController.getPremiumTemplates)
)

// Get templates accessible by current user
templateRouter.get(
    '/user-templates',
    wrapRequestHandler(templateController.getUserAccessibleTemplates)
)

// Get templates by tier
templateRouter.get(
    '/tier/:tier',
    wrapRequestHandler(templateController.getTemplatesByTier)
)

// Get template by ID (with access control)
templateRouter.get(
    '/:id',
    // validateResource(getTemplateSchema), // Uncomment when middleware is implemented
    checkTemplateAccess('read'),
    wrapRequestHandler(templateController.getTemplateById)
)

// ======= Admin Routes (Admin authentication required) =======

// Create new template
templateRouter.post(
    '/',
    // validateResource(createTemplateSchema), // Uncomment when middleware is implemented
    wrapRequestHandler(templateController.createTemplate)
)

// Update template
templateRouter.put(
    '/:id',
    // validateResource(updateTemplateSchema), // Uncomment when middleware is implemented
    // checkPermission('template', 'update'), // Uncomment when middleware is implemented
    wrapRequestHandler(templateController.updateTemplate)
)

// Delete template
templateRouter.delete(
    '/:id',
    // checkPermission('template', 'delete'), // Uncomment when middleware is implemented
    wrapRequestHandler(templateController.deleteTemplate)
)

// Increment template popularity when used
templateRouter.post(
    '/:id/increment-popularity',
    wrapRequestHandler(templateController.incrementTemplatePopularity)
)

export default templateRouter 