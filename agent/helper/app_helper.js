const { get_application_module_details } = require("../models/moduleModel");
const CustomModel = require('../models/CustomDbModel');
const moment = require('moment');
function generateAppTransactionReference(modPrefix = '', addProjectPrefix = true) {
    if (!modPrefix) {
        modPrefix = 'REF';
    }
    let ref = '';
    return ref + modPrefix + '-' + generateUniqueReferenceId();
}

function generateUniqueReferenceId() {
    // const formattedDate = new Date().toISOString().replace(/[^0-9]/g, '').slice(2, -4);
    
    const formattedDate = moment().format('DDMMY');
    const randomNumbers = `${getRandomInt(10, 99)}${getRandomInt(10, 99)}`;
    return formattedDate + '-' + moment().format('Hmmss')+'-'+randomNumbers;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
async function  get_module_transaction_staus(course_id){
    let status = 0;
    await get_application_module_details
    // $CI = & get_instance();
}



//flight Markup
async function getFlightMarkups() {
    const entityCreationSource = '4648';
    let distMarkupType = 'plus';
    let distMarkupValue = 0;
    let adminMarkupType = 'plus';
    let adminMarkupValue = 0;

    if (entityCreationSource === 'dist') {
        const distId = global.CI.entity_reporting_to_id;
        const where1 = {
            created_by_id: distId,
            creation_source: 'dist',
            module: 'flight'
        };
       
        const distMarkup = await CustomModel.selectData('flight_markups',where1);

        if (distMarkup) {
            distMarkupType = distMarkup.type;
            distMarkupValue = distMarkup.value;
        }
    }

    // const where2 = {
    //     creation_source: 'admin',
    //     module: 'flight'
    // };
     const where2 = `creation_source= 'admin' AND module='flight'`

    const adminMarkup = await CustomModel.selectData('flight_markups',where2);
 
    if (adminMarkup.result) {
        adminMarkupType = adminMarkup.result[adminMarkup.result.length - 1].type;
        adminMarkupValue = adminMarkup.result[adminMarkup.result.length - 1].value;
    }

    let airlineMarkups = await CustomModel.selectData('airlines_commission');
    airlineMarkups=airlineMarkups.result;
    const response = {
        distMarkupType,
        distMarkupValue,
        adminMarkupType,
        adminMarkupValue,
        airlineMarkups
    };


    return response;
}
function getEnumList(enumber, default_value = -1)
{
    const enumeration_list= {
        BOOKING_CONFIRMED: 'confirmed',
        BOOKING_HOLD: 'hold',
        BOOKING_CANCELLED: 'cancelled',
        BOOKING_ERROR: 'error',
        BOOKING_PENDING: 'pending',
        BOOKING_FAILED: 'failed',
        BOOKING_ROLLEDBACK: 'rollback'
    };
    // if ($GLOBALS['CI']->load->is_loaded('enumeration') == false) {
    //     $GLOBALS['CI']->load->library('enumeration');
    // }
    // constv enumeration_list = getEnumerationList->getEnumerationList($enum);
  
    // if (intval($default_value) > - 1) {
    //     return (isset($enumeration_list[$default_value]) ? $enumeration_list[$default_value] : '');
    // } else {
          //debug_exit($enumeration_list);
        return enumeration_list;
    // }
}


function generateTransactionId() {
    return Math.floor(Math.random() * 9000) + 1000 + 'NP' + Date.now() + Math.floor(Math.random() * 9000) + 1000;
}
// Example usage
const transactionReference = generateAppTransactionReference();
//console.log(`Application Reference: ${transactionReference}`);

module.exports = { getEnumList,generateAppTransactionReference, getRandomInt, generateUniqueReferenceId, generateUniqueReferenceId,getFlightMarkups,generateTransactionId }
