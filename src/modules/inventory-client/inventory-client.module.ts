import { Module } from '@nestjs/common';
import {
  INVENTORY_CLIENT,
  INVENTORY_HTTP_TRANSPORT,
} from './inventory-client.contract.js';
import { FetchInventoryHttpTransport } from './fetch-inventory-http.transport.js';
import { InventoryClientService } from './inventory-client.service.js';

@Module({
  providers: [
    FetchInventoryHttpTransport,
    {
      provide: INVENTORY_HTTP_TRANSPORT,
      useExisting: FetchInventoryHttpTransport,
    },
    InventoryClientService,
    {
      provide: INVENTORY_CLIENT,
      useExisting: InventoryClientService,
    },
  ],
  exports: [INVENTORY_CLIENT],
})
export class InventoryClientModule {}
