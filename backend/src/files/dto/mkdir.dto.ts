import { IsString } from 'class-validator';

export class MkdirDto {
  @IsString()
  domainId: string;

  @IsString()
  path: string;
}
