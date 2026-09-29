const AuthModel = require('../models/auth.models');
const jwt = require('jsonwebtoken');
const CustomMessages = require('../../utilities/customMessages');
const AuthService = require('../services/auth.service');

const JWT_secret_key = process.env.JWT_SECRET;

class AuthController {

    async login(req, res) {
        try {
            let searchData = req.body;
            const result = await AuthService.login(searchData);
            res.send(result);
        } catch (err) {
            res.status(500).json({ success: 0, message: err.message, details: err });
        }
    }

    static async getUser(req, res) {
        let email = req.body.email;
        let password = req.body.password;
        let deviceType = req.body.devicetype;
        let result = {};
        try {
            const selectata = await UserModel.selectUser(email, password);
            const numOfUsersFound = Array.isArray(selectata) ? selectata.length : 0;
            if (numOfUsersFound < 1) {
                result.status = 0;
                result.errors = CustomMessages.invalidCredErr();
                result.message = CustomMessages.invalidCredErr('msg');
                res.status(200).json(result);
            } else {
                const token = jwt.sign(selectata[0], JWT_secret_key);
                console.log(token)
                // req.session.token = token;
                result.status = 1;
                result.token = token;
                result.Userdata = selectata[0];
                result.data = selectata[0];
                // global.Authtoken = token;
                // await UserModel.updateUser(selectata[0].user_id, global.Authtoken);
                // req.session.deviceType = deviceType;
                // result.devicetype = deviceType;
                result.message = CustomMessages.login();
                res.json(result).status(200);
            }
        } catch (error) {
            result.status = 0;
            result.errors = error.message;
            result.message = CustomMessages.serverMsg();
            res.json(result).status(404);
        }
    }
    // write logout function with dbpol query remove token from db user table 
    async logout(req, res) {
        let result = {};
        try {
            const userId = req.user.user_id;
            // use auth servervice logout function
            let loutKey = await AuthService.logout(userId);
            if (loutKey.status === 0) {
                result.status = 0;
                result.errors = loutKey.details;
                result.message = CustomMessages.serverMsg();
                return res.json(result).status(500);
            }
            // destroy jwt token
            //jwt.destroy(req.user);
            // await UserModel.updateUser(userId, null);
            result.status = 1;
            result.doLogout = 1;
            result.message = CustomMessages.logout();
            res.json(result).status(200);
        }
        catch (error) {
            result.status = 0;
            result.errors = error.message;
            result.message = CustomMessages.serverMsg();
            res.json(result).status(404);
        }
    }
    static async logoutUser(req, res) {
        let result = {};
        try {
            req.session.destroy((err) => {
                if (err) {
                    result.status = 0;
                    result.errors = error.message;
                    result.message = CustomMessages.serverMsg();
                    res.json(result).status(500);
                } else {
                    result.status = 1;
                    result.message = CustomMessages.logout();
                    res.json(result).status(200);
                }
            });
        }
        catch (error) {
            result.status = 0;
            result.errors = error.message;
            result.message = CustomMessages.serverMsg();
            res.json(result).status(404);
        }
    }

    async getAgentbalance(req, res) {
        let result = {};
        try {
            const getdata = await AuthModel.getAgentbalance(req?.user?.user_id);
            if (getdata && getdata.length == 0) {
                result.status = 0;
                result.errors = [
                    CustomMessages.somethingWrong(),
                ];
                result.message = "";
                res.status(200).json(result);
            }
            else {
                result.status = 1;
                result.data = getdata;
                result.message = CustomMessages.successResponse();
                res.json(result).status(200);
            }
        } catch (error) {
            result.status = 0;
            result.message = CustomMessages.somethingWrong();
            res.json(result).status(500);
        }

    }
}
module.exports = new AuthController(); 