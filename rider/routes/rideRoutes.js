const express = require('express');
const RideController = require('../controllers/Ride/RideController');
const router = express.Router();
const RideControllerInstance = new RideController();
router.get('/get_airport_code_list',RideControllerInstance.getAirPortCodeList);

module.exports = router;