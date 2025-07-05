import express, { ErrorRequestHandler } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { auth, UnauthorizedError } from 'express-oauth2-jwt-bearer'
import pool from './db/connection'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Root route (server check)
app.get('/', (req, res) => {
  res.send('Fono Backend is running!')
})

// Public greeting endpoint (frontend /api/v1)
app.get('/v1/greeting', (req, res) => {
  res.json({ greeting: 'Backend says hello from a public endpoint!' })
})

// JWT middleware
const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
})

// Protected route (JWT)
app.get('/v1/protected', jwtCheck, (req, res) => {
  console.log('Protected route accessed by authenticated user!')
  res.json({ message: 'This is protected data from the backend!' })
})

// Error handling middleware
app.use(function errorHandler(
  err: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (err instanceof UnauthorizedError) {
    console.error('Unauthorized Error:', err.message)
    return res.status(err.status).json({ message: err.message })
  }
  next(err)
} as ErrorRequestHandler)

// Test db connection before starting server
pool
  .connect()
  .then((client) => {
    console.log('Connected to PostgreSQL database!')
    client.release()
  })
  .catch((err) => {
    console.error('Error connecting to PostgreSQL database:', err.message)
  })

app.listen(port, () => {
  console.log(`Fono Backend listening on port ${port}`)
})
