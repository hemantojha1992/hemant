const dbPool= require('../database/db');
const mysql = require('mysql2');
const moment = require('moment');
const CustomModel = require('./CustomDbModel');
const notifications = require('./moduleModel');
const batch = require('../database/GroupUpdateInsert');

class TourismModel {
    static async getTransactionSummaryForLog(appRef) {
        let con =`app_reference = '${appRef}'`;
        let getCreatedTrans= await CustomModel.selectData('irctc_tourism_agent_fare_details', con);  
        return getCreatedTrans;
    }
    
    static async savecreateTransaction(data) {
        let createTrans= await CustomModel.createItem('irctc_tourism_create_transaction', data);  
        return createTrans;
    }
    static async saveAgentBookingData(data) {
        let agentBook= await CustomModel.createItem('irctc_tourism_agent_booking_data', data);  
        return agentBook;
    }
    static async TranDetailsJson(data) {
        let tranJson= await CustomModel.createItem('irctc_tourism_tran_details_json', data);  
        return tranJson;
    }

    static async saveTransactionSummary(data) {
        let status=0;
        let connection;
        connection = await dbPool.getConnection();
        try{
        await connection.beginTransaction();
            data = data['data'];
          if(typeof data['agentFareDetails']== 'object' ){
            let where = 'user_id = 4648 or user_id = 0 ORDER by user_id desc limit 1';
            let res = await CustomModel.selectFeildData('irctc_tourism_agent_commision','value', where);
            let adminComm;
            if(res.status==1){
                adminComm = (res.result[0].value);
            }
        
            let adminFinalComm = (data['agentFareDetails']['agentCommission']*adminComm)/100;
            const valagentFareDetails = {
                            'gst' : data['agentFareDetails']['gst'],
                            'gstAmount' : data['agentFareDetails']['gstAmount'],
                            'agentCommission' : data['agentFareDetails']['agentCommission'],
                            'adminCommission' : adminFinalComm,
                            'agentBuyingPrice' :(data['agentFareDetails']['agentFare']-(data['agentFareDetails']['agentCommission']-adminFinalComm)),
                            'agentFare' : data['agentFareDetails']['agentFare'],
                            'commissionPersentage' : data['agentFareDetails']['commissionPersentage'],
                            'totalAmtExclGstComm' : data['agentFareDetails']['totalAmtExclGstComm'],
                            'totalAmount' : data['agentFareDetails']['totalAmount'],
                            'tds' : data['agentFareDetails']['tds'],
                            'agntGST' : data['agentFareDetails']['agntGST'],
                            'agntCGST' : data['agentFareDetails']['agntCGST'],
                            'agntSGST' : data['agentFareDetails']['agntSGST'],
                            'agntIGST' : data['agentFareDetails']['agntIGST'],
                            'created_by' : '4648',
                            'created_datetime': moment().format('YYYY-MM-DD HH:mm:ss'),
                            'app_reference':data['app_reference']
                        };

            await CustomModel.createItem('irctc_tourism_agent_fare_details', valagentFareDetails);
            }

            if(typeof data['lstPessenger']== 'object' ){
            for (const val of data['lstPessenger']) {
                    const valLstPessenger = {
                    age: val.age,
                    gender: val.gender,
                    name: val.name,
                    transactionId: val.transactionId,
                    paxtype: val.paxtype,
                    firstName: val.firstName,
                    lastName: val.lastName,
                    isSelectCancel: val.isSelectCancel,
                    created_by: '4648',
                    created_datetime: moment().format('YYYY-MM-DD HH:mm:ss'), // Assuming equivalent of db_current_datetime()
                    app_reference: data.app_reference,
                    };
                
                await CustomModel.createItem('irctc_tourism_passenger_details', valLstPessenger);
                }

            }

            if(typeof data['accomLst']== 'object' ){
                for (const val of data['accomLst']) {
                    const accdetails  = {
                        details: val.details,
                        price: val.price,
                        adult: val.adult,
                        child: val.child,
                        child24: val.child24,
                        room_No: val.room_No,
                        roomNumber: val.roomNumber,
                        basePrice: val.basePrice,
                        oldAccom: val.oldAccom,
                        toCan: val.toCan,
                        created_by: '4648',
                        created_datetime: moment().format('YYYY-MM-DD HH:mm:ss'), // Assuming equivalent of db_current_datetime()
                        app_reference: data.app_reference,
                    };
                    
                    
                    await CustomModel.createItem('irctc_tourism_accom_details', accdetails);
                }
    
            }

                    // Unset properties from the object
            delete data['agentFareDetails'];
            delete data['lstPessenger'];
            delete data['accomLst'];

        // Set the 'created_by' property
        data.created_by = '4648';

            const fData = {
                transactionId: data.transactionId,
                mastertransactionId: data.mastertransactionId,
                boardingStation: data.boardingStation,
                category: data.category,
                deboardingStation: data.deboardingStation,
                nationality: data.nationality,
                contact: data.contact,
                nomineeContact: data.nomineeContact,
                nomineeName: data.nomineeName,
                nomineeRelation: data.nomineeRelation,
                numberOfPassenger: data.numberOfPassenger,
                pckgCode: data.pckgCode,
                state: data.state,
                tour_Starting_Date: new Date(data.tour_Starting_Date).toISOString().split('T')[0], // Assuming date is in 'YYYY-MM-DD' format
                emailId: data.emailId,
                mealAmount: data.mealAmount,
                secAmount: data.secAmount,
                catAmount: data.catAmount,
                cityId: data.cityId,
                stateId: data.stateId,
                country: data.country,
                idCardType: data.idCardType,
                idCardNumber: data.idCardNumber,
                custMobile: data.custMobile,
                totalAmount: data.totalAmount,
                bookingAmount: data.bookingAmount,
                gstAmount: data.gstAmount,
                fareClassId: data.fareClassId,
                booking_type: data.booking_type,
                boardingStationCode: data.boardingStationCode,
                deboardingStationCode: data.deboardingStationCode,
                baseFare: data.baseFare,
                userId: data.userId,
                showSummary: data.showSummary,
                completeAddress: data.completeAddress,
                street: data.street,
                doPartialbooking: data.doPartialbooking,
                pincode: data.pincode,
                poolcode: data.poolcode,
                bookedSeat: data.bookedSeat,
                created_by: '4648',
                created_datetime: new Date().toISOString(), // Assuming equivalent of db_current_datetime()
                app_reference: data.app_reference,
            };
            
        await CustomModel.createItem('irctc_tourism_summary_details', fData);
            status=1;
            await connection.commit();
            connection.release(); 
            return status;
        }
       catch (error) {
        if (connection) {
          await connection.rollback();
          return status;
        }

      }
    }
    
    static async getAllCancellationRecords(condition, getData,refund_type = 'auto_refund',offset = 0, limit = 500) {
       
        let UserId='4648';
        let conditionStr = '';
        // condition, getData
      
        if (condition && typeof condition.st !== 'undefined') {
            const st = getData.st;
            
            conditionStr += `WHERE TCD.status=17 AND TBCD.app_reference LIKE '%${st}%' OR TCD.transaction_id LIKE '%${st}%' OR TCD.name LIKE '%${st}%' AND TBD.created_by='4648' `;
        } else {
            condition = getCustomCondition(condition);
           
            conditionStr += ' Where TCD.status=17' +condition;
            }
        
        const sql = 'SELECT TBCD.app_reference,TBCD.manual_refund, TBCD.created_datetime, TBCD.id, TBD.msg as remarks,refund_ammount AS amount_refund , charges AS amount_deducted, TBCD.created_datetime,TCD.pax_id,TCD.name,TCD.txn_code,TCD.transaction_id, U.user_id, U.user_type, U.uuid, U.first_name, TBD.chargeType AS torism_refund_type, AU.user_id AS agent_user_id, AU.user_type AS agent_user_type, AU.uuid AS agent_uuid, AU.first_name AS agent_first_name, TCD.name as pax_name, count(TCD.name) as total_per FROM irctc_tourism_cancellation_booking_details AS TBCD INNER JOIN irctc_tourism_cancellation_charges AS TBD ON TBCD.app_reference = TBD.app_reference INNER JOIN user AS AU ON AU.user_id = TBD.created_by INNER JOIN user AS U ON U.user_id = TBCD.created_by INNER JOIN irctc_tourism_cancellation_pax_details AS TCD ON TCD.app_reference=TBD.app_reference '+conditionStr+' GROUP BY TBCD.app_reference ORDER BY TBCD.id  LIMIT ' + offset + ' , ' + limit;
         
        const result = await dbPool.query(sql);
        const numRows = result[0].length;
        return {
            numRows:numRows,
            result:result[0]
        };
	}


    static async updateItems(tableName,data,con) {
        const keysArray = Object.keys(data);
        const valuesArray = Object.values(data);
        const key = Object.keys(con)[0];
        const value = con[key];

        try {
            const sql = 'UPDATE ' + tableName + ' SET '+keysArray[0]+'= ? WHERE ' +key+ '=?';
            const result = await dbPool.query(sql, [valuesArray, value]);
            
            const affectedRows = result[0] ? result[0].affectedRows : 0;
          // Check if any rows were affected by the update
            if (result && affectedRows > 0) {
                return result[0];
            } else {
                throw new Error('Key Not found');
            }
        } catch (error) {
            console.error('Error while updating data:', error);
            throw new Error('Failed to update data');
        }
    }

    static async createItem(tableName,data) {
      
        try{
            // Constructing the dynamic insert query
            const columns = Object.keys(data).join(', ');
            const values = Object.values(data).map(value => (value !== null ? `'${value}'` : 'NULL')).join(', ');

            const insertQuery = 'INSERT INTO '+ tableName + '('+columns+')VALUES ('+values+')';

            // const sql = 'INSERT INTO '+tableName+'(name, email, password, age) VALUES (?, ?, ?, ?)';
            const [result] = await dbPool.query(insertQuery);
            if(result.insertId){
                const data = {
                    status: 1,
                    insert_id: result.insertId/* Replace with the actual insert_id from your database library or method */,
                  };
                  return data;
            }
        }catch (error) {
            console.error('Error inserting data:', error.message);
            throw error; // Re-throw the error for the calling code to handle
          } 
    }

    static async saveTransactionAndUpdateagentBalance(app_ref,ref_amm,pax_ids,code) {
      
        const currency = CURRENCY;
        const currency_conversion_rate = CURRENCY_CON_RATE;

        const getdata =await notifications.getAgentbalance('4648');
                // Assuming pax_id, agent_current_balance, and fare are variables
        const pax_id = pax_ids;
        const agent_current_balance = getdata[0].wallet_balance;
        const fare = ref_amm;

        let closing_balance;
        let transaction_type;
        let fares;
        let remark;

        if (pax_id !== 0 && pax_id !== '') {
            closing_balance = agent_current_balance + parseFloat(fare);
            transaction_type = 'irctc_tourism_refund';
            fares = parseFloat(fare);
            remark = 'IRCTC TOURISM BOOKING REFUND';
        } else {
            closing_balance = agent_current_balance - parseFloat(fare);
            transaction_type = 'irctc_tourism';
            fares = -parseFloat(fare);
            remark = 'IRCTC TOURISM BOOKING';
        }

        const agent_logs = {
            // 'system_transaction_id': generate_unique_reference_id(),
            'system_transaction_id': '',
            'transaction_type': transaction_type,
            'opening_balance': parseFloat(agent_current_balance),
            'closing_balance': parseFloat(closing_balance),
            'app_reference': app_ref,
            'fare': parseFloat(fares),
            'remarks': remark,
            'transaction_owner_id': '4648',
            'created_by_id': '4648',
            'created_datetime': new Date().toISOString(), // equivalent to date('Y-m-d H:i:s')
            'currency': currency??'INR',
            'currency_conversion_rate': currency_conversion_rate,
        };

        // Assuming pax_id, code, app_reference, and this.custom_db are variables with appropriate values
       this.createItem('transaction_log',agent_logs);
        if (pax_id && pax_id.length > 0) {
            for (let i = 0; i < pax_id.length; i++) {
                const con ={ 'pax_id': pax_id[i] };
                const txnCode ={ 'txn_code': 'Refunded' };
                this.updateItems('irctc_tourism_cancellation_pax_details', txnCode, con);
            }

            if (code === 'ManualRefund') {
                const Ref_arr ={ 'manual_refund': 'Y' };
                const  Refcon ={ 'app_reference': app_ref};
                this.updateItems('irctc_tourism_cancellation_booking_details', Ref_arr, Refcon);
                
            }
        }

        const bal_update ={ 'balance': closing_balance };
        const condition ={ 'user_oid': '4648'};
        this.updateItems('b2b_user_details', bal_update, condition);
    }

    static async deleteItem(id) {
        // Add code to delete an item from the database
    }

    static async setCancellationData(app_ref,resp) { 
     // Call getCancellationdata
    const cancellationData = await this.getCancelltiondata(app_ref);
    //let status = 'FAILURE_STATUS';
       
    if (resp && resp.paxDetails && resp.accomDetails && resp.bookingDetails) {
      
        try {
            const insertPax = [];
            const insertAccom = [];
            const insertBooking = [];

            const user_id = '4648'; // Assuming this.entity_user_id is defined somewhere

            // ... (Rest of the logic to populate insertPax, insertAccom, and insertBooking arrays)

            
                
            if (Array.isArray(resp.paxDetails)) {
                        resp.paxDetails.forEach((val, key) => {
                          
                            const { PAX_NO, NAME, AGE, GENDER, STATUS, TXN_CODE, ID, TRANSACTION_ID } = val;
                            insertPax[key] = {
                                app_reference: app_ref,
                                pax_no: PAX_NO,
                                name: NAME,
                                age: AGE,
                                gender: GENDER,
                                status: STATUS,
                                txn_code: TXN_CODE,
                                pax_id: ID,
                                transaction_id: TRANSACTION_ID,
                                created_by: user_id,
                                created_datetime: moment().utc().format('YYYY-MM-DD HH:mm:ss'),
                            };
                        });
                        
                    }

                    if (Array.isArray(resp.accomDetails)) {
                        resp.accomDetails.forEach((val, key) => {
                            const { ID, TRANSACTION_ID, DETAILS, PRICE, ADULT, CHILD, ROOM_NO, CREATE_DATE, MODIFIED_DATE, ROOM_NUMBER, BASE_FARE, CHILD2TO4, OLD_ACCOM } = val;
                            insertAccom[key] = {
                                app_reference: app_ref,
                                accom_id: ID,
                                transaction_id: TRANSACTION_ID,
                                details: DETAILS,
                                price: PRICE,
                                adult: ADULT,
                                child: CHILD,
                                room_no: ROOM_NO,
                                create_date: CREATE_DATE,
                                modified_date: MODIFIED_DATE,
                                room_number: ROOM_NUMBER,
                                base_fare: BASE_FARE,
                                child2to4: CHILD2TO4,
                                old_accom: OLD_ACCOM,
                                created_by: user_id,
                                created_datetime: moment().utc().format('YYYY-MM-DD HH:mm:ss'),
                            };
                        });
                    }

                    if (Array.isArray(resp.bookingDetails)) {
                        
                        resp.bookingDetails.forEach((val, key) => {
                            const { CHILD_REFUND_STAUS, refundStaus, PCKG_CODE, BOOKING_ID, TXN_ID, PCKG_NAME, CURRENT_PAYMENT_STATUS, PTI, STATUS, RESERV_STATUS, PAYMENT_STATUS, ONWARD_TRAIN_NUMBER, ONWARD_TRAIN_NAME, BOARDING_STATION, BOARDING_STATION_CODE, DEBOARDING_STATION, DEBOARDING_STATION_CODE, JURNY_DATE, FARE_CLASS, BOOKING_DATE,TRANSACTION_ID } = val;
                            insertBooking[key] = {
                                app_reference: app_ref,
                                child_refund_staus: CHILD_REFUND_STAUS,
                                refund_staus: JSON.stringify(refundStaus),
                                pckg_code: PCKG_CODE,
                                booking_id: BOOKING_ID,
                                txn_id: TXN_ID,
                                pckg_name: PCKG_NAME,
                                current_payment_status: CURRENT_PAYMENT_STATUS,
                                pti: PTI,
                                status: STATUS,
                                reserv_status: RESERV_STATUS,
                                payment_status: PAYMENT_STATUS,
                                onward_train_number: ONWARD_TRAIN_NUMBER,
                                onward_train_name: ONWARD_TRAIN_NAME,
                                boarding_station: BOARDING_STATION,
                                boarding_station_code: BOARDING_STATION_CODE,
                                deboarding_station: DEBOARDING_STATION,
                                deboarding_station_code: DEBOARDING_STATION_CODE,
                                jurny_date: JURNY_DATE,
                                fare_class: FARE_CLASS,
                                booking_date: BOOKING_DATE,
                                transaction_id: TRANSACTION_ID,
                                created_by: user_id,
                                created_datetime: moment().utc().format('YYYY-MM-DD HH:mm:ss'),
                            };
                        });
                    }
                   
            
            if (resp.refundStaus && resp.refundStaus !== '') {
                // Example usage:
                    let updatesDatas = [
                        {
                            tableName: 'irctc_tourism_cancellation_pax_details',
                            data:  insertPax ,
                            whereKey: 'pax_id',
                        },
                        {
                            tableName: 'irctc_tourism_cancellation_accom_details',
                            data: insertAccom,
                            whereKey: 'app_reference',
                        },
                        {
                            tableName: 'irctc_tourism_cancellation_booking_details',
                            data: insertBooking,
                            whereKey: 'app_reference',
                        },
                        // Add more updates as needed
                    ];
                    
                    let connection = await batch.batchUpdate(updatesDatas);
            } else {
                const booking_detailsrow = await this.getCancelltiondata(app_reference);

                if (!booking_detailsrow || booking_detailsrow.length === 0) {
                    let inserts = [
                        {
                            tableName: 'irctc_tourism_cancellation_pax_details',
                            data:  insertPax ,
                        },
                        {
                            tableName: 'irctc_tourism_cancellation_accom_details',
                            data: insertAccom,
                        },
                        {
                            tableName: 'irctc_tourism_cancellation_booking_details',
                            data: insertBooking,
                        },
                        // Add more updates as needed
                    ];
                    let connection = await batch.batchInsert(inserts);
                  
                }
            }
    }catch (error) {
            console.error(error);
            await connection.rollback();
        }

    }
}
    
    static async getCancelltiondata(app_ref) { 
        const sql = 'SELECT bd.*,pd.*,ad.* FROM `irctc_tourism_cancellation_booking_details` as bd JOIN irctc_tourism_cancellation_pax_details as pd on pd.app_reference = bd.app_reference JOIN irctc_tourism_cancellation_accom_details as ad on ad.app_reference = bd.app_reference WHERE bd.app_reference =?';
     
        const result = await dbPool.query(sql, [app_ref]);
        
        
        return result[0];
    }
    static async getToken() {
        const sql = 'select * from irctc_tourism_login_token order by origin desc limit 1';  
       
        const result = await dbPool.query(sql);
        
        return result[0];
    }

    static async getAllRecords(condition, getData) {
       
        let UserId='4648';
        let conditionStr = '';
        // condition, getData
       
        if (condition && condition.st!==undefined) {
            conditionStr = condition.st.trim();
            conditionStr += ' AND ';
        } else {
           
            // if (getData !== undefined) {
                if (typeof getData.st !== 'undefined')  {        
                    const st = getData.st;
                    conditionStr += `(ab.app_reference LIKE '%${st}%' OR JSON_EXTRACT(json, '$.PACKAGE_DETAIL[0].PCKG_NAME') LIKE '%${st}%' OR JSON_EXTRACT(json, '$.PESSENGER_DETAIL[0].TXN_CODE') LIKE '%${st}%' OR sd.custMobile LIKE '%${st}%' OR pd.name LIKE '%${st}%') AND `;
                } else if (getData.app_reference !== '' || getData.phone !== '' || getData.status !== '' || getData.created_datetime_from !== '' || getData.created_datetime_to !== '') {
                    const st = getData.app_reference || '';
                    const phone = getData.phone || '';
                    const status = getData.status || '';
                    const from = getData.created_datetime_from;
                    const to = getData.created_datetime_to;
                    // const toDate = to ? new Date(to).toISOString().split('T')[0] : '';
                    // const fromDate = from ? new Date(from).toISOString().split('T')[0] : '';
                
                    if (st !== '') {
                        conditionStr += `(ab.app_reference LIKE '%${st}%' OR JSON_EXTRACT(json, '$.PESSENGER_DETAIL[0].TXN_CODE') LIKE '%${status}%') AND `;
                    }
    
                    if (phone !== '') {
                        conditionStr += `sd.custMobile LIKE '%${phone}%' OR `;
                    }
    
                    const date = from ? from : to;
    
                    if (from !== undefined && from !== '1970-01-01' && to !== undefined && to !== '1970-01-01') {
                        const con = `ab.created_datetime BETWEEN '${fromDate}' AND '${toDate}'`;
                        conditionStr += `${con} AND `;
                    } 
                    //else {
                    //     if (date !== '1970-01-01') {
                    //         conditionStr += `DATE(ab.created_datetime)='${date}' AND `;
                    //     }
                    // }
                } else {
                    conditionStr = '';
                }
            }
        //}
        
        // if (getData.travel_from_date !== '' && getData.travel_from_date !== '1970-01-01') {
        //     const travelDate = new Date(getData.travel_from_date).toISOString().split('T')[0];
        //     conditionStr += `(JSON_EXTRACT(json, '$.TRANSACTION_DETAIL[0].BOARDING_DATE') = '${travelDate}') AND `;
        // }
       
        if (getData.created !== undefined) {
            console.log(dateToday);
            const dateToday = new Date().toISOString().split('T')[0];
            const dates = getData.created;
            
            if (dateToday === getData.created) {
                conditionStr += `DATE(ab.created_datetime)= '${dates}' AND `;
            } else {
                conditionStr += `DATE(ab.created_datetime)>= '${dates}' AND `;
            }
        }
        
        // && getData.created !== '1970-01-01' && getData.travel_from_date === '' && getData.travel_from_date !== '1970-01-01'
    
        if (!conditionStr || conditionStr === '') {
            const dateToday = new Date().toISOString().split('T')[0];
            conditionStr += `DATE(ab.created_datetime)= '${dateToday}' AND `;
        }
        const sql = 'SELECT pd.name ,sd.nomineeName,ab.payment_URL,sd.custMobile,dj.json,ab.created_datetime,ab.created_by,ab.app_reference,afd.agentCommission,afd.gstAmount,afd.agentBuyingPrice,afd.adminCommission FROM `irctc_tourism_agent_booking_data` as ab  JOIN irctc_tourism_agent_fare_details as afd on afd.app_reference = ab.app_reference JOIN irctc_tourism_tran_details_json as dj on dj.app_reference = ab.app_reference JOIN irctc_tourism_summary_details as sd on dj.app_reference = ab.app_reference JOIN irctc_tourism_passenger_details as pd on dj.app_reference = ab.app_reference WHERE  '+conditionStr+' ab.created_by=? group by ab.app_reference order by ab.id desc';
       
        const result = await dbPool.query(sql, [UserId]);
        // const numRows = result[0].length;
        // console.log(numRows);
        return result[0];
        
	}

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

    static async getTicketData(app_Ref)
	{
        let UserId='4648';
        const sql = 'SELECT bd.json, gd.* FROM `irctc_tourism_tran_details_json` as bd JOIN irctc_tourism_agent_fare_details gd ON gd.app_reference = bd.app_reference WHERE bd.created_by = ? AND bd.app_reference = ?';
        const result = await dbPool.query(sql, [UserId, app_Ref]);
        return result[0];
	}

    static async stationCode(sationName) {
        try {
            let raw_search_chars = dbPool.escape(sationName);
            let r_search_chars = dbPool.escape(sationName + '%');

            let search_chars = dbPool.escape('%' + sationName + '%');

            const query = 'Select origin,name,code from train_stations where name like ' + search_chars + ' OR code like ' + search_chars + 'OR city like ' + search_chars + ' ORDER BY top_destination DESC , CASE WHEN	name LIKE' + raw_search_chars + 'THEN 1 WHEN	code LIKE' + raw_search_chars + 'THEN 2 WHEN	city LIKE' + raw_search_chars + 'THEN 3 WHEN	name LIKE' + r_search_chars + 'THEN 11 WHEN code LIKE' + r_search_chars + 'THEN 12 WHEN	city LIKE' + raw_search_chars + 'THEN 13 WHEN name LIKE' + search_chars + 'THEN 21 WHEN	code			LIKE	' + search_chars + 'THEN 22 WHEN city LIKE' + raw_search_chars + ' THEN 23 ELSE 31 END LIMIT 0, 20';

            const result = await dbPool.pool.query(query);

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
                    value = `${key} BETWEEN ${startDate} AND ${endDate}`;
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

            sql += " where " + whereClause + " ORDER BY BD.origin DESC limit 0,500";
            console.log(sql)
            // sql+= ' where BD.created_datetime >= "2023-10-26 00:00:00" AND BD.created_datetime <= "2023-12-12 23:59:59" AND BD.created_by_id = 4648 AND BD.status != "BOOKING_INPROGRESS"  order by BD.origin desc limit 0, 500';

        }
        console.log(sql);
        const [result] = await dbPool.query(sql);
        return result
    }
    static async getBookingSingleData(app_reference) {
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
    } catch(error) {
        console.error('Error:', error);
        return false;
    }
    // console.log(result)


}
function getCustomCondition(cond) {
    let sql = ' AND ';
    if (isValidArray(cond)) {
        for (const [k, v] of Object.entries(cond)) {
            sql += `${v[0]} ${v[1]} '${v[2]}' AND `;
        }
    }
    sql = sql.slice(0, -5); // Remove the trailing ' AND '
    return sql;
}

function isValidArray(arr) {
    return Array.isArray(arr) && arr.length > 0;
}

module.exports = TourismModel;