import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { CronController } from './cron.controller';
import { CrontabModule } from '../system/crontab/crontab.module';

@Module({
  imports: [CrontabModule],
  controllers: [CronController],
  providers: [CronService],
})
export class CronModule {}
