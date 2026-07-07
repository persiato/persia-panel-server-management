import { Module } from '@nestjs/common';
import { SystemSshTunnelService } from './ssh-tunnel.service';

@Module({
  providers: [SystemSshTunnelService],
  exports: [SystemSshTunnelService],
})
export class SystemSshTunnelModule {}
