import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SendgridService {
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    sgMail.setApiKey(apiKey);
  }

  async sendMail(options: {
    to: string | string[];
    subject: string;
    template?: string;
    context?: Record<string, any>;
    text?: string;
    html?: string;
  }): Promise<void> {
    const from = this.configService.get<string>('SENDGRID_MAIL_FROM');

    let htmlContent = options.html;

    // Nếu có template, render nó
    if (options.template && options.context) {
      htmlContent = await this.renderTemplate(
        options.template,
        options.context,
      );
    }

    const msg = {
      to: options.to,
      from,
      subject: options.subject,
      text: options.text,
      html: htmlContent,
    };

    try {
      await sgMail.send(msg);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  private async renderTemplate(
    templateName: string,
    context: Record<string, any>,
  ): Promise<string> {
    const templatesDir = path.join(__dirname, 'templates');
    const templatePath = path.join(templatesDir, `${templateName}`);

    try {
      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateContent);
      return template(context);
    } catch (error) {
      console.error(`Error loading template ${templateName}:`, error);
      throw error;
    }
  }
}
