import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import figlet from 'figlet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/commerce');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API de Commerce de LicoresYaaa')
    .setDescription(
      'API REST de Commerce. Las operaciones de pedidos y pagos requieren un cliente interno de confianza. El checkout para recogida se procesa de forma asíncrona.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const configService = app.get(ConfigService);
  const port = Number(configService.get('PORT', '3001'));
  const host = configService.get('HOST', '0.0.0.0');
  await app.listen(port, host);

  const amarillo = '\x1b[33m';
  const reset = '\x1b[0m';
  const banner = figlet.textSync('LicoresYaaa - Commerce', {
    horizontalLayout: 'controlled smushing',
  });
  console.log(`${amarillo}${banner}${reset}`);
}

await bootstrap();
