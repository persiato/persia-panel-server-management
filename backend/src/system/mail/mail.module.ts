import { Module } from '@nestjs/common';
import { SystemMailService } from './mail.service';

@Module({
  providers: [SystemMailService],
  exports: [SystemMailService],
})
export class SystemMailModule {}
