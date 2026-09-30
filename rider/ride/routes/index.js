const express = require('express');
const router = express.Router();
const RideController = require('../contoller/ride.controller');
const ReportController = require('../contoller/report.controller');
// const validate = require('../../middleware/validate');
const { AirPortSearchValidation, GetFareRulesValidation, FlightSearchValidation , AirPriceValidation,
  createReservationValidation, CountrySearchValidation, FlightBookingReportValidataion,
  CancelFlightViewValidataion,CancelFlightValidataion,RepriceValidation ,OptionalServicesValidation,
  HoldToConfirmValidation,DownloadFlightTicketValidation,holdBookingDetailValidation,unprocessTicketValidation,
  FinalCancelFlightBooking,BookingRefundValidation,BookingRefundReceiptValidation } = require('../services/flight.request.validation');
const { searchSchema, bookSchema } = require('../services/ride.validation');


router.get('/airports',AirPortSearchValidation,RideController.GetAirports);
router.post('/search',FlightSearchValidation,RideController.GetFlightList);
router.post('/detail',AirPriceValidation,RideController.GetDetail);
router.post('/rePrice',RepriceValidation,RideController.rePrice);
router.post('/optional-services',OptionalServicesValidation,RideController.GetOptionalServices);
router.post('/createReservation',createReservationValidation,RideController.CreateReservation);
router.post('/holdToConfirm',HoldToConfirmValidation,RideController.HoldToConfirm);
router.post('/download-ticket',DownloadFlightTicketValidation,ReportController.DownloadFlightTicket);

router.post('/getHoldBookingDetail',holdBookingDetailValidation,RideController.GetHoldBookingDetail);
router.post('/unprocessTicket',unprocessTicketValidation,RideController.unprocessTicket);

router.get('/fareRules',GetFareRulesValidation,RideController.GetFareRules);
///lks  
router.get('/report',FlightBookingReportValidataion,ReportController.GetFlightBookingReport);
router.get('/cancel-view',CancelFlightViewValidataion,RideController.CancelFlightBookingView);
router.post('/cancelFlightBooking',CancelFlightValidataion,RideController.cancelFlightBooking);
router.post('/FinalCancelFlightBooking',FinalCancelFlightBooking,RideController.FinalCancelFlightBooking);
router.get('/bookingRefund',BookingRefundValidation,RideController.bookingRefund);
router.get('/getRefundReceipt',BookingRefundReceiptValidation,RideController.getRefundReceipt);




router.get('/country',CountrySearchValidation,RideController.GetCountries);

router.post('/test', (req,res)=>{
  res.json(req.body);
});
module.exports = router;