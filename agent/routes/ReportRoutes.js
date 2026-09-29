const express =  require('express');
const ReportController = require('../controllers/ReportController');

const router = express.Router();
router.get('/ledger',ReportController.ledger)
router.post('/flightrefundbookings',ReportController.flightRefundBookings)
router.post('/flightBookingreport',ReportController.flight);
module.exports = router;