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
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('domains')
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDomainDto) {
    return this.domainsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    if (user.role === UserRole.ADMIN) {
      return this.domainsService.findAll();
    }
    return this.domainsService.findAllForOwner(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.domainsService.findOwned(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.RESELLER)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.domainsService.remove(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }
}
