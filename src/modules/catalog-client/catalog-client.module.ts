import { Injectable, Module } from '@nestjs/common';
import {
  CATALOG_CLIENT,
  CATALOG_HTTP_TRANSPORT,
  type CatalogHttpTransport,
} from './catalog-client.contract.js';
import { CatalogClientService } from './catalog-client.service.js';

@Injectable()
class FetchCatalogHttpTransport implements CatalogHttpTransport {
  fetch(url: URL, options: RequestInit): Promise<Response> {
    return fetch(url, options);
  }
}

@Module({
  providers: [
    FetchCatalogHttpTransport,
    { provide: CATALOG_HTTP_TRANSPORT, useExisting: FetchCatalogHttpTransport },
    CatalogClientService,
    { provide: CATALOG_CLIENT, useExisting: CatalogClientService },
  ],
  exports: [CATALOG_CLIENT],
})
export class CatalogClientModule {}
