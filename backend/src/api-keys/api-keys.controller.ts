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
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.apiKeysService.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.generate(user.userId, dto);
  }

  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.apiKeysService.revoke(
      id,
      user.userId,
      user.role === UserRole.ADMIN,
    );
  }
}
