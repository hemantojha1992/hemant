class CustomMessages{
    static usernameIsLength(min) {
        return `Username must be at least ${min} characters`;
    }
    static emailIsEmail() {
        return 'Invalid email address';
    }
    static passwordIsLength(min) {
        return `Password must be at least ${min} characters`;
    }
    static emailNotEmpty()
    {
        return `Email is required`;
    }
    static nameIsLength(min,max)
    {
        return `Name must be between ${min} and ${max} characters.`;
    }
    static nameIsRequired()
    {
        return `Name is required`;
    }
    static passwordIsRequired()
    {
        return `Password is required `;
    }
    static somethingWrong()
    {
        return `Something Went Wrong at our end`;
    }
    static trylater()
    {
        return `Something Went Wrong ! Please Try after Some time`;
    }

    static successResponse()
    {
        return `Fetch Successful`;
    }
    
    static transactionResponse()
    {
        return `Error Occure While Cancelattion !Try again later`;
    }

    static login()
    {
        return 'Login Successful'
    }

    static serverMsg()
    {
        
        return `Internal Server Error`;
    }
    static validationErr()
    {
        return `Validation Error`;
    }
    static invalidCredErr(val='err')
    {
        return (val=='msg')?'Invalid Credential !':['The email or password you provided is incorrect. Please double-check your credentials and try again.']
    }
    static dataMissing()
    {
        return 'Data missing. Please try after sometime';
    }
    static deviceTypeIsString()
    {
        return 'Device Type Is Straing';
    }
    static deviceTypeErr()
    {
        return 'Device Type Error';
    }
    static invalidToken()
    {
        return 'Invalid Token';
    }
    static logout(){
        return 'Logout Succesful';
    }
    static unauthorize()
    {
        return 'Unauthorise';
    }
    static DataNotFound()
    {
        return 'Data not found!';
    }
    static LoggedIn(){
        return 'Already Logged In'; 
    }
    static missingMsg(){
        return 'Request Parameter Missing';  
    }
    static successcancellation(){
        return 'Your booking canceled successfully';  
    }
    static fechingChargesErr(){
        return 'Error Occure While Fetching Refund Charges';    
    }
    static bookingErr(){
        return 'Error Occure While Booking';    
    }
    static paramRequire(val){
        return 'The '+val+ ' field is Require';    
    }
    static numparamRequire(val){
        return 'The '+val+ ' field must be a number';    
    }
    static dateFormateValidation(val)
    {
        return `The ${val} field must be DD-MM-YYYY formate`;
    }
    static flightFormMessage(type){
        return 
    }
    static noResultsFound(){
        return 'No results found';
    }
    static paginationPageValidation(){
        return 'Page must be a positive integer starting from 1';
    }
    static paginationLimitValidation(){
        return 'Limit must be a positive integer (1-100)';
    }
    static paginationInvalidLimit(){
        return 'Limit cannot exceed 100 records per page';
    }
}
module.exports = CustomMessages;
