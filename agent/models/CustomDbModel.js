const dbPool= require('../database/db');
const mysql = require('mysql2');
const batch = require('../database/GroupUpdateInsert');
class CustomDB {
    static async single_table_records() {
        return { ram: "syaam" };
    }
    static async deleteRecord(tableName, data) {
        try {
           
            const whereConditions = Object.entries(data).map(([key, value]) => {
                return value !== null ? `${key} = '${value}'` : `${key} IS NULL`;
            }).join(' AND ');
           
            const deleteQuery = `DELETE FROM ${tableName} WHERE ${whereConditions}`;
        
            const [result] = await dbPool.query(deleteQuery);
          
            if(result.affectedRows>0){
                return {status:1,deletedRows:result.affectedRows}
            }
          
        } catch (error) {
            return {status:1,deletedRows:0,error:error}
        }
    }
    static async irctc_tourism_xml_log(appReference, request, response, description, attr, user_id) {
        try {
            const attr = JSON.stringify(process.env);
            const sql = 'INSERT INTO irctc_tourism_xml (app_reference, request, response, description, attr, created_datetime, created_by_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), ?)';
            const [result] = await dbPool.query(sql, [appReference, request, response, description, attr, '4648' || null]);
            return result.insertId;
        } catch (error) {
            return error;
        }
    }
    
    static async xml_log(appReference, request, response, description, attr, user_id) {
        try {
            const attr = JSON.stringify(process.env);
            const sql = 'INSERT INTO xml_log (app_reference, request, response, description, attr, created_datetime, created_by_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), ?)';
            const [result] = await dbPool.query(sql, [appReference, request, response, description, attr, '4648' || null]);
            return result.insertId;
           
        } catch (error) {
            throw error;
        }
    }

    static async flight_xml_log(appReference, request, response, description) {
        try {
            const attr = JSON.stringify(process.env);
            const sql = 'INSERT INTO flight_xml_log (app_reference, request, response, description, attr, created_datetime, created_by_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), ?)';
         
            const [result] = await dbPool.query(sql, [appReference, JSON.stringify(request), JSON.stringify(response), description, attr, '4648' || null]);
            return result.insertId;
        } catch (error) {
            return {status:0,errors:error};
        }
    }

    static async selectFeildData(tableName,feilds,con){
        let selectQuery;
        try{
            // if(group && group.length>0 || group !==undefined || group !==''){
              selectQuery = 'SELECT ' +feilds+ ' FROM '+ tableName + ' WHERE '+con ;
           
          
            const result = await dbPool.query(selectQuery);
            
            return { status: 1, result: result[0] };
           
        }catch (error) {
            console.error('Error while fetching data:', error.message);
            throw error; // Re-throw the error for the calling code to handle
          }  
    }
    static async selectData(tableName,con) {
      let selectQuery;
        try{
            if(con && con.length>0 || con !==undefined){
              selectQuery = 'SELECT * FROM '+ tableName + ' WHERE '+con;
             }else{
              selectQuery = 'SELECT * FROM '+ tableName;
             }
            // console.log(selectQuery);
            const result = await dbPool.query(selectQuery);
           
            //return result[0];
         
         return { status: 1, result: result[0] };
           
        }catch (error) {
            return  error; // Re-throw the error for the calling code to handle
          } 
    }

    static async createItem(tableName,data) {
      
        try{
            // Constructing the dynamic insert query
            const columns = Object.keys(data).join(', ');
            const values = Object.values(data).map(value => (value !== null ? `'${value}'` : 'NULL')).join(', ');
           

           const insertQuery = 'INSERT INTO '+ tableName + '('+columns+')VALUES ('+values+')';

            const [result] = await dbPool.query(insertQuery);
            if(result.insertId){
                const data = {
                    status: 1,
                    insert_id: result.insertId/* Replace with the actual insert_id from your database library or method */,
                  };
                  return data;
            }
        }catch (error) {
            console.error('Error while inserting data:', error.message);
            throw error; // Re-throw the error for the calling code to handle
          } 
    }
    static async updateOrCreate(tableName,data,con){
        const keysArray = Object.keys(data);
        const valuesArray = Object.values(data);
        const selectData = await CustomDB.selectData(tableName,con);
        
        let connection;
       if(selectData.result && selectData.result.length>0){
            let updatesDatas = [
                {
                    tableName: tableName,
                    data:  data,
                    whereKey: 'booking_id',
                }];
            connection = await batch.batchUpdate(updatesDatas);
            return connection;
         }
         let insertDatas = [ {
            tableName:tableName,
            data: data,
         }];
        connection = await batch.batchInsert(insertDatas);
        return connection;
        // if(con){
        //     const key = Object.keys(con)[0];
        //     const value = con[key];
        
        //     try {
        //         const sql = 'UPDATE ' + tableName + ' SET '+keysArray[0]+'= ? WHERE ' +key+ '=?';
        //         const result = await dbPool.query(sql, [valuesArray, value]);
            
        //         const affectedRows = result[0] ? result[0].affectedRows : 0;
        //     // Check if any rows were affected by the update
        //         if (result && affectedRows > 0) {
        //             return result[0];
        //         } else {
        //             throw new Error('Key Not found');
        //         }
        //     } catch (error) {
        //         console.error('Error while updating data:', error);
        //         throw new Error('Failed to update data');
        //     }
        // }
    }
    // static async updateItems(tableName,data,con) {
    
    //     const keysArray = Object.keys(data);
    //     const valuesArray = Object.values(data);
    //     const key = Object.keys(con)[0];
    //     const value = con[key];
       
    //     try {
    //         const sql = 'UPDATE ' + tableName + ' SET '+keysArray[0]+'= ? WHERE ' +key+ '=?';
    //         const result = await dbPool.query(sql, [valuesArray, value]);
           
    //         const affectedRows = result[0] ? result[0].affectedRows : 0;
    //       // Check if any rows were affected by the update
    //         if (result && affectedRows > 0) {
    //             return result[0];
    //         } else {
    //             throw new Error('Key Not found');
    //         }
    //     } catch (error) {
    //         console.error('Error while updating data:', error);
    //         throw new Error('Failed to update data');
    //     }
    // }
    static async updateRecords(tableName, agentLogs, condition) {
        const keysArray = Object.keys(agentLogs);
        const valuesArray = Object.values(agentLogs);
        
        const conditions = Object.keys(condition).map(key => `${key} = ?`).join(' AND ');
    
        try {
            const sql = `UPDATE ${tableName} SET ${keysArray.map(key => `${key} = ?`).join(', ')} WHERE ${conditions}`;
            const result = await dbPool.query(sql, [...valuesArray, ...Object.values(condition)]);
            
            const affectedRows = result[0] ? result[0].affectedRows : 0;
        
            // Check if any rows were affected by the update
            if (result && affectedRows > 0) {
                return result[0];
            } else {
                return "Not Found";
            }
        } catch (error) {
            return 'Error while updating data: ' + error;
        }
    }

    

}
module.exports = CustomDB;