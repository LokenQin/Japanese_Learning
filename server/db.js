import mysql from 'mysql2/promise'
import { getDatabaseConfig } from './config.js'

let pool

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...getDatabaseConfig(),
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })
  }
  return pool
}

export async function checkDatabase() {
  const connection = await getPool().getConnection()
  try {
    await connection.ping()
  } finally {
    connection.release()
  }
}
