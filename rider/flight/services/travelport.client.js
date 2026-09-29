const axios = require('axios');
async function processRequest(request, url = '', isUniv = '') { 
    
    const soapAction = '';
    const authorization = Buffer.from(`${process.env.TRAVELPORTUSER}:${process.env.TRAVELPORTPASSWORD}`).toString('base64');

    const httpHeader = {
        'SOAPAction': soapAction,
        'Content-Type': 'text/xml; charset=UTF-8',
        'Content-Encoding': 'UTF-8',
        'Authorization': `Basic ${authorization}`,
        'Accept-Encoding': 'gzip,deflate',
    };

    if (!url) {
        if(isUniv){
            url = isUniv ? `${process.env.TRAVELPORTURL}/UniversalRecordService` : `${process.env.TRAVELPORTURL}/UniversalRecordService`;
        }else{
            url = isUniv ? `${process.env.TRAVELPORTURL}/UniversalRecordService` : `${process.env.TRAVELPORTURL}/AirService`;
        }
    }
    try {
        
        const response = await axios.post(url, request, {
            headers: httpHeader,
            timeout: 180000, // 3 minutes in milliseconds
            SSLValidate: false, // Ignore SSL validation (not recommended for production)
        });
        return response.data;
    } catch (error) {
        throw error; 
    }
}

module.exports = { processRequest };
