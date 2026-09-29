let dbPool = require('../database/db');

class Hotel {
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
 static async getBookingStautsSummarybydateinterval(fromData,toDate,User) {
    let filter = '';
    if (typeof fromData != 'undefined' || fromData != null) {
        filter += ' and BD.created_at >= "' + fromData + '" ';
    }
    if (typeof toDate != 'undefined' || toDate != null) {
        filter += ' and BD.created_at <= "' + toDate + '" ';
    }
    const sql = 'select count(distinct(BD.app_reference)) as count, DATE(BD.created_at) as date, BD.booking_status as status from tbl_bus_bookings BD  where  BD.booking_status IN ("Confirmed","Cancelled")'+filter+' group by  BD.booking_status';
    
    const result = await dbPool.query(sql);
       
    return result[0];
    
  }


  }


module.exports = Hotel;