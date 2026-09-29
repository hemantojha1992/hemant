let dbPool = require('../database/db');

const md5 = require('md5')



class UserModel {
    static async getAllUsers() {
        try {
            const sql = 'SELECT * FROM user';
            const [rows] = await dbPool.query(sql);
            return rows;
        } catch (error) {
            return error;
        }
    }
    static async createUser(name, email, age, password) {
        try {
            const sql = 'INSERT INTO users (name, email, password, age) VALUES (?, ?, ?, ?)';
            const [result] = await dbPool.query(sql, [name, email, password, age]);
            return result.insertId;
        } catch (error) {
            throw error;
        }
    }

    static async selectUser(username, password) {
        try {
            const sql = `SELECT * FROM user WHERE  email= '${username}' AND password= '${md5(password)}'`;
            const [result] = await dbPool.query(sql);
            return result;
        } catch (error) {
            throw error;
        }
    }

    static async getUserRenewaldate(userid) {
        try {
            const sql = 'SELECT next_renewal_date FROM irctc_user_details WHERE  user_id=?';
            const result = await dbPool.query(sql, [userid]);
            return result[0];
        } catch (error) {
            throw error;
        }
    }

    static async updateUser(userid,userToken) {

        try {
            const sql = 'UPDATE user SET token = ? WHERE  user_id=?';
            const result = await dbPool.query(sql, [userToken, userid]);
            const affectedRows = result[0] ? result[0].affectedRows : 0;
          // Check if any rows were affected by the update
            if (result && affectedRows > 0) {
                return result[0];
            } else {
                throw new Error('User not found or token not updated');
            }
        } catch (error) {
            console.error('Error updating user token:', error);
            throw new Error('Failed to update user token');
        }

    }
    static async getUserById(userid) {
        try {
           const sql = 'SELECT u.*,GROUP_CONCAT(pl.privilege_key) AS privileges FROM user as u  LEFT JOIN privileges p ON p.user_id = u.user_id and p.user_type=u.user_type LEFT JOIN privilege_list as pl ON pl.origin=p.p_no WHERE u.user_id = ?  GROUP BY u.user_id';
            const [result] = await dbPool.query(sql, [userid]);
            return result;
        } catch (error) {
            throw error;
        }
    }
    


}

module.exports = UserModel;
