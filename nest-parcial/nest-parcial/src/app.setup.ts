import { INestApplication, ValidationPipe } from '@nestjs/common';

// Configuración global de la app
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Convierte el body al DTO
      whitelist: true, // Quita campos no definidos
      forbidNonWhitelisted: true, // Rechaza campos extra
    }),
  );
}
