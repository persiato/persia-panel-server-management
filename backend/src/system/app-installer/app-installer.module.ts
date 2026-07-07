import { Module } from '@nestjs/common';
import { AppInstallerService } from './app-installer.service';

@Module({
  providers: [AppInstallerService],
  exports: [AppInstallerService],
})
export class AppInstallerModule {}
