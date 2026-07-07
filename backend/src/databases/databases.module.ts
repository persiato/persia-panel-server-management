import { Module } from '@nestjs/common';
import { DatabasesService } from './databases.service';
import { DatabasesController } from './databases.controller';
import { DbProvisionerModule } from '../system/db-provisioner/db-provisioner.module';

@Module({
  imports: [DbProvisionerModule],
  controllers: [DatabasesController],
  providers: [DatabasesService],
})
export class DatabasesModule {}
