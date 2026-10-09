import '../env.ts';
import mysql from 'mysql2/promise';
export function databaseName(name = process.env.DB_NAME || 'smartreview') {
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    throw new Error('DB_NAME may contain only letters, numbers and underscore');
  return name;
}
export function createPool({ database = databaseName() } = {}) {
  if (!process.env.DB_USER)
    throw new Error('Missing DB_USER. Configure .env then run npm run db:migrate.');
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: databaseName(database),
    connectionLimit: 5,
    waitForConnections: true,
    connectTimeout: 5000,
    timezone: 'Z',
    dateStrings: true,
    charset: 'utf8mb4',
    decimalNumbers: true,
    multipleStatements: false,
  });
}
