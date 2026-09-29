let dbPool = require('../database/db');

const moment = require('moment');
const { setCacheData } = require('../../shared/redis/Redis');
const md5 = require('md5');
class TransactionModel {
    static async UserTransactionLogs(user_id, queryParams, ret = false) {
        let sqlQuery = `SELECT TL.origin, TL.system_transaction_id, TL.transaction_type, TL.opening_balance, TL.closing_balance, TL.app_reference, TL.fare,  TL.remarks, TL.transaction_owner_id, TL.created_by_id, TL.created_datetime,
            U.uuid,TL.currency,TL.currency_conversion_rate FROM	transaction_log TL LEFT JOIN user U ON TL.transaction_owner_id = U.user_id where TL.transaction_owner_id =${user_id} `;
        for (const key in queryParams) {
            if (queryParams[key]) {
                if (key === 'from_date') {
                    sqlQuery += ` AND TL.created_datetime >= STR_TO_DATE('${queryParams[key]} 00:00:00', '%Y-%m-%d %H:%i:%s')`;
                }
                if (key === 'to_date') {
                    sqlQuery += ` AND TL.created_datetime <= STR_TO_DATE('${queryParams[key]} 23:59:59', '%Y-%m-%d %H:%i:%s')`;
                }
                if (key === 'transaction_type') {
                    if (queryParams[key] != 'both') {
                        if (queryParams[key] == 'debit') {
                            sqlQuery += ` AND TL.opening_balance > TL.closing_balance`
                        }
                        else if (queryParams[key] == 'credit') {
                            sqlQuery += ` AND TL.opening_balance < TL.closing_balance`
                        }
                    }
                    else {
                        sqlQuery += ` AND TL.${key} != 'credit'`;
                    }
                }
            }
        }
        sqlQuery += ' order by TL.created_datetime asc';
        const [result] = await dbPool.query(sqlQuery);
        let transDb = await this.get_group_transactions(result);
        result.forEach(item => {
            let det1 = '';
            let det2 = '';
            let det3 = '';
            let formattedLogs = [];
            formattedLogs[item['system_transaction_id']] = item;
            switch (item['transaction_type']) {
                case 'train':
                    const reslt = transDb[item['origin']] || [];
                    if ((reslt)) {
                        det1 = `TrDate: ${moment.unix(reslt['dep_ts']).format('DD-MMM, HH:mm')}, Pax: ${reslt['name']}`;
                        det2 = `Train: ${reslt['train']}-${reslt['j_class']} (${reslt['sector']}), PNR: ${reslt['pnr']}`;
                    }
                    break;
                default:
                // result = item;
            }
            formattedLogs[item['system_transaction_id']]['det1'] = det1;
            formattedLogs[item['system_transaction_id']]['det2'] = det2;
            return formattedLogs;
        });
        return result;

    }
    static async save_pre_search(search_type, search_data,reqObj) {
        let createdByUserId = reqObj.createdByUserId;
        let remoteAddr = reqObj.remoteAddr??'';
        // Convert the object to a JSON string
        const searchData = JSON.stringify(search_data);
        if (search_data.master_agent_id) {
            try {
                const [res] = await dbPool.query('SELECT uuid FROM user WHERE user_id = ?', [
                    parseInt(searchData.master_agent_id)
                ]);
                if (res.length > 0) {
                    const { uuid } = res[0];
                    search_data.master_agent_uuid = uuid;
                }
            } catch (error) {
                throw error;
            }
        }
        try {
            const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
            const [result] = await dbPool.query(
                'INSERT INTO search_history (search_type, search_data, created_datetime, remote_addr, created_by_id) VALUES (?, ?, ?, ?, ?)',
                [search_type, searchData, currentDateTime, remoteAddr, createdByUserId]
            );
            let search_hash = md5(search_data);
            await setCacheData(search_hash, search_data, 1200);
            return search_hash;
        } catch (error) {
            throw error;
        }
    }
    static async get_group_transactions(resData) {
        let trans_db = [];
        let txn_data = {};

        resData.forEach((transaction) => {
            if (!txn_data.hasOwnProperty(transaction['transaction_type'])) {
                txn_data[transaction['transaction_type']] = [];
            }
            txn_data[transaction['transaction_type']].push(transaction['origin']);
        });
        let train_txns = [];

        if (txn_data['train']) {
            train_txns = [...train_txns, ...txn_data['train']];
        }

        if (txn_data['train_cancel']) {
            train_txns = [...train_txns, ...txn_data['train_cancel']];
        }

        if (txn_data['train_rolledback']) {
            train_txns = [...train_txns, ...txn_data['train_rolledback']];
        }
        return await this.getTrainTransactions(train_txns);

    }
    static async getTrainTransactions(trainTxns) {
        const transDb = [];
        if (this.isValidArray(trainTxns)) {
            const tTxnCond = `TL.origin IN (${trainTxns.join(',')})`;
            let tTxnData = await this.trainTransactions(tTxnCond);
            if (this.isValidArray(tTxnData.data)) {

                tTxnData.data.forEach((item) => {
                    transDb[item.origin] = item;
                });
            }
        }
        return transDb;
    }
    static async trainTransactions(condition = '', count = false, offset = 0, limit = 100000000000) {
        let where = condition;

        let select = `"INR" as currency, 
        TL.origin, TL.system_transaction_id, TL.transaction_type, TL.opening_balance, TL.closing_balance, TL.app_reference, TL.fare,  TL.remarks, TL.transaction_owner_id, TL.created_by_id, TL.created_datetime,
        concat(U.uuid," <br/> ",U.agency_name) as company`;

        let join = 'JOIN user AS U ON TL.transaction_owner_id = U.user_id';

        join += ' JOIN `train_booking_details` AS BD ON TL.app_reference = BD.app_reference';
        select += ', BD.pnr_number as pnr, BD.transaction_id, BD.reservation_id, BD.status, BD.booking_source, BD.payment_mode, BD.amount, BD.admin_charge, BD.payment_status, BD.booked_by_id';

        join += ' JOIN `train_booking_itinerary_details` AS ID ON TL.app_reference = ID.app_reference';
        select += ',ID.journey_date, concat(ID.dep_station_code,"- ",ID.arr_station_code) as sector, ID.dep_ts, ID.arr_ts, concat(ID.train_number,"-",ID.train_name) as train, ID.j_quota, ID.j_class';

        join += ' JOIN `train_booking_customer_details` AS CD ON TL.app_reference = CD.app_reference and CD.sno = 1';
        select += ', CD.name';

        const groupBy = 'GROUP BY  TL.origin';
        const result = [];
        if (count) {
            const countQuery = `select count(*) as total_records from transaction_log TL ${join} where ${where}`;
            const countData = await await dbPool.query(countQuery);
            result['total_records'] = countData['total_records'];
        }
        const query = `select ${select} from transaction_log TL ${join} where ${where} ${groupBy} order by TL.origin desc limit ${offset}, ${limit}`;
        [result['data']] = await dbPool.query(query);
        return result;

    }
    static isValidArray(trainTxns) {
        return Array.isArray(trainTxns) && trainTxns.length > 0;
    }
}
module.exports = TransactionModel;