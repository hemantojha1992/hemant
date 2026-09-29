let dbPool = require('../database/db1');
const moment = require('moment');
const mysql = require('mysql2');

const CustomModel = require('../models/CustomDbModel');

class Flight {
    static async getUserFlightCommission(createdById=null,createdFor,creationSource,moduleType,userId) {
        let conditionStr=` WHERE creation_source = '${creationSource}' AND created_for ='${createdFor}' AND module_type='${moduleType}'`;
        let numRows,result;
        let query;
                    
            if(createdById && createdById!=='' || createdById!==null){
                  
                conditionStr += ` AND created_by_id = '${createdById}'` ;    
            }
            conditionStr += ` AND user_oid = '${userId}'` ; 
            
         query = 'select * FROM markup_list' + conditionStr;
        result = await dbPool.query(query);
        numRows = result[0].length;
        console.log(numRows);
         if(numRows>0){
            result = result[0];
        }else{
            conditionStr='';
            conditionStr=` WHERE creation_source = '${creationSource}' AND created_for ='${createdFor}' AND module_type='${moduleType}'`;
           
            if(createdById && createdById!=='' || createdById!==null){
                  
                conditionStr += `  AND created_by_id = '${createdById}'` ; 
                  
             }
                conditionStr += `  AND user_oid = 0` ; 
             
      
            query = 'select * FROM markup_list' + conditionStr;
            result = await dbPool.query(query);
        }
       
       return result[0];
     } 
     
    static async getReschedulingDetails(select='*',con){
        let where = '';
        if(con && con.length>0 || con !==undefined){
            where = ' WHERE '+con;
           }
        
        let query = `SELECT ` +select+ ` FROM  flight_rescheduling_details JOIN flight_booking_details ON flight_rescheduling_details.app_reference = flight_booking_details.app_reference `+where;
         const result = await dbPool.query(query);
      
         return result[0]
      
    }
    
    static async getFlightOnlineBookingReports(tableName,condition=[],getData=[],) {
        let conditionStr='';
         let query;
        
                 if (typeof getData === 'object' && getData !== null) {
                    
                 if(getData['app_reference'] && getData['app_reference']!==''){
                  
                    conditionStr += ` AND app_reference = '${getData['app_reference']}'` ;    
                 }
             
                 if(getData['created_datetime_from'] && getData['created_datetime_from']!=''){
                    // minvalue = date('Y-m-d',strtotime(getData['created_datetime_from']))+' 00:00:00';
                     const minvalue = moment(getData['created_datetime_from'], 'YYYY-MM-DD').format('YYYY-MM-DD')+' 00:00:00';
                    
                     conditionStr += ` AND created_datetime >= '${minvalue}'`;
                     if(getData['created_datetime_to'].length>0){
                        const maxvalue =  moment(getData['created_datetime_to'], 'YYYY-MM-DD').format('YYYY-MM-DD')+' 23:59:59';
                        conditionStr += ` AND created_datetime <= '${maxvalue}'`; 
                     }
                 }
                 
                 if(getData['email'] && getData['email']!==''){
                    conditionStr += ` AND email like  '%${getData['email']}%'` ;    
                 }
                  
                 if(getData['phone'] && getData['phone']!==''){
                    conditionStr += ` AND phone like  '%${getData['phone']}%'` ;    
                 }
                  
                 if(getData['pnr'] && getData['pnr']!==''){
                    conditionStr += ` AND data like  '%${getData['pnr']}%'` ;    
                 }
                 
                 if(getData['status'] && getData['status']!='All' && getData['status']!='all'){
                   conditionStr += ` AND status like '${getData['status']}'`;
                  }     
                 
             }
            
         query = `SELECT *  FROM ` + tableName +  `  WHERE created_by_id = '4648'`+conditionStr;
        
         const result = await dbPool.query(query);
         const numRows = result[0].length;
         return {
             numRows:numRows,
             result:result[0]
         };
     } 

     static async getHotDealsReports(tableName,condition=[],getData=[],) {
        let conditionStr=' WHERE ';
         let query;
                if (condition.length > 0) {
                 conditionStr+=` cb.` +  condition;
                 }  

                 if (typeof getData === 'object' && getData !== null) {
                    
                 if(getData['app_reference'] && getData['app_reference']!==''){
                  
                    conditionStr += ` AND cb.app_reference = '${getData['app_reference']}'` ;    
                 }
             
                 if(getData['created_datetime_from'] && getData['created_datetime_from']!=''){
                    // minvalue = date('Y-m-d',strtotime(getData['created_datetime_from']))+' 00:00:00';
                     const minvalue = moment(getData['created_datetime_from'], 'DD-MM-YYYY').format('YYYY-MM-DD')+' 00:00:00';
                     const maxvalue =  moment(getData['created_datetime_to'], 'DD-MM-YYYY').format('YYYY-MM-DD')+' 23:59:59';
                     conditionStr += ` AND cb.created_datetime >= '${minvalue}'`;
                     conditionStr += ` AND cb.created_datetime <= '${maxvalue}'`; 
                 }
      
                 if(getData['status'] && getData['status']!='All' && getData['status']!='all'){
                   conditionStr += ` AND cb.status = '${getData['status']}'`;
                  }     
                 
             }
            
         query = `select cb.*,cd.* ,(select count(*) from crs_booking_customer_details CDS WHERE CDS.crs_origin_id=cb.origin ) as pax_count from crs_booking_itnary_details as cb Join crs_booking_customer_details as cd on cd.crs_origin_id=cb.origin`+conditionStr+` group by cb.app_reference`;
       
         const result = await dbPool.query(query);
         const numRows = result[0].length;
         return {
             numRows:numRows,
             result:result[0]
         };
     } 
  
    static async onlineBookingCalcellationReport(getData) {
       let conditionStr='';
        let query;
       
                if (typeof getData === 'object' && getData !== null) {
                   
                if(getData['app_reference'] && getData['app_reference']!==''){
                 
                   conditionStr += ` AND fb.app_reference like  '${getData['app_reference']}'` ;    
                }
            
                if(getData['created_datetime_from'] && getData['created_datetime_from']!=''){
                   // minvalue = date('Y-m-d',strtotime(getData['created_datetime_from']))+' 00:00:00';
                   
                    const minvalue = moment(getData['created_datetime_from'], 'YYYY-MM-DD').format('YYYY-MM-DD')+' 00:00:00';
                    const maxvalue =  moment(getData['created_datetime_to'], 'YYYY-MM-DD').format('YYYY-MM-DD')+' 23:59:59';
                    conditionStr += ` AND fb.created_at >= '${minvalue}'`;
                    conditionStr += ` AND fb.created_at <= '${maxvalue}'`; 
                }
                
                if(getData['online_status'] && getData['online_status']!='All' && getData['online_status']!='all'){
                  conditionStr += ` AND fb.status like '${getData['online_status']}'`;
                 }
                
            }
           
        query = `SELECT fb.*  FROM flight_booking_cancellation_details AS fb LEFT JOIN flight_booking_details AS fbd ON fbd.app_reference=fb.app_reference  WHERE fbd.created_by_id = '4648'`+conditionStr;
        
        const result = await dbPool.query(query);
        const numRows = result[0].length;
        return {
            numRows:numRows,
            result:result[0]
        };
    } 

    static async getRefundData(condition, count = 0, offset = 0, limit = 100000000000) {
        
        let conditionStr = getCustomCondition(condition);   
        let query;
        query = `SELECT FCD.app_reference,FCD.cancellation_id,FCD.reason,FCD.admin_remarks,FCD.created_datetime,
        FCD.block_user_id,FCPD.status AS current_status,FCPD.currency_conversion_rate,
        FCPD.processed_datetime AS cancellation_processed_on,
          user.uuid, user.agency_name, user.first_name,user.phone,
        CASE WHEN FCD.API_RefundedAmount > 0 THEN FCD.API_RefundedAmount ELSE sum(FCPD.refund_amount) END AS API_RefundedAmount,
        CASE WHEN FCD.API_CancellationCharge > 0 THEN FCD.API_CancellationCharge ELSE sum(FCPD.cancellation_charge+FCPD.airline_cancellation_charge) END AS API_CancellationCharge
        FROM flight_cancellation_details AS FCD
        INNER JOIN flight_cancellation_passenger_details AS FCPD ON FCD.origin=FCPD.fc_origin
        INNER JOIN flight_booking_passenger_details AS FBPD ON FBPD.origin=FCPD.p_origin
        INNER JOIN user ON FCD.created_by_id=user.user_id
        WHERE FCPD.status NOT IN('CANCEL_INITIALIZED') AND FCD.created_by_id = '4648'` +conditionStr +`
        GROUP BY FCD.cancellation_id`;

        // console.log(query);
   
       // query += `ORDER BY FCD.origin DESC limit ` + offset + `, ` + limit;
        
       
        const result = await dbPool.query(query);
        const numRows = result[0].length;
        return {
            numRows:numRows,
            result:result[0]
        };
        // if (data && parseInt(data.total) > 0) {
        //     return 0;
        // } else {
        //     return 1;
        // }
    }

    static async isDomesticFlight(fromLoc, toLoc) {
        let airportCityCodes = '';
    
        if (Array.isArray(fromLoc) || Array.isArray(toLoc)) { // Multicity
            const airportCities = [...new Set([...fromLoc, ...toLoc])];
            airportCityCodes = airportCities.map(city => `"${city}"`).join(',');
        } else { // Oneway/RoundWay
            airportCityCodes = `"${fromLoc}","${toLoc}"`;
        }
    
        const query = `SELECT count(*) total FROM flight_airport_list WHERE airport_code IN (${airportCityCodes}) AND country != "India"`;
        const data = await dbPool.query(query);
        if (data && parseInt(data.total) > 0) {
            return 0;
        } else {
            return 1;
        }
    }

    static async cleanSearchData(tempSearchData){
        let success = 1;
        const cleanSearch = {};
         //let depature=moment(tempSearchData.depature, 'DD-MM-YYYY').format('YYYY-MM-DD');
         const dateTimeString = new Date();
         const dateOnly = moment(dateTimeString,'YYYY-MM-DD').format('DD-MM-YYYY');           
    // make sure dates are correct
    if (tempSearchData.trip_type !== undefined) {
        if (tempSearchData.fare_type) {
            cleanSearch.fare_type = tempSearchData.fare_type;
        }

        cleanSearch.isDirectFlight = 1;
        cleanSearch.isConnectingFlight = '';

        if (tempSearchData.isDirectFlight && tempSearchData.isDirectFlight === 'isDirectFlight') {
            cleanSearch.isDirectFlight = 1;
        }

        if (tempSearchData.isConnectingFlight && tempSearchData.isConnectingFlight === 'isConnectingFlight') {
            cleanSearch.isConnectingFlight = 1;
        }

        cleanSearch.trip_type = tempSearchData.trip_type;
        cleanSearch.search_type = tempSearchData.search_type;
       
        if (tempSearchData.trip_type !== 'multicity') {
           // Convert date strings to the format 'YYYY-MM-DD'
            const [day1, month1, year1] = tempSearchData.depature.split('-').map(Number);
            const [day2, month2, year2] = dateOnly.split('-').map(Number);

            const date1 = new Date(year1, month1 - 1, day1);
            const date2 = new Date(year2, month2 - 1, day2);
            if (date1 >= date2) {
                cleanSearch.depature = tempSearchData.depature;
            } else {
                success = 0;
            }
          
          
            // If round way make sure return date is correct;
            if (tempSearchData.trip_type == 'circle' || tempSearchData.trip_type === 'gdsspecial' || tempSearchData.trip_type === 'special_return') {
                cleanSearch.trip_type_label = (tempSearchData.trip_type === 'circle') ? 'Round Trip' :
                    (tempSearchData.trip_type === 'gdsspecial') ? 'GDS Special' : 'Special Round Trip';
//&& new Date(tempSearchData.return) >= new Date(tempSearchData.depature)
                if (tempSearchData.return > dateOnly ) {
                    cleanSearch.return = tempSearchData.return;
                }
                //  else {
                //     success = 0;
                // }
            } else {
                cleanSearch.trip_type_label = 'One Way';
            }
           // console.log(cleanSearch,success);

            // departure airport
            if (tempSearchData.from !== undefined) {
                cleanSearch.from = tempSearchData.from;
                cleanSearch.from_loc_id = tempSearchData.from_loc_id || '';
            } else {
                success = 0;
            }
           

            // arrival airport
            if (tempSearchData.to !== undefined) {
                cleanSearch.to = tempSearchData.to;
                cleanSearch.to_loc_id = tempSearchData.to_loc_id || '';
            } else {
                success = 0;
            }
          
            if (success==1) {
              
                    let cond = `origin IN  (` + tempSearchData.from_loc_id + `,` + tempSearchData.to_loc_id + `)`;
                
                    let f_array = await CustomModel.selectData('flight_airport_list',cond);
              
                   const fc = {};
                    f_array.result.forEach(v => {
                    fc[v.origin] = v;
                   });   
                    cleanSearch.to_loc = fc[tempSearchData.to_loc_id].airport_code,
                    cleanSearch.from_loc = fc[tempSearchData.from_loc_id].airport_code,
                    cleanSearch.from_loc_country = fc[tempSearchData.from_loc_id].country,
                    cleanSearch.to_loc_country = fc[tempSearchData.to_loc_id].country,
                    cleanSearch.from_airport_name = fc[tempSearchData.from_loc_id].airport_name,
                    cleanSearch.to_airport_name = fc[tempSearchData.to_loc_id].airport_name   
                }

                
        } else {
            // multicity
            cleanSearch.trip_type_label = 'Multi City';
            cleanSearch.depature = [],cleanSearch.from=[];

            for (let i = 0; i < tempSearchData.depature.length; i++) {
                // make sure departure date is correct
                if (success==1) {
                    if (tempSearchData.depature[i] > dateOnly ||
                        tempSearchData.depature[i] === new Date().toDateString() &&
                        tempSearchData.depature[i] >= tempSearchData.depature[i - 1]) {
                        cleanSearch.depature[i] = tempSearchData.depature[i];
                    } else {
                        success = 0;
                    }
                    
                   
                   
                    // departure airport
                    if (tempSearchData.from[i] !== undefined) {
                        cleanSearch.from[i] = tempSearchData.from[i];
                        cleanSearch.from_loc[i] = cleanSearch.from[i];
                        cleanSearch.from_loc_id[i] = tempSearchData.from_loc_id[i] || '';
                    } else {
                        success = 0;
                    }

                    // arrival airport
                    if (tempSearchData.to[i] !== undefined) {
                        cleanSearch.to[i] = tempSearchData.to[i];
                        cleanSearch.to_loc[i] = cleanSearch.to[i].match(/\((.*?)\)/)[1];
                        cleanSearch.to_loc_id[i] = tempSearchData.to_loc_id[i] || '';
                    } else {
                        success = 0;
                    }
                } else {
                    break;
                }
            }
            //console.log(cleanSearch);
            cleanSearch.is_domestic = this.isDomesticFlight(cleanSearch.from_loc, cleanSearch.to_loc);
        }

        cleanSearch.total_pax = 0;

        if (tempSearchData.adult !== undefined) {
            cleanSearch.adult_config = tempSearchData.adult;
            cleanSearch.total_pax += parseInt(cleanSearch.adult_config);
        } else {
            success = 0;
        }

        if (tempSearchData.child !== undefined) {
            cleanSearch.child_config = tempSearchData.child;
            cleanSearch.total_pax += parseInt(cleanSearch.child_config);
        }

        if (tempSearchData.infant !== undefined) {
            cleanSearch.infant_config = tempSearchData.infant;
            cleanSearch.total_pax += parseInt(cleanSearch.infant_config);
        }

        if (tempSearchData.v_class !== undefined) {
            cleanSearch.v_class = tempSearchData.v_class;
        }

        if (tempSearchData.i_class !== undefined) {
            cleanSearch.i_class = tempSearchData.i_class;
        }

        if (tempSearchData.carrier !== undefined) {
            cleanSearch.carrier = tempSearchData.carrier;
        } else {
            cleanSearch.carrier = '';
        }

        cleanSearch.is_domestic = await this.isDomesticFlight(cleanSearch.from_loc, cleanSearch.to_loc);
       
        if (tempSearchData.provider !== undefined) {
            cleanSearch.provider = tempSearchData.provider;
        } else {
            cleanSearch.provider = '';
        }
    } else {
        success = 0;
    }

    return {
        data: cleanSearch,
        status: success
    };
    }
    static async get_flight_markup(tableName,con) {
      
        try{
            let selectQuery = 'SELECT * FROM '+ tableName + ' WHERE '+con;
          
            const result = await dbPool.query(selectQuery);
            
            return { status: 1, result: result[0] };
           
        }catch (error) {
            console.error('Error while fetching data:', error.message);
            throw error; // Re-throw the error for the calling code to handle
          } 
    }

    // static async get_airport_list(search_chars,search_type='')
    // {
    //     let spl_filter = '';
    //     let raw_search_chars = mysql.escape(search_chars);
    //     let r_search_chars = mysql.escape(search_chars+'%');
    //     search_chars = mysql.escape('%'+search_chars+'%');
    //     let query = `Select * from flight_airport_list where (airport_city like   ${search_chars} OR airport_code like  ${search_chars} OR country like   ${search_chars} )   ${spl_filter} ORDER BY top_destination DESC`; 
    //    // query = query.replace(/\n|\t/g, '');
    //     const [result] = await dbPool.query(query);
    //     return result;
    // }

    static async get_airport_list(search_chars,search_type='')
    {
        let spl_filter = '';
        let raw_search_chars = mysql.escape(search_chars);
        let r_search_chars = mysql.escape(search_chars+'%');
        search_chars = mysql.escape('%'+search_chars+'%');
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
    static async getBookingStautsSummarybydateinterval(fromData, toDate, User) {
        let filter = '';
        if (typeof fromData != 'undefined' || fromData != null) {
            filter += ' and BD.created_datetime >= "' + fromData + '" ';
        }
        if (typeof toDate != 'undefined' || toDate != null) {
            filter += ' and BD.created_datetime <= "' + toDate + '" ';
        }
        const sql = 'select count(distinct(BD.app_reference)) as count, DATE(BD.created_datetime) as date, BD.status from flight_booking_details BD where BD.created_by_id = ' + User + '' + filter + ' group by BD.status';

        const result = await dbPool.query(sql);

        return result[0];

    }
    static async get_RetriveData(app_reference) {
        try {
            const query = "SELECT * FROM flight_booking_online_additional_details WHERE app_reference = ?";
            const [rows] = await dbPool.query(query, [app_reference]);
            return { status: 1, result: rows };
        } catch (error) {
            console.error("Error while fetching data:", error.message);
            throw error;
        }
    }


}
function getCustomCondition(cond) {
    let sql = ' AND ';
   
    if (isValidArray(cond)) {
        for (const[k, v] of Object.entries(cond)) {
            sql += `${v[0]} ${v[1]} '${v[2]}' AND `;
        }
    }
    
    sql = sql.slice(0, -5); // Remove the trailing ' AND '
    return sql;
}
function isValidArray(arr) {
    return Array.isArray(arr) && arr.length > 0; 
     ;
}
    



module.exports = Flight;