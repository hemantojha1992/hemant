const dbPool = require('../database/db');
const CustomDB = require('../models/CustomDbModel');
const moment = require('moment');

class Module extends CustomDB{
    static async getdistributorbalance(userId) {

        try {
            const sql = "SELECT (DL.balance+DL.due_amount) as amount, CC.country as currency, CC.value as conversion_value from dist_user_details as DL, currency_converter AS CC where CC.id=DL.currency_converter_fk	and DL.user_oid=" + userId;

            const result = await dbPool.query(sql);

            return result[0][0].amount;
        }
        catch (error) {

            return  error;
        }

    }
    static async getAllItems() {
        try {
            const sql = 'SELECT * FROM banner_images';

            const result = await dbPool.query(sql);

            return result;
            //return false;
            // result;
        } catch (error) {
            throw error;
        }
    }


    static async deleteItem(id) {
        // Add code to delete an item from the database
    }
    static async getoffersnotifications(module, todate) {

        const sql = `select content,type from offer_notifications where module in('${module}', "all") and status='1' and expiry_date>='${todate}' order by origin desc`;


        const result = await dbPool.query(sql);
        // const rowCount = result[0].rowCount;

        return result[0];

    }
    // static async getAgentCreditbalance(userId) {

    //   try{
    //     const Agent_credit = await this.getAgentCredit(userId);

    //     return Agent_credit[0].credit_limit;
    //      }
    //      catch (error) {
    //       throw error;
    //      }

    //   }

    // static async getAgentCredit(userId) {

    //     try{
    //         const sql = "select balance, due_amount, credit_limit, credit_expiry_date from b2b_user_details where  user_oid ="+userId;

    //         const result = await dbPool.query(sql);

    //         return result[0];
    //      }
    //      catch (error) {
    //         console.log(error);
    //         throw error;
    //     }



    // }

    static async getAgentbalance(userId) {

        try {
            // const Balancesql = "select balance from dist_user_details where  user_oid ="+3;

            // const Balanceresult = await dbPool.query(Balancesql);

            const sql = "select balance as wallet_balance, due_amount, credit_limit, credit_expiry_date from b2b_user_details where  user_oid =" + userId;
           
            const result = await dbPool.query(sql);
           
            //const combinedArray = Balanceresult[0].concat(result[0]);
            return result[0];
        }
        catch (error) {

            return  error;
        }

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
    static async getoffersnotifications(module, todate) {

        const sql = `select type,module from offer_notifications where module in('${module}', "all") and status='1' and expiry_date>='${todate}' order by origin desc`;

        const [result] = await dbPool.query(sql);
        // console.log(result)
        // const rowCount = result[0].rowCount;

        return result;

    }
    static async get_application_module_details() {
        
        let application_module_details = '';
        let cache_key = 'mdd_module_transaction_status';
        application_module_details = getCacheData(cache_key);

        if (Array.isArray(application_module_details)) {
            await this.single_table_records('meta_course_list')
        }

    }
    static async logException(module, op, notification, req) {
        const data = {};
        data.exception_id = 'EID-' + Date.now() + '-' + Math.floor(Math.random() * 100);
        data.module = module;
        data.op = op;
        data.notification = notification;
        data.user_agent = req.headers['user-agent'];
        data.user_ip = req.headers['host'];
        data.domain_origin = req.userId
        data.created_datetime = moment().format('YYYY-MM-DD HH:mm:ss');
        let createTrans= await CustomDB.createItem('exception_logger', data); 
        if(createTrans && createTrans.status==1)
        {
            return {status:1,eid:createTrans.insert_id};
        }
        return {status:0};
    }



}


module.exports = Module;