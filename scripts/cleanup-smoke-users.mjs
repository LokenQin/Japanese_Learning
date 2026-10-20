import 'dotenv/config'
import { getPool } from '../server/db.js'

const pool = getPool()
const emails = process.argv.slice(2).map((email) => email.trim().toLowerCase())
const smokeEmailPattern = /^kotoba-(reset-)?smoke-\d+@example\.com$/

try {
  if (emails.length === 0) {
    const [rows] = await pool.execute(
      "SELECT email FROM users WHERE email LIKE 'kotoba-reset-smoke-%@example.com' OR email LIKE 'kotoba-smoke-%@example.com' ORDER BY id",
    )
    console.log(JSON.stringify({ temporaryUsers: rows.map((row) => row.email) }))
  } else {
    if (emails.some((email) => !smokeEmailPattern.test(email))) {
      throw new Error('Only complete generated smoke-test email addresses can be deleted')
    }

    const placeholders = emails.map(() => '?').join(', ')
    const [result] = await pool.execute(
      `DELETE FROM users WHERE email IN (${placeholders})`,
      emails,
    )
    console.log(JSON.stringify({ deletedTemporaryUsers: result.affectedRows }))
  }
} finally {
  await pool.end()
}
