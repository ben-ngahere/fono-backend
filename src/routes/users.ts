import express from 'express'
import { auth, AuthResult } from 'express-oauth2-jwt-bearer'
import pool from '../db/connection'

// JWT middleware
const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
})

interface AuthenticatedRequest extends express.Request {
  auth?: AuthResult
}

const router = express.Router()

// GET all users (/v1/users)
router.get('/', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, email, display_name, avatar_url, status, status_message, last_seen
       FROM user_profiles
       ORDER BY display_name ASC`
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ message: 'Failed to fetch users' })
  }
}) as express.RequestHandler)

// Create current user profile (/v1/users/me)
router.get('/me', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub
  const userEmail = req.auth?.payload.email as string

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }

  try {
    // Try to get existing profile
    let result = await pool.query(
      `SELECT user_id, email, display_name, avatar_url, status, status_message, last_seen
       FROM user_profiles
       WHERE user_id = $1`,
      [userId]
    )

    // If no profile exists, create one
    if (result.rows.length === 0) {
      // Create a unique email if none provided
      const email = userEmail || `${userId.replace(/[|.]/g, '-')}@fono.local`

      // Extract a display name
      const emailName = email.split('@')[0]
      const displayName =
        (req.auth?.payload.name as string) ||
        (req.auth?.payload.nickname as string) ||
        emailName

      result = await pool.query(
        `INSERT INTO user_profiles (user_id, email, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         RETURNING user_id, email, display_name, avatar_url, status, status_message, last_seen`,
        [userId, email, displayName, req.auth?.payload.picture || null]
      )
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching/creating user profile:', error)
    res.status(500).json({ message: 'Failed to fetch user profile' })
  }
}) as express.RequestHandler)

// GET specific user (/v1/users/:userId)
router.get('/:userId', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params

  try {
    const result = await pool.query(
      `SELECT user_id, email, display_name, avatar_url, status, status_message, last_seen
       FROM user_profiles
       WHERE user_id = $1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ message: 'Failed to fetch user' })
  }
}) as express.RequestHandler)

// Update current user profile (/v1/users/profile)
router.put('/profile', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub
  const { display_name, avatar_url, status_message } = req.body

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }

  try {
    const result = await pool.query(
      `UPDATE user_profiles
       SET display_name = COALESCE($2, display_name),
           avatar_url = COALESCE($3, avatar_url),
           status_message = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING user_id, email, display_name, avatar_url, status, status_message, last_seen`,
      [userId, display_name, avatar_url, status_message]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User profile not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating user profile:', error)
    res.status(500).json({ message: 'Failed to update profile' })
  }
}) as express.RequestHandler)

// Update user status (/v1/users/status)
router.put('/status', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub
  const { status } = req.body

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }

  if (!['online', 'offline', 'away'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status value' })
  }

  try {
    const result = await pool.query(
      `UPDATE user_profiles
       SET status = $2,
           last_seen = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING user_id, status, last_seen`,
      [userId, status]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User profile not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Error updating user status:', error)
    res.status(500).json({ message: 'Failed to update status' })
  }
}) as express.RequestHandler)

export default router
