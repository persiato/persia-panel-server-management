import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateEmailAccountDto {
  @IsString()
  domainId: string;

  @IsString()
  localPart: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quotaMb?: number;
}
