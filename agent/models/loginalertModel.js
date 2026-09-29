let dbPool = require('../database/db');


class LoginAlert {
  static async getAllItems() {
    // Add code to retrieve all items from the database
  }

  static async createItem(name, description, price) {
    // Add code to insert a new item into the database
  }

  static async updateItem(id, name, description, price) {
    // Add code to update an item in the database
  }

  static async deleteItem(id) {
    // Add code to delete an item from the database
  }
 static async getloginAlrt(fromData,toDate,User) {
    
    const sql = "SELECT COUNT(*) as rowCount FROM `login_alert` WHERE `status` != '0' ORDER BY created_at ASC  LIMIT 1";
    
    const result = await dbPool.query(sql);
    const rowCount = result[0];

    return rowCount;
    
  }


  }


module.exports = LoginAlert;