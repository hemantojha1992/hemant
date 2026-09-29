require('@envConfig');
const jwt = require('jsonwebtoken');
const { getEnumList } = require("../helper/custom/app_helper");

exports.getUserDetails = (req, type = 'id') =>{

    // const token = req.session.token;
    const token = req.header('Authorization').split(' ')[1]
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    if (type == 'id') {
        return decodedToken.user_id;
    } else if (type == 'both') {
        let baseVal = getEnumList('title', decodedToken.title);
        let fullName = baseVal + ' ' + decodedToken.first_name + ' ' + decodedToken.last_name
        return { user_id: decodedToken.user_id, user_fullName: fullName, uuid: decodedToken.uuid, user_authID: decodedToken.domain_list_fk };
    }
}