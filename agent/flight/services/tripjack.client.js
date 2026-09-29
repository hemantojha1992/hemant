const axios = require('axios');

async function tjProcessRequest(params) {
   const requrl="fms/v1/air-search-all";
        try{
            const formData = params;
            const url = 'https://apitest.tripjack.com/'+requrl;

            const headers = {
                'Content-Type': 'application/json', // Set your content type or other headers as needed
                'Accept': 'application/json', 
                'accept-encoding': 'gzip',// Add other headers if necessary
                'apikey': '21180412e16663-d3b4-49b8-be14-02ba3301071d'  
            };

            const axiosConfig = {
                method: 'post', // Set the HTTP method to POST
                url: url,
                headers: headers,
                data: formData,
                timeout: 30000, // 300 seconds timeout (5 minutes)
                responseType: 'json', // Set the expected response type
            };
            // Make the request and return the response data
           const response = await axios(axiosConfig);
           return response;
        } catch (error) {
            //console.error(error);return false;
            throw error; 
           
            //return error; // Re-throw the error to be caught by the caller
        }
}

module.exports = { tjProcessRequest };