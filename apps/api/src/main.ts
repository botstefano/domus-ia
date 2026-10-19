import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableCors({
    origin: [config.webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });
  app.enableShutdownHooks();

  setupOpenApi(app);

  // Sirve la interfaz web compilada si está disponible (despliegue monolítico).
  const webDist = resolve(__dirname, '..', '..', 'web', 'dist');
  if (existsSync(join(webDist, 'index.html'))) {
    app.useStaticAssets(webDist, { index: false });
    app.use((req: { method: string; path: string }, res: { sendFile: (path: string) => void }, next: () => void) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(join(webDist, 'index.html'));
    });
    Logger.log(`Interfaz web servida desde ${webDist}`, 'Bootstrap');
  }

  await app.listen(config.port, '0.0.0.0');
  Logger.log(`API disponible en http://localhost:${config.port}/api`, 'Bootstrap');
  Logger.log(`Documentación OpenAPI en http://localhost:${config.port}/api/docs`, 'Bootstrap');
}

void bootstrap();
