const mysql = require('mysql2/promise');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const dbpool = mysql.createPool({
  host: process.env.DB_HOST1,
  user: process.env.DB_USER1,
  password: process.env.DB_PASSWORD1,
  database: process.env.DB_DATABASE1,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = dbpool;
