import { Module } from '@nestjs/common';
import { Fail2banService } from './fail2ban.service';

@Module({
  providers: [Fail2banService],
  exports: [Fail2banService],
})
export class SecurityModule {}
