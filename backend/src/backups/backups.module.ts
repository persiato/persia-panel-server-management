import { Module } from '@nestjs/common';
import { BackupModule } from '../system/backup/backup.module';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';

@Module({
  imports: [BackupModule],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
