import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SaveBackupDestinationDto {
  @IsString()
  host: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsString()
  username: string;

  @IsString()
  remotePath: string;

  // The PEM-encoded private key content. Optional on updates that only
  // change host/port/username/remotePath — the previously saved key file is
  // reused — but required the first time a destination is configured.
  @IsOptional()
  @IsString()
  privateKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
