import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CronService } from './cron.service';
import { CreateCronJobDto } from './dto/create-cron-job.dto';
import { UpdateCronJobDto } from './dto/update-cron-job.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cron-jobs')
export class CronController {
  constructor(private readonly cronService: CronService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCronJobDto) {
    return this.cronService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.ADMIN) {
      return this.cronService.findAll();
    }
    return this.cronService.findAllForOwner(user.userId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCronJobDto,
  ) {
    return this.cronService.update(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
      dto,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.cronService.remove(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }
}
