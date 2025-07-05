import express from 'express'
import { auth, AuthResult } from 'express-oauth2-jwt-bearer'
import Pusher from 'pusher'

// JWT Middleware
const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
})

interface AuthenticatedRequest extends express.Request {
  auth?: AuthResult
}

export default function createPusherAuthRouter(pusherInstance: Pusher) {
  const router = express.Router()

  // POST messages (/v1/pusher/auth)
  router.post('/auth', jwtCheck, ((req: AuthenticatedRequest, res) => {
    const socketId = req.body.socket_id
    const channel = req.body.channel_name
    const userId = req.auth?.payload.sub

    // This prevents a user from listening to another users chat
    const sanitizedUserId = userId?.replace(/\|/g, '_').replace(/\./g, '-')
    const expectedChannelName = `private-chat-${sanitizedUserId}`

    if (channel !== expectedChannelName) {
      console.error(
        `Forbidden: User ${userId} tried to access channel ${channel}`
      )
      return res.status(403).send('Forbidden')
    }

    try {
      const authResponse = pusherInstance.authorizeChannel(socketId, channel)
      res.send(authResponse)
    } catch (error) {
      console.error('Pusher authorization error:', error)
      res.status(500).send('Pusher authorization failed')
    }
  }) as express.RequestHandler)

  return router
}
