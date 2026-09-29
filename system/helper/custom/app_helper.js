const CONSTANT = require("../../../shared/constant");
const {getEnumerationList} = require("../../libraries/enumeration");
function WebPageAccessPrivilege(privilegeKey, autoRedirect) {
    return CONSTANT.SUCCESS_STATUS;
}

function isDomainUser() {
    return CONSTANT.SUCCESS_STATUS;
}


function getDomainAuthId() {
    return CONSTANT.SUCCESS_STATUS;
}


function getEnumList(type,enumber, defaultValue = -1)
{
    let enumerationList = getEnumerationList(type,enumber);
    if (parseInt(defaultValue) > -1) {
        return (enumerationList[parseInt(defaultValue)] !== undefined ? enumerationList[parseInt(defaultValue)] : '');
    } else {
       
        return enumerationList;
    }
}
function check_user_privileges(key,privileges_array)
{
    if (privileges_array.includes(key)) {
        return true;
    }
    return false;

}



module.exports = { WebPageAccessPrivilege,isDomainUser,getDomainAuthId,getEnumList,check_user_privileges}
