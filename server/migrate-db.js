import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { getDatabaseConfig } from './config.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const schema = await readFile(resolve(currentDirectory, '../database/schema.sql'), 'utf8')
const connection = await mysql.createConnection({
  ...getDatabaseConfig(),
  multipleStatements: true,
})

try {
  await connection.query(schema)
  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('recovery_keyword_salt', 'recovery_keyword_hash')`,
    [getDatabaseConfig().database],
  )
  const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME))
  if (!existingColumns.has('recovery_keyword_salt')) {
    await connection.query('ALTER TABLE users ADD COLUMN recovery_keyword_salt VARBINARY(32) NULL AFTER password_hash')
  }
  if (!existingColumns.has('recovery_keyword_hash')) {
    await connection.query('ALTER TABLE users ADD COLUMN recovery_keyword_hash VARBINARY(64) NULL AFTER recovery_keyword_salt')
  }
  console.log('Database schema is up to date.')
} finally {
  await connection.end()
}
