import { Module } from '@nestjs/common';
import { BackupModule } from '../system/backup/backup.module';
import { SystemBackupDestinationModule } from '../system/backup-destination/backup-destination.module';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';

@Module({
  imports: [BackupModule, SystemBackupDestinationModule],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
