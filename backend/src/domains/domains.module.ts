import { Module } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { DomainsController } from './domains.controller';
import { NginxModule } from '../system/nginx/nginx.module';
import { RuntimeModule } from '../system/runtime/runtime.module';
import { SystemDnsModule } from '../system/dns/dns.module';
import { SystemMailModule } from '../system/mail/mail.module';
import { DnsModule } from '../dns/dns.module';

@Module({
  imports: [
    NginxModule,
    RuntimeModule,
    SystemDnsModule,
    SystemMailModule,
    DnsModule,
  ],
  controllers: [DomainsController],
  providers: [DomainsService],
})
export class DomainsModule {}
