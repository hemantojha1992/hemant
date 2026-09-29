const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const moduleAlias = require('module-alias');
const http = require('http');
moduleAlias.addAliases({
  '@envConfig': path.resolve(__dirname, '../envConfig.js'),
});
require('@envConfig');
require('../shared/constant');
require('../rider/constant')

// const { SessionSchema } = require('./session');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
let corsObj = cors({ origin: '*', methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', credentials: true, optionsSuccessStatus: 200, });

// app.use(SessionSchema);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsObj);

const AgentTokenValidate = require('../rider/middleware/validateMiddleware')
const AgentRoutes = require('../rider/routes');
//agent route
app.use('/agent',AgentTokenValidate, AgentRoutes);


app.get('/', (req, res) => {
  res.send({ status: SUCCESS_STATUS, data: 'from node' });
})
app.get('*', (req, res) => {
  res.status(404).send({ status: 0, message: "Method not supported" });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
