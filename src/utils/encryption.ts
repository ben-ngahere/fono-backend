import crypto from 'crypto'

// Encryption key from .env (hardcoded for Docker)
// Encryption key from .env
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY

if (!ENCRYPTION_KEY_HEX) {
  throw new Error('ENCRYPTION_KEY is not set in environment variables')
}

// Convert hex string to a Buffer for crypto ops
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex')

// Ensure key length is 256-bit
if (ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be a 32-byte (256-bit) key.')
}

// Encryption Standard, 256-bit key, Galois/Counter Mode
const ALGORITHM = 'aes-256-gcm'

interface EncryptedData {
  iv: string // Init Vector (randomly generated for each encryption)
  encryptedText: string // The encrypted message
  tag: string // Auth Tag (integrity verification)
}

// Encrypts plaintext string using AES-256-GCM
export function encrypt(text: string): EncryptedData {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const tag = cipher.getAuthTag().toString('hex') // Auth Tag

  return {
    iv: iv.toString('hex'),
    encryptedText: encrypted,
    tag: tag,
  }
}

// Decrypts encrypted string using AES-256-GCM
export function decrypt(encryptedData: EncryptedData): string {
  const iv = Buffer.from(encryptedData.iv, 'hex')
  const encryptedText = Buffer.from(encryptedData.encryptedText, 'hex')
  const tag = Buffer.from(encryptedData.tag, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  decipher.setAuthTag(tag) // Set Auth Tag before decrypting

  let decrypted = decipher.update(encryptedText)
  try {
    decrypted = Buffer.concat([decrypted, decipher.final()])
  } catch (error) {
    // Handles cases where Auth Tag is invalid or data is tampered
    console.error(
      'Decryption failed, data may be tampered or key/IV/tag is incorrect:',
      error
    )
    throw new Error(
      'Decryption failed: Authentication tag invalid or data tampered.'
    )
  }
  return decrypted.toString('utf8')
}

// Test
// console.log('Encryption utility loaded.');
// try {
//   const originalText = 'Hello, secure chat message!';
//   const encrypted = encrypt(originalText);
//   console.log('Encrypted:', encrypted);
//   const decrypted = decrypt(encrypted);
//   console.log('Decrypted:', decrypted);
//   if (originalText === decrypted) {
//     console.log('Encryption/Decryption test successful!');
//   } else {
//     console.error('Encryption/Decryption test FAILED!');
//   }
// } catch (e) {
//   console.error('Encryption/Decryption test encountered an error:', e);
// }
