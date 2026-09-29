const {getTjFlighstSearchRequest} = require('./tripjack.request');
const {tjProcessRequest}          = require('./tripjack.client');

class TripjackAdapter {
    async search(searchData) {
        try {
            const request = await getTjFlighstSearchRequest(searchData);
            const [response] = await Promise.all([
                tjProcessRequest(request)
            ]);
            
            const res = response ? this.mapToUnifiedFormat(response) : [];
            return res;

        } catch (error) {
            throw error;
        }
    }

    async mapToUnifiedFormat(response)
    {
        //console.log(response.data.errors);
        if(!response?.data?.status?.success)
        {
            console.log('hemant');
            throw response?.data?.errors ; 
        }else{
            return response.data;
        }
    }
}

module.exports = new TripjackAdapter();