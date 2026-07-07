import { Module } from '@nestjs/common';
import { AcmeService } from './acme.service';

@Module({
  providers: [AcmeService],
  exports: [AcmeService],
})
export class AcmeModule {}
