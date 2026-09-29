const mysql = require('mysql2');
const dbPool = require('../agent/database/db');

class TrainLibrary {
    static async getBookingData(conditions,$offset=0,$limit=12345) {
        let sql = "select U.user_id, U.uuid, U.agency_name, U.first_name,U.last_name,U.phone,U.email,U.address,U.user_type, TCD.name as pax_name,TCD.status as passanger_status,ID.j_class,"
        sql+= "(select count(*) from train_booking_customer_details CD WHERE CD.app_reference=BD.app_reference and type = 'adult' and age > 11) as adult_passenger_count,"
        sql+= "(select count(*) from train_booking_customer_details CD WHERE CD.app_reference=BD.app_reference and type = 'adult' and age < 12) as child_passenger_count,"
        sql+= "(select count(*) from train_booking_customer_details CD WHERE CD.app_reference=BD.app_reference and type = 'infant') as infant_passenger_count,"
        sql+= "BD.origin AS b_origin, BD.pnr_number AS pnr, BD.transaction_id, BD.reservation_id, BD.status, BD.app_reference, BD.phone, BD.email, ROUND(BD.amount + BD.admin_charge+BD.dist_charge, 2) AS amount,"
        sql+= "BD.created_datetime, ID.journey_date, ID.dep_station_code,ROUND(BD.admin_charge+BD.dist_charge, 2) AS admin_charge,BD.dist_charge,BD.agent_pg_charge, BD.payment_status, ID.arr_station_code,ID.origin AS i_origin"
        sql+= ", ID.boarding_station_code, ID.boarding_station_name, URM.origin as user_rollback_origin,BD.convinence_amount,BD.discount,BD.amount as admin_invoice_amount,"
        sql+= "BD.api_total_display_train_fare,BD.api_total_tax,BD.api_total_fare,BD.total_collectible_amount,BD.base_fare,BD.reservation_charge,BD.superfast_charge,BD.fuel_amount,BD.total_concession,"
        sql+= "BD.tatkal_fare,BD.service_tax,BD.other_charge,BD.catering_charge,BD.dynamic_fare,BD.travel_agent_service_charge,BD.wp_service_charge,BD.wp_service_tax,BD.total_fare,BD.insurance_charge,BD.insurance_tax"
        sql+= ",U.state_origin from train_booking_details BD JOIN train_booking_itinerary_details ID ON BD.app_reference=ID.app_reference LEFT JOIN"
        sql+= " user U ON BD.created_by_id=U.user_id JOIN b2b_user_details AS B2B ON B2B.user_oid = U.user_id JOIN train_booking_customer_details AS TCD ON TCD.app_reference=BD.app_reference and TCD.type = 'adult'"
        sql+= " LEFT JOIN user_rollback_mapping as URM ON BD.app_reference = URM.app_reference"

        
        if (Array.isArray(conditions) && conditions.length > 0) {
            const whereClause = conditions.map(cond => {
                const key = Object.keys(cond)[0];
                let value = cond[key];
               
                if (key === 'BD.created_datetime' && Array.isArray(value) && value.length === 2) {
                    // Assuming value is an array with [startDateTime, endDateTime]
                    const startDate = mysql.escape(value[0]);
                    const endDate = mysql.escape(value[1]);
                    value = `${key} >= ${startDate} AND ${key} <= ${endDate}`;
                } else if (key === 'BD.status' ) {
                    if( value =='ALL')
                    {
                        value = "('BOOKING_INPROGRESS')";
                        value = `${key} != ${value}`;
                    }
                    else
                    {
                        value = typeof value === 'string' ? mysql.escape(value) : value;
                        value = `${key} = ${value}`;
                    }
                    
                } else {
                    value = typeof value === 'string' ? mysql.escape(value) : value;
                    value = `${key} = ${value}`;
                }

                return value;
            }).join(' AND ');

            sql += ` WHERE ${whereClause}`;
        }
        // sql+='group by  BD.app_reference order by BD.origin desc limit'+ $offset+' ,  '+ $limit;
        sql += ' GROUP BY BD.app_reference ORDER BY BD.origin DESC';
        const result = await dbPool.query(sql);
        // console.log(result); // Output the received data to inspect the structure and content

        return result;
    }

    static async getGender(gender) {
       console.log(gender); 
       
    }
}
module.exports = TrainLibrary; 