const jwt = require('jsonwebtoken');
require('@envConfig');
const CustomMessages = require('../utilities/customMessages');


function validateToken(req, res, next) {
    const loginIndex = req.url.indexOf("login");
    if (
        req.url.includes('login') ||
        req.url.includes('train/redirect-to-irctc')
        ||
        req.url.includes('train/secure-booking') 
        ||
        req.url.includes('flight/cancel-view')
        ||
        req.url.includes('sso/validate')
    ) {
        return next();
    }
    // const deviceType = req.header('DeviceType') || req.body.devicetype; 
    const authHeader = req.header('Authorization');
    if (loginIndex > -1) return next()

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        let response = { status: 0, message: CustomMessages.unauthorize(), errors: [CustomMessages.unauthorize(), 'Please Login!'] }
        return res.status(401).json(response);
    }
    const token = authHeader.split(' ')[1];

    try {
        const JWT_SECRET = process.env.JWT_SECRET;

        const getUser = jwt.verify(token, JWT_SECRET);

        // if (token != req.session?.token || deviceType != req.session?.deviceType) 
        //    if(token != req.session?.token )
        if (!getUser) {

            return res.status(403).json({ status: 0, message: CustomMessages.invalidToken(), doLogout: 1 });
        }
        if (loginIndex > -1) {

            return res.status(200).json({ status: 0, message: CustomMessages.LoggedIn() });
        }
        req.user = getUser;
        next();
    } catch (err) {

        return res.status(403).json({ status: 0, message: err.message, doLogout: 1 });
    }
}

module.exports = validateToken;