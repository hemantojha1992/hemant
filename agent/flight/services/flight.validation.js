const Joi = require('joi');
const CustomMessages = require('../../utilities/customMessages');

const searchSchema = Joi.object({
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
        'date.base': CustomMessages.paramRequire('Departure  (YYYY-MM-DD)'),
        'date.format': CustomMessages.paramRequire('Departure  must be in YYYY-MM-DD format'),
        'any.required': CustomMessages.paramRequire('Departure '),
    }),
    return: Joi.date().iso().optional().messages({
        'date.base': CustomMessages.paramRequire('Return  (YYYY-MM-DD)'),
        'date.format': ('Return must be in YYYY-MM-DD format'),
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
    isDirect: Joi.boolean().optional().messages({
        'number.base': CustomMessages.paramRequire('isDirect Optional'),
    }),
    isConnecting: Joi.boolean().optional().messages({
        'number.base': CustomMessages.paramRequire('isConnecting Optional'),
    }),
    fareType: Joi.string().optional().messages({
        'number.base': CustomMessages.paramRequire('Fare Type Optional'),
    }),
    cabinClass: Joi.string().optional().messages({
        'number.base': CustomMessages.paramRequire('Cabin Class Optional'),
    }),
    
     isMulticity: Joi.boolean().optional(),

    from_multicity: Joi.alternatives().conditional('isMulticity', {
        is: true,
        then: Joi.string().required().messages({
            'number.base': CustomMessages.paramRequire('from_multicity'),
        }),
        otherwise: Joi.string().optional(),
    }),

    to_multicity: Joi.alternatives().conditional('isMulticity', {
        is: true,
        then: Joi.string().required().messages({
            'number.base': CustomMessages.paramRequire('to_multicity'),
        }),
        otherwise: Joi.string().optional(),
    }),

    departure_multicity: Joi.alternatives().conditional('isMulticity', {
        is: true,
        then: Joi.date().required().iso().messages({
            'date.base': CustomMessages.paramRequire('Multicity Departure  (YYYY-MM-DD)'),
            'date.format': CustomMessages.paramRequire('Multicity Departure  must be in YYYY-MM-DD format'),
            'any.required': CustomMessages.paramRequire('Multicity Departure '),
        }),
        otherwise: Joi.date().optional(),
    }),
});

const bookSchema = Joi.object({
    flightId: Joi.string().required(),
    passengers: Joi.array().items(
        Joi.object({
            firstName: Joi.string().required(),
            lastName: Joi.string().required(),
            age: Joi.number().required(),
            gender: Joi.string().valid('M', 'F', 'O').required(),
            passportNumber: Joi.string().optional(),
        })
    ).min(1).required(),
    contactEmail: Joi.string().email().required(),
    contactPhone: Joi.string().required()
});

module.exports = {
    searchSchema,
    bookSchema
};
