const express = require('express');

//const {loginValidationRule,registerValidationRule,validateForm} = require('../utilities/formValidationRule')
const UserController = require('../controllers/userController')
const LoginController = require('../controllers/loginController')
//const {login} = require('../controllers/authController')
const authenticateToken = require('../middleware/authMiddleware')
const {loginRule,registerValidationRule,validateForm} = require('../utilities/formValidationRule')


const router = express.Router();
//router.post('/login',loginValidationRule(),validateForm,login);
router.post('/login',loginRule,LoginController.getUser);

//router.post('/logout',LoginController.logoutUser);
router.post('/logout',(req,res)=>{
    res.send({ke:'vleue'})
});

//router.post('/devicetype',LoginController.getDevice);
// router.post('/login',(req,res)=>{res.send('test')}),loginRule,LoginController.getUser;

router.post('/register',registerValidationRule,validateForm,(req,res)=>{
    return res.status(200).send(req.body)
})
router.get('/get-all-user', UserController.getAllUsers);


module.exports = router;