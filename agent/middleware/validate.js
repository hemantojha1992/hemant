const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.validate(req.body, { abortEarly: false });
    if (result.error) {
      return res.status(400).json({
        status:0,
        message: 'Validation failed',
        details: result.error.details.map(d => d.message)
      });
    }
    req.validatedBody = result.value;
    next();
  };
};

module.exports = validate;
