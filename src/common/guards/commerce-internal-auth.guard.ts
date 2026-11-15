import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import type {
  CommerceActor,
  CommerceRequest,
} from '../security/commerce-actor.js';

@Injectable()
export class CommerceInternalAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CommerceRequest>();
    const authorization = request.headers.authorization;
    const configuredToken = this.configService.getOrThrow<string>(
      'COMMERCE_INTERNAL_API_TOKEN',
    );
    if (typeof authorization !== 'string') {
      throw new UnauthorizedException('Trusted service authentication required.');
    }

    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match?.[1] || !safeTokenMatch(configuredToken, match[1])) {
      throw new UnauthorizedException('Invalid trusted service token.');
    }

    const actorId = request.headers['x-actor-id'];
    const permissions = request.headers['x-actor-permissions'];
    if (
      typeof actorId !== 'string' ||
      !isUUID(actorId, '4') ||
      typeof permissions !== 'string'
    ) {
      throw new UnauthorizedException('Trusted actor context is required.');
    }

    const actorPermissions = permissions
      .split(',')
      .map((permission) => permission.trim())
      .filter(Boolean);
    if (actorPermissions.length === 0) {
      throw new UnauthorizedException('Actor permissions are required.');
    }

    const actor: CommerceActor = {
      id: actorId,
      permissions: actorPermissions,
    };
    request.commerceActor = actor;
    return true;
  }
}

function safeTokenMatch(expectedToken: string, receivedToken: string): boolean {
  if (!expectedToken || !receivedToken) {
    return false;
  }
  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(receivedToken);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
