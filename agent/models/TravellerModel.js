let dbPool = require('../database/db');
const moment = require('moment');
const { setCacheData } = require('../../shared/redis/Redis');
const md5 = require('md5');
class TravellerModel {
    static async get_traveller_details_with_mobile(mno,user_id) {
        let qry = `SELECT  BD.phone, BD.email, TBCD.name, TBCD.age, TBCD.gender,
        TBCD.type, SL.state_id, SL.state_name as gst_state_name, CL.city_name, GD.provisional_gst_number as gst_no, GD.contact_person_mobile as gst_phone,
        GD.contact_person as gst_customer_name, GD.correspondence_email as gst_email, GD.gst_contact_address as gst_address, GD.state_name as state_id,
        GD.city_fk, GD.pincode as gst_pincode FROM train_booking_details BD LEFT JOIN train_booking_customer_details TBCD ON TBCD.app_reference = BD.app_reference
        LEFT JOIN gst_details GD on BD.gst_details_fk=GD.origin 
        LEFT JOIN state_list AS SL on SL.state_id=GD.state_name 
        LEFT JOIN city_list AS CL on CL.city_list_id=GD.city_fk
        WHERE BD.phone =${mno} AND BD.created_by_id =${user_id}  group by TBCD.name ORDER BY BD.origin`;
        const [result] = await dbPool.query(qry);
        return result;
    }
}
module.exports = TravellerModel;