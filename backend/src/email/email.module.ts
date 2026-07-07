import { Module } from '@nestjs/common';
import { SystemMailModule } from '../system/mail/mail.module';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

@Module({
  imports: [SystemMailModule],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
