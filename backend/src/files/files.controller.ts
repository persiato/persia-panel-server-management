import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FilesService } from './files.service';
import { FilePathQueryDto } from './dto/file-path-query.dto';
import { WriteContentDto } from './dto/write-content.dto';
import { MkdirDto } from './dto/mkdir.dto';
import { RenameDto } from './dto/rename.dto';

interface AuthUser {
  userId: string;
  role: UserRole;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  private isAdmin(user: AuthUser) {
    return user.role === UserRole.ADMIN;
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: FilePathQueryDto) {
    return this.filesService.list(
      query.domainId,
      user.userId,
      this.isAdmin(user),
      query.path ?? '.',
    );
  }

  @Get('content')
  readContent(@CurrentUser() user: AuthUser, @Query() query: FilePathQueryDto) {
    return this.filesService
      .readText(
        query.domainId,
        user.userId,
        this.isAdmin(user),
        query.path ?? '.',
      )
      .then((content) => ({ content }));
  }

  @Put('content')
  writeContent(@CurrentUser() user: AuthUser, @Body() dto: WriteContentDto) {
    return this.filesService
      .writeText(
        dto.domainId,
        user.userId,
        this.isAdmin(user),
        dto.path,
        dto.content,
      )
      .then(() => ({ success: true }));
  }

  @Post('mkdir')
  mkdir(@CurrentUser() user: AuthUser, @Body() dto: MkdirDto) {
    return this.filesService
      .mkdir(dto.domainId, user.userId, this.isAdmin(user), dto.path)
      .then(() => ({ success: true }));
  }

  @Post('rename')
  rename(@CurrentUser() user: AuthUser, @Body() dto: RenameDto) {
    return this.filesService
      .rename(
        dto.domainId,
        user.userId,
        this.isAdmin(user),
        dto.path,
        dto.newName,
      )
      .then(() => ({ success: true }));
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser, @Query() query: FilePathQueryDto) {
    return this.filesService
      .remove(
        query.domainId,
        user.userId,
        this.isAdmin(user),
        query.path ?? '.',
      )
      .then(() => ({ success: true }));
  }

  @Get('download')
  async download(
    @CurrentUser() user: AuthUser,
    @Query() query: FilePathQueryDto,
    @Res() res: Response,
  ) {
    const { stream, size, name } = await this.filesService.getReadableStream(
      query.domainId,
      user.userId,
      this.isAdmin(user),
      query.path ?? '.',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(name)}"`,
    );
    res.setHeader('Content-Length', size.toString());
    res.setHeader('Content-Type', 'application/octet-stream');
    stream.pipe(res);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Query() query: FilePathQueryDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const targetPath = [query.path, file.originalname]
      .filter(Boolean)
      .join('/');
    return this.filesService
      .writeBuffer(
        query.domainId,
        user.userId,
        this.isAdmin(user),
        targetPath,
        file.buffer,
      )
      .then(() => ({ success: true }));
  }
}
