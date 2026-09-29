const CONSTANT = require("../../shared/constant");
const moment = require('moment');
const CustomModel = require('../../distributor/models/CustomDbModel');

async function logout(ipData,username, userOrigin, QueryString,authID, details = '',) {
    const eventOrigin = 'EID006';
    if (!details) {
        details = `${username} Logout Of System`;
    }
   let actionQueryString={"user_id":userOrigin,"uuid":QueryString};
   let logTime=await logTimeLine(ipData,eventOrigin, details, actionQueryString,authID,[], userOrigin);
   return logTime;
}

async function logTimeLine(ipData,eventOrigin, eventDetails, actionQueryString = [],authID, attr = {}, userId = 0) {
    const details = ''; // Details can be fetched asynchronously if needed
    const domainOrigin = authID;
    const internalIp = ipData.ip || '127.0.0.1';
    const externalIp = ''; // Fetch external IP asynchronously
    const createdBy = userId;
    //? parseInt(userId) : parseInt(global.CI.entity_user_id)
    const createdDatetime = new Date().toISOString();
    
    const actionQueryStringJSON = actionQueryString ? JSON.stringify({ q_params: [actionQueryString, { q_search_type: 'wildcard' }] }) : undefined;
    const attributes = {
        isp: ipData.isp,
        user_agent: ipData.ip || ''
    };
    if (attr) {
        Object.assign(attributes, attr);
    }

    const data = {
        domain_origin: domainOrigin,
        event_origin: eventOrigin,
        event_description: eventDetails,
        location: '',
        internal_ip: internalIp,
        external_ip: externalIp,
        city: '',
        country: '',
        country_code: '',
        lat: '',
        lon: '',
        created_by_id: createdBy,
        created_datetime: moment(createdDatetime).format('YYYY-MM-DD HH:MM:SS'),
        action_query_string: actionQueryStringJSON,
        attributes: JSON.stringify(attributes)
    };

    try {
       let insertTimeLine = await CustomModel.createItem('timeline', data);
    
       return insertTimeLine;
        // await insertRecord('timeline', data);
    } catch (error) {
        // console.error('Error inserting record:', error);
        return {status:0,error:error};
    }
}


// Sample usage
logTimeLine('EID006', 'Event details', ['query1', 'query2'], { isp: 'Sample ISP' }, 123); // Example with custom user ID





module.exports = {logout}



