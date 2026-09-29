const Joi = require('joi');
const CustomMessages = require('../../utilities/customMessages');

const AirPortSearchValidation = (req, res, next) => {
    const schema = Joi.object({
        term: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('From Airport'),
            'string.empty': CustomMessages.paramRequire('From Airport'),
            'any.required': CustomMessages.paramRequire('From Airport'),
        })

    });
    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};
const CountrySearchValidation = (req, res, next) => {
    const schema = Joi.object({
        type: Joi.string().required().min(2).messages({
            'string.base': CustomMessages.paramRequire('From type'),
            'string.empty': CustomMessages.paramRequire('From type'),
            'any.required': CustomMessages.paramRequire('From type'),
        }),
        state_id: Joi.when('type', {
            is: 'city',
            then: Joi.string()
                .min(1)
                .required()
                .messages({
                    'string.base': CustomMessages.paramRequire('From state_id'),
                    'string.empty': CustomMessages.paramRequire('From state_id'),
                    'any.required': CustomMessages.paramRequire('From state_id'),
                }),
            otherwise: Joi.optional().allow(null, '')
        })

    });
    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};
const GetFareRulesValidation = (req, res, next) => {
    const schema = Joi.object({
        fare_type: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('fare type'),
            'string.empty': CustomMessages.paramRequire('fare type'),
            'any.required': CustomMessages.paramRequire('fare type'),
        })

    });
    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};
const FlightSearchValidation = (req, res, next) => {
    const schema = Joi.object({
        from: Joi.string().min(3).required().messages({
            'string.base': CustomMessages.paramRequire('From Airport'),
            'string.empty': CustomMessages.paramRequire('From Airport'),
            'string.min': CustomMessages.paramRequire('From Airport must be at least 3 characters'),
            'any.required': CustomMessages.paramRequire('From Airport'),
        }),

        to: Joi.string().min(3).required().messages({
            'string.base': CustomMessages.paramRequire('To Airport'),
            'string.empty': CustomMessages.paramRequire('To Airport'),
            'string.min': CustomMessages.paramRequire('To Airport must be at least 3 characters'),
            'any.required': CustomMessages.paramRequire('To Airport'),
        }),

        departure: Joi.date().iso().required().messages({
            'date.base': CustomMessages.paramRequire('Departure Date'),
            'date.format': CustomMessages.paramRequire('Departure Date'),
            'any.required': CustomMessages.paramRequire('Departure Date'),
        }),

        // existing
        // adult: Joi.number().integer().min(1).required().messages({
        //     'number.base': CustomMessages.paramRequire('Adult Count'),
        //     'number.min': CustomMessages.paramRequire('Adult must be at least 1'),
        //     'any.required': CustomMessages.paramRequire('Adult'),
        // }),

        // // OPTIONAL FIELDS
        // child: Joi.number().integer().min(1).optional().messages({
        //     'number.base': CustomMessages.paramRequire('Child Count'),
        //     'number.min': CustomMessages.paramRequire('Child must be at least 1'),
        // }),

        // infant: Joi.number().integer().min(0).optional().messages({
        //     'number.base': CustomMessages.paramRequire('Infant Count'),
        //     'number.min': CustomMessages.paramRequire('Infant must be at least 0'),
        // }),

        adult: Joi.number()
            .integer()
            .min(1)
            .required()
            .messages({
                'number.base': CustomMessages.paramRequire('Adult Count'),
                'number.min': CustomMessages.paramRequire('Adult must be at least 1'),
                'any.required': CustomMessages.paramRequire('Adult'),
            }),

        child: Joi.number()
            .integer()
            .min(1)          // 👈 0 NOT allowed
            .optional()
            .messages({
                'number.base': CustomMessages.paramRequire('Child Count'),
                'number.min': CustomMessages.paramRequire('Child must be at least 1'),
            }),

        infant: Joi.number()
            .integer()
            .valid(1)        // 👈 ONLY 1 allowed
            .optional()
            .messages({
                'number.base': CustomMessages.paramRequire('Infant Count'),
                'any.only': CustomMessages.paramRequire('Only 1 Infant is allowed'),
            }),



        return: Joi.date().iso().optional().greater(Joi.ref('departure')).messages({
            'date.base': CustomMessages.paramRequire('Return Date'),
            'date.format': CustomMessages.paramRequire('Return Date'),
            'date.greater': CustomMessages.paramRequire('Return date must be after departure date')
        }),

        isDirect: Joi.boolean().optional().messages({
            'boolean.base': CustomMessages.paramRequire('isDirect must be true/false'),
        }),

        isConnecting: Joi.boolean().optional().messages({
            'boolean.base': CustomMessages.paramRequire('isConnecting must be true/false'),
        }),

        fareType: Joi.string().valid('regular', 'student', 'senior', 'armedforces', 'doctor').optional().messages({
            'string.base': CustomMessages.paramRequire('Fare Type'),
            'any.only': CustomMessages.paramRequire('Invalid Fare Type'),
        }),

        cabinClass: Joi.string()
            .valid('economy', 'premium_economy', 'business', 'first')
            .optional()
            .messages({
                'string.base': CustomMessages.paramRequire('Cabin Class'),
                'any.only': CustomMessages.paramRequire('Invalid Cabin Class'),
            }),

        isMulticity: Joi.boolean().optional(),

        from_multicity: Joi.string()
            .min(3)
            .when('isMulticity', {
                is: true,
                then: Joi.required(),
                otherwise: Joi.optional()
            })
            .messages({
                'string.base': CustomMessages.paramRequire('From Multicity Airport'),
                'string.min': CustomMessages.paramRequire('From Multicity Airport must be at least 3 characters'),
                'any.required': CustomMessages.paramRequire('From Multicity Airport is required when Multicity is true'),
            }),

        to_multicity: Joi.string()
            .min(3)
            .when('isMulticity', {
                is: true,
                then: Joi.required(),
                otherwise: Joi.optional()
            })
            .messages({
                'string.base': CustomMessages.paramRequire('To Multicity Airport'),
                'string.min': CustomMessages.paramRequire('To Multicity Airport must be at least 3 characters'),
                'any.required': CustomMessages.paramRequire('To Multicity Airport is required when Multicity is true'),
            }),

        departure_multicity: Joi.date()
            .iso()
            .when('isMulticity', {
                is: true,
                then: Joi.required(),
                otherwise: Joi.optional()
            })
            .messages({
                'date.base': CustomMessages.paramRequire('Departure Multicity Date'),
                'date.format': CustomMessages.paramRequire('Departure Multicity Date'),
                'any.required': CustomMessages.paramRequire('Departure Multicity Date is required when Multicity is true'),
            }),

    });

    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }

    next();
};

const AirPriceValidation = (req, res, next) => {
    const airPriceschema = Joi.object({
        price_id: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('Price ID'),
            'string.empty': CustomMessages.paramRequire('Price ID'),
            'any.required': CustomMessages.paramRequire('Price ID'),
        })
    });

    const { error } = airPriceschema.validate(req.body, { abortEarly: false });

    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }

    next();
};
const OptionalServicesValidation = (req, res, next) => {
    const opServiceSchema = Joi.object({
        pre_booking_id: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('Pre Booking ID'),
            'string.empty': CustomMessages.paramRequire('Pre Booking ID'),
            'any.required': CustomMessages.paramRequire('Pre Booking ID'),
        }),
        apUniqueId: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('App Unique ID'),
            'string.empty': CustomMessages.paramRequire('App Unique ID'),
            'any.required': CustomMessages.paramRequire('App Unique ID'),
        }),
        saerchId: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('Search ID'),
            'string.empty': CustomMessages.paramRequire('Search ID'),
            'any.required': CustomMessages.paramRequire('Search ID'),
        }),
        pax: Joi.optional(),
    });

    const { error } = opServiceSchema.validate(req.body, { abortEarly: false });

    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }

    next();
};
const RepriceValidation = (req, res, next) => {
    const airPriceschema = Joi.object({
        op_id: Joi.optional(),
        ap_unique_id: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('App Unique ID'),
            'string.empty': CustomMessages.paramRequire('App Unique ID'),
            'any.required': CustomMessages.paramRequire('App Unique ID'),
        }),
        // app_reference: Joi.string().required().min(3).messages({
        //     'string.base': CustomMessages.paramRequire('App Unique ID'),
        //     'string.empty': CustomMessages.paramRequire('App Unique ID'),
        //     'any.required': CustomMessages.paramRequire('App Unique ID'),
        // }),
        saerchId: Joi.string().required().min(3).messages({
            'string.base': CustomMessages.paramRequire('App Unique ID'),
            'string.empty': CustomMessages.paramRequire('App Unique ID'),
            'any.required': CustomMessages.paramRequire('App Unique ID'),
        })
    });

    const { error } = airPriceschema.validate(req.body, { abortEarly: false });

    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }

    next();
};

const createReservationValidation = (req, res, next) => {
    const schema = Joi.object({
        pre_booking_id: Joi.string().required().messages({
            "any.required": CustomMessages.paramRequire('App Reference'),
        }),
        app_reference: Joi.string().required().messages({
            "any.required": CustomMessages.paramRequire('App Reference'),
        }),
        booking_type: Joi.string()
            .valid('hold', 'confirm')
            .required()
            .messages({
                "any.only": "booking type must be either 'hold' or 'confirm' in small latter",
                "any.required": CustomMessages.paramRequire('Booking Type'),
            }),
        passenger_detail: Joi.object({
            ADT: passengerSchema.required(),   // ADT must be present
            CHD: passengerSchema.optional(),   // only validate if exists
            INF: passengerSchema.optional(),   // only validate if exists
        }).required(),
        contact_detail: Joi.object({
            country_code: Joi.string().required().messages({
                "any.required": "Country code is required",
            }),
            mobile: Joi.string().required().messages({
                "any.required": "Mobile number is required",
            }),
            email: Joi.string().trim().email().required().messages({
                "any.required": "Email is required",
                "string.email": "Invalid email format",
            }),

            gst_number: Joi.string().optional(),
            gst_customer: Joi.string().optional(),
            gst_customer_email: Joi.string().trim().email().allow('', null).optional(),
            gst_phone_number: Joi.string().optional(),
            gst_address: Joi.string().optional(),
            gst_state: Joi.string().optional(),
            gst_city: Joi.string().optional(),
            gst_pincode: Joi.string().allow('', null).optional(),
        }).required(),
    });
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
        return res.status(400).json({
            status: 0,
            message: "Validation error",
            errors: error.details.map(err => err.message),
        });
    }

    next();
};
const passengerSchema = Joi.array().items(
    Joi.object({
        prefix: Joi.string().required().messages({
            'string.base': CustomMessages.paramRequire('Prefix'),
            'string.empty': CustomMessages.paramRequire('Prefix'),
            'any.required': CustomMessages.paramRequire('Prefix'),
        }),
        first_name: Joi.string().required().messages({
            "any.required": "First name is required",
        }),
        last_name: Joi.string().required().messages({
            "any.required": "Last name is required",
        }),
        // ref: Joi.string().required().messages({
        //     "any.required": "Reference ID is required",
        // }),
        dob: Joi.optional(),
        age: Joi.optional()
    })
);

const HoldToConfirmValidation = (req, res, next) => {
    const schema = Joi.object({
        app_reference: Joi.string().required().messages({
            "any.required": "App Reference is required",
        }),
    })

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};

const DownloadFlightTicketValidation = (req, res, next) => {
    const schema = Joi.object({
        app_reference: Joi.string().required().messages({
            "any.required": "App Reference is required",
        }),
    })
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};

const FlightBookingReportValidataion = (req, res, next) => {
    const schema = Joi.object({
        fromDate: Joi.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/).messages({
            'string.pattern.base': CustomMessages.dateFormateValidation('From Date'),
        }),
        toDate: Joi.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/).messages({
            'string.pattern.base': CustomMessages.dateFormateValidation('To Date'),
        }),
        journeyDate: Joi.string().regex(/^\d{4}-\d{1,2}-\d{1,2}$/).messages({
            'string.pattern.base': CustomMessages.dateFormateValidation('Journey Date'),
        }),
        email: Joi.string().email().messages({
            'string.email': 'Email must be a valid email address',
        }),
        phone: Joi.string().pattern(/^[6-9]\d{9}$/).messages({
            'string.pattern.base': 'Mobile Number must be a valid 10-digit number starting with 6-9',
        }),
        pnr: Joi.string().allow('').optional(),
        st: Joi.string().allow('').optional(),
        status: Joi.string().allow('').optional(),
        app_reference: Joi.string().allow('').optional(),
    })

    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};
const CancelFlightViewValidataion = (req, res, next) => {
    const schema = Joi.object({
        app_reference: Joi.string().required().messages({
            "any.required": CustomMessages.paramRequire('App Reference'),
        }),
    })

    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};

const CancelFlightValidataion = (req, res, next) => {
    const schema = Joi.object({
        app_reference: Joi.string().required().messages({
            "any.required": "App Reference is required",
        }),
        users: Joi.optional(),
        data: Joi.optional(),
        remarks: Joi.optional(),
        type: Joi.optional(),
    })

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};

const FinalCancelFlightBooking = (req, res, next) => {
    const schema = Joi.object({
        app_reference: Joi.string().required().messages({
            "any.required": "App Reference is required",
        }),
        users: Joi.optional(),
        data: Joi.optional(),
        remarks: Joi.optional(),
        type: Joi.optional(),
    })

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};
const BookingRefundValidation = (req, res, next) => {
    const schema = Joi.object({
        created_datetime_from: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required()
            .messages({
                "any.required": "Created Date To is required",
                "string.pattern.base": "Created Date To must be in YYYY-MM-DD format",
        }),
        created_datetime_to: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .messages({
                "string.pattern.base": "Created Date To must be in YYYY-MM-DD format",
        }),
    })
    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};
const BookingRefundReceiptValidation = (req, res, next) => {
    const schema = Joi.object({
        ref_id: Joi.string().required().messages({
            "any.required": "Reference id is required",
        }),
    })
    const { error } = schema.validate(req.query, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};

const holdBookingDetailValidation = (req, res, next) => {
    const schema = Joi.object({
        app_reference: Joi.string().required().messages({
            "any.required": "App Reference is required",
        }),
    })

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};
const unprocessTicketValidation = (req, res, next) => {
    const schema = Joi.object({
        app_reference: Joi.string().required().messages({
            "any.required": "App Reference is required",
        }),
    })

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
        return res.status(400).json({
            status: 0,
            message: CustomMessages.validationErr(),
            errors: error.details.map(err => err.message),
        });
    }
    next();
};


module.exports = {
    AirPortSearchValidation, GetFareRulesValidation, FlightSearchValidation, AirPriceValidation, createReservationValidation, CountrySearchValidation, FlightBookingReportValidataion, CancelFlightViewValidataion, CancelFlightValidataion,
    RepriceValidation, OptionalServicesValidation,HoldToConfirmValidation,DownloadFlightTicketValidation,
    holdBookingDetailValidation,unprocessTicketValidation,FinalCancelFlightBooking,BookingRefundValidation,BookingRefundReceiptValidation
};
