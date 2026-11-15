import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  CommerceActor,
  CommerceRequest,
} from './commerce-actor.js';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CommerceActor => {
    const request = context.switchToHttp().getRequest<CommerceRequest>();
    if (!request.commerceActor) {
      throw new UnauthorizedException('Trusted actor context is required.');
    }
    return request.commerceActor;
  },
);
