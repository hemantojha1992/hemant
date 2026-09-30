const express = require('express');

const AgentRoutes = require('../profile/routes');
const RideRoute = require('../ride/routes');


const router = express.Router();
router.use(AgentRoutes);
router.use('/ride',RideRoute);


module.exports = router;

