const dbPool = require('../../database/db');
const moment = require('moment');
const mysql = require('mysql2');
const { setCacheData, getCacheData } = require('../../../shared/redis/Redis');


class rideModel {

    static async get_raw_airport_list() {

        let query = `Select airport_code,airport_name,airport_city,country from flight_airport_list`;
        const [airports] = await dbPool.query(query);
        let result;
        if (airports && typeof airports === 'object') {
            result = airports.reduce((acc, item) => {
                const { airport_code, ...rest } = item;

                acc[airport_code] = rest;

                return acc;
            }, {});
        }
        return result;
    }
    static async get_raw_airline_list() {

        let query = `Select code,name from airline_list`;
        const [airLines] = await dbPool.query(query);
        let result;
        if (airLines && typeof airLines === 'object') {
            result = airLines.reduce((acc, item) => {
                const { code, ...rest } = item;
                acc[code] = rest;
                return acc;
            }, {});
        }
        return result;
    }
    static async get_airport_list(search_chars, search_type = '') {
        let spl_filter = '';
        let raw_search_chars = mysql.escape(search_chars);
        let r_search_chars = mysql.escape(search_chars + '%');
        search_chars = mysql.escape('%' + search_chars + '%');
        let query = `Select * from flight_airport_list where (airport_city like   ${search_chars} OR airport_code like  ${search_chars} OR country like   ${search_chars} )   ${spl_filter} ORDER BY top_destination DESC,
        CASE
        WHEN airport_code =	${raw_search_chars} THEN 1
        WHEN airport_city =	${raw_search_chars}	THEN 2
        WHEN country = ${raw_search_chars} THEN 3            
        WHEN airport_code LIKE ${raw_search_chars} THEN 4
        WHEN airport_city LIKE ${raw_search_chars} THEN 5
        WHEN country LIKE ${raw_search_chars} THEN 6
        WHEN airport_code LIKE ${r_search_chars} THEN 7
        WHEN airport_city LIKE ${r_search_chars} THEN 8
        WHEN country LIKE ${r_search_chars} THEN 9
        WHEN airport_code LIKE ${search_chars} THEN 10
        WHEN airport_city LIKE ${search_chars} THEN 11
        WHEN country LIKE ${search_chars} THEN 12
        ELSE 10 END
        LIMIT 0, 15`;
        query = query.replace(/\n|\t/g, '');
        const [result] = await dbPool.query(query);
        return result;
    }

    static async get_location_list(type, search_chars = '', state_id = null) {

        try {
            let rows = [];
            let query = '';
            let params = [];

            if (type === 'country') {
                query = `SELECT * FROM country`;
            }
            else if (type === 'state') {
                query = `SELECT * FROM state_list`;
            }
            else if (type === 'city') {

                if (!state_id) {
                    throw {
                        status: 0,
                        message: 'state_id is required for city list'
                    };
                }

                query = `SELECT * FROM city_list WHERE state_id = ?`;
                params.push(state_id);
            }
            else {
                throw {
                    status: 0,
                    message: 'Invalid type (country/state/city allowed)'
                };
            }

            const [result] = await dbPool.query(query, params);
            rows = result;
            return rows;

        } catch (error) {
            throw error;
        }
    }

    // static async selectData(tableName, con,column='*') {
    //     let selectQuery;
    //     try {
    //         if (con && con.length > 0 || con !== undefined) {
    //             selectQuery = 'SELECT * FROM ' + tableName + ' WHERE ' + con;
    //         } else {
    //             selectQuery = 'SELECT * FROM ' + tableName;
    //         }
    //         const result = await dbPool.query(selectQuery);
    //         return { status: 1, result: result[0] };

    //     } catch (error) {
    //         return error; // Re-throw the error for the calling code to handle
    //     }
    // }
    static async selectData(tableName, con, column = '') {
        let selectQuery;
        try {
            column = (column && column.trim() !== '') ? column : '*';
            if (con && con.trim() !== '') {
                selectQuery = `SELECT ${column} FROM ${tableName} WHERE ${con}`;
            } else {
                selectQuery = `SELECT ${column} FROM ${tableName}`;
            }

            const result = await dbPool.query(selectQuery);

            return {
                status: 1,
                result: result[0]
            };
        } catch (error) {
            return error;
        }
    }

    static async checkIsDomestic(city) {
        try {

            let CityQuery = `select country from flight_airport_list where airport_code = '${city}' order by airport_code asc`;
            const [result] = await dbPool.query(CityQuery);
            return (result.length > 0 && result[0].country.toLowerCase() === 'india')
                ? 'domestic'
                : 'international';
        } catch (err) {
            return { status: 0, error: err }
        }

    }
    static async flight_xml_log(appReference, request, response, description, user_id = 0) {
        const createdDatetime = new Date().toLocaleString('sv-SE', {
            timeZone: 'Asia/Kolkata'
        });
        try {
            const attr = JSON.stringify(process.env);
            const sql = 'INSERT INTO xml_log (app_reference, request, response, description, attr, created_datetime, created_by_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), ?)';

            const [result] = await dbPool.query(sql, [appReference, request, response, description, attr,createdDatetime, user_id]);
        } catch (error) {
            return { status: 0, errors: error };
        }
    }
    static async flightAprData(decryptedPriceId) {
        const { APSref, app_ref, fareFamily, providerCode, cabinClass } = decryptedPriceId;
        let descriptionWhere = '';
        const cabin = cabinClass.toLowerCase();
        if (providerCode.toLowerCase() === 'ach') {
            descriptionWhere = 'ach';

        } else if (fareFamily.toLowerCase() === 'sme') {
            descriptionWhere = '1g_sme';

        } else if (providerCode.toLowerCase() != 'ach' && (cabin.includes('premium') || cabin.includes('economy'))) {
            descriptionWhere = '1g_premium';

        } else if (cabin.includes('economy') || cabin.includes('gds')) {
            descriptionWhere = '1g_gds';

        } else {
            descriptionWhere = `1g_${cabin}`;
        }
        //console.log(app_ref,'descriptionWhere',descriptionWhere);
        try {
            const query = `SELECT origin,response,description FROM xml_log WHERE app_reference = ? AND description = ? LIMIT 1`;
            const [rows] = await dbPool.query(query, [app_ref, descriptionWhere]);
            return rows.length ? rows[0] : null;
        } catch (error) {
            return { status: 0, errors: error };
        }
    }
    static async getAirPriceXml(opId, app_ref) {
        const op_id = `travelport_air_price_${opId}`;
        try {
            const query = `SELECT origin,request,response,description FROM xml_log WHERE app_reference = ? AND description = ? LIMIT 1`;
            const [rows] = await dbPool.query(query, [app_ref, op_id]);
            return rows.length ? rows[0] : null;
        } catch (error) {
            return { status: 0, errors: error };
        }
    }
    static async getRePriceXml(opId, app_ref) {
        const op_id = `travelport_reprice_${opId}`;
        try {
            const query = `SELECT origin,request,response,description FROM xml_log WHERE app_reference = ? AND description = ? LIMIT 1`;
            const [rows] = await dbPool.query(query, [app_ref, op_id]);
            return rows.length ? rows[0] : null;
        } catch (error) {
            return { status: 0, errors: error };
        }
    }

    static async get_xml_log(appReference) {
        try {
            const query = `SELECT * FROM xml_log WHERE origin = ? LIMIT 1`;
            const [rows] = await dbPool.query(query, [appReference]);

            return rows.length ? rows[0] : null;
        } catch (error) {
            return { status: 0, errors: error };
        }
    }
    static async insertData(tableName, data) {
        try {
            const keys = Object.keys(data).join(", ");
            const values = Object.values(data);
            const placeholders = values.map(() => "?").join(", ");

            const insertQuery = `INSERT INTO ${tableName} (${keys}) VALUES (${placeholders})`;
            const result = await dbPool.query(insertQuery, values);
            //console.log('result',insertQuery,values,result);
            return { status: 1, insertId: result[0].insertId };
        } catch (error) {
            return error;
        }
    }
    static async updateData(tableName, data, condition) {
        try {
            if (!condition || condition.trim() === "") {
                return { status: 0, error: "Update condition missing!" };
            }
            const keys = Object.keys(data);
            const values = Object.values(data);
            const setClause = keys.map(key => `${key} = ?`).join(", ");
            const updateQuery = `UPDATE ${tableName} SET ${setClause} WHERE ${condition}`;
            const result = await dbPool.query(updateQuery, values);
            return { status: 1, affectedRows: result[0].affectedRows };
        } catch (error) {
            return { status: 0, error };
        }
    }
    static async deleteData(tableName, condition) {
        try {
            if (!condition || condition.trim() === "") {
                return {
                    status: 0,
                    error: "Delete condition missing!"
                };
            }

            const deleteQuery = `DELETE FROM ${tableName} WHERE ${condition}`;
            const result = await dbPool.query(deleteQuery);

            return {
                status: 1,
                affectedRows: result[0].affectedRows
            };
        } catch (error) {
            return {
                status: 0,
                error
            };
        }
    }
    static async get_fare_rule(fare_type) {
        try {
            const query = `SELECT * FROM flight_booking_fare_rules WHERE fare_type = ? LIMIT 1`;
            const [rows] = await dbPool.query(query, [fare_type]);

            return rows.length ? rows[0] : null;

        } catch (error) {
            throw error;
        }
    }
    //------------------------------------10122025-------calculate fare------------------------
    static async getAdminDistMarkup(entity_user_id, entity_reporting_to_id) {

        try {
            const Markups = {};

            const sql = `
                SELECT *
                FROM flight_markups
                WHERE module = 'flight' AND (created_for = 0 OR created_for = ?)
                ORDER BY CASE WHEN created_for = ? THEN 0 ELSE 1 END
            `;
            const [MarkupRow] = await dbPool.query(sql, [entity_user_id, entity_user_id]);

            if (!MarkupRow || MarkupRow.length === 0) return Markups;

            // Sort by created_for DESC
            MarkupRow.sort((a, b) => b.created_for - a.created_for);

            for (const val of MarkupRow) {
                if (val.creation_source === 'dist' && !Markups.dist) {

                    if (val.created_by_id === entity_reporting_to_id) {
                        // Check flight markup limit
                        const sqlLimit = `
                            SELECT * 
                            FROM b2c_flight_markup_limit
                            WHERE (user_id = ? AND status = 1) OR (user_id = 0 AND status = 1)
                            ORDER BY user_id DESC
                            LIMIT 1
                        `;

                        const [MarkupRowLimitArr] = await dbPool.query(sqlLimit, [entity_reporting_to_id]);
                        const MarkupRowLimit = MarkupRowLimitArr.length ? MarkupRowLimitArr[0] : null;
                        if (val.created_for > 0) {
                            Markups.dist = val;
                        } else if (val.created_by_id === entity_reporting_to_id && val.created_for === 0) {
                            Markups.dist = val;
                        }

                        if (MarkupRowLimit && Markups.dist) {
                            if (Markups.dist.type === 'plus') { // flat
                                if (Markups.dist.value > MarkupRowLimit.flat) {
                                    Markups.dist.value = MarkupRowLimit.flat;
                                }
                            } else { // percentage
                                if (Markups.dist.value > MarkupRowLimit.percentage) {
                                    Markups.dist.value = MarkupRowLimit.percentage;
                                }
                            }
                        } else {
                            Markups.dist = {};
                        }
                    }
                }

                if (val.creation_source === 'admin' && !Markups.admin) {
                    Markups.admin = val;
                    if (val.created_for > 0) {
                        Markups.admin = val;
                    }
                }
            }

            return Markups;

        } catch (error) {
            console.error("Error in getAdminDistMarkup:", error);
            throw error;
        }
    }
    static async getPLBData(entity_user_id) {
        try {
            const query = `
                SELECT 
                    TTF, DI, MPLB, QPLB, YPLB, IPLB, group_type, fare_type, user_id
                FROM travelport_ach_plb_data
                WHERE is_deleted = 0 AND user_id IN (?, 0)
            `;
            const [records] = await dbPool.query(query, [entity_user_id]);

            if (!records || records.length === 0) return {};

            // Sort by user_id DESC
            records.sort((a, b) => b.user_id - a.user_id);

            const result = {};

            for (const item of records) {
                let fare_type = item.fare_type.replace(/\s+/g, '_').toLowerCase();
                let group_type = item.group_type;
                const region_type = item.region_type;

                if (!result[group_type]) result[group_type] = {};
                if (!result[group_type][fare_type]) {
                    const copyItem = { ...item };
                    delete copyItem.user_id;
                    if (group_type.toLowerCase() === 'ai') {
                        group_type = group_type + region_type;
                    }
                    result[group_type][fare_type] = copyItem;
                }
            }

            return result;

        } catch (error) {
            console.error("Error in getPLBData:", error);
            throw error;
        }
    }

    static async getAdminDistMarkup_New(user_id) {
        try {
            const Markups = {};

            const sql = `
                SELECT id,created_by_id,created_for,creation_source,value,type,module,created_at,updated_at
                FROM flight_markups
                WHERE module = 'flight' and (created_for = ? OR created_for = 0)
                ORDER BY 
                    CASE 
                        WHEN creation_source = 'admin' THEN 0
                        WHEN creation_source = 'dist' THEN 1
                        ELSE 2
                    END,
                    created_for DESC
            `;

            const [MarkupRow] = await dbPool.query(sql, [user_id]);

            if (!MarkupRow || MarkupRow.length === 0) {
                return Markups;
            }

            for (const val of MarkupRow) {

                // Distributor markup (first match)
                if (val.creation_source === 'dist' && !Markups.dist) {
                    Markups.dist = val;
                }

                // Admin markup (first match)
                if (val.creation_source === 'admin' && !Markups.admin) {
                    Markups.admin = val;
                }
            }

            return Markups;

        } catch (error) {
            console.error("Error in getAdminDistMarkup:", error);
            throw error;
        }
    }
    static async getPLBData_New(user_id) {
        try {
            const query = `
                SELECT 
                    TTF,
                    DI,
                    MPLB,
                    QPLB,
                    YPLB,
                    IPLB,
                    group_type,
                    fare_type
                FROM travelport_ach_plb_data
                WHERE is_deleted = 0 and user_id=?
            `;

            const [records] = await dbPool.query(query, [user_id]);
            if (!records || records.length === 0) return {};

            const result = {};
            for (const item of records) {

                const fare_type = item.fare_type
                    .replace(/\s+/g, '_')
                    .toLowerCase();

                const group_type = item.group_type;

                if (!result[group_type]) {
                    result[group_type] = {};
                }

                if (!result[group_type][fare_type]) {
                    const copyItem = { ...item };
                    delete copyItem.group_type;
                    delete copyItem.fare_type;

                    result[group_type][fare_type] = copyItem;
                }
            }
            return result;

        } catch (error) {
            console.error("Error in getPLBData_New:", error);
            throw error;
        }
    }
    static async get_agent_markup(entity_user_id) {
        try {
            const query = `
                SELECT markup
                FROM agent_flight_markups
                WHERE user_id = ?
                LIMIT 1
            `;

            const [records] = await dbPool.query(query, [entity_user_id]);

            if (!records || records.length === 0) return { value: 0 };

            return {
                value: Number(records[0].markup)
            };

        } catch (error) {
            console.error("Error in get_agent_markup:", error);
            throw error;
        }
    }
    static async GetFlightBookingData(conn, agentId, queryParams = {}) {
        try {
            const { fromDate, toDate, journeyDate, phone, email, pnr, app_reference, status, st, order = 'DESC' } = queryParams;

            const response = {
                status: 1,
                data: {
                    flight_details: []
                }
            };

            // let filterCondition = `
            //     WHERE fb.created_by_id = ?
            //     AND (fb.status = 'new' OR fb.status = 'newtp')
            // `;
            // const queryValues = [agentId];
            let filterCondition = 'WHERE 1=1';
            const queryValues = [];

            if (agentId) {
                filterCondition += ' AND fb.created_by_id = ?';
                queryValues.push(agentId);
            }

            const isSearching = (pnr && pnr.trim()) || (journeyDate && journeyDate.trim()) || (phone && phone.trim()) || (email && email.trim()) || (status && status.trim()) || (st && st.trim()) || (app_reference && app_reference.trim());

            if (!isSearching) {
                const fromDateValue = fromDate
                    ? moment(fromDate).startOf('day').format('YYYY-MM-DD HH:mm:ss')
                    : moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');

                const toDateValue = toDate
                    ? moment(toDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
                    : moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');

                filterCondition += ' AND fb.created_datetime >= ?';
                queryValues.push(fromDateValue);
                filterCondition += ' AND fb.created_datetime <= ?';
                queryValues.push(toDateValue);
            }

            if (app_reference && app_reference.trim()) {
                filterCondition += ' AND fb.app_reference = ?';
                queryValues.push(app_reference.trim());
            }

            if (journeyDate && journeyDate.trim()) {
                const journey_start = moment(journeyDate).startOf('day').format('YYYY-MM-DD HH:mm:ss');
                const journey_end = moment(journeyDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');
                filterCondition += ' AND fb.journey_start BETWEEN ? AND ?';
                queryValues.push(journey_start);
                queryValues.push(journey_end);
            }

            if (email && email.trim()) {
                filterCondition += ' AND fb.email LIKE ?';
                queryValues.push(`%${email.trim()}%`);
            }

            if (phone && phone.trim()) {
                filterCondition += ' AND fb.phone LIKE ?';
                queryValues.push(`%${phone.trim()}%`);
            }

            if (status && status.trim() && status !== 'All' && status !== 'all') {
                filterCondition += ' AND fb.booking_status = ?';
                queryValues.push(status.trim());
            }

            if (pnr && pnr.trim()) {
                filterCondition += ' AND fboid.airline_pnr = ?';
                queryValues.push(pnr.trim());
            }

            if (st && st.trim()) {
                const searchTerm = st.trim();
                const stLength = searchTerm.length;
                let searchConditions = [];

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                const hasDigit = /\d/.test(searchTerm);
                const hasLetter = /[a-zA-Z]/.test(searchTerm);
                const isAllDigits = /^\d+$/.test(searchTerm);

                if (emailRegex.test(searchTerm)) {
                    searchConditions.push('fb.email = ?');
                    queryValues.push(searchTerm);
                } else if (stLength === 10 && isAllDigits) {
                    searchConditions.push('fb.phone = ?');
                    queryValues.push(searchTerm);
                } else if (stLength >= 6 && stLength <= 10 && hasDigit && hasLetter) {
                    searchConditions.push('UPPER(fboid.airline_pnr) = UPPER(?)');
                    queryValues.push(searchTerm);
                } else if (stLength > 10 && /[a-zA-Z]-[0-9]/.test(searchTerm)) {
                    searchConditions.push('fb.app_reference = ?');
                    queryValues.push(searchTerm);
                } else if (stLength >= 3) {
                    searchConditions.push('fb.app_reference IN (SELECT app_reference FROM flight_booking_passenger_details WHERE UPPER(first_name) LIKE UPPER(?) OR UPPER(last_name) LIKE UPPER(?))');
                    queryValues.push(`%${searchTerm}%`);
                    queryValues.push(`%${searchTerm}%`);
                }

                if (searchConditions.length > 0) {
                    filterCondition += ' AND (' + searchConditions.join(' OR ') + ')';
                }
            }

            const mainQuery = `
                SELECT
                    fb.booking_status,
                    fb.app_reference,
                    DATE_FORMAT(fb.journey_start, '%Y-%m-%d %H:%i') AS journey_date,
                    DATE_FORMAT(fb.created_datetime, '%Y-%m-%d %H:%i') AS created_datetime,
                    CONCAT(pd.title,' ',pd.first_name,' ', COALESCE(pd.middle_name,''),' ', pd.last_name ) AS pax_name,
                    fb.phone,
                    fb.trip_type,
                    fb.total_fare,
                    fb.agent_commission,
                    fb.agent_markup,
                    fb.airline_gst,
                    fbd.status AS cancel_status,
                    GROUP_CONCAT(
                       DISTINCT CONCAT(fbit.from_airport_code, ' - ', fbit.to_airport_code, ' - ', COALESCE(fbit.airline_pnr, 'N/A'))
                        ORDER BY fbit.departure_index ASC
                        SEPARATOR ', '
                    ) AS sectors,
                    TD.status, TD.pnr, TD.supplier_reference, 
                    sum(TD.total_fare) as booking_fare, 
					sum(TD.agent_commission) as agent_commission,
                    sum(TD.agent_markup) as agent_markup, 
                    sum(TD.service_tax) as service_tax, 
                    sum(TD.agent_tds_on_commission) as agent_tds_on_commission
                FROM flight_booking_details fb
                LEFT JOIN flight_booking_passenger_details pd
                    ON pd.app_reference = fb.app_reference
                    AND pd.is_lead = 1
                LEFT JOIN (
                    SELECT app_reference, COUNT(*) AS total_pax
                    FROM flight_booking_passenger_details
                    GROUP BY app_reference
                ) pc ON pc.app_reference = fb.app_reference
                LEFT JOIN flight_booking_itinerary_details fbit
                    ON fbit.app_reference = fb.app_reference
                LEFT JOIN flight_booking_cancellation_details fbd
                    ON fbd.app_reference = fb.app_reference
                LEFT JOIN flight_booking_transaction_details TD ON fb.app_reference=TD.app_reference 
                ${filterCondition}
                GROUP BY fb.app_reference
                ORDER BY fb.created_datetime ${order}`;
            const [flight_details] = await conn.query(mainQuery, queryValues);
            response.data.flight_details = flight_details.map(row => ({
                ...row,
                sectors: row.sectors || ''
            }));
            return response;

        } catch (error) {
            console.error('Get Flight Travel Booking Reports Error:', error);
            throw {
                statusCode: 500,
                message: "Unable to fetch flight booking report. Please try again later.",
                originalError: error.message
            };
        }
    }

    static async getCancellationRecords(conn, agentId, app_reference) {
        try {
            const response = {
                status: 1,
                data: { cancellation_details: [] }
            };
            const mainQuery = `
                SELECT 
                    fcm.*, 
                    fcd.*
                FROM flight_booking_cancellation_map AS fcm
                LEFT JOIN flight_booking_cancellation_details AS fcd
                    ON fcm.fc_origin = fcd.id
                WHERE fcm.app_reference = ?
                    AND fcm.created_by = ?
                ORDER BY fcm.created_datetime DESC
            `;

            const [rows] = await conn.query(mainQuery, [app_reference, agentId]);
            response.data.cancellation_details = rows;
            return response;
        } catch (error) {
            console.error('Get Flight Cancellation Data Error:', error);
            throw {
                statusCode: 500,
                message: "Unable to fetch flight cancellation details. Please try again later.",
                originalError: error.message
            };
        }
    }
    static async GetCancelViewDetailsOld(app_reference) {
        try {
            const response = {
                status: 1,
                data: []
            };
            const [booking] = await dbPool.query(
                `SELECT * 
                FROM flight_booking_details 
                WHERE app_reference = ? `,
                [app_reference]
            );
            if (booking.length === 0) {
                return { status: 0, msg: "No booking found" };
            }

            const [itinerary] = await dbPool.query(
                `SELECT 
                    it.airline_code as code,
                    it.flight_number,
                    it.airline_name,
                    it.from_airport_code AS from_airport,
                    it.to_airport_code AS to_airport,
                    it.segment_indicator,                    
                    DATE_FORMAT(it.departure_datetime, '%Y-%m-%d %H:%i :%s') AS departure,
                    DATE_FORMAT(it.arrival_datetime, '%Y-%m-%d %H:%i :%s') AS arrival
                    FROM flight_booking_itinerary_details AS it
                    WHERE it.app_reference = ?
                `,
                [app_reference]
            );

            const [passengers] = await dbPool.query(
                `SELECT 
                    px.title, 
                    px.first_name, 
                    px.last_name, 
                    px.passenger_type, 
                    px.status, 
                    px.ticket_no 
                    FROM flight_booking_passenger_details as px
                    WHERE app_reference = ?
                `,
                [app_reference]
            );
            if (passengers.length === 0) {
                return { status: 0, msg: "No passengers found" };
            }
            const [cancellation] = await dbPool.query(
                `SELECT 
                    fcm.app_reference, 
                    fcd.amendment_id,
                    fcd.refundable_amount,
                    fcd.refund_status,
                    fcd.remarks,
                    fcd.passengers,
                    fcd.created_at
                    FROM flight_booking_cancellation_map AS fcm
                    LEFT JOIN flight_booking_cancellation_details AS fcd ON fcm.fc_origin = fcd.id
                    WHERE fcm.app_reference = ?
                    ORDER BY fcm.created_datetime DESC
                `,
                [app_reference]
            );

            const amendmentsObject = {
                "CANCELLATION": "CANCELLATION",
                "FULL_REFUND": "FULL REFUND",
                "CANCLE_BY_AIR_LINE": "CANCEL BY AIRLINE",
                "REISSUE_QUOTATION": "REISSUE QUOTATION",
                "VOIDED": "VOIDED",
                "REISSUE": "REISSUE",
                "SSR": "SSR",
                "NO_SHOW": "NO SHOW",
                "CORRECTION": "CORRECTION",
                "ADD_INFANT": "ADD INFANT"
            };

            const newData = {
                booking_detail:booking,
                i_details: itinerary,
                p_details: passengers,
                c_details: cancellation,
                a_details: amendmentsObject
            };
            response.data = newData;
            return response;

        } catch (error) {
            console.error("GetCancelViewDetails Error:", error);
            throw {
                statusCode: 500,
                message: "Unable to fetch booking details",
                originalError: error.message
            };
        }
    }

    static async GetCancelViewDetails(app_reference) {
        try {
            const response = {
                status: 1,
                data: {}
            };

            // Booking Details
            const [bookingRows] = await dbPool.query(
                `SELECT * 
                FROM flight_booking_details
                WHERE app_reference = ?`,
                [app_reference]
            );

            if (!bookingRows.length) {
                return {
                    status: 0,
                    msg: "No booking found"
                };
            }

            const booking = bookingRows[0];

            let transaction = [];
            let itinerary = [];
            let passengers = [];
            let providerCode = [];

            // Fetch data based on booking status
            if (booking.status === "newtp") {

                [transaction] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_transaction_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                [itinerary] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_itinerary_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                [passengers] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_passenger_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                [providerCode] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_online_additional_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

            } else {

                [transaction] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_transaction_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                [itinerary] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_itinerary_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                [passengers] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_passenger_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );
            }

            // Cancellation Records
            const [cancellations] = await dbPool.query(
                `SELECT
                    fcm.app_reference,
                    fcd.amendment_id,
                    fcd.refundable_amount,
                    fcd.status,
                    fcd.refund_status,
                    fcd.remarks,
                    fcd.passengers,
                    fcd.created_at
                FROM flight_booking_cancellation_map AS fcm
                LEFT JOIN flight_booking_cancellation_details AS fcd
                    ON fcm.fc_origin = fcd.id
                WHERE fcm.app_reference = ?
                ORDER BY fcm.created_datetime DESC`,
                [app_reference]
            );

            // Amendment Object
            const amendmentsObject = {
                CANCELLATION: "CANCELLATION",
                FULL_REFUND: "FULL REFUND",
                CANCLE_BY_AIR_LINE: "CANCEL BY AIRLINE",
                REISSUE_QUOTATION: "REISSUE QUOTATION",
                VOIDED: "VOIDED",
                REISSUE: "REISSUE",
                SSR: "SSR",
                NO_SHOW: "NO SHOW",
                CORRECTION: "CORRECTION",
                ADD_INFANT: "ADD INFANT"
            };

            response.data = {
                booking,
                app_reference,
                cancellations,
                amendmentsObject,
                transaction: transaction.length ? transaction[0] : {},
                tripInfos: itinerary,
                travellerInfos: passengers,
                providercode: providerCode.length ? providerCode[0].pro_code : null
            };
            return response; 
        } catch (error) {
            throw {
                statusCode: 500,
                message: "Unable to fetch booking details",
                originalError: error.message
            };
        }
    }

    static  get_currency_conveted_value(data, currency_conversion_rate) {
        const rate = Number(currency_conversion_rate);
        if (!Number.isFinite(rate)) {
            return data;
        }
        if (data !== null && typeof data === 'object') {
            if (Array.isArray(data)) {
                return data.map(value =>
                    this.get_currency_conveted_value(value, rate)
                );
            }
            const converted_data = {};
            for (const [key, value] of Object.entries(data)) {
                converted_data[key] = this.get_currency_conveted_value(value, rate);
            }
            return converted_data;
        }
        if (
            typeof data === 'number' ||
            (typeof data === 'string' &&
                data.trim() !== '' &&
                Number.isFinite(Number(data)))
        ) {
            return Math.round((Number(data) * rate + Number.EPSILON) * 100) / 100;
        }
        return data;
    }
    static async GetBookingRefund(connection,postData) {
        try{
            const entity_current_user_id = postData.user_id;
            const app_reference = postData.app_reference;
            const limit = 500;
            const offset = 0;
            // let customCondition = '';
            // let st = null;

            // if (!Object.prototype.hasOwnProperty.call(condition, 'st')) {
            //     customCondition = this.get_custom_condition(condition);
            // } else if (Object.keys(condition).length > 0) {
            //     st = condition.st;

            //     const newCondition = { ...condition };
            //     delete newCondition.st;

            //     customCondition = this.get_custom_condition(newCondition);
            // } else {
            //     customCondition = '';
            // }

            // if (count) {
            //     const query = `
            //         SELECT COUNT(DISTINCT FCD.cancellation_id) AS total_records
            //         FROM flight_cancellation_details AS FCD
            //         INNER JOIN flight_cancellation_passenger_details AS FCPD
            //             ON FCD.origin = FCPD.fc_origin
            //         INNER JOIN flight_booking_passenger_details AS FBPD
            //             ON FBPD.origin = FCPD.p_origin
            //         INNER JOIN user
            //             ON FCD.created_by_id = user.user_id
            //         WHERE FCPD.status NOT IN ('CANCEL_INITIALIZED')
            //         AND FCD.created_by_id = ?
            //     `;

            //     const [rows] = await this.db.query(query, [
            //         entity_current_user_id
            //     ]);

            //     return rows.length && rows[0].total_records
            //         ? rows[0].total_records
            //         : 0;
            // }

            const query = `
                SELECT
                    FCD.app_reference,
                    FCD.cancellation_id,
                    FCD.reason,
                    FCD.admin_remarks,
                    FCD.created_datetime,
                    FCD.block_user_id,
                    FCPD.status AS current_status,
                    FCPD.currency_conversion_rate,
                    FCPD.processed_datetime AS cancellation_processed_on,
                    user.uuid,
                    user.agency_name,
                    user.first_name,
                    user.phone,

                    CASE
                        WHEN FCD.API_RefundedAmount > 0
                        THEN FCD.API_RefundedAmount
                        ELSE SUM(FCPD.refund_amount)
                    END AS API_RefundedAmount,

                    CASE
                        WHEN FCD.API_CancellationCharge > 0
                        THEN FCD.API_CancellationCharge
                        ELSE SUM(
                            FCPD.cancellation_charge +
                            FCPD.airline_cancellation_charge
                        )
                    END AS API_CancellationCharge

                FROM flight_cancellation_details AS FCD

                INNER JOIN flight_cancellation_passenger_details AS FCPD
                    ON FCD.origin = FCPD.fc_origin

                INNER JOIN flight_booking_passenger_details AS FBPD
                    ON FBPD.origin = FCPD.p_origin

                INNER JOIN user
                    ON FCD.created_by_id = user.user_id

                WHERE FCPD.status NOT IN ('CANCEL_INITIALIZED')
                AND FCD.created_by_id = ?

                GROUP BY FCD.cancellation_id

                ORDER BY FCD.origin DESC

                LIMIT ?,? 
            `;
            const [result] = await connection.query(query, [
                entity_current_user_id,
                Number(offset),
                Number(limit)
            ]);
            if (!result || result.length === 0) {
                return {
                    status: 0,
                    message: "Refund booking not found",
                    data: null
                };
            }
            if (Array.isArray(result) && result.length > 0) {
                for (let k_currency = 0; k_currency < result.length; k_currency++) {
                    const v_currency = result[k_currency];
                    const currency_rate = 1; //v_currency.currency_conversion_rate;
                    const converted_refund_values = {
                        API_RefundedAmount: v_currency.API_RefundedAmount,
                        API_CancellationCharge: v_currency.API_CancellationCharge
                    };
                    const converted_refund_details = this.get_currency_conveted_value(
                        converted_refund_values,
                        currency_rate
                    );
                    const refund_details = {
                        ...v_currency,
                        ...converted_refund_details
                    };
                    result[k_currency] = refund_details;
                }
            }
            const type = 'refund';
            let get_data = [];
            // for online cancellation
            let queryR = `
                SELECT
                    fb.*,
                    fbd.created_by_id,
                    fbd.booking_source,
                    TLJ.system_transaction_id

                FROM flight_booking_cancellation_details AS fb

                LEFT JOIN flight_booking_details AS fbd
                    ON fbd.app_reference = fb.app_reference

                LEFT JOIN transaction_log AS TLJ
                    ON TLJ.app_reference = fb.app_reference

                WHERE fbd.created_by_id = ?
            `;

            const params = [entity_current_user_id];

            // type == refund
            if (type === 'refund') {
                queryR += `
                    AND TLJ.transaction_type = ?
                `;
                params.push('flight_cancel');
            }
            // get_data filters
            if (get_data && Object.keys(get_data).length > 0) {

                // app_reference
                if (get_data.app_reference) {
                    queryR += `
                        AND fb.app_reference = ?
                    `;

                    params.push(get_data.app_reference);
                }

                // created date
                if (get_data.created_datetime_from) {

                    const minvalue =
                        `${get_data.created_datetime_from} 00:00:00`;

                    // created_datetime_to optional hai
                    const maxDate =
                        get_data.created_datetime_to ||
                        get_data.created_datetime_from;

                    const maxvalue =
                        `${maxDate} 23:59:59`;

                    queryR += `
                        AND fb.created_at >= ?
                        AND fb.created_at <= ?
                    `;

                    params.push(minvalue, maxvalue);
                }

                // online_status
                if (
                    get_data.online_status &&
                    get_data.online_status !== 'All' &&
                    get_data.online_status !== 'all'
                ) {
                    queryR += `
                        AND fb.status = ?
                    `;

                    params.push(get_data.online_status);
                }
            }

            // type != refund
            if (type !== 'refund') {
                queryR += `
                    AND TLJ.transaction_owner_id = ?
                `;
                params.push(entity_user_id);

                queryR += `
                    GROUP BY fb.id
                `;
            }

            const [online_cancellation_reports] = await connection.query(queryR, params);
            return {
                status: 1,
                message: "Refund booking data retrieved successfully",
                // data: result
                data: {
                    booking_details: result,
                    online_cancellation_reports: online_cancellation_reports
                }
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error retrieving refund booking data",
                data: null,
                originalError: error.message
            };
        }
    }
    static formatDate(input){
        if (!input) return '';
        let d;
        if (typeof input === 'number') {
            d = input < 10000000000 ? new Date(input * 1000) : new Date(input);
        } else {
            d = new Date(input);
        }
        if (isNaN(d.getTime())) return '';

        // Convert to IST
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(d.getTime() + istOffset);

        const day = istDate.getUTCDate().toString().padStart(2, '0');
        const month = istDate.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
        const year = istDate.getUTCFullYear();
        const hours = istDate.getUTCHours().toString().padStart(2, '0');
        const minutes = istDate.getUTCMinutes().toString().padStart(2, '0');
        const seconds = istDate.getUTCSeconds().toString().padStart(2, '0');
        return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds}`;
    }
    static async getRefundReceipt(connection, postData) {
        try {
            const entity_user_id = postData.user_id;
            const tr_reference = postData.ref_id;

            const condition = {
                tr_reference: tr_reference,
                transaction_type: 'flight_cancel'
            };
            const dtlsResult = await this.userTransactionLogs(
                connection,
                entity_user_id,
                condition,
                true
            );
            if (
                !dtlsResult ||
                Object.keys(dtlsResult).length === 0
            ) {
                return {
                    status: 0,
                    message: "Transaction details not found",
                    data: null
                };
            }

            const dtls =
                dtlsResult[tr_reference] ||
                dtlsResult?.data?.find(
                    item =>
                        item.system_transaction_id === tr_reference
                );
            if (!dtls) {
                return {
                    status: 0,
                    message: "Transaction details not found",
                    data: null
                };
            }
            const user_id = dtls.transaction_owner_id;
            const id = entity_user_id;

            if (Number(user_id) !== Number(id)) {
                return {
                    status: 0,
                    message: "Unauthorized transaction",
                    data: null
                };
            }

            const currency_rate =
                Number(dtls.currency_conversion_rate || 1);

            const converted_dtls = {};

            converted_dtls.opening_balance =
                this.get_currency_conveted_value(
                    dtls.opening_balance,
                    currency_rate
                );

            converted_dtls.closing_balance =
                this.get_currency_conveted_value(
                    dtls.closing_balance,
                    currency_rate
                );

            converted_dtls.fare =
                this.get_currency_conveted_value(
                    dtls.fare,
                    currency_rate
                );

            const finalDtls = {
                ...dtls,
                ...converted_dtls
            };

            const page_data = {};
            page_data.data = finalDtls;
            page_data.data.for =
                finalDtls.transaction_type;

            switch (finalDtls.transaction_type) {

                // -------------------------------------
                // FLIGHT CANCEL
                // -------------------------------------
                case 'flight_cancel': {

                    const [cancelRows] =
                        await connection.query(
                            `
                            SELECT *
                            FROM flight_booking_cancellation_details
                            WHERE app_reference = ?
                            LIMIT 1
                            `,
                            [finalDtls.app_reference]
                        );

                    const [flightRows] =
                        await connection.query(
                            `
                            SELECT *
                            FROM flight_booking_details
                            WHERE app_reference = ?
                            LIMIT 1
                            `,
                            [finalDtls.app_reference]
                        );

                    const [paxRows] =
                        await connection.query(
                            `
                            SELECT *
                            FROM flight_booking_passenger_details
                            WHERE app_reference = ?
                            LIMIT 1
                            `,
                            [finalDtls.app_reference]
                        );
                    page_data.cancel_data =
                        cancelRows[0] || null;

                    page_data.fl_det =
                        flightRows[0] || null;

                    page_data.PaxData =
                        paxRows[0] || null;

                    page_data.receipt_title =
                        "Flight Refund Receipt";

                    page_data.data.for =
                        "Flight Cancellation";

                    page_data.data.details =
                        "Flight Cancellation";

                    break;
                }


                // -------------------------------------
                // FLIGHT TRAVEL CANCEL
                // -------------------------------------
                case 'flight_travel_cancel': {

                    const [cancelRows] =
                        await connection.query(
                            `
                            SELECT *
                            FROM flight_booking_cancellation_details
                            WHERE app_reference = ?
                            ORDER BY id DESC
                            LIMIT 1
                            `,
                            [finalDtls.app_reference]
                        );

                    const [transactionRows] =
                        await connection.query(
                            `
                            SELECT *
                            FROM flight_booking_transaction_details
                            WHERE app_reference = ?
                            `,
                            [finalDtls.app_reference]
                        );

                    const [paxRows] =
                        await connection.query(
                            `
                            SELECT *
                            FROM flight_booking_passenger_details
                            WHERE app_reference = ?
                            `,
                            [finalDtls.app_reference]
                        );

                    page_data.cancel_data =
                        cancelRows[0] || null;

                    page_data.transctionData =
                        transactionRows;

                    page_data.PaxData =
                        paxRows;

                    page_data.receipt_title =
                        "Flight Refund Receipt";

                    page_data.data.for =
                        "Flight Cancellation";

                    page_data.data.details =
                        "Flight Cancellation";

                    break;
                }

                default: {

                    page_data.data.details =
                        finalDtls.remarks;

                    break;
                }
            }


            // =========================================
            // USER DATA
            // =========================================

            const [userRows] =
                await connection.query(
                    `
                    SELECT *
                    FROM user
                    WHERE user_id = ?
                    LIMIT 1
                    `,
                    [entity_user_id]
                );

            if (!userRows.length) {
                return {
                    status: 0,
                    message: "User data not found",
                    data: null
                };
            }

            page_data.user_data =
                userRows[0];

            const userId =
                userRows[0].user_id;


            // =========================================
            // GST DETAILS
            // =========================================

            const [gstRows] =
                await connection.query(
                    `
                    SELECT *
                    FROM gst_details
                    WHERE origin = ?
                    `,
                    [userRows[0].gst_details_fk]
                );

            page_data.gst_details =
                gstRows;


            // =========================================
            // AMOUNT
            // =========================================

            page_data.amount =
                finalDtls.fare;


            // =========================================
            // RETURN
            // =========================================

            return {
                status: 1,
                message: "Refund receipt data retrieved successfully",
                data: page_data
            };

        } catch (error) {

            console.error(
                "getRefundReceipt Error:",
                error
            );

            return {
                status: 0,
                message:
                    error.message ||
                    "Unable to generate refund receipt",
                data: null,
                originalError: error.message
            };
        }
    }
    static async userTransactionLogs(connection,user_id,condition = {},returnData = false) {
        try {

            let where = [];
            let params = [];
            where.push(`TL.transaction_owner_id = ?`);
            params.push(user_id);
            if (condition?.tr_reference) {
                where.push(`TL.system_transaction_id = ?`);
                params.push(condition.tr_reference);
            }

            // Optional app reference
            if (condition?.app_reference) {
                where.push(`TL.app_reference = ?`);
                params.push(condition.app_reference);
            }

            // Optional transaction type
            if (condition?.transaction_type) {
                where.push(`TL.transaction_type = ?`);
                params.push(condition.transaction_type);
            }

            const whereCondition = where.length
                ? `WHERE ${where.join(' AND ')}`
                : '';

            /*
            * Main transaction query
            */
            const trQuery = `
                SELECT
                    TL.origin,
                    TL.system_transaction_id,
                    TL.transaction_type,
                    TL.opening_balance,
                    TL.closing_balance,
                    TL.app_reference,
                    TL.fare,
                    TL.remarks,
                    TL.transaction_owner_id,
                    TL.created_by_id,
                    TL.created_datetime,
                    U.uuid,
                    TL.currency,
                    TL.currency_conversion_rate

                FROM transaction_log AS TL

                LEFT JOIN user AS U
                    ON TL.transaction_owner_id = U.user_id

                ${whereCondition}

                ORDER BY TL.created_datetime ASC
            `;

            const [transactions] = await connection.query(
                trQuery,
                params
            );
            if (!transactions || transactions.length === 0) {
                return {};
            }
            const formatted_logs = {};
            for (const lv of transactions) {
                let det1 = '';
                let det2 = '';
                let det3 = '';
                let result = {};

                const transactionId =
                    lv.system_transaction_id;
                formatted_logs[transactionId] = {
                    ...lv
                };

                /*
                * ==========================================
                * FLIGHT
                * ==========================================
                */
                switch (lv.transaction_type) {

                    case 'flight': {

                        const [bookingRows] = await connection.query(
                            `
                            SELECT
                                app_reference,
                                booking_source,
                                status,
                                data
                            FROM flight_booking_details
                            WHERE app_reference = ?
                            LIMIT 1
                            `,
                            [lv.app_reference]
                        );

                        const row = bookingRows[0];

                        if (row) {

                            /*
                            * Travelport / Old booking
                            */
                            if (
                                row.booking_source === 'Travelport' ||
                                row.status === 'old'
                            ) {

                                const [paxDetails] =
                                    await connection.query(
                                        `
                                        SELECT
                                            title,
                                            first_name,
                                            last_name
                                        FROM flight_booking_passenger_details
                                        WHERE app_reference = ?
                                        `,
                                        [lv.app_reference]
                                    );

                                if (paxDetails.length > 0) {

                                    let passenger =
                                        `${paxDetails[0].title} ` +
                                        `${paxDetails[0].first_name} ` +
                                        `${paxDetails[0].last_name}`;

                                    if (paxDetails.length > 1) {
                                        passenger +=
                                            `(${paxDetails.length - 1})`;
                                    }

                                    det1 = passenger;
                                }

                                const [itineraryDetails] =
                                    await connection.query(
                                        `
                                        SELECT
                                            airline_pnr,
                                            departure_datetime
                                        FROM flight_booking_itinerary_details
                                        WHERE app_reference = ?
                                        `,
                                        [lv.app_reference]
                                    );

                                if (itineraryDetails.length > 0) {

                                    const itinerary =
                                        itineraryDetails[0];

                                    det2 =
                                        `Travel Date : ${this.formatDate(
                                            itinerary.departure_datetime
                                        )}`;

                                    det3 =
                                        `<b>PNR NO: </b>${itinerary.airline_pnr}`;
                                }

                                formatted_logs[transactionId]
                                    .transaction_type =
                                    'flight_travel';

                                formatted_logs[transactionId].det1 =
                                    det1;

                                formatted_logs[transactionId].det2 =
                                    det2;

                                formatted_logs[transactionId].det3 =
                                    det3;

                            } else {

                                /*
                                * New flight booking
                                */
                                try {

                                    const data =
                                        typeof row.data === 'string'
                                            ? JSON.parse(row.data)
                                            : row.data;

                                    const travellerInfos =
                                        data?.itemInfos?.AIR
                                            ?.travellerInfos || [];

                                    if (travellerInfos.length > 0) {

                                        const traveller =
                                            travellerInfos[0];

                                        let passenger =
                                            `${traveller.ti} ` +
                                            `${traveller.fN} ` +
                                            `${traveller.lN}`;

                                        if (travellerInfos.length > 1) {
                                            passenger +=
                                                `(${travellerInfos.length - 1})`;
                                        }

                                        det1 = passenger;
                                    }

                                    const departure =
                                        data?.itemInfos?.AIR
                                            ?.tripInfos?.[0]
                                            ?.sI?.[0]?.dt;

                                    if (departure) {
                                        det2 =
                                            `<b>Travel Date : </b>${this.formatDate(
                                                departure
                                            )}`;
                                    }

                                    det3 =
                                        `<b>PNR NO: </b><br>`;

                                    const pnrDetails =
                                        travellerInfos?.[0]
                                            ?.pnrDetails || {};

                                    for (
                                        const [key, value]
                                        of Object.entries(pnrDetails)
                                    ) {
                                        det3 +=
                                            `${key} - ${value}<br>`;
                                    }

                                } catch (e) {
                                    console.log(
                                        'Flight data parse error:',
                                        e.message
                                    );
                                }
                            }
                        }

                        break;
                    }
                    /*
                    * ==========================================
                    * FLIGHT ROLLBACK
                    * ==========================================
                    */
                    case 'flight_rolledback': {

                        const [bookingRows] =
                            await connection.query(
                                `
                                SELECT
                                    booking_source,
                                    status,
                                    data
                                FROM flight_booking_details
                                WHERE app_reference = ?
                                LIMIT 1
                                `,
                                [lv.app_reference]
                            );

                        const row = bookingRows[0];

                        if (row) {

                            try {

                                const data =
                                    typeof row.data === 'string'
                                        ? JSON.parse(row.data)
                                        : row.data;

                                const travellerInfos =
                                    data?.itemInfos?.AIR
                                        ?.travellerInfos || [];

                                if (travellerInfos.length > 0) {

                                    const traveller =
                                        travellerInfos[0];

                                    let passenger =
                                        `${traveller.ti} ` +
                                        `${traveller.fN} ` +
                                        `${traveller.lN}`;

                                    if (travellerInfos.length > 1) {
                                        passenger +=
                                            `(${travellerInfos.length - 1})`;
                                    }

                                    det1 = passenger;
                                }

                                const departure =
                                    data?.itemInfos?.AIR
                                        ?.tripInfos?.[0]
                                        ?.sI?.[0]?.dt;

                                if (departure) {
                                    det2 =
                                        `Travel Date : ${this.formatDate(
                                            departure
                                        )}`;
                                }

                            } catch (e) {
                                console.log(
                                    'Rollback data parse error:',
                                    e.message
                                );
                            }

                            /*
                            * Travelport
                            */
                            if (
                                row.booking_source === 'Travelport' ||
                                row.status === 'old'
                            ) {

                                const [paxDetails] =
                                    await connection.query(
                                        `
                                        SELECT
                                            title,
                                            first_name,
                                            last_name
                                        FROM flight_booking_passenger_details
                                        WHERE app_reference = ?
                                        `,
                                        [lv.app_reference]
                                    );

                                if (paxDetails.length > 0) {

                                    let passenger =
                                        `${paxDetails[0].title} ` +
                                        `${paxDetails[0].first_name} ` +
                                        `${paxDetails[0].last_name}`;

                                    if (paxDetails.length > 1) {
                                        passenger +=
                                            `(${paxDetails.length - 1})`;
                                    }

                                    det1 = passenger;
                                }

                                const [itineraryDetails] =
                                    await connection.query(
                                        `
                                        SELECT
                                            airline_pnr,
                                            departure_datetime
                                        FROM flight_booking_itinerary_details
                                        WHERE app_reference = ?
                                        `,
                                        [lv.app_reference]
                                    );

                                if (itineraryDetails.length > 0) {

                                    det2 =
                                        `Travel Date : ${this.formatDate(
                                            itineraryDetails[0]
                                                .departure_datetime
                                        )}`;

                                    det3 =
                                        `<b>PNR NO: </b>` +
                                        itineraryDetails[0]
                                            .airline_pnr;
                                }
                            }
                        }

                        break;
                    }


                    /*
                    * ==========================================
                    * FLIGHT RESCHEDULE
                    * ==========================================
                    */
                    case 'flight_reschedule': {

                        const [rows] =
                            await connection.query(
                                `
                                SELECT
                                    passengers,
                                    destinations,
                                    dates,
                                    flight_no,
                                    pnr_no
                                FROM flight_online_rescheduling_details
                                WHERE system_transaction_id = ?
                                LIMIT 1
                                `,
                                [lv.system_transaction_id]
                            );

                        const row = rows[0];

                        if (row) {
                            const passengers =
                                JSON.parse(row.passengers) || [];
                            const destinations =
                                JSON.parse(row.destinations) || [];
                            const dates =
                                JSON.parse(row.dates) || [];
                            det1 = passengers.join(',');

                            det2 =
                                `<b>Sector : </b>` +
                                destinations.join(',');

                            if (dates.length > 0) {

                                const dts = dates.map(dt => {

                                    return (
                                        `${this.formatDate(dt.departure)}` +
                                        ` To ` +
                                        `${this.formatDate(dt.arrival)}`
                                    );

                                });

                                det2 +=
                                    `<br><b>Dates : </b>` +
                                    dts.join(',');
                            }

                            det3 =
                                `<b>Flight No: </b>` +
                                String(row.flight_no || '')
                                    .toUpperCase() +
                                '<br>';

                            det3 +=
                                `<b>PNR No: </b>` +
                                String(row.pnr_no || '')
                                    .toUpperCase() +
                                '<br>';
                        }

                        break;
                    }


                    /*
                    * ==========================================
                    * FLIGHT CANCEL
                    * ==========================================
                    */
                    case 'flight_cancel': {

                        const [cancelRows] =
                            await connection.query(
                                `
                                SELECT
                                    *
                                FROM flight_booking_cancellation_details
                                WHERE app_reference = ?
                                LIMIT 1
                                `,
                                [lv.app_reference]
                            );

                        const row1 = cancelRows[0];
                        if (row1) {

                            /*
                            * Passenger details from cancellation
                            */
                            const paxs =
                                JSON.parse(row1.passengers) || [];

                            const pass = [];

                            for (const p of paxs) {

                                pass.push(
                                    `${p.fn} ${p.ln}`
                                );
                            }

                            if (pass.length > 0) {

                                det1 =
                                    `<b>Passengers : </b>` +
                                    pass.join(',');
                            }


                            /*
                            * Booking details
                            */
                            const [bookingRows] =
                                await connection.query(
                                    `
                                    SELECT
                                        booking_source,
                                        data
                                    FROM flight_booking_details
                                    WHERE app_reference = ?
                                    LIMIT 1
                                    `,
                                    [lv.app_reference]
                                );

                            const row2 = bookingRows[0];

                            if (row2) {

                                /*
                                * Travelport
                                */
                                if (
                                    row2.booking_source ===
                                    'Travelport'
                                ) {

                                    const [paxDetails] =
                                        await connection.query(
                                            `
                                            SELECT
                                                title,
                                                first_name,
                                                last_name
                                            FROM flight_booking_passenger_details
                                            WHERE app_reference = ?
                                            `,
                                            [lv.app_reference]
                                        );

                                    let passenger = '';

                                    if (paxDetails.length > 0) {

                                        passenger =
                                            `${paxDetails[0].title} ` +
                                            `${paxDetails[0].first_name} ` +
                                            `${paxDetails[0].last_name}`;

                                        if (paxDetails.length > 1) {
                                            passenger +=
                                                `(${paxDetails.length - 1})`;
                                        }
                                    }

                                    const [itineraryDetails] =
                                        await connection.query(
                                            `
                                            SELECT
                                                airline_pnr,
                                                departure_datetime
                                            FROM flight_booking_itinerary_details
                                            WHERE app_reference = ?
                                            `,
                                            [lv.app_reference]
                                        );

                                    if (
                                        itineraryDetails.length > 0
                                    ) {

                                        det2 =
                                            `Travel Date : ${this.formatDate(
                                                itineraryDetails[0]
                                                    .departure_datetime
                                            )}`;

                                        det3 =
                                            `<b>PNR NO: </b>` +
                                            itineraryDetails[0]
                                                .airline_pnr;
                                    }

                                    formatted_logs[transactionId]
                                        .transaction_type =
                                        'flight_travel_cancel';

                                    formatted_logs[transactionId].det1 =
                                        det1;

                                    formatted_logs[transactionId].det2 =
                                        det2;

                                    formatted_logs[transactionId].det3 =
                                        det3;

                                } else {

                                    try {

                                        const data =
                                            typeof row2.data === 'string'
                                                ? JSON.parse(row2.data)
                                                : row2.data;

                                        const travellerInfos =
                                            data?.itemInfos?.AIR
                                                ?.travellerInfos || [];

                                        const pnrDetails =
                                            travellerInfos?.[0]
                                                ?.pnrDetails || {};

                                        const pnrValues =
                                            Object.values(pnrDetails);

                                        if (pnrValues.length > 0) {

                                            det2 =
                                                `<b>PNR : </b>` +
                                                pnrValues[0];
                                        }

                                    } catch (e) {
                                        console.log(
                                            'Cancel data parse error:',
                                            e.message
                                        );
                                    }
                                }
                            }
                        }

                        break;
                    }


                    /*
                    * ==========================================
                    * DEFAULT
                    * ==========================================
                    */
                    default: {

                        result = lv;

                        break;
                    }
                }


                /*
                * Cancellation ID
                */
                if (
                    result &&
                    result.cancellation_id
                ) {

                    formatted_logs[transactionId]
                        .cancellation_id =
                        result.cancellation_id;

                    det1 =
                        `<strong>AppRef: ${lv.app_reference}</strong>` +
                        `<hr>` +
                        det1;
                }


                /*
                * Final details
                */
                formatted_logs[transactionId].det1 =
                    det1 || '';

                formatted_logs[transactionId].det2 =
                    det2 || '';

                formatted_logs[transactionId].PNR =
                    result?.pnr || det3 || '';

                formatted_logs[transactionId].forReceipt =
                    det3 || '';
            }


            return formatted_logs;

        } catch (error) {

            console.error(
                'userTransactionLogs Error:',
                error
            );

            throw error;
        }
    }
    static async getTransactionLog(
        connection,
        condition = {},
        count = false,
        offset = 0,
        limit = 50
    ) {
        try {

            let where = [];
            let params = [];

            // Transaction Reference
            if (condition && condition.tr_reference) {
                where.push(`TL.system_transaction_id = ?`);
                params.push(condition.tr_reference);
            }

            const whereCondition = where.length > 0
                ? `WHERE ${where.join(' AND ')}`
                : '';

            const result = {};

            // =========================
            // COUNT
            // =========================
            if (count) {

                const countQuery = `
                    SELECT COUNT(*) AS total_records

                    FROM transaction_log AS TL

                    INNER JOIN user AS U
                        ON TL.transaction_owner_id = U.user_id

                    ${whereCondition}
                `;

                const [countRows] = await connection.query(
                    countQuery,
                    params
                );

                result.total_records =
                    Number(countRows[0]?.total_records || 0);
            }

            // =========================
            // DATA
            // =========================
            const query = `
                SELECT
                    'INR' AS currency,
                    TL.system_transaction_id,
                    TL.transaction_type,
                    TL.app_reference,
                    TL.fare,
                    TL.remarks,
                    TL.created_datetime,
                    TL.created_by_id,
                    U.phone,
                    CONCAT(U.uuid, ' <br/> ', U.agency_name) AS company

                FROM transaction_log AS TL

                INNER JOIN user AS U
                    ON TL.transaction_owner_id = U.user_id

                ${whereCondition}

                ORDER BY TL.origin DESC

                LIMIT ?, ?
            `;

            const queryParams = [
                ...params,
                Number(offset),
                Number(limit)
            ];

            const [rows] = await connection.query(
                query,
                queryParams
            );

            result.data = rows;

            return result;

        } catch (error) {
            throw error;
        }
    }


    /**
     * Get flight booking cancellation data
     * @param {Object} connection - Database connection
     * @param {number} agentId - Agent ID
     * @param {Object} postData - Request data
     * @returns {Object} Booking cancellation data
     */
    static async GetFlightBookingCancelData(connection, agentId, postData) {
        try {
            const appReference = mysql.escape(postData.app_reference);

            const query = `
                SELECT 
                    fb.id as booking_id,
                    fb.app_reference,
                    fb.pnr_code,
                    fb.total_price,
                    fb.booking_status,
                    fb.created_at,
                    fbd.* 
                FROM flight_booking AS fb
                LEFT JOIN flight_booking_details AS fbd 
                    ON fb.id = fbd.booking_id
                WHERE fb.app_reference = ${appReference} 
                    AND fb.agent_id = ${agentId}
                LIMIT 1
            `;

            const [result] = await (connection || dbPool).query(query);

            if (!result || result.length === 0) {
                return {
                    status: 0,
                    message: "Booking not found",
                    data: null
                };
            }

            return {
                status: 1,
                message: "Booking data retrieved successfully",
                data: result[0]
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error retrieving booking data",
                data: null,
                originalError: error.message
            };
        }
    }

    /**
     * Get cancellation details by cancellation ID
     * @param {number} cancellationId - Cancellation ID
     * @returns {Object} Cancellation details
     */
    static async getCancellationDetails(cancellationId) {
        try {
            const query = `
                SELECT * 
                FROM flight_booking_cancellation_details
                WHERE id = ${mysql.escape(cancellationId)}
                LIMIT 1
            `;

            const [result] = await dbPool.query(query);

            if (!result || result.length === 0) {
                return {
                    status: 0,
                    message: "Cancellation details not found",
                    data: null
                };
            }

            return {
                status: 1,
                message: "Cancellation details retrieved successfully",
                data: result[0]
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error retrieving cancellation details",
                data: null
            };
        }
    }

    /**
     * Get booking status
     * @param {string} appReference - App reference
     * @returns {Object} Booking status
     */
    static async getBookingStatus(appReference) {
        try {
            const escaped = mysql.escape(appReference);
            const query = `
                SELECT 
                    id,
                    app_reference,
                    booking_status,
                    total_price,
                    pnr_code,
                    created_at
                FROM flight_booking
                WHERE app_reference = ${escaped}
                LIMIT 1
            `;

            const [result] = await dbPool.query(query);

            if (!result || result.length === 0) {
                return {
                    status: 0,
                    message: "Booking not found",
                    data: null
                };
            }

            return {
                status: 1,
                message: "Booking status retrieved successfully",
                data: result[0]
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error retrieving booking status",
                data: null
            };
        }
    }

    /**
     * Get booking details by app reference
     * @param {string} appReference - App reference
     * @returns {Object} Booking details
     */
    static async getBookingByAppReference(connection, appReference) {

        try {
            const query = `
                SELECT 
                    fb.booking_status,booking_id,fare_type,fbad.pro_code, COUNT(fp.origin) AS total_pax,

                    GROUP_CONCAT(CONCAT(fp.first_name, ' ', fp.last_name) ORDER BY fp.origin ASC  SEPARATOR ', ') AS pax_names

                FROM flight_booking_details fb
                LEFT JOIN flight_booking_online_additional_details fbad
                    ON fbad.app_reference = fb.app_reference
                LEFT JOIN flight_booking_passenger_details fp
                    ON fp.app_reference = fb.app_reference
                WHERE fb.app_reference = ?
                GROUP BY fb.app_reference
                LIMIT 1
            `;
            const [result] = await connection.query(query, [appReference]);

            if (!result || result.length === 0) {
                return {
                    status: 0,
                    message: "Booking not found",
                    data: null
                };
            }

            return {
                status: 1,
                message: "Booking retrieved successfully",
                data: result[0]
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error retrieving booking",
                data: null
            };
        }
    }

    static async BookingDetailByAppReference(connection, appReference) {

        try {
            const query = `
                SELECT 
                    fb.booking_status,fb.booking_id,fb.total_fare,fb.other_fare,fb.agent_commission,fb.app_user_buying_price,fb.api_total_fare
                    ,fb.dist_markup,fbad.supp_locator_code,fbad.pro_locator_code,
                    fbad.uni_locator_code,fbad.pro_code,fbad.supp_code
                FROM flight_booking_details fb
                LEFT JOIN flight_booking_online_additional_details fbad
                    ON fbad.app_reference = fb.app_reference
                WHERE fb.app_reference = ?
                LIMIT 1
            `;

            const [result] = await connection.query(query, [appReference]);

            if (!result || result.length === 0) {
                return {
                    status: 0,
                    message: "Booking not found",
                    data: null
                };
            }

            return {
                status: 1,
                message: "Booking retrieved successfully",
                data: result[0]
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error retrieving booking",
                data: null
            };
        }
    }

    /**
     * Create cancellation record
     * @param {Object} cancellationData - Cancellation details
     * @returns {Object} Insert result
     */
    static async createCancellation(cancellationData) {
        try {
            const fields = Object.keys(cancellationData);
            const values = fields.map(field => mysql.escape(cancellationData[field]));
            const query = `
                INSERT INTO flight_booking_cancellation_details (${fields.join(', ')})
                VALUES (${values.join(', ')})
            `;
            const [result] = await dbPool.query(query);
            if (result.affectedRows === 0) {
                return {
                    status: 0,
                    message: "Failed to create cancellation record",
                    insert_id: null
                };
            }
            return {
                status: 1,
                message: "Cancellation record created successfully",
                insert_id: result.insertId
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error creating cancellation record",
                insert_id: null
            };
        }
    }

    /**
     * Get cancellation charges/fare rules
     * @param {string} slug - Fare rule slug
     * @returns {Object} Fare rules data
     */
    static async getFareRules(slug = 'cancellation_charges') {
        try {
            const escapedSlug = mysql.escape(slug);
            const query = `
                SELECT * 
                FROM flight_fare_rules
                WHERE slug = ${escapedSlug}
                LIMIT 1
            `;

            const [result] = await dbPool.query(query);

            if (!result || result.length === 0) {
                return {
                    status: 0,
                    message: "Fare rules not found",
                    data: []
                };
            }

            return {
                status: 1,
                message: "Fare rules retrieved successfully",
                data: result
            };
        } catch (error) {
            return {
                status: 0,
                message: error.message || "Error retrieving fare rules",
                data: []
            };
        }
    }

    /**
     * Update cancellation details
     * @param {number} cancellationId - Cancellation ID
     * @param {Object} updateData - Data to update
     * @returns {Object} Update result
     */


    static async getPassengerByAppRef(app_ref) {
        try {
            const query = `SELECT first_name,last_name FROM flight_booking_passenger_details WHERE app_reference = ?`;
            const [result] = await dbPool.query(query, [app_ref]);
            return result.length ? result : null;
        } catch (error) {
            return { status: 0, errors: error };
        }
    }

    static async getFlightHoldDetails(app_reference) {
        try {
            const response = {};

            // Booking Details
            const [bookingRows] = await dbPool.query(
                `SELECT * FROM flight_booking_details WHERE app_reference = ? LIMIT 1`,
                [app_reference]
            );
            const data = bookingRows[0];
            if (!bookingRows.length || data.booking_status != 'BOOKING_HOLD') {
                return {
                    status: false,
                    message: "Booking not found",
                    data:[]
                };
            }

            let paxDetails = [];
            let tripInfos = [];
            let additionalDetails = {};
            if (data.status === "newtp") {

                // Passenger Details
                [paxDetails] = await dbPool.query(
                    `SELECT * 
                    FROM flight_booking_passenger_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                // Itinerary
                [tripInfos] = await dbPool.query(
                    `SELECT
                        app_reference,
                        segment_indicator,
                        airline_code,
                        airline_name,
                        flight_number,
                        departure_datetime,
                        arrival_datetime,
                        from_airport_code,
                        to_airport_code,
                        cabin_class,
                        fare_class
                    FROM flight_booking_itinerary_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                // Additional Details
                const [additionalRows] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_online_additional_details
                    WHERE app_reference = ?
                    LIMIT 1`,
                    [app_reference]
                );

                additionalDetails = additionalRows[0] || {};

            } else {

                // Passenger Details
                [paxDetails] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_passenger_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                // Itinerary
                [tripInfos] = await dbPool.query(
                    `SELECT
                        app_reference,
                        airline_code,
                        airline_name,
                        flight_number,
                        departure_datetime,
                        arrival_datetime,
                        from_city,
                        to_city,
                        email,
                        phone,
                        cabin_class,
                        refund_type,
                        fare_class
                    FROM flight_booking_itinerary_details
                    WHERE app_reference = ?`,
                    [app_reference]
                );

                const [additionalRows] = await dbPool.query(
                    `SELECT *
                    FROM flight_booking_online_additional_details
                    WHERE app_reference = ?
                    LIMIT 1`,
                    [app_reference]
                );

                additionalDetails = additionalRows[0] || {};
            }
            const newData = {};
            newData.flight_detail = data;
            newData.travellerInfos = paxDetails;
            newData.travellerInfos = paxDetails;

            response.status  = true;
            response.message = "Booking detail fetched succeefully.";
            if (tripInfos.length > 0) {
                newData.tripInfos = tripInfos;
                newData.last_tickit_date = additionalDetails.last_tickiting_date || null;
                newData.additiona_details = additionalDetails;
            }
            
            response.data = newData;
            //response.travellerInfos = paxDetails;
            return response;

        } catch (error) {
            console.error("getFlightHoldDetails Error:", error);
            throw error;
        }
    }

    static async get_user_detail(user_id) {
        try {
            const query = `
                SELECT 
                    u.user_id,u.first_name,u.last_name,u.uuid,u.user_type,
                    bud.reporting_to_id
                FROM user u
                LEFT JOIN b2b_user_details bud
                    ON bud.user_oid = u.user_id
                WHERE u.user_id = ?
                LIMIT 1
            `;

            const [rows] = await dbPool.query(query, [user_id]);

            return rows.length ? rows[0] : null;

        } catch (error) {
            throw error;
        }
    }
    static async get_dist_user(duser_id) {
        try {
            const query = `SELECT * FROM dist_user_details WHERE user_oid = ?`;
            const [result] = await dbPool.query(query, [duser_id]);
            return result.length ? result : null;
        } catch (error) {
            return { status: 0, errors: error };
        }
    }
    static async getAgentBalance(userId) {
        try {
            const query = `
                SELECT
                    bud.balance,
                    bud.due_amount,
                    cc.country AS currency,
                    cc.value AS conversion_value
                FROM b2b_user_details AS bud
                LEFT JOIN currency_converter AS cc
                    ON cc.id = bud.currency_converter_fk
                WHERE bud.user_oid = ?
                LIMIT 1
            `;

            const [rows] = await dbPool.query(query, [userId]);

            if (!rows.length) {
                return {
                    balance: 0,
                    due_amount: 0,
                    currency: "INR",
                    conversion_value: 1,
                    available_balance: 0
                };
            }

            const row = rows[0];

            return {
                ...row,
                available_balance:
                    Number(row.balance) <= 0
                        ? Number(row.due_amount)
                        : Number(row.balance)
            };
        } catch (error) {
            throw error;
        }
    }
    static async modifyUserBalance(userType, userId, amount) {
        try {
            const response = {};

            if (amount == 0 || userId <= 0) {
                return response;
            }

            // Get user balance details
            const userBalanceDetails = await this.getUserBalanceDetails(userType, userId);
    
            if (!userBalanceDetails) {
                throw new Error("User balance details not found");
            }

            const transactionCurrency = userBalanceDetails.currency || "INR";
            const transactionCurrencyConversionRate = 1;//userBalanceDetails.conversion_value || 1;

            // Convert amount to user's currency
            amount = amount * transactionCurrencyConversionRate;
            let balance = userBalanceDetails.amount + amount;

            let dueAmount = userBalanceDetails.due_amount;
            let creditLimit = userBalanceDetails.credit_limit;

            const updateData = {};
            if (balance > 0) {
                updateData.balance = balance;
                updateData.due_amount = 0;
                response.message = "Transaction Done Successfully";
            } else {
                updateData.balance = 0;
                updateData.due_amount = balance;
                if (Math.abs(balance) > creditLimit) {
                    updateData.credit_limit = Math.abs(balance);
                }
                response.message = "Added to due amount, because of insufficient balance in wallet";
            }
            // Update user balance
            const tableName = `${userType}_user_details`;

            const rr = await dbPool.query(
                `UPDATE ${tableName}
                SET ?
                WHERE user_oid = ?`,
                [updateData, userId]
            );
            response.transaction_currency = transactionCurrency;
            response.transaction_currency_conversion_rate =
                transactionCurrencyConversionRate;

            return response;

        } catch (error) {
            throw error;
        }
    }
    static async getUserBalanceDetails(userType, userId) {
        try {
            const query = `
                SELECT
                    DL.balance,
                    DL.due_amount,
                    DL.credit_limit,
                    (DL.balance + DL.due_amount) AS amount,
                    CC.country AS currency,
                    CC.value AS conversion_value
                FROM ${userType}_user_details AS DL
                INNER JOIN currency_converter AS CC
                    ON CC.id = DL.currency_converter_fk
                WHERE DL.user_oid = ?
                LIMIT 1
            `;

            const [rows] = await dbPool.query(query, [userId]);

            return rows.length ? rows[0] : null;

        } catch (error) {
            throw error;
        }
    }
    static async updateTransactionPaymentStatus(
        transactionType,
        appReference,
        status,
        transactionIds = []
    ) {
        try {
            let tableName = "";

            switch (transactionType.toLowerCase()) {
                case "flight":
                    tableName = "flight_booking_transaction_details";
                    break;

                case "hotel":
                    tableName = "hotel_booking_itinerary_details";
                    break;

                case "bus":
                    tableName = "bus_booking_itinerary_details";
                    break;

                case "train":
                    tableName = "train_booking_details";
                    break;

                case "recharge":
                    tableName = "recharge_data";
                    break;

                case "mt":
                    tableName = "MT_transfer_details";
                    break;

                case "package":
                    tableName = "offline_package_booking_details";
                    break;

                case "insurance":
                    tableName = "insurance_payment_details";
                    break;

                default:
                    throw new Error(`Invalid transaction type: ${transactionType}`);
            }

            let query = `
                UPDATE ${tableName}
                SET payment_status = ?
                WHERE app_reference = ?
            `;

            const params = [status, appReference];

            if (
                Array.isArray(transactionIds) &&
                transactionIds.length > 0 &&
                ["flight", "mt"].includes(transactionType.toLowerCase())
            ) {
                const placeholders = transactionIds.map(() => "?").join(",");
                query += ` AND origin IN (${placeholders})`;
                params.push(...transactionIds);
            }

            await dbPool.query(query, params);

            // Track Log
            // await this.createTrackLog(
            //     appReference,
            //     `${transactionType} TXN PAYMENT ${status}`
            // );

            return appReference;
        } catch (error) {
            throw error;
        }
    }
    static async getDistributorBalance(distId) {
        const [rows] = await dbPool.query(
            `SELECT 
                (DL.balance + DL.due_amount) AS amount,
                CC.country AS currency,
                CC.value AS conversion_value
            FROM dist_user_details AS DL
            INNER JOIN currency_converter AS CC
                ON CC.id = DL.currency_converter_fk
            WHERE DL.user_oid = ?`,
            [distId]
        );

        return rows.length ? rows[0].amount : 0;
    }
    static async checkDistDiStatus(distId) {
        let returnStatus = 0;
        let getFromTable = false;
        const distCacheId = `dist_di_${distId}_dist_di_status`;
        let cacheDiStatus = await getCacheData(distCacheId)
        if (cacheDiStatus) {
            const newStatus = Number(cacheDiStatus) === 2 ? 0 : 1;
            returnStatus = newStatus;
        } else {
            getFromTable = true;
        }
        if (getFromTable) {
            const [rows] = await dbPool.query(
                `SELECT di_status
                FROM dist_user_details
                WHERE user_oid = ?
                LIMIT 1`,
                [distId]
            );
            if(
                rows.length > 0 &&
                rows[0].di_status !== undefined &&
                rows[0].di_status !== null
            ) {
                const resDiStatus = rows[0].di_status;
                await setCacheData(distCacheId, resDiStatus, 604800)
                returnStatus = resDiStatus;
            }
        }
        return returnStatus;
    }
    static generateUniqueReferenceId() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const date =
            pad(now.getDate()) +
            pad(now.getMonth() + 1) +
            String(now.getFullYear()).slice(-2);
        const time =
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
        const random =
            Math.floor(Math.random() * 90 + 10).toString() +
            Math.floor(Math.random() * 90 + 10).toString();
        return `${date}-${time}-${random}`;
    }

    static async generateAppTransactionReference(modPrefix = "REF", addProjectPrefix = true) {
        let ref = "";
        return `${ref}${modPrefix}-${this.generateUniqueReferenceId()}`;
    }





}

module.exports = rideModel;