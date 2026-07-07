import { Module } from '@nestjs/common';
import { SystemDnsModule } from '../system/dns/dns.module';
import { DnsService } from './dns.service';
import { DnsController } from './dns.controller';

@Module({
  imports: [SystemDnsModule],
  controllers: [DnsController],
  providers: [DnsService],
  exports: [DnsService],
})
export class DnsModule {}
