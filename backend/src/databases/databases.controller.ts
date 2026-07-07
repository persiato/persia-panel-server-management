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
import { DatabasesService } from './databases.service';
import { CreateDatabaseDto } from './dto/create-database.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('databases')
export class DatabasesController {
  constructor(private readonly databasesService: DatabasesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDatabaseDto) {
    return this.databasesService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.ADMIN) {
      return this.databasesService.findAll();
    }
    return this.databasesService.findAllForOwner(user.userId);
  }

  @Post(':id/reset-password')
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.databasesService.resetPassword(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.databasesService.remove(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }
}
