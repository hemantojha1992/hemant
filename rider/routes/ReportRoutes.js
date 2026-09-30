const express =  require('express');
const ReportController = require('../controllers/ReportController');

const router = express.Router();
router.get('/ledger',ReportController.ledger)
module.exports = router;