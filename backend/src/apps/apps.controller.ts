import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AppsService } from './apps.service';
import { InstallAppDto } from './dto/install-app.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('apps')
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  private isAdmin(user: AuthUser) {
    return user.role === UserRole.ADMIN;
  }

  @Get('catalog')
  listCatalog() {
    return this.appsService.listCatalog();
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    if (this.isAdmin(user)) {
      return this.appsService.findAll();
    }
    return this.appsService.findAllForOwner(user.userId);
  }

  @Post()
  install(@CurrentUser() user: AuthUser, @Body() dto: InstallAppDto) {
    return this.appsService.install(user.userId, this.isAdmin(user), dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appsService.remove(id, user.userId, this.isAdmin(user));
  }
}
