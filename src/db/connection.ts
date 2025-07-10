import pg from 'pg'

// Debug logging
console.log('DB Environment Variables:')
console.log('DB_HOST:', process.env.DB_HOST)
console.log('DB_DATABASE:', process.env.DB_DATABASE)
console.log('DB_USER:', process.env.DB_USER)
console.log('DB_PORT:', process.env.DB_PORT)

// Hardcoded connection for Docker
const pool = new pg.Pool({
  user: 'fono_user',
  host: 'db',
  database: 'fono_db',
  password: 'fono_password',
  port: 5432,
})

export default pool
