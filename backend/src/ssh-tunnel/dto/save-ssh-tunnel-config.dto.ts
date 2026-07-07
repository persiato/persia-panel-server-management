import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SaveSshTunnelConfigDto {
  @IsString()
  host: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsString()
  username: string;

  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(65535)
  localProxyPort?: number;

  // The PEM-encoded private key content. Optional on updates that only
  // change host/port/username — the previously saved key file is reused —
  // but required the first time a tunnel is configured.
  @IsOptional()
  @IsString()
  privateKey?: string;

  // Whether the tunnel should be (re)started immediately after saving.
  // Defaults to true so "save" behaves like "save and connect" for the
  // common case; pass false to just persist config without connecting.
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
