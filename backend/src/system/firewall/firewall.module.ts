import { Module } from '@nestjs/common';
import { FirewallService } from './firewall.service';

@Module({
  providers: [FirewallService],
  exports: [FirewallService],
})
export class FirewallModule {}
