import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  INVENTORY_CLIENT,
  type InventoryClient,
} from '../inventory-client/inventory-client.contract.js';
import {
  CARTS_REPOSITORY,
  type CartsRepository,
} from './commerce.repository.port.js';
import {
  CommerceResponseMapper,
  type CartAvailabilityResponse,
  type CartItemResponse,
  type CartResponse,
  type CartWithItemsResponse,
} from './commerce-response.mapper.js';
import { CartStatus } from './commerce.constants.js';

@Injectable()
export class CartsService {
  constructor(
    @Inject(CARTS_REPOSITORY)
    private readonly repository: CartsRepository,
    @Inject(INVENTORY_CLIENT)
    private readonly inventory: InventoryClient,
    private readonly mapper: CommerceResponseMapper,
  ) {}

  async create(sessionId?: string): Promise<CartResponse> {
    const cart = await this.repository.createCart(sessionId);
    return this.mapper.mapCart(cart);
  }

  async get(cartId: string): Promise<CartWithItemsResponse> {
    const cart = await this.repository.getCart(cartId);
    if (!cart) {
      throw new NotFoundException(`Cart ${cartId} was not found.`);
    }
    return this.mapper.mapCartWithItems(cart);
  }

  async getAvailability(
    cartId: string,
  ): Promise<readonly CartAvailabilityResponse[]> {
    const cart = await this.get(cartId);
    if (cart.items.length === 0) {
      return [];
    }

    const availability = await this.inventory.getAvailability(
      cart.items.map((item) => item.variantId),
    );
    const availableByVariant = new Map(
      availability.map((item) => [item.variantId, item.quantityAvailable]),
    );
    return cart.items.map((item) => {
      const quantityAvailable = availableByVariant.get(item.variantId);
      if (quantityAvailable === undefined) {
        throw new BadGatewayException(
          `Inventory availability for variant ${item.variantId} is missing.`,
        );
      }
      return {
        variantId: item.variantId,
        quantityRequested: item.quantity,
        quantityAvailable,
        isAvailable: quantityAvailable >= item.quantity,
      };
    });
  }

  async addItem(
    cartId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartItemResponse> {
    await this.assertActiveCart(cartId);
    const item = await this.repository.addCartItem(
      cartId,
      variantId,
      quantity,
    );
    return this.mapper.mapCartItem(item);
  }

  async updateItem(
    cartId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartItemResponse> {
    await this.assertActiveCart(cartId);
    const item = await this.repository.updateCartItem(cartId, itemId, quantity);
    if (!item) {
      throw new NotFoundException(`Cart item ${itemId} was not found.`);
    }
    return this.mapper.mapCartItem(item);
  }

  async removeItem(cartId: string, itemId: string): Promise<void> {
    await this.assertActiveCart(cartId);
    if (!(await this.repository.deleteCartItem(cartId, itemId))) {
      throw new NotFoundException(`Cart item ${itemId} was not found.`);
    }
  }

  private async assertActiveCart(cartId: string): Promise<void> {
    const cart = await this.get(cartId);
    if (cart.status !== CartStatus.ACTIVE) {
      throw new ConflictException(
        `Cart ${cartId} cannot be changed while it is ${cart.status}.`,
      );
    }
  }
}
