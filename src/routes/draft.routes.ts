import { Router } from 'express';
import draftController from '~/controllers/draft.controller';
import { accessTokenValidation } from '~/middlewares/auth.middlewares';


const draftRouter = Router();

draftRouter.use(accessTokenValidation)

// Get draft for a resume
draftRouter.get(
    '/:resumeId',
    draftController.getDraft
);

// Create or update draft
draftRouter.post(
    '/:resumeId',
    draftController.createOrUpdateDraft
);

// Save draft to resume
draftRouter.post(
    '/:resumeId/save',
    draftController.saveDraftToResume
);

// Auto-save section edit
draftRouter.post(
    '/:resumeId/autosave-section',
    draftController.autoSaveSectionEdit
);

// Auto-save form data as user types
draftRouter.post(
    '/:resumeId/autosave-form',
    draftController.autoSaveFormData
);

export default draftRouter;
