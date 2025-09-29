// import express from 'express';
// import User from '../models/User.js';
// import { generateToken } from '../utils/jwtUtils.js';
// import { protect } from '../middleware/authMiddleware.js';
// import { validate, registerSchema, loginSchema } from '../validators/authValidator.js';

// const router = express.Router();

// // Register - with Joi validation
// router.post('/register', validate(registerSchema), async (req, res) => {
//   try {
//     const { username, email, password } = req.body;

//     // Check if user exists
//     const existingUser = await User.findOne({
//       $or: [{ email }, { username }]
//     });

//     if (existingUser) {
//       return res.status(400).json({
//         success: false,
//         message: 'User already exists with this email or username'
//       });
//     }

//     // Create user
//     const user = await User.create({
//       username,
//       email,
//       password
//     });

//     // Generate token
//     const token = generateToken(user._id);

//     res.status(201).json({
//       success: true,
//       message: 'User registered successfully',
//       token,
//       user: {
//         id: user._id,
//         username: user.username,
//         email: user.email
//       }
//     });
//   } catch (error) {
//     console.error('Registration error:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// });

// // Login - with Joi validation
// router.post('/login', validate(loginSchema), async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     // Check if user exists
//     const user = await User.findOne({ email });
//     if (!user) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid credentials'
//       });
//     }

//     // Check password
//     const isPasswordValid = await user.comparePassword(password);
//     if (!isPasswordValid) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid credentials'
//       });
//     }

//     // Generate token
//     const token = generateToken(user._id);

//     res.json({
//       success: true,
//       message: 'Login successful',
//       token,
//       user: {
//         id: user._id,
//         username: user.username,
//         email: user.email
//       }
//     });
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// });

// // Get current user (Protected route)
// router.get('/me', protect, async (req, res) => {
//   try {
//     res.json({
//       success: true,
//       user: {
//         id: req.user._id,
//         username: req.user.username,
//         email: req.user.email,
//         createdAt: req.user.createdAt
//       }
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// });

// export default router;


import express from 'express';
import User from '../models/User.js';
import { generateToken } from '../utils/jwtUtils.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate, registerSchema, loginSchema } from '../validators/authValidator.js';
import { setAuthCookie, clearAuthCookie } from '../utils/cookieUtils.js';

const router = express.Router();

// Register - with Joi validation and cookie support
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or username'
      });
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password
    });

    // Generate token
    const token = generateToken(user._id);

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token, // Still return token in response for flexibility
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Login - with Joi validation and cookie support
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Set HTTP-only cookie
    setAuthCookie(res, token);

    res.json({
      success: true,
      message: 'Login successful',
      token, // Still return token in response for flexibility
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get current user (Protected route)
router.get('/me', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Logout route - Clear cookie
router.post('/logout', (req, res) => {
  try {
    clearAuthCookie(res);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Check authentication status
router.get('/check-auth', protect, (req, res) => {
  res.json({
    success: true,
    message: 'User is authenticated',
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

export default router;