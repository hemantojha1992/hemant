const mysql = require('mysql2/promise');
//require('@envConfig')
// Load environment variables from .env file
//dotenv.config();
const dbpool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
module.exports = dbpool;
