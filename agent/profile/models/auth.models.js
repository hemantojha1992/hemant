let dbPool = require('../../database/db');
const md5 = require('md5')
class AuthModel {
    async getUser(email, password) {
        try {
            const sql = 'SELECT u.*,GROUP_CONCAT(pl.privilege_key) AS privileges FROM user as u  LEFT JOIN privileges p ON p.user_id = u.user_id and p.user_type=u.user_type LEFT JOIN privilege_list as pl ON pl.origin=p.p_no WHERE email = ? AND password = ? GROUP BY u.user_id';
            const [result] = await dbPool.query(sql, [email, md5(password)]);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async getUserWithId(userId) {
        try {
            const sql = `SELECT * FROM user WHERE  user_id= '${userId}' `;
            const [result] = await dbPool.query(sql);
            return result;
        } catch (error) {
            throw error;
        }
    }
    async updateToken(userId, token) {
        try {
            const sql = 'UPDATE user SET token = ? WHERE  user_id=?';
            const result = await dbPool.query(sql, [token, userId]);
            const affectedRows = result[0] ? result[0].affectedRows : 0;
            if (result && affectedRows > 0) {
                return await this.getUserWithId(userId);
            } else {
                throw new Error('User not found or token not updated');
            }
        } catch (error) {
            throw new Error('Failed to update user token');
        }
    }
    async getAgentbalance(userId) {
        try {
            const sql = "select balance as wallet_balance, due_amount, credit_limit, credit_expiry_date from b2b_user_details where  user_oid =" + userId;
            const result = await dbPool.query(sql);
            return result[0];
        }
        catch (error) {
            return  error;
        }
    }
}
module.exports = new AuthModel();