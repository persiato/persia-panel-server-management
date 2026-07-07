import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { AppRuntime } from '@prisma/client';

export class CreateDomainDto {
  @IsString()
  @Matches(
    /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/,
    {
      message: 'name must be a valid domain name',
    },
  )
  name: string;

  @IsOptional()
  @IsEnum(AppRuntime)
  runtime?: AppRuntime;

  @IsOptional()
  @IsString()
  phpVersion?: string;

  @IsOptional()
  @IsString()
  nodeVersion?: string;

  @IsOptional()
  @IsString()
  pythonVersion?: string;

  @IsOptional()
  @IsString()
  appEntryPoint?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  appPort?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(?!\/)(?!.*\.\.)[a-zA-Z0-9_\-/]{1,100}$/, {
    message:
      'publicSubdir must be a relative path without ".." segments (e.g. "public")',
  })
  publicSubdir?: string;
}
