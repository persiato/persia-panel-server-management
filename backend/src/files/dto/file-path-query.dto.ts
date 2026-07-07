import { IsOptional, IsString } from 'class-validator';

export class FilePathQueryDto {
  @IsString()
  domainId: string;

  @IsOptional()
  @IsString()
  path?: string;
}
