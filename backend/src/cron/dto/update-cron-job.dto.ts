import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateCronJobDto } from './create-cron-job.dto';

export class UpdateCronJobDto extends PartialType(CreateCronJobDto) {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
