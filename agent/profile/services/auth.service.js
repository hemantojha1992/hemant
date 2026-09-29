const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const AuthModel = require('../models/auth.models');

class AuthService {
    async login(searchData) {
        const { email, password } = searchData;

        try {
            const users = await AuthModel.getUser(email, password);

            if (!Array.isArray(users) || users.length === 0) {
                return {
                    status: 0,
                    message: CustomMessages.invalidCredErr('msg'),
                    details: CustomMessages.invalidCredErr(),
                };
            }

            let user = users[0];
            let privileges = user.privileges;
            let privilegesArray = [];
            if (privileges && privileges.length > 0) {
                privilegesArray = Array.isArray(privileges)
                    ? privileges
                    : privileges.split(',').map(p => p.trim());
            }

            
            const token = jwt.sign({user_id: user.user_id,user_type:user.user_type, uuid: user.uuid, privileges: privilegesArray }
                , process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRATION, algorithm: process.env.JWT_ALGORITHM, });
            try {
                let updateduser  = await AuthModel.updateToken(user.user_id, token);
                user = (Array.isArray(updateduser) || updateduser.length > 0)?updateduser:user;
                user.map(user => {
                    user.privileges = privilegesArray;
                    return user;
                });        
            } catch (err) {
                return {
                    status: 0,
                    message: 'Login Failed',
                    details: err.message,
                };
            }
            return {
                status: 1,
                message: CustomMessages.login(),
                token,
                data: user,
            }
        } catch (error) {
            return {
                status: 0,
                message: 'Something went our end please try after some time',
                details: error.message,
            };
        }
    }
    //  add logout function to remove token from db
    async logout(userId) {
        try {
            await AuthModel.updateToken(userId, null);
            return {
                status: 1,
                message: 'Logout successful',
            };
        } catch (error) {
            return {
                status: 0,
                message: 'Logout failed',
                details: error.message,
            };
        }
    }
}
module.exports = new AuthService();