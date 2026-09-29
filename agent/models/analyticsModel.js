let dbPool = require('../database/db');

class Analytics {
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

  static async getDashboardSummary(fromData,toDate,User) {
    // Add code to delete an item from the database
    const trans_summary = Analytics.getTransactionSummary(fromData,toDate,User);
    return trans_summary;
  }

  static async getTransactionSummary(fromData,toDate,User) {
   
    let filter = '';
    // if ((typeof fromData != 'undefined' || fromData != null) && (typeof toDate != 'undefined' || toDate != null)) {
    //     fromData = fromData+' 00:00:00';
    //     toDate = toDate+' 23:59:59';
    //     filter += ' AND created_datetime BETWEEN "' + fromData + '" and "' + toDate + '" ';
    // } else {
        if (typeof fromData != 'undefined' || fromData != null) {
            fromData = fromData + ' 00:00:00';

            filter +=  ' and created_datetime >= "' + fromData + '" ';
        }
        if (typeof toDate != 'undefined' || toDate != null) {
            toDate = toDate + ' 23:59:59';
            filter += ' and created_datetime <= "' + toDate + '" ';
        }
    //}
    
    const sql = 'select DATE(created_datetime), transaction_type,sum(abs(fare)) as sum, count(origin) as count from transaction_log where transaction_type IN ("flight", "flight_rolledback", "flight_cancel", "train", "train_rolledback", "train_cancel","hotel","hotel_rolledback","hotel_cancel","bus","bus_rolledback","bus_cancel","mt","mt_rolledback","mt_cancel","recharge","recharge_rolledback","recharge_cancel" ) and transaction_owner_id not in(select user_oid from dist_user_details)'+filter+' group by DATE(created_datetime), transaction_type order by sum desc';
    
    
    const result = await dbPool.query(sql);
      
    return result[0];
  }

  static async getBookingStautsSummarybydateinterval(fromDate,toDate,User) {
   
    const flight = require('./flightModel'); 
    const train = require('./trainModel'); 
    const recharge = require('./rechargeModel'); 
    const hotel = require('./hotelModel'); 
    const bus = require('./busModel'); 
    const [flightData, trainData, rechargeData, hotelData, busData] = await Promise.all([
      flight.getBookingStautsSummarybydateinterval(fromDate, toDate, User),
      train.getBookingStautsSummarybydateinterval(fromDate, toDate, User),
      recharge.getBookingStautsSummarybydateinterval(fromDate, toDate, User),
      hotel.getBookingStautsSummarybydateinterval(fromDate, toDate, User),
      bus.getBookingStautsSummarybydateinterval(fromDate, toDate, User)
    ]);
  
    const countData = {
      "HotelCount": hotelData,
      "RechargeCount": rechargeData,
      "FlightCount": flightData,
      "BusCount": busData,
      "TrainCount": trainData
    };
  
    return countData;
    
  }


  }


module.exports = Analytics;