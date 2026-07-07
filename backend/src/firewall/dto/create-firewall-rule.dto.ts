import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateFirewallRuleDto {
  @IsIn(['allow', 'deny'])
  action: 'allow' | 'deny';

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsOptional()
  @IsIn(['tcp', 'udp'])
  proto?: 'tcp' | 'udp';

  @IsOptional()
  @IsString()
  from?: string;
}
