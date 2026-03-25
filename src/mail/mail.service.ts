import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}
  testMail() {
    this.mailerService.sendMail({
      to: '', // list of receivers
      subject: 'Testing Nest MailerModule', // Subject line
      text: 'welcome', // plaintext body
      template: 'register.hbs',
      context: {
        name: '',
        activationCode: 123456,
      },
    });
    return 'Send ok';
  }
}
