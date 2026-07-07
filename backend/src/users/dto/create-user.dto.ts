import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9]{2,15}$/, {
    message:
      'username must be lowercase alphanumeric, 3-16 chars, starting with a letter',
  })
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsInt()
  @Min(0)
  diskQuotaMb?: number;
}
