import express from 'express'
import { auth, AuthResult } from 'express-oauth2-jwt-bearer'
import pool from '../db/connection'
import { encrypt, decrypt } from '../utils/encryption'
import Pusher from 'pusher'

// JWT middleware
const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: 'RS256',
})

// Get user ID from Auth0
interface AuthenticatedRequest extends express.Request {
  auth?: AuthResult
}

export default function createChatMessagesRouter(pusherInstance: Pusher) {
  const router = express.Router()

  // POST chat messages (Encrypt + Store) (/v1/chat_messages)
  router.post('/', jwtCheck, (async (req: AuthenticatedRequest, res) => {
    const senderId = req.auth?.payload.sub
    const { receiverId, content, messageType = 'text' } = req.body

    if (!senderId) {
      return res.status(401).json({ message: 'Sender not authenticated.' })
    }
    if (!content) {
      return res.status(400).json({ message: 'Message content is required.' })
    }

    try {
      // Encrypt the message
      const { iv, encryptedText, tag } = encrypt(content)

      const result = await pool.query(
        `INSERT INTO chat_messages (sender_id, receiver_id, encrypted_content, iv, auth_tag, message_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, sender_id, receiver_id, created_at, read_status, message_type`, // Non-sensitive fields
        [
          senderId,
          receiverId,
          encryptedText,
          Buffer.from(iv, 'hex'),
          Buffer.from(tag, 'hex'),
          messageType,
        ]
      )
      const newMessage = result.rows[0] // Capture the returned new message

      // Trigger Pusher event after successful message storage
      const sanitizedReceiverId = receiverId
        ? receiverId.replace(/\|/g, '_').replace(/\./g, '-')
        : null

      const channelName = sanitizedReceiverId
        ? `private-chat-${sanitizedReceiverId}`
        : 'public-chat'

      const eventName = 'new-message'

      pusherInstance.trigger(channelName, eventName, {
        id: newMessage.id,
        senderId: newMessage.sender_id,
        receiverId: newMessage.receiver_id,
        content: content, // Send the decrypted content via Pusher
        messageType: newMessage.message_type,
        createdAt: newMessage.created_at,
        readStatus: newMessage.read_status,
      })
      console.log(
        `Pusher event triggered on channel '${channelName}' for message ID: ${newMessage.id}`
      )

      res.status(201).json(newMessage) // Return the new message
    } catch (err) {
      console.error('Error sending chat message:', err)
      res.status(500).json({ message: 'Failed to send chat message.' })
    }
  }) as express.RequestHandler)

  // GET chat messages (Decrypt + Retrieve) (/v1/chat_messages?participantId=<OTHER_USER_ID>)
  router.get('/', jwtCheck, (async (req: AuthenticatedRequest, res) => {
    const userId = req.auth?.payload.sub
    const { participantId } = req.query

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated.' })
    }

    let query = `SELECT id, sender_id, receiver_id, encrypted_content, iv, auth_tag, created_at, read_status, message_type
               FROM chat_messages
               WHERE sender_id = $1 OR receiver_id = $1
               ORDER BY created_at ASC` // Chat history ordered by time
    const values: (string | number)[] = [userId]

    if (participantId) {
      query = `SELECT id, sender_id, receiver_id, encrypted_content, iv, auth_tag, created_at, read_status, message_type
             FROM chat_messages
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
             ORDER BY created_at ASC`
      values.push(participantId as string)
    }

    try {
      const result = await pool.query(query, values)

      // Decrypt each message before sending it to the client
      const decryptedMessages = result.rows.map((row) => {
        try {
          const decryptedContent = decrypt({
            iv: row.iv,
            encryptedText: row.encrypted_content,
            tag: row.auth_tag,
          })
          // Return a new object with decrypted content
          const { encrypted_content, iv, auth_tag, ...rest } = row
          return {
            ...rest,
            content: decryptedContent,
          }
        } catch (decryptError) {
          console.error('Failed to decrypt message ID:', row.id, decryptError)
          const { encrypted_content, iv, auth_tag, ...rest } = row
          return {
            ...rest,
            content: '[Could not decrypt message]',
            decryptionError: true,
          }
        }
      })

      res.json(decryptedMessages)
    } catch (err) {
      console.error('Error fetching chat messages:', err)
      res.status(500).json({ message: 'Failed to fetch chat messages.' })
    }
  }) as express.RequestHandler)

  return router
}
