import { SendgridService } from './sendgrid.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private sendgridService: SendgridService) {}

  async testMail() {
    await this.sendgridService.sendMail({
      to: '', // list of receivers
      subject: 'Testing Nest MailerModule',
      text: 'welcome',
      template: 'register.hbs',
      context: {
        name: '',
        activationCode: 123456,
      },
    });
    return 'Send ok';
  }
}
