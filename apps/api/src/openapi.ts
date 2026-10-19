import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Configura la documentación OpenAPI en /api/docs y /api/docs-json. */
export function setupOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Domus IA API')
    .setDescription(
      'Plataforma de diseño arquitectónico asistido por IA: modelo geométrico estructurado, edición paramétrica verificable y documentación preliminar. Documentación de referencia; no sustituye la revisión de un profesional habilitado.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  return document;
}
