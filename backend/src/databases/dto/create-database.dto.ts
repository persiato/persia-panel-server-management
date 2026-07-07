import { IsEnum, IsString, Matches } from 'class-validator';
import { DatabaseEngine } from '@prisma/client';

export class CreateDatabaseDto {
  @IsString()
  domainId: string;

  @IsEnum(DatabaseEngine)
  engine: DatabaseEngine;

  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{0,13}$/, {
    message:
      'name must be alphanumeric/underscore, up to 14 chars, starting with a letter',
  })
  name: string;
}
