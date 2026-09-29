const enumList = require("../../distributor/custom/enumeration/english");


// function enumList(enumKey, enumList) { 
//     return enum;
   
// }


function getEnumerationList(enumKey,enumber) {
    return enumList.hasOwnProperty(enumKey) ? enumList[enumKey][enumber] : '';
}




module.exports = {getEnumerationList}