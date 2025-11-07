const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
// suggested by ai

const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many accounts created from this IP, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: 'Too many login attempts from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// MongoDB injection prevention
const mongoSanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
});

// Advanced MongoDB sanitization
const advancedMongoSanitize = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    req.body = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  }
  
  // Sanitize request query
  if (req.query) {
    req.query = mongoSanitize.sanitize(req.query, { replaceWith: '_' });
  }
  
  // Sanitize request params
  if (req.params) {
    req.params = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  }
  
  next();
};

// Input validation middleware
const validateInput = (req, res, next) => {
  const suspiciousPatterns = [
    /\$where/i,
    /\$ne/i,
    /\$gt/i,
    /\$lt/i,
    /\$regex/i,
    /\$exists/i,
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
  ];
  
  const checkObject = (obj) => {
    if (typeof obj === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(obj)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid input detected',
            message: 'Request contains potentially malicious content'
          });
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          checkObject(obj[key]);
        }
      }
    }
  };
  
  try {
    if (req.body) checkObject(req.body);
    if (req.query) checkObject(req.query);
    if (req.params) checkObject(req.params);
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: 'Input validation error',
      message: 'Error processing request data'
    });
  }
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent XSS attacks
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Set strict transport security (if using HTTPS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
};

// Export all middleware
module.exports = {
  createAccountLimiter,
  loginLimiter,
  generalLimiter,
  mongoSanitizeMiddleware,
  advancedMongoSanitize,
  validateInput,
  securityHeaders
};