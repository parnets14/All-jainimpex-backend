// middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // don't count successful requests
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many file uploads from this IP, please try again after 15 minutes'
  }
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many sensitive operations from this IP, please try again after 15 minutes'
  }
});

// Development limiter - more lenient
export const devLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Very high limit for development
  message: {
    success: false,
    message: 'Too many requests from this IP'
  },
  skip: process.env.NODE_ENV === 'production' // Skip in production
});