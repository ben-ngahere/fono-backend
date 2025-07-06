import express from 'express'
import { auth, AuthResult } from 'express-oauth2-jwt-bearer'
import pool from '../db/connection'

const router = express.Router()

// JWT middleware
const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
})

// Get user ID from JWT payload
interface AuthenticatedRequest extends express.Request {
  auth?: AuthResult
}

// GET all fono_items for the authenticated user (Read All)
router.get('/', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }

  try {
    const result = await pool.query(
      'SELECT id, title, description, created_at, updated_at FROM fono_items WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Error fetching fono_items:', err)
    res.status(500).json({ message: 'Failed to fetch fono items' })
  }
}) as express.RequestHandler)

// POST a new fono_item for the authenticated user (Create)
router.post('/', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub
  const { title, description } = req.body

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }
  if (!title) {
    return res.status(400).json({ message: 'Title is required' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO fono_items (user_id, title, description) VALUES ($1, $2, $3) RETURNING id, title, description, created_at, updated_at',
      [userId, title, description]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('Error creating fono_item:', err)
    res.status(500).json({ message: 'Failed to create fono item' })
  }
}) as express.RequestHandler)

// GET a single fono_item by ID for the authenticated user (Read One)
router.get('/:id', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub
  const { id } = req.params

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }

  try {
    const result = await pool.query(
      'SELECT id, title, description, created_at, updated_at FROM fono_items WHERE id = $1 AND user_id = $2',
      [id, userId]
    )
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: 'Fono item not found or not authorised' })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error fetching single fono_item:', err)
    res.status(500).json({ message: 'Failed to fetch fono item.' })
  }
}) as express.RequestHandler)

// PUT to update a fono_item by ID for the authenticated user (Update)
router.put('/:id', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub
  const { id } = req.params
  const { title, description } = req.body

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }
  if (title === undefined && description === undefined) {
    return res.status(400).json({ message: 'No fields to update provided' })
  }

  try {
    const values: (string | number)[] = [id, userId]

    let setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP']

    let paramIndex = 3

    if (title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`)
      values.push(title)
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`)
      values.push(description)
    }

    const updateQuery = `
      UPDATE fono_items
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING id, title, description, created_at, updated_at
    `

    const result = await pool.query(updateQuery, values)

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: 'Fono item not found or not authorised' })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Error updating fono_item:', err)
    res.status(500).json({ message: 'Failed to update fono item' })
  }
}) as express.RequestHandler)

// DELETE a fono_item by ID for the authenticated user (Delete)
router.delete('/:id', jwtCheck, (async (req: AuthenticatedRequest, res) => {
  const userId = req.auth?.payload.sub
  const { id } = req.params

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' })
  }

  try {
    const result = await pool.query(
      'DELETE FROM fono_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    )
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: 'Fono item not found or not authorized' })
    }
    res.status(204).send()
  } catch (err) {
    console.error('Error deleting fono_item:', err)
    res.status(500).json({ message: 'Failed to delete fono item' })
  }
}) as express.RequestHandler)

export default router
