import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DomainsModule } from './domains/domains.module';
import { NginxModule } from './system/nginx/nginx.module';
import { RuntimeModule } from './system/runtime/runtime.module';
import { DatabasesModule } from './databases/databases.module';
import { FilesModule } from './files/files.module';
import { CronModule } from './cron/cron.module';
import { SslModule } from './ssl/ssl.module';
import { BackupsModule } from './backups/backups.module';
import { FirewallModule } from './firewall/firewall.module';
import { SecurityModule } from './security/security.module';
import { AppsModule } from './apps/apps.module';
import { SshTunnelModule } from './ssh-tunnel/ssh-tunnel.module';
import { DnsModule } from './dns/dns.module';
import { EmailModule } from './email/email.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { BackupDestinationModule } from './backup-destinations/backup-destination.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ApiKeysModule,
    AuthModule,
    UsersModule,
    DomainsModule,
    NginxModule,
    RuntimeModule,
    DatabasesModule,
    FilesModule,
    CronModule,
    SslModule,
    BackupsModule,
    FirewallModule,
    SecurityModule,
    AppsModule,
    SshTunnelModule,
    DnsModule,
    EmailModule,
    BackupDestinationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
