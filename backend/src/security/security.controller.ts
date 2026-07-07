import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Fail2banService } from '../system/security/fail2ban.service';
import { BanIpDto } from './dto/ban-ip.dto';

// Intrusion-prevention state is server-wide, so — like the Firewall
// controller — this is intentionally ADMIN-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('system/security')
export class SecurityController {
  constructor(private readonly fail2ban: Fail2banService) {}

  @Get('status')
  async status() {
    try {
      return await this.fail2ban.status();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to read fail2ban status: ${(err as Error).message}`,
      );
    }
  }

  @Post('ban')
  async ban(@Body() dto: BanIpDto) {
    try {
      await this.fail2ban.banIp(dto.jail, dto.ip);
    } catch (err) {
      throw new InternalServerErrorException((err as Error).message);
    }
    return this.fail2ban.status();
  }

  @Post('unban')
  async unban(@Body() dto: BanIpDto) {
    try {
      await this.fail2ban.unbanIp(dto.jail, dto.ip);
    } catch (err) {
      throw new InternalServerErrorException((err as Error).message);
    }
    return this.fail2ban.status();
  }
}
