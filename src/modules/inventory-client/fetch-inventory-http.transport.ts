import { Injectable } from '@nestjs/common';
import type { InventoryHttpTransport } from './inventory-client.contract.js';

@Injectable()
export class FetchInventoryHttpTransport implements InventoryHttpTransport {
  fetch(url: URL, options: RequestInit): Promise<Response> {
    return globalThis.fetch(url, options);
  }
}
