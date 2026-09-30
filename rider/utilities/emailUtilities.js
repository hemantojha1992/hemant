const nodemailer = require('nodemailer');
const { SMTP_OTP_MAIL, SMTP_OTP_PASSWORD, SMTP_MAIL, SMTP_PASSWORD } = process.env;
const fs = require('fs');

// Create a log file
const logStream = fs.createWriteStream('rider/logs/email_log.txt', { flags: 'a' });

const transporter1 = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_OTP_MAIL,
    pass: SMTP_OTP_PASSWORD,
  },
});


function logEmailSuccess(message) {
  const logMessage = `[SUCCESS] - ${new Date().toISOString()} - ${message}\n`;
  logStream.write(logMessage);
}

function logEmailError(message, error) {
  const logMessage = `[ERROR] - ${new Date().toISOString()} - ${message}\n`;
  logStream.write(logMessage);
//   console.error(error);
}

function sendOTP(recipient, otp) {
  return new Promise((resolve, reject) => {
    const mailOptions = {
      from: SMTP_OTP_MAIL,
      to: recipient,
      subject: 'OTP for Authentication',
      text: `Your OTP code is: ${otp}`,
    };

    transporter1.sendMail(mailOptions, (error, info) => {
      if (error) {
        const errorMessage = 'Error sending OTP email';
        logEmailError(errorMessage, error);
        reject(errorMessage);
      } else {
        const successMessage = 'OTP email sent successfully';
        logEmailSuccess(successMessage);
        console.log('Email sent: ' + info.response);
        resolve(successMessage);
      }
    });
  });
}

function sendOtherEmail(recipient, subject, message) {
  return new Promise((resolve, reject) => {
    const mailOptions = {
      from: SMTP_MAIL,
      to: recipient,
      subject: subject,
      text: message,
    };

    transporter2.sendMail(mailOptions, (error, info) => {
      if (error) {
        const errorMessage = 'Error sending other email';
        logEmailError(errorMessage, error);
        reject(errorMessage);
      } else {
        const successMessage = 'Other email sent successfully';
        logEmailSuccess(successMessage);
        console.log('Email sent: ' + info.response);
        resolve(successMessage);
      }
    });
  });
}

module.exports = { sendOTP, sendOtherEmail };
