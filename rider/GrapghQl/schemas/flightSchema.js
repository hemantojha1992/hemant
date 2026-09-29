const { gql } = require('apollo-server');

const typeDefs = gql`
  scalar JSON

  type FareOption {
    name: String
    price: Float
    refundable: Boolean
  }

  type Flight {
    AirPrisingSolution:JSON
    AirPriceSolKey:String
    airline: String
    flightNumber: String
    source: String
    destination: String
    departureTime: String
    arrivalTime: String
    duration: String
    fareOptions: JSON  
  }

  type Query {
    flights: [Flight]
  }
`;

module.exports = typeDefs;