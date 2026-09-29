const express = require('express');
const router = express.Router();
const FlightController = require('../contoller/flight.controller');
const ReportController = require('../contoller/report.controller');
// const validate = require('../../middleware/validate');
const { AirPortSearchValidation, GetFareRulesValidation, FlightSearchValidation , AirPriceValidation,
  createReservationValidation, CountrySearchValidation, FlightBookingReportValidataion,
  CancelFlightViewValidataion,CancelFlightValidataion,RepriceValidation ,OptionalServicesValidation,
  HoldToConfirmValidation,DownloadFlightTicketValidation,holdBookingDetailValidation,unprocessTicketValidation,
  FinalCancelFlightBooking,BookingRefundValidation,BookingRefundReceiptValidation } = require('../services/flight.request.validation');
const { searchSchema, bookSchema } = require('../services/flight.validation');


router.get('/airports',AirPortSearchValidation,FlightController.GetAirports);
router.post('/search',FlightSearchValidation,FlightController.GetFlightList);
router.post('/detail',AirPriceValidation,FlightController.GetDetail);
router.post('/rePrice',RepriceValidation,FlightController.rePrice);
router.post('/optional-services',OptionalServicesValidation,FlightController.GetOptionalServices);
router.post('/createReservation',createReservationValidation,FlightController.CreateReservation);
router.post('/holdToConfirm',HoldToConfirmValidation,FlightController.HoldToConfirm);
router.post('/download-ticket',DownloadFlightTicketValidation,ReportController.DownloadFlightTicket);

router.post('/getHoldBookingDetail',holdBookingDetailValidation,FlightController.GetHoldBookingDetail);
router.post('/unprocessTicket',unprocessTicketValidation,FlightController.unprocessTicket);

router.get('/fareRules',GetFareRulesValidation,FlightController.GetFareRules);
///lks  
router.get('/report',FlightBookingReportValidataion,ReportController.GetFlightBookingReport);
router.get('/cancel-view',CancelFlightViewValidataion,FlightController.CancelFlightBookingView);
router.post('/cancelFlightBooking',CancelFlightValidataion,FlightController.cancelFlightBooking);
router.post('/FinalCancelFlightBooking',FinalCancelFlightBooking,FlightController.FinalCancelFlightBooking);
router.get('/bookingRefund',BookingRefundValidation,FlightController.bookingRefund);
router.get('/getRefundReceipt',BookingRefundReceiptValidation,FlightController.getRefundReceipt);




router.get('/country',CountrySearchValidation,FlightController.GetCountries);

router.post('/test', (req,res)=>{
  res.json(req.body);
});
module.exports = router;