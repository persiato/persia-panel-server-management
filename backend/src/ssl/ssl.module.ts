import { Module } from '@nestjs/common';
import { AcmeModule } from '../system/acme/acme.module';
import { NginxModule } from '../system/nginx/nginx.module';
import { SslService } from './ssl.service';
import { SslController } from './ssl.controller';

@Module({
  imports: [AcmeModule, NginxModule],
  controllers: [SslController],
  providers: [SslService],
})
export class SslModule {}
