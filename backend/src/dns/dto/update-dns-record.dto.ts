import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DnsRecordType } from '@prisma/client';

export class UpdateDnsRecordDto {
  @IsOptional()
  @IsEnum(DnsRecordType)
  type?: DnsRecordType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(604800)
  ttl?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  priority?: number;
}
