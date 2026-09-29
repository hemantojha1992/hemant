let dbPool = require('../database/db');


class UserModel {
    static async getAllUsers() {
        try {
            const sql = 'SELECT * FROM user';
            const [rows] = await dbPool.query(sql);
            return rows;
        } catch (error) {
            throw error;
        }
    }
    static async checkEmailAndOTP(email,otp=false) {
        try{
            let sql = "SELECT * FROM users WHERE email = ? ";
            if(otp)
            {
                sql+=" AND otp = ?";
            }
            // const [result] = await dbPool.query(sql, [email,otp]);
            return {otp:sql};
            
            return {status:SUCCESS_STATUS,data:result};
        }catch(error)
        {
            return {status:FAILURE_STATUS,error:error};
        }
        
        return sql
        console.log(sql)
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
}

module.exports = UserModel;
