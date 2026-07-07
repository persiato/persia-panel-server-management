import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { AppRuntime } from '@prisma/client';

// Kept in sync with the php_versions array in installer/install.sh — those
// are the only PHP-FPM pools that actually exist on the server. phpVersion
// is interpolated into filesystem paths and socket names in RuntimeService/
// NginxService (e.g. `/etc/php/{version}/fpm/pool.d`), so without this
// allowlist any authenticated user could pass an arbitrary string and make
// the root backend process read/write paths outside the intended directory.
export const SUPPORTED_PHP_VERSIONS = ['7.4', '8.0', '8.1', '8.2', '8.3'];

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
  @IsIn(SUPPORTED_PHP_VERSIONS)
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
