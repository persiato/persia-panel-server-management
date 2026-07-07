import { IsString } from 'class-validator';

export class CreateBackupDto {
  @IsString()
  domainId: string;
}
