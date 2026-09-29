const express = require('express');
const FlightController = require('../controllers/Flight/FlightController');

const router = express.Router();
// const FlightController = require('./FlightController');
const TravelportController = require('../controllers/Flight/TravelportController');
//router for travelport

const {flightSearchrule} = require('../../utilities/formValidationRule')

router.get('/search',flightSearchrule,TravelportController.GetFlightList);
//ended here
  
// >>>>>>>> 7570253a28bc288677d68ee103e99c56fc892020:agent/controllers/Flight/FlightRoutes.js
const FlightControllerInstance = new FlightController();
router.get('/get_airport_code_list',FlightControllerInstance.getAirPortCodeList);
router.post('/search',FlightControllerInstance.getFlightList);
router.post('/cancelFlightBookingView',FlightControllerInstance.cancelFlightBookingView);
router.post('/cancelFlightBooking',FlightControllerInstance.cancelFlightBooking);
// Flight Bookings
router.post('/preBookingpage',FlightControllerInstance.preBooking);
router.post('/preBookingSection',FlightControllerInstance.preBookingSection);
router.post('/reviewPassengerDetails',FlightControllerInstance.reviewPassengerDetails);
router.get('/getFlightTicket',FlightControllerInstance.getFlightTicket);

router.post('/flightFareRule',FlightControllerInstance.flightFareRule);


  // 1.block fare  
router.post('/blockFlightFare',FlightControllerInstance.blockFlightFare);
     //i process ticket
router.post('/processTicket',FlightControllerInstance.processTicket);
router.post('/submitHoldTicket',FlightControllerInstance.submitHoldTicket);
   // i.process  end
        //ii unprocess ticket
router.post('/unprocessTicket',FlightControllerInstance.unprocessHoldTicket);

   // ii.unprocess  end
  // 1.block fare  end
router.post('/confirmFlightBooking',FlightControllerInstance.confirmFlightBooking);
router.post('/getStateCity',FlightControllerInstance.getStateCity);
// End Flight Bookings




module.exports = router;