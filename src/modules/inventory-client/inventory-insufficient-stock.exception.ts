import { ConflictException } from '@nestjs/common';

export class InventoryInsufficientStockException extends ConflictException {
  constructor() {
    super('Inventory has insufficient stock for the requested order.');
  }
}
