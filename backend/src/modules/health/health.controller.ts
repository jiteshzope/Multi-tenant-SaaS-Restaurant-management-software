import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — the process is up' })
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness — the process can reach PostgreSQL' })
  async ready() {
    const started = Date.now();
    try {
      await this.prisma.ping();
      return { status: 'ok', database: { status: 'up', latencyMs: Date.now() - started } };
    } catch (e) {
      return {
        status: 'error',
        database: { status: 'down', message: (e as Error).message },
      };
    }
  }
}
