import express, { ErrorRequestHandler } from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { auth, UnauthorizedError } from 'express-oauth2-jwt-bearer'
import pool from './db/connection'
import * as fs from 'fs'
import * as path from 'path'
import fonoItemsRouter from './routes/fonoItems'
import createChatMessagesRouter from './routes/chatMessages'
import Pusher from 'pusher'
import createPusherAuthRouter from './routes/pusherAuth'

dotenv.config()

// Pusher init
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID as string,
  key: process.env.PUSHER_KEY as string,
  secret: process.env.PUSHER_SECRET as string,
  cluster: process.env.PUSHER_CLUSTER as string,
  useTLS: true,
})

const app = express()
const port = process.env.PORT || 3000
app.use(express.urlencoded({ extended: true }))

app.use(cors())
app.use(express.json())

// Routes
app.use('/v1/fono_items', fonoItemsRouter)
app.use('/v1/chat_messages', createChatMessagesRouter(pusher))
app.use('/v1/pusher', createPusherAuthRouter(pusher))

// Root route (server check)
app.get('/', (req, res) => {
  res.send('Fono Backend is running!')
})

// Public greeting endpoint (frontend /api/v1)
app.get('/v1/greeting', (req, res) => {
  res.json({ greeting: 'Backend says hello from a public endpoint!' })
})

// JWT middleware for other protected routes
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

// DB init
async function initializeDatabase() {
  try {
    await pool.connect()
    console.log('Connected to PostgreSQL database!')

    const schemaPath = path.join(__dirname, 'db', 'schema.sql')
    const schemaSql = fs.readFileSync(schemaPath, 'utf8')
    await pool.query(schemaSql)
    console.log('Database schema applied successfully (or already exists)')
  } catch (err) {
    console.error('Error initializing database:', err)
    process.exit(1)
  }
}

// Error handling
app.use(((err, req, res, next) => {
  if (err instanceof UnauthorizedError) {
    console.error('Unauthorized Error:', err.message)
    return res.status(err.status).json({ message: err.message })
  }
  next(err)
}) as ErrorRequestHandler)

app.use(((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ message: 'Internal Server Error' })
}) as ErrorRequestHandler)

// Start server
initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Fono Backend listening on port ${port}`)
    })
  })
  .catch((err) => {
    console.error(
      'Failed to start server due to database initialization error:',
      err
    )
    process.exit(1)
  })
