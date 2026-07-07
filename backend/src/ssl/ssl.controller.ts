import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SslService } from './ssl.service';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('domains/:id/ssl')
export class SslController {
  constructor(private readonly sslService: SslService) {}

  @Post()
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sslService.issue(id, user.userId, user.role === UserRole.ADMIN);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sslService.remove(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }
}
