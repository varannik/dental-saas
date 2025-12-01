import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { config } from '../config';
import { logger } from '../utils/logger';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    template: string;
    data: Record<string, unknown>;
  }) {
    try {
      const html = this.compileTemplate(options.template, options.data);

      const info = await this.transporter.sendMail({
        from: config.smtp.from,
        to: options.to,
        subject: options.subject,
        html,
      });

      logger.info(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  private compileTemplate(template: string, data: Record<string, unknown>) {
    const compiled = Handlebars.compile(template);
    return compiled(data);
  }

  async sendWelcomeEmail(email: string, name: string) {
    return this.sendEmail({
      to: email,
      subject: 'Welcome to SaaS Platform',
      template: '<h1>Welcome, {{name}}!</h1><p>Thank you for signing up.</p>',
      data: { name },
    });
  }

  async sendPasswordResetEmail(email: string, resetLink: string) {
    return this.sendEmail({
      to: email,
      subject: 'Password Reset Request',
      template: '<p>Click <a href="{{resetLink}}">here</a> to reset your password.</p>',
      data: { resetLink },
    });
  }
}

