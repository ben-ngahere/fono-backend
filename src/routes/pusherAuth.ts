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

    // Prevents a user from listening to another users chat
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

  // POST typing events (/v1/pusher/typing)
  router.post('/typing', jwtCheck, ((req: AuthenticatedRequest, res) => {
    const userId = req.auth?.payload.sub
    const { action, targetUserId } = req.body

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' })
    }

    if (!['start', 'stop'].includes(action)) {
      return res
        .status(400)
        .json({ message: 'Invalid action. Must be "start" or "stop"' })
    }

    if (!targetUserId) {
      return res.status(400).json({ message: 'Target user ID is required' })
    }

    try {
      // Sanitize the target user ID for channel name
      const sanitizedTargetUserId = targetUserId
        .replace(/\|/g, '_')
        .replace(/\./g, '-')

      const channelName = `private-chat-${sanitizedTargetUserId}`
      const eventName = `user-typing-${action}`

      // Send typing event to the target users channel
      pusherInstance.trigger(channelName, eventName, {
        fromUserId: userId,
        action: action,
        timestamp: new Date().toISOString(),
      })

      console.log(`🔔 Typing ${action} event sent to channel: ${channelName}`)
      res
        .status(200)
        .json({ message: `Typing ${action} event sent successfully` })
    } catch (error) {
      console.error('Error sending typing event:', error)
      res.status(500).json({ message: 'Failed to send typing event' })
    }
  }) as express.RequestHandler)

  return router
}
