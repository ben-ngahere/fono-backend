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
      return res.status(401).json({ message: 'Sender not authenticated' })
    }
    if (!content) {
      return res.status(400).json({ message: 'Message content is required' })
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
      const newMessage = result.rows[0]

      // Trigger Pusher event after successful message storage
      const sanitizedReceiverId = receiverId
        ? receiverId.replace(/\|/g, '_').replace(/\./g, '-')
        : null

      const channelName = sanitizedReceiverId
        ? `private-chat-${sanitizedReceiverId}`
        : 'public-chat'

      const eventName = 'new-message'

      // -- Testing -- //
      console.log(
        `Sending Pusher event to channel: ${channelName} with event: ${eventName}`
      )
      pusherInstance.trigger(channelName, eventName, {
        message: `A new message has been posted in your chat`,
        timestamp: new Date().toISOString(),
      })
      // -- Testing -- //

      // Trigger a notification event telling the user there's a new message
      pusherInstance.trigger(channelName, eventName, {
        message: `A new message has been posted in your chat`,
        timestamp: new Date().toISOString(),
      })
      console.log(
        `Pusher event triggered on channel '${channelName}' for message ID: ${newMessage.id}`
      )

      res.status(201).json(newMessage) // Return the new message
    } catch (err) {
      console.error('Error sending chat message:', err)
      res.status(500).json({ message: 'Failed to send chat message' })
    }
  }) as express.RequestHandler)

  // GET chat messages (Decrypt + Retrieve) (/v1/chat_messages?participantId=<OTHER_USER_ID>)
  router.get('/', jwtCheck, (async (req: AuthenticatedRequest, res) => {
    const userId = req.auth?.payload.sub
    const { participantId, includeDeleted } = req.query

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' })
    }

    // Base query - exclude deleted messages by default
    const deletedFilter =
      includeDeleted === 'true' ? '' : 'AND is_deleted = FALSE'

    let query = `SELECT id, sender_id, receiver_id, encrypted_content, iv, auth_tag, created_at, read_status, message_type, is_deleted, deleted_at
                 FROM chat_messages
                 WHERE (sender_id = $1 OR receiver_id = $1) ${deletedFilter}
                 ORDER BY created_at ASC` // Chat history ordered by time
    const values: (string | number)[] = [userId]

    if (participantId) {
      query = `SELECT id, sender_id, receiver_id, encrypted_content, iv, auth_tag, created_at, read_status, message_type, is_deleted, deleted_at
               FROM chat_messages
               WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)) ${deletedFilter}
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
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            content: decryptedContent,
          }
        } catch (decryptError) {
          console.error('Failed to decrypt message ID:', row.id, decryptError)
          const { encrypted_content, iv, auth_tag, ...rest } = row
          return {
            ...rest,
            senderId: row.sender_id,
            receiverId: row.receiver_id,
            content: '[Could not decrypt message]',
            decryptionError: true,
          }
        }
      })

      res.json(decryptedMessages)
    } catch (err) {
      console.error('Error getting chat messages:', err)
      res.status(500).json({ message: 'Failed to get chat messages' })
    }
  }) as express.RequestHandler)

  // DELETE a message (/v1/chat_messages/:messageId)
  router.delete('/:messageId', jwtCheck, (async (
    req: AuthenticatedRequest,
    res
  ) => {
    const userId = req.auth?.payload.sub
    const { messageId } = req.params

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' })
    }

    try {
      // First check if the user owns this message and it's not already deleted
      const checkResult = await pool.query(
        'SELECT sender_id, is_deleted FROM chat_messages WHERE id = $1',
        [messageId]
      )

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: 'Message not found' })
      }

      const message = checkResult.rows[0]

      if (message.sender_id !== userId) {
        return res
          .status(403)
          .json({ message: 'You can only delete your own messages' })
      }

      if (message.is_deleted) {
        return res.status(400).json({ message: 'Message is already deleted' })
      }

      // Soft delete by setting is_deleted flag and deleted_at timestamp
      const deleteResult = await pool.query(
        'UPDATE chat_messages SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND sender_id = $2',
        [messageId, userId]
      )

      if (deleteResult.rowCount === 0) {
        return res
          .status(404)
          .json({ message: 'Message not found or already deleted' })
      }

      console.log(`Message ${messageId} soft deleted by user ${userId}`)
      res.status(200).json({ message: 'Message deleted successfully' })
    } catch (err) {
      console.error('Error deleting message:', err)
      res.status(500).json({ message: 'Failed to delete message' })
    }
  }) as express.RequestHandler)

  // Optional: Restore a deleted message (Admin or user feature)
  router.patch('/:messageId/restore', jwtCheck, (async (
    req: AuthenticatedRequest,
    res
  ) => {
    const userId = req.auth?.payload.sub
    const { messageId } = req.params

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' })
    }

    try {
      // Check if the user owns this message and it's deleted
      const checkResult = await pool.query(
        'SELECT sender_id, is_deleted FROM chat_messages WHERE id = $1',
        [messageId]
      )

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: 'Message not found' })
      }

      const message = checkResult.rows[0]

      if (message.sender_id !== userId) {
        return res
          .status(403)
          .json({ message: 'You can only restore your own messages' })
      }

      if (!message.is_deleted) {
        return res.status(400).json({ message: 'Message is not deleted' })
      }

      // Restore the message
      const restoreResult = await pool.query(
        'UPDATE chat_messages SET is_deleted = false, deleted_at = NULL WHERE id = $1 AND sender_id = $2',
        [messageId, userId]
      )

      if (restoreResult.rowCount === 0) {
        return res.status(404).json({ message: 'Message not found' })
      }

      console.log(`Message ${messageId} restored by user ${userId}`)
      res.status(200).json({ message: 'Message restored successfully' })
    } catch (err) {
      console.error('Error restoring message:', err)
      res.status(500).json({ message: 'Failed to restore message' })
    }
  }) as express.RequestHandler)

  // Optional: Permanently delete a message (Admin feature)
  router.delete('/:messageId/permanent', jwtCheck, (async (
    req: AuthenticatedRequest,
    res
  ) => {
    const userId = req.auth?.payload.sub
    const { messageId } = req.params

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' })
    }

    try {
      // Check if the user owns this message
      const checkResult = await pool.query(
        'SELECT sender_id FROM chat_messages WHERE id = $1',
        [messageId]
      )

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ message: 'Message not found' })
      }

      if (checkResult.rows[0].sender_id !== userId) {
        return res.status(403).json({
          message: 'You can only permanently delete your own messages',
        })
      }

      // Hard delete - actually remove from database
      const deleteResult = await pool.query(
        'DELETE FROM chat_messages WHERE id = $1 AND sender_id = $2',
        [messageId, userId]
      )

      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ message: 'Message not found' })
      }

      console.log(`Message ${messageId} permanently deleted by user ${userId}`)
      res.status(200).json({ message: 'Message permanently deleted' })
    } catch (err) {
      console.error('Error permanently deleting message:', err)
      res.status(500).json({ message: 'Failed to permanently delete message' })
    }
  }) as express.RequestHandler)

  return router
}
