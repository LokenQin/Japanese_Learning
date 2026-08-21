import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import mysql from 'mysql2/promise'
import { getDatabaseConfig } from './config.js'
import { hashPassword } from './security.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD
const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || '学习者'

if (!email || !password) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required for database initialization')
}
if (password.length < 10) {
  throw new Error('ADMIN_PASSWORD must contain at least 10 characters')
}

const schema = await readFile(resolve(currentDirectory, '../database/schema.sql'), 'utf8')
let connection

try {
  const databaseConfig = getDatabaseConfig()
  const databaseName = databaseConfig.database
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error('DB_NAME may contain only letters, numbers, and underscores')
  }
  const { database: _database, ...serverConfig } = databaseConfig
  connection = await mysql.createConnection({ ...serverConfig, multipleStatements: true })
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await connection.changeUser({ database: databaseName })
  await connection.query(schema)
  const { salt, hash } = await hashPassword(password)
  await connection.execute(
    `INSERT INTO users (email, display_name, password_salt, password_hash)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       password_salt = VALUES(password_salt),
       password_hash = VALUES(password_hash)`,
    [email, displayName, salt, hash],
  )
  console.log(`Database initialized. Login account: ${email}`)
} catch (error) {
  if (error.code === 'HANDSHAKE_SSL_ERROR' && /self-signed certificate/i.test(error.message)) {
    console.error([
      'MySQL TLS certificate validation failed: the server uses a self-signed certificate.',
      'Recommended: copy the MySQL CA certificate locally and set DB_SSL_CA_PATH in .env.',
      'Temporary alternative for a server you control: set DB_SSL_REJECT_UNAUTHORIZED=false.',
    ].join('\n'))
  } else {
    console.error(`Database initialization failed: ${error.message}`)
  }
  process.exitCode = 1
} finally {
  if (connection) await connection.end()
}
