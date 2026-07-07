import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DnsService } from './dns.service';
import { CreateDnsRecordDto } from './dto/create-dns-record.dto';
import { UpdateDnsRecordDto } from './dto/update-dns-record.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dns-records')
export class DnsController {
  constructor(private readonly dnsService: DnsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('domainId') domainId: string) {
    return this.dnsService.list(
      domainId,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDnsRecordDto) {
    return this.dnsService.create(
      user.userId,
      user.role === UserRole.ADMIN,
      dto,
    );
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDnsRecordDto,
  ) {
    return this.dnsService.update(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
      dto,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dnsService.remove(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }
}
