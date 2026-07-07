import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrontabService } from '../system/crontab/crontab.service';
import { CreateCronJobDto } from './dto/create-cron-job.dto';
import { UpdateCronJobDto } from './dto/update-cron-job.dto';

@Injectable()
export class CronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crontab: CrontabService,
  ) {}

  private async syncOwner(ownerId: string) {
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    const jobs = await this.prisma.cronJob.findMany({
      where: { ownerId, isEnabled: true },
    });
    await this.crontab.sync(
      owner.username,
      jobs.map((j) => ({ schedule: j.schedule, command: j.command })),
    );
  }

  async create(ownerId: string, dto: CreateCronJobDto) {
    const job = await this.prisma.cronJob.create({
      data: { ownerId, schedule: dto.schedule, command: dto.command },
    });
    try {
      await this.syncOwner(ownerId);
    } catch {
      await this.prisma.cronJob
        .delete({ where: { id: job.id } })
        .catch(() => undefined);
      throw new InternalServerErrorException(
        'Failed to activate cron job in the system crontab',
      );
    }
    return job;
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.cronJob.findMany({ where: { ownerId } });
  }

  findAll() {
    return this.prisma.cronJob.findMany();
  }

  private async findOwned(id: string, ownerId: string, isAdmin: boolean) {
    const job = await this.prisma.cronJob.findUnique({ where: { id } });
    if (!job || (!isAdmin && job.ownerId !== ownerId)) {
      throw new NotFoundException('Cron job not found');
    }
    return job;
  }

  async update(
    id: string,
    ownerId: string,
    isAdmin: boolean,
    dto: UpdateCronJobDto,
  ) {
    const job = await this.findOwned(id, ownerId, isAdmin);
    const updated = await this.prisma.cronJob.update({
      where: { id: job.id },
      data: {
        schedule: dto.schedule ?? job.schedule,
        command: dto.command ?? job.command,
        isEnabled: dto.isEnabled ?? job.isEnabled,
      },
    });
    try {
      await this.syncOwner(job.ownerId);
    } catch {
      await this.prisma.cronJob
        .update({
          where: { id: job.id },
          data: {
            schedule: job.schedule,
            command: job.command,
            isEnabled: job.isEnabled,
          },
        })
        .catch(() => undefined);
      throw new InternalServerErrorException(
        'Failed to update the system crontab',
      );
    }
    return updated;
  }

  async remove(id: string, ownerId: string, isAdmin: boolean) {
    const job = await this.findOwned(id, ownerId, isAdmin);
    await this.prisma.cronJob.delete({ where: { id: job.id } });
    try {
      await this.syncOwner(job.ownerId);
    } catch {
      throw new InternalServerErrorException(
        'Cron job deleted, but the system crontab could not be updated',
      );
    }
    return { success: true };
  }
}
