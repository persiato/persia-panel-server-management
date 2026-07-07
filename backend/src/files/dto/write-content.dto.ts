import { IsString } from 'class-validator';

export class WriteContentDto {
  @IsString()
  domainId: string;

  @IsString()
  path: string;

  @IsString()
  content: string;
}
