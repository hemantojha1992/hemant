let dbPool = require('../database/db');
const mysql = require('mysql2');
const moment = require('moment')
const { getCacheData } = require('../../shared/redis/Redis');
class TrainModel {
    static async getBookingStautsSummarybydateinterval(fromData, toDate, User) {
        let filter = '';
        if (typeof fromData != 'undefined' || fromData != null) {
            filter += ' and BD.created_datetime >= "' + fromData + '" ';
        }
        if (typeof toDate != 'undefined' || toDate != null) {
            filter += ' and BD.created_datetime <= "' + toDate + '" ';
        }
        const sql = 'select count(distinct(BD.app_reference)) as count, DATE(BD.created_datetime) as date, BD.status from train_booking_details BD where BD.created_by_id = ' + User + ' and BD.status IN ("BOOKING_CONFIRMED","BOOKING_ROLLEDBACK","BOOKING_CANCELLED") ' + filter + ' group by BD.status';

        const result = await dbPool.query(sql);

        return result[0];

    }
    static async getAllStationList(){
        try {
            const query = 'Select name,code from train_stations where 1';

            const result = await dbPool.query(query);
            return result[0];
        } catch (error) {
            throw error;
        }
    }
    static async stationCode(sationName) {
        try {
            let raw_search_chars = dbPool.escape(sationName);
            let r_search_chars = dbPool.escape(sationName + '%');

            let search_chars = dbPool.escape('%' + sationName + '%');

            const query = 'Select origin,name,code from train_stations where name like ' + search_chars + ' OR code like ' + search_chars + 'OR city like ' + search_chars + ' ORDER BY top_destination DESC , CASE WHEN	name LIKE' + raw_search_chars + 'THEN 1 WHEN	code LIKE' + raw_search_chars + 'THEN 2 WHEN	city LIKE' + raw_search_chars + 'THEN 3 WHEN	name LIKE' + r_search_chars + 'THEN 11 WHEN code LIKE' + r_search_chars + 'THEN 12 WHEN	city LIKE' + raw_search_chars + 'THEN 13 WHEN name LIKE' + search_chars + 'THEN 21 WHEN	code			LIKE	' + search_chars + 'THEN 22 WHEN city LIKE' + raw_search_chars + ' THEN 23 ELSE 31 END LIMIT 0, 20';

            const result = await dbPool.query(query);

            return result[0];
        } catch (error) {
            throw error;
        }


    }
    static async getBookingData(conditions, $offset = 0, $limit = 12345) {
        let sql = "select U.user_id, U.uuid, U.agency_name, U.first_name,U.last_name,U.phone,U.email,U.address,U.user_type, TCD.name as pax_name,TCD.status as passanger_status,ID.j_class,"
        sql += "(select count(*) from train_booking_customer_details CD WHERE CD.app_reference=BD.app_reference and type = 'adult' and age > 11) as adult_passenger_count,"
        sql += "(select count(*) from train_booking_customer_details CD WHERE CD.app_reference=BD.app_reference and type = 'adult' and age < 12) as child_passenger_count,"
        sql += "(select count(*) from train_booking_customer_details CD WHERE CD.app_reference=BD.app_reference and type = 'infant') as infant_passenger_count,"
        sql += "BD.origin AS b_origin, BD.pnr_number AS pnr, BD.transaction_id, BD.reservation_id, BD.status, BD.app_reference, BD.phone, BD.email, ROUND(BD.amount + BD.admin_charge+BD.dist_charge, 2) AS amount,"
        sql += "BD.created_datetime, ID.journey_date, ID.dep_station_code,ROUND(BD.admin_charge+BD.dist_charge, 2) AS admin_charge,BD.dist_charge,BD.agent_pg_charge, BD.payment_status, ID.arr_station_code,ID.origin AS i_origin"
        sql += ", ID.boarding_station_code, ID.boarding_station_name, URM.origin as user_rollback_origin,BD.convinence_amount,BD.discount,BD.amount as admin_invoice_amount,"
        sql += "BD.api_total_display_train_fare,BD.api_total_tax,BD.api_total_fare,BD.total_collectible_amount,BD.base_fare,BD.reservation_charge,BD.superfast_charge,BD.fuel_amount,BD.total_concession,"
        sql += "BD.tatkal_fare,BD.service_tax,BD.other_charge,BD.catering_charge,BD.dynamic_fare,BD.travel_agent_service_charge,BD.wp_service_charge,BD.wp_service_tax,BD.total_fare,BD.insurance_charge,BD.insurance_tax"
        sql += ",U.state_origin from train_booking_details BD JOIN train_booking_itinerary_details ID ON BD.app_reference=ID.app_reference LEFT JOIN"
        sql += " user U ON BD.created_by_id=U.user_id JOIN b2b_user_details AS B2B ON B2B.user_oid = U.user_id JOIN train_booking_customer_details AS TCD ON TCD.app_reference=BD.app_reference and TCD.type = 'adult'"
        sql += " LEFT JOIN user_rollback_mapping as URM ON BD.app_reference = URM.app_reference"


        if (Array.isArray(conditions) && conditions.length > 0) {
            const whereClause = conditions.map(cond => {
                const key = Object.keys(cond)[0];
                let value = cond[key];
                console.log(value);
                if (key === 'BD.created_datetime' && Array.isArray(value) && value.length === 2) {
                    // Assuming value is an array with [startDateTime, endDateTime]
                    const startDate = mysql.escape(value[0]);
                    const endDate = mysql.escape(value[1]);
                    // value = key+" >= "+startDate+" AND "+key+ "<= "+endDate;
                    // value = 'BD.created_datetime >= "2023-10-26 00:00:00" AND BD.created_datetime<= "2023-12-12 23:59:59"';
                    // value = `${key} BETWEEN ${startDate} AND ${endDate}`;
                } else if (key === 'BD.status') {
                    if (value == 'ALL') {
                        value = '"BOOKING_INPROGRESS"';
                        value = `${key} != ${value}`;
                    }
                    else {
                        value = typeof value === 'string' ? mysql.escape(value) : value;
                        value = `${key} = ${value}`;
                    }

                } else {
                    value = typeof value === 'string' ? mysql.escape(value) : value;
                    value = `${key} = ${value}`;
                }

                return value;
            }).join(' AND ');

            // sql += " where " + whereClause + " ORDER BY BD.origin DESC limit 0,500";
            // console.log(sql)
            sql += ' where BD.created_datetime >= "2022-07-14 00:00:00" AND BD.created_datetime <= "2023-12-12 23:59:59" AND BD.created_by_id = 4648 AND BD.status != "BOOKING_INPROGRESS"  order by BD.origin desc limit 0, 500';

        }
        // console.log(sql);
        const [result] = await dbPool.query(sql);
        return result
    }
    static async getBookingSingleData(app_reference) {
        try {
            const query = "SELECT IUD.irctc_username, U.user_type, U.user_id, U.first_name, U.agency_name, U.last_name, U.phone AS agency_phone, U.email AS agency_email, U.address, " +
                "SL.state_name AS agency_state_name, CL.city_name AS agency_city_name, U.pin_code AS agency_pin_code, ID.*, CD.*, BD.*, " +
                "GD.provisional_gst_number AS gst_no, GD.contact_person AS gst_name, GD.pincode AS gst_pin, GD.flat_no AS gst_flat, GD.state_name AS gst_state, " +
                "GD.city_name AS gst_city, GD.street AS gst_street, GD.gst_contact_address AS gst_area, b2b.user_oid, b2b.reporting_to_id " +
                "FROM train_booking_details BD " +
                "JOIN train_booking_itinerary_details ID ON BD.app_reference = ID.app_reference " +
                "LEFT JOIN train_booking_cancellation_details AS CD ON BD.app_reference = CD.app_reference " +
                "LEFT JOIN user U ON U.user_id = BD.created_by_id " +
                "LEFT JOIN state_list AS SL ON SL.state_id = U.state_origin " +
                "LEFT JOIN city_list AS CL ON CL.city_list_id = U.city_origin " +
                "LEFT JOIN gst_details AS GD ON BD.gst_details_fk = GD.origin " +
                "LEFT JOIN b2b_user_details AS b2b ON U.user_id = b2b.user_oid " +
                "LEFT JOIN irctc_user_details AS IUD ON U.user_id = IUD.user_id " +
                "WHERE BD.app_reference = '" + app_reference + "' AND BD.created_by_id = 4648";
            // console.log(query);
            const [trainRows] = await dbPool.query(query);
            if (trainRows.length === 0) {
                return false;
            }
            // console.log(trainRows);

            const passengerQuery = `SELECT * FROM train_booking_customer_details CD WHERE CD.app_reference =  '${app_reference}'`;
            const [passengerRows] = await dbPool.query(passengerQuery);
            if (passengerRows.length > 0) {
                // Modify passenger data if it exists
                passengerRows.forEach(row => {
                    if (row['id_proof'] === 'NULL_IDCARD') {
                        row['selected_id_proof'] = '---';
                    } else {
                        row['selected_id_proof'] = row['id_proof'];
                    }
                });
                return { trainData: trainRows[0], passengerData: passengerRows };
            } else {
                return { trainData: trainRows[0], passengerData: false };
            }
        } catch (error) {
            console.error('Error:', error);
            return false;
        }
        // console.log(result)
    }
    static async GetAgentTrainRefundReport(con, offset = 0, limit = 500) {
        try {

            const {
                app_reference,
                pnr_number,
                lead_pax,
                refund_type,
                created_datetime_from,
                created_datetime_to,
                created_by_id
            } = con;
            const conditions = [];
            if (created_datetime_from && created_datetime_to) {
                const fromDate = moment(created_datetime_from, 'DD-MM-YYYY').format('YYYY-MM-DD');
                const toDate = moment(created_datetime_to, 'DD-MM-YYYY').format('YYYY-MM-DD');

                conditions.push(`TBCD.created_datetime >= '${fromDate} 00:00:00'`);
                conditions.push(`TBCD.created_datetime <= '${toDate} 23:59:59'`);
            }

            if (app_reference) {
                conditions.push(`TBCD.app_reference LIKE '%${app_reference}%'`);
            }
            if (refund_type) {
                conditions.push(`TBCD.app_reference = '${refund_type}'`);
            }

            if (pnr_number) {
                conditions.push(`TBD.pnr_number LIKE '%${pnr_number}%'`);
            }

            if (lead_pax) {
                conditions.push(`TCD.name LIKE '%${lead_pax}%'`);
            }

            conditions.push(`TBD.created_by_id = ${created_by_id}`);

            const whereCondition = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const refundQuery = `
            SELECT TBCD.app_reference, TBCD.cancellation_id, TBCD.message AS remarks,
                SUM(subquery.new_amount_refund) AS amount_refund, SUM(new_amount_deducted) AS amount_deducted, TBCD.created_datetime,
                subquery.TTT AS app_refund_status, TBCD.status AS irctc_refund_status,
                TBD.pnr_number, U.user_id, U.user_type, U.uuid, U.first_name, TBCD.refund_type AS train_refund_type,
                AU.user_id AS agent_user_id, AU.user_type AS agent_user_type, AU.uuid AS agent_uuid, AU.first_name AS agent_first_name, TCD.name AS pax_name
            FROM train_booking_cancellation_details AS TBCD
            INNER JOIN (
            SELECT TBCD.app_reference, MAX(TBCD.created_datetime) AS max_date, TBCD.refund_to_user AS TTT, TBCD.amount_refund AS new_amount_refund, TBCD.amount_deducted AS new_amount_deducted
            FROM train_booking_cancellation_details AS TBCD
            JOIN train_booking_details AS TBD ON TBCD.app_reference = TBD.app_reference
            ${whereCondition} AND TBCD.created_datetime = (
                SELECT MAX(created_datetime) FROM train_booking_cancellation_details WHERE app_reference = TBD.app_reference
            )
            GROUP BY TBCD.app_reference, TBCD.cancellation_id ORDER BY TBCD.refund_to_user ASC
            ) AS subquery ON TBCD.app_reference = subquery.app_reference AND TBCD.created_datetime = subquery.max_date
            INNER JOIN train_booking_details AS TBD ON TBCD.app_reference = TBD.app_reference
            INNER JOIN user AS U ON U.user_id = TBCD.created_by_id
            INNER JOIN user AS AU ON AU.user_id = TBD.created_by_id
            INNER JOIN train_booking_customer_details AS TCD ON TCD.app_reference = TBD.app_reference AND TCD.type = 'adult' AND TCD.sno = 1
            ${whereCondition}
            GROUP BY TBCD.app_reference
            ORDER BY TBCD.origin DESC
            LIMIT ${offset}, ${limit};
        `;
            const [refundReport] = await dbPool.query(refundQuery);
            return { status: 1, data: refundReport };
        }
        catch (error) {
            return { status: 0, errors: error };
        }
    }
    static async getSafeSearchData(searchId) {
        // return searchId;
        let success = 1;
        let cleanSearch = '';
        let data = {};
        try {
            const searchData = await this.getSearchData(searchId);
            if (searchData.length > 0 && searchData) {
                const temp_search_data = (searchData);
                cleanSearch = await this.cleanSearchData(temp_search_data);
                data = cleanSearch;

            } else {
                success = 0;
            }

            return {
                status: success,
                data: data,
            };

        } catch (error) {
            throw error;
        }


    }

    static async getSearchData(search_data) {
        // if (master_search_data)  {
        let searchData = await getCacheData(search_data);

        if (searchData.length > 0) {
            return searchData;
        } else {
            return false;
        }
        //}

    }

    static async activeBookingSource() {
        try {
            const query = `select BS.source_id, BS.origin from meta_course_list AS MCL, booking_source AS BS, activity_source_map AS ASM WHERE  MCL.origin=ASM.meta_course_list_fk and ASM.booking_source_fk=BS.origin and MCL.course_id= '${META_TRAIN_COURSE}' and BS.booking_engine_status=${ACTIVE} AND MCL.status=${ACTIVE} AND ASM.status='active'`;
            const [result] = await dbPool.query(query);
            return result[0];
        } catch (error) {
            throw error;
        }
    }

    static async cleanSearchData(temp_Search_Data) {
        const tempSearchData = JSON.parse(temp_Search_Data);

        let success = true;
        let cleanSearch = {};

        const depatureTimestamp = moment(tempSearchData.depature, "D-M-YYYY").valueOf();
        const currentTimestamp = Date.now();
        const currentDate = new Date().toISOString().split('T')[0]; // Get current date in 'YYYY-MM-DD' format
        // Your code here moment(dateString, format)
        if (depatureTimestamp > currentTimestamp || new Date(depatureTimestamp).toISOString().split('T')[0] === currentDate) {
            cleanSearch.fromTs = new Date(tempSearchData.depature).getTime();
            cleanSearch.fromDate = new Date(cleanSearch.fromTs).toISOString();
            cleanSearch.depature = new Date(cleanSearch.fromTs).toLocaleDateString('en-GB');
        } else {
            success = false;
        }
        //console.log(depatureTimestamp);

        if (tempSearchData.from_loc_id !== undefined) {
            cleanSearch.fromLocId = tempSearchData.from_loc_id;
        } else {
            success = false;
        }



        if (tempSearchData.to_loc_id !== undefined) {
            cleanSearch.toLocId = tempSearchData.to_loc_id;
        } else {
            success = false;
        }


        if (success) {
            const ids = [parseInt(tempSearchData.from_loc_id), parseInt(tempSearchData.to_loc_id)];
            const stations = await this.stationDetails(ids);

            if (stations[tempSearchData.from_loc_id] !== undefined) {
                cleanSearch.from = tempSearchData.from !== undefined ? tempSearchData.from : stations[tempSearchData.from_loc_id].code;
                cleanSearch.fromStationCode = stations[tempSearchData.from_loc_id].code;
                cleanSearch.fromStationName = stations[tempSearchData.from_loc_id].name;
            } else {
                success = false;
            }
            if (stations[tempSearchData.to_loc_id] !== undefined) {
                cleanSearch.to = tempSearchData.to !== undefined ? tempSearchData.to : stations[tempSearchData.to_loc_id].code;
                cleanSearch.toStationCode = stations[tempSearchData.to_loc_id].code;
                cleanSearch.toStationName = stations[tempSearchData.to_loc_id].name;
            } else {
                success = false;
            }

        }

        cleanSearch.vClass = tempSearchData.v_class !== undefined ? tempSearchData.v_class : '';

        if (tempSearchData.train_number !== undefined) {
            cleanSearch.tNumber = tempSearchData.train_number;
        }

        if (tempSearchData.j_quota !== undefined) {
            cleanSearch.jQuota = tempSearchData.j_quota;
        }
        if (tempSearchData.onward_booking_app_reference !== undefined && tempSearchData.onward_booking_app_reference.trim() !== '') {
            cleanSearch.onwardBookingAppReference = tempSearchData.onward_booking_app_reference;
        }

        return {
            data: cleanSearch,
            // status: success
        };
    }

    static async stationDetails(id) {
        let cond = '';

        if (typeof id === 'object' && id !== null && !Array.isArray(id)) {
            if (Array.isArray(id.originList)) {
                cond += `origin IN (${id.originList.map(Number).join(',')})`;
            }
        } else {
            // If `id` is not an object, or it's an object without `originList`, treat it as a single value.
            const singleValue = Array.isArray(id) ? id : [id];
            cond += `origin IN (${singleValue.map(Number).join(',')})`;
        }

        try {

            const query = `SELECT * from train_stations WHERE ` + cond;

            const result = await dbPool.query(query);

            let resp = false;

            if (Array.isArray(result[0])) {
                resp = {};
                result[0].forEach(item => {
                    resp[item.origin] = item;
                });
            }

            return resp;
        } catch (error) {
            throw error;
        }
    }
}

// function strtotime(dateString) {
//     // Parse the date string and return the timestamp
//     return Date.parse(dateString);
// }



module.exports = TrainModel;