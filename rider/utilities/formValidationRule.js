const { check, validationResult } = require('express-validator');
const CustomMessages = require('./customMessages');
const Joi = require('joi');



class FormValidationRule { 
    static loginValidationRule() {
        return [
            check('email')
                .notEmpty().withMessage(CustomMessages.emailNotEmpty)
                .isEmail().withMessage(CustomMessages.emailIsEmail),]
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
}
module.exports = FormValidationRule;