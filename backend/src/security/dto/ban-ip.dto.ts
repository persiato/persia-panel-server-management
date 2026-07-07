import { IsString } from 'class-validator';

export class BanIpDto {
  @IsString()
  jail: string;

  @IsString()
  ip: string;
}
