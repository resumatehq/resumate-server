import { Router } from 'express'
import resumeSectionController from '~/controllers/resume-section.controller'
import resumeController from '~/controllers/resume.controller'
import { accessTokenValidation } from '~/middlewares/auth.middlewares'
import { checkPremiumTemplateAccess, checkResumeOwnership } from '~/middlewares/access-control.middleware'

const resumeRouter = Router()

// Apply authentication middleware to all resume routes
resumeRouter.use(accessTokenValidation)

// Resume CRUD operations
resumeRouter.post('/', checkPremiumTemplateAccess, resumeController.createResume)
resumeRouter.get('/', resumeController.getUserResumes)
resumeRouter.post('/empty', checkPremiumTemplateAccess, resumeController.createEmptyResume)

// Routes that need resume ownership check
resumeRouter.get('/:resumeId', checkResumeOwnership, resumeController.getResume)
resumeRouter.put('/:resumeId', checkResumeOwnership, checkPremiumTemplateAccess, resumeController.updateResume)
resumeRouter.delete('/:resumeId', checkResumeOwnership, resumeController.deleteResume)

// Section operations
resumeRouter.get('/:resumeId/sections', checkResumeOwnership, resumeSectionController.getAllSections)
resumeRouter.post('/:resumeId/sections', checkResumeOwnership, resumeSectionController.createOrUpdateSection) // chưa test
resumeRouter.post('/:resumeId/sections/reorder', checkResumeOwnership, resumeSectionController.reorderSections) // chưa test
resumeRouter.put('/:resumeId/sections/:sectionId', checkResumeOwnership, resumeSectionController.updateSection) // chưa test
resumeRouter.get('/:resumeId/sections/:sectionType', checkResumeOwnership, resumeSectionController.getSection)
resumeRouter.delete('/:resumeId/sections/:sectionId', checkResumeOwnership, resumeSectionController.deleteSection)
resumeRouter.patch('/:resumeId/sections/:sectionId/visibility', checkResumeOwnership, resumeSectionController.toggleSectionVisibility)

// Section save and continue route
resumeRouter.post('/:resumeId/sections/:sectionId/save-continue', checkResumeOwnership, resumeSectionController.saveAndContinueSection)

// Section draft routes
resumeRouter.post('/:resumeId/sections/:sectionType/draft', checkResumeOwnership, resumeSectionController.saveSectionDraft)
resumeRouter.get('/:resumeId/sections/:sectionType/draft', checkResumeOwnership, resumeSectionController.getSectionDraft)

// Version control
resumeRouter.get('/:resumeId/versions', checkResumeOwnership, resumeController.getVersions)
resumeRouter.post('/:resumeId/versions', checkResumeOwnership, resumeController.createVersion)
resumeRouter.post('/:resumeId/versions/:versionNumber/restore', checkResumeOwnership, resumeController.restoreVersion)

// Resume sharing
resumeRouter.post('/:resumeId/share', checkResumeOwnership, resumeController.shareResume)
resumeRouter.put('/:resumeId/share', checkResumeOwnership, resumeController.updateShareSettings)
resumeRouter.delete('/:resumeId/share', checkResumeOwnership, resumeController.revokeShareAccess)
resumeRouter.get('/:resumeId/share/qrcode', checkResumeOwnership, resumeController.generateQRCode)
resumeRouter.get('/shared/:shareableLink', resumeController.getPublicResume)

export default resumeRouter 