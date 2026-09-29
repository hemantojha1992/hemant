const express = require('express');
const path = require('path');
const cors = require('cors');
const moduleAlias = require('module-alias');
const http = require('http');
const { ApolloServer } = require('apollo-server-express'); // Import Apollo Server
const TestController = require('../agent/controllers/testController');
const { typeDefs, resolvers } = require('../agent/GrapghQl/graphql'); // Import your GraphQL schema and resolvers

moduleAlias.addAliases({
  '@envConfig': path.resolve(__dirname, '../envConfig.js'),
});

require('@envConfig');
require('../shared/constant');
require('../agent/constant');

const app = express();
const server = http.createServer(app);
let corsObj = cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 200,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsObj);

// Set up Apollo Server for GraphQL
const apolloServer = new ApolloServer({ typeDefs, resolvers });

// Start the Apollo Server
const startServer = async () => {
  await apolloServer.start(); // Await the server start
  apolloServer.applyMiddleware({ app }); // Connect Apollo Server to Express

  // REST API routes
  app.get('/', (req, res) => {
    res.send({ status: SUCCESS_STATUS, data: 'from node' });
  });

  app.get('/test-xml', TestController.GetXmlData);

  // Handle 404 for unsupported methods
  app.get('*', (req, res) => {
    res.status(404).send({ status: 0, message: "Method not supported" });
  });

  // Start the server
  const PORT = process.env.PORT || 3030;
  console.log(PORT, "port");

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint at http://localhost:${PORT}${apolloServer.graphqlPath}`);
  });
};

// Call the startServer function
startServer().catch(err => {
  console.error('Error starting the server:', err);
});