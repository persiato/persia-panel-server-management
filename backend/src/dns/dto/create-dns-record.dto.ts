import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DnsRecordType } from '@prisma/client';

export class CreateDnsRecordDto {
  @IsString()
  domainId: string;

  @IsEnum(DnsRecordType)
  type: DnsRecordType;

  // Relative label within the zone, e.g. "@", "www", "mail".
  @IsString()
  name: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(604800)
  ttl?: number;

  // MX/SRV priority. Ignored for other record types.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(65535)
  priority?: number;
}
