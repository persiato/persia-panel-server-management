import { Module } from '@nestjs/common';
import { SystemBackupDestinationService } from './backup-destination.service';

@Module({
  providers: [SystemBackupDestinationService],
  exports: [SystemBackupDestinationService],
})
export class SystemBackupDestinationModule {}
