// Cookie configuration
export const cookieOptions = {
  httpOnly: true, // Prevents client-side JS from accessing the cookie
  secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
  sameSite: 'strict', // CSRF protection
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
  path: '/' // Cookie available for all routes
};

// Set authentication cookie
export const setAuthCookie = (res, token) => {
  res.cookie('token', token, cookieOptions);
};

// Clear authentication cookie
export const clearAuthCookie = (res) => {
  res.cookie('token', '', {
    ...cookieOptions,
    maxAge: 0 // Expire immediately
  });
};