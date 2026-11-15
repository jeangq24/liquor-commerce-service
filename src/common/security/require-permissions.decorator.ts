import { SetMetadata } from '@nestjs/common';

export const REQUIRED_COMMERCE_PERMISSIONS = 'required_commerce_permissions';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_COMMERCE_PERMISSIONS, permissions);
