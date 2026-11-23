import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'admin-secret-token';

// Valida el token de la cabecera Authorization
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (authHeader !== ADMIN_TOKEN) {
      throw new ForbiddenException('Token de autorización inválido o ausente');
    }
    return true;
  }
}
