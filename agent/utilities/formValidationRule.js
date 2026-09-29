const { check, validationResult } = require('express-validator');
const CustomMessages = require('./customMessages');
const Joi = require('joi');



class FormValidationRule { 
    static loginValidationRule() {
        return [
            // check('username').isLength({ min: 5 }).withMessage(CustomMessages.usernameIsLength(5)),
            check('email')
                .notEmpty().withMessage(CustomMessages.emailNotEmpty)
                .isEmail().withMessage(CustomMessages.emailIsEmail),
            // check('password').isLength({ min: 6 }).withMessage(CustomMessages.passwordIsLength(6)),
        ]
    } 
    static registerValidationRule() {
        return check('name').notEmpty()
            .withMessage(CustomMessages.nameIsRequired).isLength({ min: 1, max: 50 }).withMessage(CustomMessages.nameIsLength(1, 50))
    }
    static validateForm(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }
        next();
    }
    static loginRule(req, res, next) {
        // const userSchema = Joi.object({
        //     email: Joi.string().email().required(),
        //     password: Joi.string().required(),
        // });
        const userSchema = Joi.object({
            email: Joi.string()
                .required()
                .email({ tlds: { allow: false } })
                .messages({
                    'string.base': CustomMessages.emailIsEmail(),
                    'string.email': CustomMessages.emailIsEmail(),
                    'string.empty': CustomMessages.emailNotEmpty(),
                    'any.required': CustomMessages.emailNotEmpty(),
                }),
            password: Joi.string().required().messages({
                'string.empty': CustomMessages.passwordIsRequired(),
                'any.required': CustomMessages.passwordIsRequired(),
            }),
            //   devicetype: Joi.string()
            //   .min(3)
            //   .max(30)
            //   .required()
            //   .messages({
            //     'string.base': CustomMessages.deviceTypeIsString(),
            //     'string.empty': CustomMessages.deviceTypeErr(),
            //     'any.required': CustomMessages.deviceTypeErr(),
            //   }),
        })

        const options = {
            abortEarly: false, // This option will collect all validation errors
        };
        const validationResult = userSchema.validate(req.body, options);

        if (validationResult.error) {
            // console.log(validationResult.error.details);
            const validationErrors = validationResult.error.details.map(error => error.message);
            // console.error('Validation errors:', validationErrors);
            return res.status(422).json({ status: 0, errors: validationErrors, message: validationErrors });
        } else {
            next()
        }
    }
    static flightSearchrule(req, res, next) {
        const flightSearchSchema = Joi.object({
            from: Joi.string().required().min(3).messages({
                'string.base': CustomMessages.paramRequire('From Airport'),
                'string.empty': CustomMessages.paramRequire('From Airport'),
                'any.required': CustomMessages.paramRequire('From Airport'),
            }),
            to: Joi.string().required().min(3).messages({
                'string.base': CustomMessages.paramRequire('To Airport'),
                'string.empty': CustomMessages.paramRequire('To Airport'),
                'any.required': CustomMessages.paramRequire('To Airport'),
            }),
            departure: Joi.date().required().iso().messages({
                'date.base': CustomMessages.paramRequire('Departure Date (YYYY-MM-DD)'),
                'date.format': CustomMessages.paramRequire('Departure Date must be in YYYY-MM-DD format'),
                'any.required': CustomMessages.paramRequire('Departure Date'),
            }),
            return: Joi.date().iso().optional().messages({
                'date.base': CustomMessages.paramRequire('Return Date (YYYY-MM-DD)'),
                'date.format': ('Return Date must be in YYYY-MM-DD format'),
            }),
            adult: Joi.number().integer().min(1).max(9).required().messages({
                'number.base': CustomMessages.paramRequire('Adult (1-9)'),
                'number.min': CustomMessages.paramRequire('Minimum 1 Adult Required'),
                'number.max': ('Maximum 9 Adults Allowed'),
                'any.required': CustomMessages.paramRequire('Adult '),
            }),
            child: Joi.number().integer().min(1).max(9).optional().messages({
                'number.base': CustomMessages.paramRequire('Child (1-9)'),
                'number.min': ('Minimum 1 Child Required'),
                'number.max': ('Maximum 9 Children Allowed'),
            }),
            infant: Joi.number().integer().min(1).max(9).optional().messages({
                'number.base': CustomMessages.paramRequire('Infant (1-9)'),
                'number.min': ('Minimum 1 Infant Required'),
                'number.max': ('Maximum 9 Infants Allowed'),
            }),
        });
        const options = {
            abortEarly: false,
        }
        const validationResult = flightSearchSchema.validate(req.query, options);
        if (validationResult.error) {
            const validationErrors = validationResult.error.details.map(error => error.message);
            return res.status(422).json({ status: 0, errors: validationErrors, message: CustomMessages.validationErr() });
        } else {
            next()
        }
    }
}
module.exports = FormValidationRule;