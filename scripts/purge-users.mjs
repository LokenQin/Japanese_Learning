import mysql from 'mysql2/promise'
import { getDatabaseConfig } from '../server/config.js'

const confirmation = '--confirm-delete-all-users'

if (!process.argv.includes(confirmation)) {
  console.error(`Refusing to run without ${confirmation}`)
  process.exit(1)
}

const connection = await mysql.createConnection(getDatabaseConfig())

async function counts() {
  const [[users]] = await connection.query('SELECT COUNT(*) AS count FROM users')
  const [[states]] = await connection.query('SELECT COUNT(*) AS count FROM learning_states')
  const [[sessions]] = await connection.query('SELECT COUNT(*) AS count FROM sessions')
  return {
    users: Number(users.count),
    learningStates: Number(states.count),
    sessions: Number(sessions.count),
  }
}

try {
  const before = await counts()
  await connection.beginTransaction()
  const [result] = await connection.query('DELETE FROM users')
  await connection.commit()
  const after = await counts()

  console.log(JSON.stringify({ before, deletedUsers: result.affectedRows, after }, null, 2))
} catch (error) {
  await connection.rollback()
  throw error
} finally {
  await connection.end()
}
