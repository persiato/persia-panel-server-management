import { IsOptional, IsString } from 'class-validator';

export class InstallAppDto {
  @IsString()
  domainId: string;

  @IsString()
  appId: string;

  // Relative subdirectory under the domain's documentRoot to install into,
  // e.g. "phpmyadmin" installs at documentRoot/phpmyadmin. Empty/omitted
  // installs at the document root itself. Validated against
  // assertValidRelativePath before ever touching the filesystem.
  @IsOptional()
  @IsString()
  targetPath?: string;
}
