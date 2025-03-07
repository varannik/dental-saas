/**
 * Email Service
 */
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify transporter connection
const verifyConnection = async () => {
  try {
    await transporter.verify();
    logger.info('Email service connected successfully');
    return true;
  } catch (err) {
    logger.error('Email service connection failed:', err);
    return false;
  }
};

// Send email verification
const sendVerificationEmail = async (email, token, tenantDomain) => {
  try {
    const verificationUrl = `https://${tenantDomain}/verify-email?token=${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <h1>Email Verification</h1>
        <p>Thank you for registering with Dental SaaS. Please verify your email address by clicking the link below:</p>
        <p><a href="${verificationUrl}">Verify Email</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you did not create an account, please ignore this email.</p>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Verification email sent: ${info.messageId}`);
    return true;
  } catch (err) {
    logger.error('Error sending verification email:', err);
    return false;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, token, tenantDomain) => {
  try {
    const resetUrl = `https://${tenantDomain}/reset-password?token=${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Reset Your Password',
      html: `
        <h1>Password Reset</h1>
        <p>You have requested to reset your password. Please click the link below to set a new password:</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request a password reset, please ignore this email.</p>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent: ${info.messageId}`);
    return true;
  } catch (err) {
    logger.error('Error sending password reset email:', err);
    return false;
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, firstName, tenantName, tenantDomain) => {
  try {
    const loginUrl = `https://${tenantDomain}/login`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Welcome to ${tenantName}`,
      html: `
        <h1>Welcome to ${tenantName}</h1>
        <p>Hello ${firstName || 'there'},</p>
        <p>Your account has been created successfully. You can now log in to the platform using your email and password.</p>
        <p><a href="${loginUrl}">Login to Your Account</a></p>
        <p>Thank you for choosing Dental SaaS for your practice management needs.</p>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Welcome email sent: ${info.messageId}`);
    return true;
  } catch (err) {
    logger.error('Error sending welcome email:', err);
    return false;
  }
};

module.exports = {
  verifyConnection,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
}; 