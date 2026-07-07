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
import { SshTunnelService } from './ssh-tunnel.service';
import { SaveSshTunnelConfigDto } from './dto/save-ssh-tunnel-config.dto';

// Fallback connectivity is a server-wide setting (one tunnel for the whole
// box), not a per-user resource — ADMIN-only, like Firewall/Security.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('system/ssh-tunnel')
export class SshTunnelController {
  constructor(private readonly sshTunnel: SshTunnelService) {}

  @Get()
  getStatus() {
    return this.sshTunnel.getStatus();
  }

  @Put()
  save(@Body() dto: SaveSshTunnelConfigDto) {
    return this.sshTunnel.save(dto);
  }

  @Delete()
  remove() {
    return this.sshTunnel.remove();
  }

  @Post('test')
  test() {
    return this.sshTunnel.testConnection();
  }
}
