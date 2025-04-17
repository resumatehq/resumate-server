// middleware/authMiddleware.js
import jwt from 'jsonwebtoken'
import User from '../models/userModel.js'
import asyncHandler from 'express-async-handler'
import redisClient from '../config/redis.js'

// Function to check API permissions
const checkApiPermission = (permissions, path, method) => {
  // Implementation depends on your API structure
  // Example:
  if (path.startsWith('/api/resumes') && method === 'GET') {
    return permissions.includes('read')
  }

  if (path.startsWith('/api/resumes') && ['POST', 'PUT', 'PATCH'].includes(method)) {
    return permissions.includes('write')
  }

  if (path.startsWith('/api/resumes') && method === 'DELETE') {
    return permissions.includes('delete')
  }

  if (path.startsWith('/api/export')) {
    return permissions.includes('export')
  }

  if (path.startsWith('/api/share')) {
    return permissions.includes('share')
  }

  if (path.startsWith('/api/ai')) {
    return permissions.includes('ai')
  }

  return false
}

// Protect routes - JWT based authentication
export const protect = asyncHandler(async (req, res, next) => {
  let token

  // Check if token exists in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1]
  } else if (req.cookies?.jwt) {
    // Sử dụng optional chaining
    token = req.cookies.jwt
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    })
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Check if token is blacklisted (logged out)
    const isBlacklisted = await redisClient.get(`bl_${token}`)
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Please log in again'
      })
    }

    // Get user from token
    const user = await User.findById(decoded.id)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists'
      })
    }

    // Check password change timestamp
    if (user.passwordChangedAt && decoded.iat < user.passwordChangedAt.getTime() / 1000) {
      return res.status(401).json({
        success: false,
        message: 'User recently changed password. Please log in again'
      })
    }

    // Add user to request object
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    })
  }
})

// Check role-based authorization
export const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.accountType)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.accountType} is not authorized to access this route`
      })
    }
    next()
  }

// Validate API key
export const validateApiKey = asyncHandler(async (req, res, next) => {
  const apiKey = req.headers['x-api-key']

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key is required'
    })
  }

  const keyData = await User.verifyApiKey(apiKey)
  if (!keyData) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired API key'
    })
  }

  // Check permissions
  const hasPermission = checkApiPermission(keyData.permissions, req.path, req.method)
  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      message: 'API key does not have permission for this action'
    })
  }

  // Get user from API key
  const user = await User.findById(keyData.userId)
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'User no longer exists'
    })
  }

  // Add context to request
  req.user = user
  req.apiKey = true
  next()
})
