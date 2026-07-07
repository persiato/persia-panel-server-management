import { Module } from '@nestjs/common';
import { AppInstallerModule } from '../system/app-installer/app-installer.module';
import { DbProvisionerModule } from '../system/db-provisioner/db-provisioner.module';
import { AppsService } from './apps.service';
import { AppsController } from './apps.controller';

@Module({
  imports: [AppInstallerModule, DbProvisionerModule],
  controllers: [AppsController],
  providers: [AppsService],
})
export class AppsModule {}
