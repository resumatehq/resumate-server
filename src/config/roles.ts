import { AccessControl } from "accesscontrol";

// Định nghĩa các feature của hệ thống
export const FEATURES = {
    // Editor features
    BASIC_EDITOR: 'basic_editor',
    ADVANCED_EDITOR: 'advanced_editor',

    // AI features
    BASIC_AI: 'basic_ai',
    ADVANCED_AI: 'advanced_ai',

    // Export features
    EXPORT_PDF: 'export_pdf',
    EXPORT_DOCX: 'export_docx',
    EXPORT_PNG: 'export_png',
    EXPORT_JSON: 'export_json',

    // Template features
    BASIC_TEMPLATES: 'basic_templates',
    PREMIUM_TEMPLATES: 'premium_templates',

    // Support features
    BASIC_SUPPORT: 'basic_support',
    PRIORITY_SUPPORT: 'priority_support',

    // Analytics
    ANALYTICS: 'analytics',

    // Custom sections
    CUSTOM_SECTIONS: 'custom_sections'
};

// Định nghĩa các giới hạn sử dụng
export const USAGE_LIMITS = {
    FREE: {
        MAX_RESUMES: 3,
        MAX_CUSTOM_SECTIONS: 0,
        AI_REQUESTS_PER_DAY: 10,
        AI_REQUESTS_PER_MONTH: 100,
        EXPORT_LIMIT: 5
    },
    PREMIUM_MONTHLY: {
        MAX_RESUMES: 10,
        MAX_CUSTOM_SECTIONS: 5,
        AI_REQUESTS_PER_DAY: 50,
        AI_REQUESTS_PER_MONTH: 500,
        EXPORT_LIMIT: Number.POSITIVE_INFINITY
    },
    PREMIUM_YEARLY: {
        MAX_RESUMES: 20,
        MAX_CUSTOM_SECTIONS: 5,
        AI_REQUESTS_PER_DAY: 100,
        AI_REQUESTS_PER_MONTH: 1000,
        EXPORT_LIMIT: Number.POSITIVE_INFINITY
    }
};

// Định nghĩa các điều kiện thuộc tính ABAC
export const ATTRIBUTE_CONDITIONS = {
    // Điều kiện sở hữu - chỉ truy cập tài nguyên do mình tạo
    OWN_RESOURCE: 'own_resource',

    // Điều kiện template - chỉ truy cập template thuộc phân khúc của mình
    FREE_TEMPLATE: 'free_template',
    PREMIUM_TEMPLATE: 'premium_template',

    // Điều kiện trạng thái subscription
    ACTIVE_SUBSCRIPTION: 'active_subscription'
};

// Khởi tạo AccessControl instance
const ac = new AccessControl();

// Định nghĩa quyền cho vai trò free user
ac.grant('free')
    // Editor permissions
    .createAny(FEATURES.BASIC_EDITOR)
    .readAny(FEATURES.BASIC_EDITOR)
    .updateAny(FEATURES.BASIC_EDITOR)
    .deleteAny(FEATURES.BASIC_EDITOR)

    // AI permissions (limited)
    .createAny(FEATURES.BASIC_AI)
    .readAny(FEATURES.BASIC_AI)

    // Export permissions (limited)
    .createAny(FEATURES.EXPORT_PDF)
    .readAny(FEATURES.EXPORT_PDF)

    // Template permissions
    .readAny(FEATURES.BASIC_TEMPLATES)
    // User can only update/delete their own templates
    .updateOwn('template')
    .deleteOwn('template')

    // Support permissions
    .createAny(FEATURES.BASIC_SUPPORT)
    .readAny(FEATURES.BASIC_SUPPORT);

// Định nghĩa quyền cho vai trò premium user (thừa kế từ free)
ac.grant('premium')
    .extend('free')

    // Enhanced editor permissions
    .createAny(FEATURES.ADVANCED_EDITOR)
    .readAny(FEATURES.ADVANCED_EDITOR)
    .updateAny(FEATURES.ADVANCED_EDITOR)
    .deleteAny(FEATURES.ADVANCED_EDITOR)

    // Enhanced AI permissions
    .createAny(FEATURES.ADVANCED_AI)
    .readAny(FEATURES.ADVANCED_AI)

    // Full export permissions
    .createAny(FEATURES.EXPORT_DOCX)
    .readAny(FEATURES.EXPORT_DOCX)
    .createAny(FEATURES.EXPORT_PNG)
    .readAny(FEATURES.EXPORT_PNG)
    .createAny(FEATURES.EXPORT_JSON)
    .readAny(FEATURES.EXPORT_JSON)

    // Premium templates
    .readAny(FEATURES.PREMIUM_TEMPLATES)

    // Premium support
    .createAny(FEATURES.PRIORITY_SUPPORT)
    .readAny(FEATURES.PRIORITY_SUPPORT)

    // Analytics
    .readAny(FEATURES.ANALYTICS)

    // Custom sections
    .createAny(FEATURES.CUSTOM_SECTIONS)
    .readAny(FEATURES.CUSTOM_SECTIONS)
    .updateAny(FEATURES.CUSTOM_SECTIONS)
    .deleteAny(FEATURES.CUSTOM_SECTIONS);

// Định nghĩa quyền cho vai trò admin (thừa kế từ premium)
ac.grant('admin')
    .extend('premium')
    // Quyền quản trị hệ thống
    .createAny('user')
    .readAny('user')
    .updateAny('user')
    .deleteAny('user')
    .createAny('template')
    .readAny('template')
    .updateAny('template')
    .deleteAny('template')
    .readAny('analytics');

export { ac }; 