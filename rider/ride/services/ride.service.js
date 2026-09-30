const TravelportAdapter = require('./travelport.adapter');
const TripJackAdapter = require('./tripjack.adapter');
const mysql = require('mysql2/promise');
const { setCacheData } = require("../../../shared/redis/Redis");
const { generateAppTransactionReference } = require("../../helper/app_helper");

exports.GetFlightList = async (provider, searchData) => {
    const app_reference = generateAppTransactionReference('NFB');
    searchData.app_reference = app_reference;
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.GetFlightList(searchData);
        case 'TripJack':
            return await TripJackAdapter.GetFlightList(searchData);
        default:
            throw new Error('Unknown provider');
    }
};

exports.GetFlightList_Stream = async (provider, searchData, sendStream) => {
    
    const app_reference = generateAppTransactionReference('NFB');
    await setCacheData('app_reference', app_reference, 604800);

    switch (provider) {
        case 'Travelport':
            // Pass sendStream callback to adapter
            
            return await TravelportAdapter.GetFlightList_Stream(searchData, sendStream);
        case 'TripJack':
            return await TripJackAdapter.GetFlightList_Stream(searchData, sendStream);
        default:
            throw new Error('Unknown provider');
    }
};
exports.GetFlightListWithSSE = async (provider, searchData, onData) => {
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.GetFlightListWithSSE(searchData, onData);
        case 'TripJack':
            return await TripJackAdapter.GetFlightListWithSSE(searchData, onData);
        default:
            throw new Error('Unknown provider');
    }
};

 

exports.CreateReservation = async (provider, postData) => { 
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.CreateReservation(postData);
        case 'TripJack':
            return await TripJackAdapter.CreateReservation(postData);
        default:
            throw new Error('Unknown provider');
    }
};

exports.HoldToConfirm = async (provider, postData) => { 
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.HoldToConfirm(postData);
        default:
            throw new Error('Unknown provider');
    }
};
exports.GetHoldBookingDetail = async (provider, postData) => { 
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.GetHoldBookingDetail(postData);
        default:
            throw new Error('Unknown provider');
    }
};
exports.unprocessTicket = async (provider, postData) => { 
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.unprocessTicket(postData);
        default:
            throw new Error('Unknown provider');
    }
};

exports.airPrice = async (provider, searchData) => {   
    switch (provider) {  
        case 'Travelport':
            return await TravelportAdapter.airPrice(searchData);
        case 'TripJack':
            return await TripJackAdapter.airPrice(searchData);
        default:
            throw new Error('Unknown provider');
    }
};

exports.rePrice = async (provider, searchData) => {
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.rePrice(searchData);
        case 'TripJack':
            return await TripJackAdapter.rePrice(searchData);
        default:
            throw new Error('Unknown provider');
    }
};

exports.GetOptionalServices = async (provider, searchData) => {
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.GetOptionalServices(searchData);
        case 'TripJack':
            return await TripJackAdapter.GetOptionalServices(searchData);
        default:
            throw new Error('Unknown provider');
    }
};
exports.RetriveReservation = async (provider, result) => {
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.RetriveReservation(result);
        case 'TripJack':
            return await TripJackAdapter.RetriveReservation(result);
        default:
            throw new Error('Unknown provider');
    }
};
exports.GetFlightListStream = async (provider, searchData, push, done) => {
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.GetFlightListStream(searchData, push, done);
    }
}

/**
 * Process flight cancellation - Router function
 * Delegates to TravelportAdapter for business logic
 * @param {string} provider - Flight provider (Travelport/TripJack)
 * @param {Object} postData - Cancellation request data
 * @param {number} agentId - Agent ID performing cancellation
 * @returns {Object} Cancellation result with status, message, data
 */
exports.cancelFlightBooking = async (connection,provider, postData) => {
     
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.cancelFlightBooking(connection, postData);
        case 'TripJack':
            return await TripJackAdapter.cancelFlightBooking(connection, postData);
        default:
            throw new Error('Unknown provider');
    }
};
exports.FinalCancelFlightBooking = async (connection,provider, postData) => {
     
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.FinalCancelFlightBooking(connection, postData);
        case 'TripJack':
            return await TripJackAdapter.FinalCancelFlightBooking(connection, postData);
        default:
            throw new Error('Unknown provider');
    }
};

/**
 * Process flight cancellation - (DEPRECATED - Use cancelFlightBooking instead)
 * Kept for backward compatibility
 * @param {Object} postData - Cancellation request data
 * @param {number} agentId - Agent ID performing cancellation
 * @returns {Object} Cancellation result
 */
exports.processCancelFlightBooking = async (postData, agentId) => {
    // Delegate to Travelport adapter for backward compatibility
    return await TravelportAdapter.cancelFlightBooking(postData, agentId);
};


exports.DownloadFlightTicket = async (provider, postData,doc, trainData, passengerData) => { 
    switch (provider) {
        case 'Travelport':
            return await TravelportAdapter.DownloadFlightTicket(postData,doc, trainData, passengerData);
        case 'TripJack':
            return await TripJackAdapter.DownloadFlightTicket(postData,doc, trainData, passengerData);
        default:
            throw new Error('Unknown provider');
    }
};