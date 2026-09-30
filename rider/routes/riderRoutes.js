const express = require('express');

const UserController = require('../controllers/userController')
const LoginController = require('../controllers/loginController')
const authenticateToken = require('../middleware/authMiddleware')
const {loginRule,registerValidationRule,validateForm} = require('../utilities/formValidationRule')


const router = express.Router();
router.post('/login',loginRule,LoginController.getUser);

router.post('/logout',(req,res)=>{
    res.send({ke:'vleue'})
});

router.post('/register',registerValidationRule,validateForm,(req,res)=>{
    return res.status(200).send(req.body)
})
router.get('/get-all-user', UserController.getAllUsers);


module.exports = router;