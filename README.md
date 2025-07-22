# FONO Backend 🛠️

> Node.js API server for FONO family communication platform
> 
> **Work in progress** - actively adding features and improving security!

This is the backend that powers FONO - handles message encryption, user authentication, real-time events and all the server-side logic that keeps family conversations secure and private.

## What it does ✨

- **🔐 Message encryption** - AES-256-GCM encryption before database storage
- **🔑 JWT authentication** - Validates Auth0 tokens on every request
- **📡 Real-time events** - Pusher integration for instant messaging
- **🗃️ PostgreSQL database** - Stores encrypted messages and user profiles
- **🔒 API security** - Protected endpoints with proper error handling
- **📨 Typing indicators** - Live typing awareness between family members

## Currently working on 🚧

- **Better display name fetching** - Improving how user names are resolved
- **Activity feed API** - Backend support for notification history
- **Error handling improvements** - Better error messages and recovery
- **Rate limiting** - Protect against abuse while keeping it family-friendly

## Getting it running 🚀

You'll need:
- Node.js 18+
- PostgreSQL database
- Auth0 account
- Pusher account
- Docker

### Quick start 💻

```bash
git clone <your-repo-url>
cd fono-backend
npm install
cp .env.example .env
# Fill in your database, Auth0, and Pusher details
npm run dev
```

Server starts on http://localhost:3000

### With Docker 🐳

```bash
# From main FONO directory
docker-compose up
```

This starts the whole stack - backend, frontend, and database.

## Environment setup ⚙️

Create a `.env` file:

```bash
# Server
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fono

# Auth0 
AUTH0_AUDIENCE=your-api-audience
AUTH0_ISSUER_BASE_URL=https://your-domain.auth0.com/

# Pusher
PUSHER_APP_ID=your-app-id
PUSHER_KEY=your-key
PUSHER_SECRET=your-secret
PUSHER_CLUSTER=your-cluster

# Encryption
ENCRYPTION_KEY=your-32-character-key-for-message-encryption
```

### Database setup 💾

The app uses PostgreSQL. Create a database and user:

```sql
CREATE DATABASE fono_db;
CREATE USER fono_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE fono_db TO fono_user;
```

Tables are created automatically when you first run the app.

## How it's built 🏗️

### Tech stack 🛠️

- **Node.js + TypeScript** - Type safety and JavaScript
- **Express** - Simple, fast web framework  
- **PostgreSQL** - Reliable database for encrypted message storage
- **Auth0** - JWT token validation
- **Pusher** - Real-time WebSocket events
- **Docker** - Containerised for easy deployment

### API structure 📁

```
src/
├── routes/              # API endpoints
│   ├── chatMessages.ts  # Message CRUD + encryption
│   ├── users.ts         # User profiles
│   └── pusherAuth.ts    # Real-time auth
├── db/                  # Database stuff
│   └── connection.ts    # PostgreSQL setup
├── utils/               # Helper functions
│   └── encryption.ts    # Message encryption/decryption
└── index.ts            # Server startup
```

### How the encryption works 🔐

This was the trickiest part to get right. Every message gets encrypted before hitting the database:

1. **User sends message** → Plain text to API
2. **Generate unique IV** → Random initialisation vector 
3. **AES-256-GCM encryption** → Message becomes gibberish
4. **Store encrypted** → Database only sees encrypted data
5. **Client requests** → Fetch encrypted message
6. **Decrypt and send** → Client gets readable message

Even if someone steals the database, they can't read the messages without the encryption keys.

### Real-time integration 📡

The backend triggers Pusher events when messages are sent:

```typescript
// After saving encrypted message to database
await pusherInstance.trigger(`private-chat-${receiverId}`, 'new-message', {
  senderId: senderId,
  senderName: senderDisplayName,
  content: content, // Plain text for notification
  messageId: newMessage.id,
  timestamp: newMessage.created_at
})
```

This makes messages appear instantly on the recipient's screen.

## API endpoints 🛤️

### Authentication 🔑

All endpoints require valid Auth0 JWT tokens:

```bash
Authorization: Bearer <jwt-token>
```

### Messages 💬

**GET /v1/chat_messages**
- Get chat history between two users
- Messages are decrypted before sending to client
- Query param: `participantId=<user-id>`

**POST /v1/chat_messages**
- Send a new message
- Encrypts message before database storage
- Triggers real-time Pusher event

**DELETE /v1/chat_messages/:messageId**
- Soft delete a message (users own messages only)
- Message marked as deleted but not permanently removed

### Users 👥

**GET /v1/users/profile**
- Get current users profile info
- Display name, status message, avatar URL

**PUT /v1/users/profile**
- Update user profile
- Display name, status message, avatar

### Real-time 📡

**POST /v1/pusher/auth**
- Authorize private Pusher channels
- Validates JWT and ensures users can only access their own channels

**POST /v1/pusher/typing**
- Send typing start/stop events
- `action: 'start'` or `action: 'stop'`

## Security features 🔒

### Message encryption 🛡️

- **AES-256-GCM** - Military-grade encryption
- **Unique IV per message** - No patterns, even identical messages look different
- **Authentication tags** - Prevents message tampering
- **Server-side encryption** - Client never handles encryption keys

### API security 🔐

- **JWT validation** - Every request verified against Auth0
- **Private channels** - Users can only access their own real-time channels
- **Rate limiting** - Protection against abuse (planned)
- **Input validation** - Sanitise all user inputs

### Database security 💾

- **No plain text** - All message content encrypted at rest
- **Soft deletion** - Deleted messages recoverable if needed
- **User isolation** - Users can only access their own data
- **Connection security** - SSL connections in production

## Development 💻

```bash
npm run dev          # Start with nodemon
npm run build        # TypeScript compilation  
npm run start        # Production server
npm run test         # Run tests
```

### Database migrations 🗃️

Currently using simple SQL scripts. Planning to add proper migrations:

```sql
-- Current schema in db/schema.sql
-- Run manually: psql -d fono_db -f db/schema.sql
```

## Deployment 🚀

### Development 
```bash
docker-compose up
```

### Production
```bash
npm run build
npm start
```

The backend is containerised and ready for production deployment. Just make sure your environment variables are set correctly.

## Current challenges 🤔

Things I'm still working on improving:

- **Display name resolution** - Sometimes shows "Someone" instead of actual names
- **Error handling** - Need better error messages for the frontend
- **Database migrations** - Want proper migration system instead of manual SQL
- **Testing** - Need more comprehensive test coverage
- **Rate limiting** - Protect against abuse while keeping it family-friendly

## Why I built it this way 💭

Coming straight from bootcamp, I wanted to use modern patterns but keep it simple:

- **TypeScript everywhere** - Caught so many bugs and will continue to as I develop this app
- **Express over frameworks** - Wanted to understand the fundamentals first
- **Managed services** - Auth0 and Pusher handle the complex stuff
- **Container-first** - Makes deployment consistent across environments

The encryption was the scariest part - lots of research to make sure I got it right. Used industry-standard algorithms and patterns throughout.

## Contributing 🤝

This is a learning project and still evolving! If you want to help:

1. Fork the repo
2. Create a feature branch
3. Make sure tests pass
4. Submit a pull request

**Current priorities:**
- Better error handling and logging
- Comprehensive testing
- Database migration system
- Performance optimisation

## Related repositories 🔗

- **[FONO Frontend](../fono-frontend)** - React + TypeScript UI
- **[FONO Infrastructure](../infrastructure)** - Docker and deployment configs
- **[FONO Documentation](../docs)** - Technical documentation

## License 📄

MIT License - families can adapt this for their own needs.

## Status & Roadmap 🗺️

**Currently working:**
- ✅ Message encryption and storage
- ✅ JWT authentication
- ✅ Real-time Pusher events
- ✅ User profile management
- ✅ Docker deployment

**In development:**
- 🚧 Activity feed endpoints
- 🚧 Better display name handling
- 🚧 Improved error responses
- 🚧 Rate limiting

**Future plans:**
- 📋 File upload handling
- 📋 Message search endpoints
- 📋 Database migrations
- 📋 Comprehensive testing
- 📋 Performance monitoring

---

Built for families who want control over their digital communication. Every API design decision prioritises privacy, security and family ownership of data.

*Still learning backend development - always open to feedback and improvements!* 😊
