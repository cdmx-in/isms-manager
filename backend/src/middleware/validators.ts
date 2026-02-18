import { body, param, query } from 'express-validator';

// Common validators
export const uuidParam = (field: string = 'id') =>
  param(field).isUUID(4).withMessage(`${field} must be a valid UUID`);

export const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100'),
  query('sortBy').optional().isString().trim(),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
];

// Auth validators
export const registerValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters'),
];

export const loginValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

export const passwordResetValidator = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
];

// Organization validators
export const createOrganizationValidator = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Organization name must be between 2 and 100 characters'),
  body('slug')
    .optional()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
];

// Asset validators
export const createAssetValidator = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Asset name is required and must be less than 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be less than 2000 characters'),
  body('assetType')
    .optional()
    .isIn(['HARDWARE', 'SOFTWARE', 'DATA', 'SERVICE', 'PERSONNEL', 'FACILITY', 'OTHER'])
    .withMessage('Invalid asset type'),
  body('classification')
    .optional()
    .isIn(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
    .withMessage('Invalid classification'),
  body('valueConfidentiality')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Confidentiality value must be between 1 and 5'),
  body('valueIntegrity')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Integrity value must be between 1 and 5'),
  body('valueAvailability')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Availability value must be between 1 and 5'),
];

// Risk validators
export const createRiskValidator = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Risk title is required and must be less than 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must be less than 2000 characters'),
  body('likelihood')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Likelihood must be between 1 and 5'),
  body('impact')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Impact must be between 1 and 5'),
  body('treatment')
    .optional()
    .isIn(['ACCEPT', 'MITIGATE', 'TRANSFER', 'AVOID', 'PENDING'])
    .withMessage('Invalid treatment type'),
];

// Control validators
export const updateControlValidator = [
  body('implementationStatus')
    .optional()
    .isIn(['NOT_IMPLEMENTED', 'PARTIALLY_IMPLEMENTED', 'FULLY_IMPLEMENTED', 'NOT_APPLICABLE'])
    .withMessage('Invalid implementation status'),
  body('implementationPercent')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Implementation percent must be between 0 and 100'),
  body('maturity')
    .optional()
    .isInt({ min: 0, max: 5 })
    .withMessage('Maturity must be between 0 and 5'),
];

// Incident validators
export const createIncidentValidator = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Incident title is required and must be less than 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description must be less than 5000 characters'),
  body('severity')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .withMessage('Invalid severity level'),
];
