import {
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FirewallService } from '../system/firewall/firewall.service';
import { CreateFirewallRuleDto } from './dto/create-firewall-rule.dto';

// Firewall rules affect the whole server, not a single user's resources, so
// this is intentionally restricted to ADMIN only (unlike per-domain modules).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('system/firewall')
export class FirewallController {
  constructor(private readonly firewall: FirewallService) {}

  @Get('rules')
  async status() {
    try {
      return await this.firewall.status();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to read firewall status: ${(err as Error).message}`,
      );
    }
  }

  @Post('rules')
  async addRule(@Body() dto: CreateFirewallRuleDto) {
    try {
      await this.firewall.addRule(
        dto.action,
        dto.port,
        dto.proto ?? 'tcp',
        dto.from,
      );
    } catch (err) {
      throw new InternalServerErrorException((err as Error).message);
    }
    return this.firewall.status();
  }

  @Delete('rules/:number')
  async deleteRule(@Param('number', ParseIntPipe) number: number) {
    try {
      await this.firewall.deleteRule(number);
    } catch (err) {
      throw new InternalServerErrorException((err as Error).message);
    }
    return this.firewall.status();
  }
}
