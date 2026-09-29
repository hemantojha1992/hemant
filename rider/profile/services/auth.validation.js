const Joi = require('joi');
const CustomMessages = require('../../utilities/customMessages');

const authSchema = Joi.object({
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
})



module.exports = {
    authSchema
};
