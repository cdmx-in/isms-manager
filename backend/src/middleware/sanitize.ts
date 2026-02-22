import { Request, Response, NextFunction } from 'express';

// XSS sanitization - removes potentially dangerous HTML/script content
const sanitizeString = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#x60;')
    .replace(/=/g, '&#x3D;');
};

const sanitizeObject = (obj: any): any => {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    // Fields that contain structured data (JSON, API keys, tokens) - skip sanitization
    const skipFields = ['password', 'serviceaccountkey', 'apitoken', 'cloudflareapittoken', 'privatekey', 'clientsecret', 'tenantid', 'subscriptionid', 'httpcheckproxy', 'proxyurl'];
    for (const [key, value] of Object.entries(obj)) {
      if (skipFields.some(f => key.toLowerCase().includes(f))) {
        sanitized[key] = value;
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  }
  return obj;
};

export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  // Skip sanitization for OAuth callback routes (auth codes contain / and = characters)
  if (req.path.includes('/auth/google/callback')) {
    return next();
  }

  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// SQL Injection prevention helper (for raw queries if needed)
export const escapeSqlString = (str: string): string => {
  return str.replace(/[\0\n\r\b\t\\'"\x1a]/g, (char) => {
    switch (char) {
      case '\0': return '\\0';
      case '\n': return '\\n';
      case '\r': return '\\r';
      case '\b': return '\\b';
      case '\t': return '\\t';
      case '\x1a': return '\\Z';
      case "'": return "''";
      case '"': return '""';
      case '\\': return '\\\\';
      default: return char;
    }
  });
};
