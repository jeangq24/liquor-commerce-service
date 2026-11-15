import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CommerceRequest } from '../security/commerce-actor.js';
import { REQUIRED_COMMERCE_PERMISSIONS } from '../security/require-permissions.decorator.js';

@Injectable()
export class CommercePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(
        REQUIRED_COMMERCE_PERMISSIONS,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context.switchToHttp().getRequest<CommerceRequest>();
    const actorPermissions = new Set(
      request.commerceActor?.permissions ?? [],
    );
    if (
      !requiredPermissions.every((permission) =>
        actorPermissions.has(permission),
      )
    ) {
      throw new ForbiddenException('Actor is missing a required Commerce permission.');
    }
    return true;
  }
}
