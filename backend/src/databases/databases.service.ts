import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseEngine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DbProvisionerService } from '../system/db-provisioner/db-provisioner.service';
import { CreateDatabaseDto } from './dto/create-database.dto';

@Injectable()
export class DatabasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioner: DbProvisionerService,
  ) {}

  async create(ownerId: string, dto: CreateDatabaseDto) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: dto.domainId },
    });
    if (!domain || domain.ownerId !== ownerId) {
      throw new NotFoundException('Domain not found');
    }
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });

    const identifier = `${owner.username}_${dto.name}`;
    if (identifier.length > 32) {
      throw new BadRequestException(
        'Database name is too long once combined with your username',
      );
    }

    const existing = await this.prisma.database.findUnique({
      where: { name_engine: { name: identifier, engine: dto.engine } },
    });
    if (existing) {
      throw new ConflictException('A database with this name already exists');
    }

    const password = this.provisioner.generatePassword();
    if (dto.engine === DatabaseEngine.MYSQL) {
      await this.provisioner.createMysqlDatabase(
        identifier,
        identifier,
        password,
      );
    } else {
      await this.provisioner.createPostgresDatabase(
        identifier,
        identifier,
        password,
      );
    }

    const database = await this.prisma.database.create({
      data: {
        name: identifier,
        engine: dto.engine,
        username: identifier,
        domainId: dto.domainId,
      },
    });

    return { ...database, password };
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.database.findMany({ where: { domain: { ownerId } } });
  }

  findAll() {
    return this.prisma.database.findMany();
  }

  private async findOwned(id: string, ownerId: string, isAdmin: boolean) {
    const database = await this.prisma.database.findUnique({
      where: { id },
      include: { domain: true },
    });
    if (!database || (!isAdmin && database.domain.ownerId !== ownerId)) {
      throw new NotFoundException('Database not found');
    }
    return database;
  }

  async resetPassword(id: string, ownerId: string, isAdmin: boolean) {
    const database = await this.findOwned(id, ownerId, isAdmin);
    const password = this.provisioner.generatePassword();
    if (database.engine === DatabaseEngine.MYSQL) {
      await this.provisioner.setMysqlPassword(database.username, password);
    } else {
      await this.provisioner.setPostgresPassword(database.username, password);
    }
    return { password };
  }

  async remove(id: string, ownerId: string, isAdmin: boolean) {
    const database = await this.findOwned(id, ownerId, isAdmin);
    if (database.engine === DatabaseEngine.MYSQL) {
      await this.provisioner.dropMysqlDatabase(
        database.name,
        database.username,
      );
    } else {
      await this.provisioner.dropPostgresDatabase(
        database.name,
        database.username,
      );
    }
    await this.prisma.database.delete({ where: { id } });
    return { success: true };
  }
}
