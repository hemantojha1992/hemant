let dbPool = require('../database/db');


class Recharge {
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
        filter += ' and rd.created_datetime >= "' + fromData + '" ';
    }
    if (typeof toDate != 'undefined' || toDate != null) {
        filter += ' and rd.created_datetime <= "' + toDate + '" ';
    }
    const sql = "select count(distinct(rd.app_reference)) as count, rd.recharge_status as status,rd.payment_status from recharge_data rd left join recharge_service_list as rsl on rsl.product_id = rd.service_type where  created_by_id ="+User+" and recharge_status IN ('FAILED', 'rolledback','paid') "+filter+" GROUP BY rd.recharge_status,rd.payment_status";
   
    const result = await dbPool.query(sql);
       
    return result[0];
    
  }


  }


module.exports = Recharge;