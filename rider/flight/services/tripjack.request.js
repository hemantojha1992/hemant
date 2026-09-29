const FlightModel = require('../models/flight.model');
const dbPool= require('../../database/db1');
const moment = require('moment');


async function getTjFlighstSearchRequest(searchData)
{    
    if(searchData.return != undefined){
        searchData.trip_type = 'circle';
    }else{
        searchData.trip_type = 'oneway';
    }
    
    let flights;
    let SearchSchema;
    let getData      = searchData;
    let page_params  = {};
    let result       = {};
    let totalFlights = 0;
    let set_origin   = 'international';
    if ((getData.toAtype && getData.fromAtype) && (getData.toAtype === 'India' && getData.fromAtype === 'India')) {
        set_origin = 'domestic';
    }
    if(getData.return ==undefined)
    {
        getData.trip_type = 'oneway';
    }else{
        getData.trip_type = 'circle';
    }
    if(getData.isMulticity !=undefined && getData.isMulticity)
    {
       getData.trip_type = 'multicity'; 
    }

    if (getData.trip_type && getData.trip_type === 'oneway') {
        // Handle oneway trip if needed
    }
    
    let params = await arrangeSearchData(getData);

    params = `${JSON.stringify(params)}`;
    return params;
}

async function  arrangeSearchData(searchData) {
    let arr = {};
    let isDirectFlight       = true;
    let isConnectingFlight   = false;
    isConnectingFlight   = searchData.isConnecting || false;
    isDirectFlight       = (searchData.isDirect != undefined) ? true : false;

    let cabinClass       = searchData.cabinClass  ? searchData.cabinClass.toUpperCase() : 'ECONOMY';

    let routeInfos       = [];
    let preferredAirline = [];

    if (searchData.trip_type == 'oneway' || searchData.trip_type == 'circle') {
        let depature = {
            fromCityOrAirport: { code: searchData.from },
            toCityOrAirport: { code: searchData.to },
            travelDate: searchData.departure//moment(searchData.departure, 'DD-MM-YYYY').format('YYYY-MM-DD'),
        };
       
        routeInfos.push(depature);
        if (searchData.return) {
            let returnData = {
                fromCityOrAirport: { code: searchData.to },
                toCityOrAirport: { code: searchData.from },
                travelDate: searchData.return //moment(searchData.return, 'DD-MM-YYYY').format('YYYY-MM-DD'),
            };
            routeInfos.push(returnData);
        }
    } else if (searchData.trip_type === 'multicity') {
        let multyCityArr = {
            fromCityOrAirport: { code: searchData.from },
            toCityOrAirport: { code: searchData.to },
            travelDate: moment(searchData.departure, 'DD-MM-YYYY').format('YYYY-MM-DD'),
        };
        routeInfos.push(multyCityArr);

        let multyCityArrSec = {
            fromCityOrAirport: { code: searchData.from_multicity },
            toCityOrAirport: { code: searchData.to_multicity },
            travelDate: moment(searchData.departure_multicity, 'DD-MM-YYYY').format('YYYY-MM-DD'),
        };
        routeInfos.push(multyCityArrSec); 
    }
    arr = {
        searchQuery: {
            cabinClass: cabinClass,
            paxInfo: {
                ADULT: Number(searchData.adult),
                CHILD: Number(searchData.child),
                INFANT: Number(searchData.infant),
            },
            routeInfos: routeInfos,
            searchModifiers: {
                isDirectFlight: isDirectFlight,
                isConnectingFlight: isConnectingFlight,
                pft: searchData.fareType,
            },
        },
    };

    if (preferredAirline.length > 0) {
        arr.searchQuery.preferredAirline = preferredAirline;
    }
    return arr;
}


module.exports = {
    getTjFlighstSearchRequest
}