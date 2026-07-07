import { Module } from '@nestjs/common';
import { DbProvisionerService } from './db-provisioner.service';

@Module({
  providers: [DbProvisionerService],
  exports: [DbProvisionerService],
})
export class DbProvisionerModule {}
