const pool = require('./db');

const batchUpdate = async (updatesData) => {
    let connection,whereCon,updateCases;// Declare whereCon outside the loop
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
  
        // Construct the update query
        let updateQuery = '';
        updatesData.forEach(async (update) => {
          const { tableName, data, whereKey } = update;
              // Loop through paxDetails
              data.forEach(async (detail) => {
                updateCases = Object.entries(detail)
                   .map(([column, value]) => `${column} = ${connection.escape(value)}`)
                   .join(', ');
            
                if (Object.keys(detail).includes(whereKey)) {
                    const matchedValue = detail[whereKey];
                    whereCon = `${whereKey} = ${connection.escape(matchedValue)}`;
            
                    // Your logic for handling the match goes here
                }
            });
          
              const updateQuery = `UPDATE ${tableName} SET ${updateCases} WHERE ${whereCon};`;
       
              const result = await pool.query(updateQuery);
          })
         
          await connection.commit();
          return  { status: 1, message: "Updated Succesfully !" };
    } catch (error) {
      if (connection) {
      
        await connection.rollback();
        
      }
      connection.release();
      return  { status: 0, message: "Process RollBacked !" };
      //throw error;
    } 
    // finally {
    //   if (connection) {
    //     connection.release(); // Release the connection back to the pool
    //     return  { status: 0, message: "Connection release Without Update !" };
    //   }
    // }
  };
 
const batchInsert = async (inserts) => {
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
  
      for (const insert of inserts) {
        const { tableName, data } = insert;
  
        const columns = Object.keys(data[0]).join(', ');
        const values = data.map(detail =>
          Object.values(detail).map(value => connection.escape(value)).join(', ')
        ).join('), (');
       
  
        const insertQuery = `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;
         
        await pool.query(insertQuery);
      }
  
      await connection.commit();
      return  { status: 1, message: "Inserted Succesfully !" };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      connection.release();
      return  { status: 0, message: "Process RollBacked !" };
      //throw error;
    } 
    // finally {
    //   if (connection) {
    //     connection.release();
    //   }
    // }
  };
  
  module.exports = {batchInsert,batchUpdate};
