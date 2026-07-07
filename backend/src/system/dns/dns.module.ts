import { Module } from '@nestjs/common';
import { SystemDnsService } from './dns.service';

@Module({
  providers: [SystemDnsService],
  exports: [SystemDnsService],
})
export class SystemDnsModule {}
