import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels(process.env.LOG_LEVEL ?? 'log'),
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  const corsOrigin = config.get('corsOrigin', { infer: true });

  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({ origin: corsOrigin, credentials: true });
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.get('swaggerEnabled', { infer: true })) {
    const doc = new DocumentBuilder()
      .setTitle('Restaurant SaaS API')
      .setDescription(
        'Multi-tenant restaurant management. Every tenant-scoped query is filtered by the ' +
          'restaurantId carried in the verified access token — never by anything the client sends.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API      → http://localhost:${port}/api`);
  logger.log(`Swagger  → http://localhost:${port}/api/docs`);
  logger.log(`Realtime → ws://localhost:${port}/realtime`);
  logger.log(`CORS     → ${corsOrigin.join(', ')}`);
}

function logLevels(level: string) {
  const order = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
  const idx = Math.max(0, order.indexOf(level as (typeof order)[number]));
  return order.slice(0, idx + 1);
}

void bootstrap();
