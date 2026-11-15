import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommerceRepository } from './commerce.repository.js';

@Injectable()
export class CartsService {
  constructor(private readonly repository: CommerceRepository) {}

  create(sessionId?: string) {
    return this.repository.createCart(sessionId);
  }

  async get(cartId: string) {
    const cart = await this.repository.getCart(cartId);
    if (!cart) {
      throw new NotFoundException(`Cart ${cartId} was not found.`);
    }
    return cart;
  }

  async addItem(cartId: string, variantId: string, quantity: number) {
    await this.assertActiveCart(cartId);
    return this.repository.addCartItem(cartId, variantId, quantity);
  }

  async updateItem(cartId: string, itemId: string, quantity: number) {
    await this.assertActiveCart(cartId);
    const item = await this.repository.updateCartItem(cartId, itemId, quantity);
    if (!item) {
      throw new NotFoundException(`Cart item ${itemId} was not found.`);
    }
    return item;
  }

  async removeItem(cartId: string, itemId: string): Promise<void> {
    await this.assertActiveCart(cartId);
    if (!(await this.repository.deleteCartItem(cartId, itemId))) {
      throw new NotFoundException(`Cart item ${itemId} was not found.`);
    }
  }

  private async assertActiveCart(cartId: string): Promise<void> {
    const cart = await this.get(cartId);
    if (cart.status !== 'ACTIVE') {
      throw new ConflictException(
        `Cart ${cartId} cannot be changed while it is ${cart.status}.`,
      );
    }
  }
}
