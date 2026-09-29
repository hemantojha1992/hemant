const express = require('express');
const router = express.Router();
const AuthController = require('../controller/auth.controller');
const validate = require('../../middleware/validate');
const { authSchema, bookSchema } = require('../services/auth.validation');

router.post('/login',validate(authSchema),AuthController.login);
// router.post('/logout',AuthController.logoutUser);
// add logout route
router.post('/logout',AuthController.logout);
//  router.post('/logout',AuthController.Logout);
// router.post('/book', AuthController.logout);
router.get('/get-balance', AuthController.getAgentbalance);
module.exports = router;