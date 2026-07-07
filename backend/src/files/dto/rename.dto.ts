import { IsString } from 'class-validator';

export class RenameDto {
  @IsString()
  domainId: string;

  @IsString()
  path: string;

  @IsString()
  newName: string;
}
