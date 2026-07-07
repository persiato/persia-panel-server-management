import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmailService } from './email.service';
import { CreateEmailAccountDto } from './dto/create-email-account.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('email-accounts')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('domainId') domainId: string) {
    return this.emailService.list(
      domainId,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailAccountDto) {
    return this.emailService.create(
      user.userId,
      user.role === UserRole.ADMIN,
      dto,
    );
  }

  @Post(':id/reset-password')
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.emailService.resetPassword(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.emailService.remove(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }
}
