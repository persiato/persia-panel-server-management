import { Module } from '@nestjs/common';
import { SecurityModule as SystemSecurityModule } from '../system/security/security.module';
import { SecurityController } from './security.controller';

@Module({
  imports: [SystemSecurityModule],
  controllers: [SecurityController],
})
export class SecurityModule {}
