import { Module } from '@nestjs/common';
import { FirewallModule as SystemFirewallModule } from '../system/firewall/firewall.module';
import { FirewallController } from './firewall.controller';

@Module({
  imports: [SystemFirewallModule],
  controllers: [FirewallController],
})
export class FirewallModule {}
