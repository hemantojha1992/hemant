const moment = require('moment-timezone');

function generateUniqueReferenceId(slg = 'TNB') {
    const randomInt = (min, max) =>
        Math.floor(Math.random() * (max - min + 1)) + min;

    return `${slg}-${moment()
        .tz('Asia/Kolkata')
        .format('DDMMYY-HHmmss')}-${randomInt(1000, 9999)}`;
}
function generateTransactionId(slg = 'DR') {
    return Math.floor(1000 + Math.random() * 9000).toString() + slg + Date.now().toString().slice(-8) + Math.floor(10000 + Math.random() * 90000).toString();
}

module.exports = { generateUniqueReferenceId, generateTransactionId };