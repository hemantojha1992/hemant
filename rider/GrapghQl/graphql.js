const { mergeTypeDefs, mergeResolvers } = require('@graphql-tools/merge');
const flightTypeDefs = require('./schemas/flightSchema');
// const userTypeDefs = require('./schemas/userSchema');
const flightResolvers = require('./resolvers/flightResolvers');
// const userResolvers = require('./resolvers/userResolvers');

const typeDefs = mergeTypeDefs([flightTypeDefs]);
const resolvers = mergeResolvers([flightResolvers]);

module.exports = { typeDefs, resolvers };