import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BackupsService } from './backups.service';
import { CreateBackupDto } from './dto/create-backup.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  private isAdmin(user: AuthUser) {
    return user.role === UserRole.ADMIN;
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBackupDto) {
    return this.backupsService.create(user.userId, this.isAdmin(user), dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    if (this.isAdmin(user)) {
      return this.backupsService.findAll();
    }
    return this.backupsService.findAllForOwner(user.userId);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { path, fileName } = await this.backupsService.getDownloadPath(
      id,
      user.userId,
      this.isAdmin(user),
    );
    const { size } = await stat(path);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Length', size.toString());
    res.setHeader('Content-Type', 'application/gzip');
    createReadStream(path).pipe(res);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.backupsService.restore(id, user.userId, this.isAdmin(user));
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.backupsService.remove(id, user.userId, this.isAdmin(user));
  }
}
