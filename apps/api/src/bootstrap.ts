import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { loadEnv } from './config/env';

/** Shared HTTP hardening, used by main.ts and by integration tests so both run the same stack. */
export function configureApp(app: INestApplication, opts: { docs?: boolean } = {}): void {
  const env = loadEnv();
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  const origins = env.WEB_ORIGIN.split(',').map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'] });
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  app.enableShutdownHooks();
  if (opts.docs ?? true) {
    const config = new DocumentBuilder()
      .setTitle('MADAR API')
      .setDescription('Smart-city digital twin: city model, scenarios, deterministic simulation runs, comparison and reports.')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addCookieAuth('madar_at')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), { jsonDocumentUrl: 'api/docs/openapi.json' });
  }
}
