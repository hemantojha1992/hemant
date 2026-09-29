const dbPool = require('../../database/db1'); // tumne already import kiya hua hai
const moment = require('moment');
const AppHelper = require('../../helper/app_helper');
class ReportModel {

    static async InsertRecord(conn, table_name, data) {
        const QUERY_SUCCESS = 1;
        try {
            if (
                !table_name ||
                typeof table_name !== 'string' ||
                !data ||
                Object.keys(data).length === 0
            ) {
                throw new Error('Invalid table name or data');
            }
            const query = `INSERT INTO ${table_name} SET ?`;
            const [result] = await conn.query(query, data);
            const num_inserts = result.affectedRows;
            if (parseInt(num_inserts) > 0) {
                return {
                    status: QUERY_SUCCESS,
                    insert_id: result.insertId
                };
            }
            // CI me else commented hai — same behavior
            return {};
        } catch (error) {
            console.error('InsertRecord Error:', error);
            throw error;
        }
    }
    static async UpdateRecord(conn, table_name = '', data = {}, condition = {}) {
        const QUERY_SUCCESS = 1;
        const QUERY_FAILURE = 0;
        try {
            if (!table_name || typeof table_name !== 'string' || !data || Object.keys(data).length === 0 || !condition || Object.keys(condition).length === 0) {
                throw new Error('Invalid data or condition');
            }
            const setFields = [];
            const values = [];

            for (const [key, value] of Object.entries(data)) {
                setFields.push(`${key} = ?`);
                values.push(value);
            }
            const whereFields = [];
            for (const [key, value] of Object.entries(condition)) {
                whereFields.push(`${key} = ?`);
                values.push(value);
            }
            const query = ` UPDATE ${table_name} SET ${setFields.join(', ')} WHERE ${whereFields.join(' AND ')}`;
            const [result] = await conn.query(query, values);
            if (result.affectedRows > 0) {
                return QUERY_SUCCESS;
            } else {
                return QUERY_FAILURE;
            }
        } catch (error) {
            console.error('UpdateRecord Error:', error);
            throw error;
        }
    }
    static async GetSingleRecords(table, columns = '*', where = {}) {
        try {
            const cols = Array.isArray(columns) ? columns.join(', ') : columns;
            let query = `SELECT ${cols} FROM ${table}`;
            let values = [];
            if (Object.keys(where).length > 0) {
                const conditions = Object.keys(where).map(key => {
                    values.push(where[key]);
                    return `${key} = ?`;
                });
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
            const [rows] = await dbPool.execute(query, values);
            const row = rows?.[0] || null;
            return {
                status: true,
                data: row
            };
        } catch (error) {
            console.error('DB Error:', error);
            return {
                status: false,
                data: [],
                message: error.message
            };
        }
    }
    

    static async getNewBookingDate(connection, app_reference_id) {
        try {

            let ssrFare = 0;

            // 1. BOOKING DETAILS
            const [bookRows] = await connection.query(
                `SELECT FD.*,U.agency_name,U.phone AS agency_phone,U.email AS agency_email,U.address AS agency_address FROM flight_booking_details FD
                LEFT JOIN user U ON U.user_id = FD.created_by_id
                WHERE app_reference = ?`,
                [app_reference_id]
            );

            const getBookDetails = bookRows[0];

            if (!getBookDetails) {
                return null;
            }

            let pax_details = [];
            let cd_details = [];

            if (getBookDetails.status === "newtp") {

                // 2. PASSENGER DETAILS
                const [paxRows] = await connection.query(`
                    SELECT 
                        fbbd.baggage_description,
                        fbmd.meal_description,
                        fbsd.seat,
                        fbpd.origin AS pas_id,
                        fbpd.*,
                        fbd.booking_status as main_status,
                        fbd.created_datetime,
                        fbd.phone,
                        fbd.email
                    FROM flight_booking_passenger_details fbpd
                    LEFT JOIN flight_booking_details fbd 
                        ON fbd.app_reference = fbpd.app_reference
                    LEFT JOIN (
                        SELECT p_origin, seat
                        FROM flight_booking_seat_details 
                        WHERE is_selected = 1 
                    ) fbsd ON fbsd.p_origin = fbpd.origin
                    LEFT JOIN (
                        SELECT p_origin, GROUP_CONCAT(description) AS meal_description 
                        FROM flight_booking_meals_details 
                        WHERE is_selected = 1 
                        GROUP BY p_origin
                    ) fbmd ON fbmd.p_origin = fbpd.origin
                    LEFT JOIN (
                        SELECT p_origin, GROUP_CONCAT(description) AS baggage_description 
                        FROM flight_booking_baggage_details 
                        WHERE is_selected = 1 
                        GROUP BY p_origin
                    ) fbbd ON fbbd.p_origin = fbpd.origin
                    WHERE fbpd.app_reference = ?
                `, [app_reference_id]);

                pax_details = paxRows;

                // 3. ITINERARY DETAILS
                const [cdRows] = await connection.query(`
                    SELECT DISTINCT 
                        FBI.origin as FBI_id,
                        FBI.*,
                        TD.agent_markup as AgentMarkup,
                        fbd.agent_markup as originalAgentMarkup,
                        fbd.booking_status as flight_booking_status,
                        FAL_FROM.airport_city as from_airport_city,
                        FAL_TO.airport_city as to_airport_city
                    FROM flight_booking_itinerary_details FBI
                    LEFT JOIN flight_booking_details fbd 
                        ON fbd.app_reference = FBI.app_reference
                    LEFT JOIN flight_booking_transaction_details TD 
                        ON FBI.app_reference = TD.app_reference
                    LEFT JOIN flight_airport_list FAL_FROM 
                        ON FAL_FROM.airport_code = FBI.from_airport_code
                    LEFT JOIN flight_airport_list FAL_TO 
                        ON FAL_TO.airport_code = FBI.to_airport_code
                    WHERE FBI.app_reference = ?
                    ORDER BY FBI.origin ASC
                `, [app_reference_id]);

                cd_details = cdRows;

                // 4. SSR FARE
                const [fareRows] = await connection.query(`
                    SELECT 
                        COALESCE(SUM(CASE WHEN seat.is_selected = 1 THEN seat.fare ELSE 0 END), 0) AS total_seat_fare,
                        COALESCE(SUM(CASE WHEN meal.is_selected = 1 THEN meal.fare ELSE 0 END), 0) AS total_meal_fare,
                        COALESCE(SUM(CASE WHEN bag.is_selected = 1 THEN bag.fare ELSE 0 END), 0) AS total_baggage_fare,
                        (
                            COALESCE(SUM(CASE WHEN seat.is_selected = 1 THEN seat.fare ELSE 0 END), 0) +
                            COALESCE(SUM(CASE WHEN meal.is_selected = 1 THEN meal.fare ELSE 0 END), 0) +
                            COALESCE(SUM(CASE WHEN bag.is_selected = 1 THEN bag.fare ELSE 0 END), 0)
                        ) AS total_fare
                    FROM flight_booking_itinerary_details fid
                    LEFT JOIN flight_booking_seat_details seat 
                        ON seat.i_origin = fid.origin
                    LEFT JOIN flight_booking_meals_details meal 
                        ON meal.i_origin = fid.origin
                    LEFT JOIN flight_booking_baggage_details bag 
                        ON bag.i_origin = fid.origin
                    WHERE fid.app_reference = ?
                `, [app_reference_id]);

                if (fareRows.length && fareRows[0].total_fare) {
                    ssrFare = fareRows[0].total_fare;
                }

            } else {

                // 5. PASSENGER (OLD FLOW)
                const [paxRows] = await connection.query(`
                    SELECT fbpd.*, fbd.booking_status as main_status, fbd.created_datetime, fbd.phone, fbd.email
                    FROM flight_booking_passenger_details fbpd
                    LEFT JOIN flight_booking_details fbd 
                        ON fbd.app_reference = fbpd.app_reference
                    WHERE fbpd.app_reference = ?
                `, [app_reference_id]);

                pax_details = paxRows;

                // 6. ITINERARY (OLD FLOW)
                const [cdRows] = await connection.query(`
                    SELECT DISTINCT 
                        FBI.*,
                        SD.*,
                        FBB.*,
                        TD.agent_markup as AgentMarkup,
                        fbd.agent_markup as originalAgentMarkup,
                        fbd.booking_status as flight_booking_status,
                        fbd.email as flight_booking_email,
                        fbd.phone as flight_booking_phone
                    FROM flight_booking_itinerary_details FBI
                    LEFT JOIN flight_booking_details fbd 
                        ON fbd.app_reference = FBI.app_reference
                    LEFT JOIN flight_booking_transaction_details TD 
                        ON FBI.app_reference = TD.app_reference
                    LEFT JOIN flight_booking_seat_details SD 
                        ON FBI.origin = SD.i_origin
                    LEFT JOIN flight_booking_baggage_details FBB 
                        ON FBB.origin = FBB.i_origin
                    WHERE FBI.app_reference = ?
                `, [app_reference_id]);

                cd_details = cdRows;
            }

            if (pax_details && pax_details.length > 0) {
                return {
                    pax: pax_details,
                    seatBagMealFare: ssrFare,
                    flight: cd_details,
                    bookDetails: getBookDetails
                };
            }

            return null;

        } catch (error) {
            throw error;
        }
    }

}

module.exports = ReportModel;
