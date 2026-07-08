import { Module } from '@nestjs/common';
import { SystemBackupDestinationModule } from '../system/backup-destination/backup-destination.module';
import { BackupDestinationService } from './backup-destination.service';
import { BackupDestinationController } from './backup-destination.controller';

@Module({
  imports: [SystemBackupDestinationModule],
  controllers: [BackupDestinationController],
  providers: [BackupDestinationService],
  exports: [BackupDestinationService],
})
export class BackupDestinationModule {}
