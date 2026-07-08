import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BackupDestinationService } from './backup-destination.service';
import { SaveBackupDestinationDto } from './dto/save-backup-destination.dto';

// Offsite backup storage is a server-wide setting (one destination for the
// whole box), not a per-user resource — ADMIN-only, same as the SSH tunnel.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('system/backup-destination')
export class BackupDestinationController {
  constructor(private readonly backupDestination: BackupDestinationService) {}

  @Get()
  getStatus() {
    return this.backupDestination.getStatus();
  }

  @Put()
  save(@Body() dto: SaveBackupDestinationDto) {
    return this.backupDestination.save(dto);
  }

  @Delete()
  remove() {
    return this.backupDestination.remove();
  }

  @Post('test')
  test() {
    return this.backupDestination.testConnection();
  }
}
