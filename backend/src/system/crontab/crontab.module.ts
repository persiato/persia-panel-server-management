import { Module } from '@nestjs/common';
import { CrontabService } from './crontab.service';

@Module({
  providers: [CrontabService],
  exports: [CrontabService],
})
export class CrontabModule {}
