const express = require('express');

const AgentRoutes = require('../profile/routes');
const FlightRoute = require('../flight/routes');


const router = express.Router();
router.use(AgentRoutes);
router.use('/flight',FlightRoute);


module.exports = router;

