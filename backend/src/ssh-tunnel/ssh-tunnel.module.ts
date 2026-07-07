import { Module } from '@nestjs/common';
import { SystemSshTunnelModule } from '../system/ssh-tunnel/ssh-tunnel.module';
import { SshTunnelService } from './ssh-tunnel.service';
import { SshTunnelController } from './ssh-tunnel.controller';

@Module({
  imports: [SystemSshTunnelModule],
  controllers: [SshTunnelController],
  providers: [SshTunnelService],
})
export class SshTunnelModule {}
