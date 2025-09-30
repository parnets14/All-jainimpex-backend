// utils/jwtUtils.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key-for-development-only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const generateToken = (userId) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.sign(
    { 
      userId,
      timestamp: Date.now()
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

export const verifyToken = (token) => {
  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }

    if (!token) {
      throw new Error('No token provided');
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Additional validation
    if (!decoded.userId) {
      throw new Error('Invalid token payload');
    }

    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
};

// Optional: Check token without verification (for debugging)
export const inspectToken = (token) => {
  try {
    if (!token) return null;
    
    // Decode without verification
    const decoded = jwt.decode(token);
    return decoded;
  } catch (error) {
    console.error('Token inspection failed:', error);
    return null;
  }
};