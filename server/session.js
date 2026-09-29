const session = require('express-session');
require('@envConfig')
const SessionSchema = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    path: '/',
    secure: false,
    httpOnly: true,
    maxAge: 60 * 60 * 24, 
  },
});
module.exports = { SessionSchema };
