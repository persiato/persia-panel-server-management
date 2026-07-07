import { Global, Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';

// @Global() so ApiKeyService can be injected straight into JwtAuthGuard
// (used via @UseGuards in every controller across the app) without every
// feature module having to import ApiKeysModule explicitly — mirrors how
// PrismaModule makes PrismaService available everywhere.
@Global()
@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
