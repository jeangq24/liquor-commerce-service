# LicoresYaaa Commerce

Servicio REST responsable de los carritos, pedidos y pagos de LicoresYaaa. Mantiene los datos comerciales en PostgreSQL y se comunica por HTTP con Catalog para consultar variantes y precios, y con Inventory para gestionar existencias.

## Alcance

- Creación y modificación de carritos de invitados y consulta de disponibilidad.
- Finalización de compra para **recogida**, con precios obtenidos de Catalog y reserva de inventario asíncrona.
- Consulta y transición del ciclo de vida de pedidos y pagos.
- Registro de datos e historial de pedidos, pagos, entregas y reservas.
- Integración interna con Inventory para disponibilidad, reservas, liberaciones, despachos y devoluciones.

El checkout no admite domicilios ni compras autenticadas. Las rutas de pedidos y pagos son internas y requieren un BFF de confianza. Commerce no modifica directamente las tablas de Catalog ni de Inventory.

## Tecnologías y estructura

El servicio utiliza Node.js, TypeScript, NestJS con Express, PostgreSQL, Drizzle ORM y Drizzle Kit. La documentación de la API se genera con `@nestjs/swagger`; las pruebas utilizan Vitest y Supertest.

- `src/modules/commerce`: API, casos de uso, repositorios, DTO y mapeo de respuestas comerciales.
- `src/modules/orders` y `src/modules/payments`: reglas de los ciclos de vida de pedidos y pagos.
- `src/modules/catalog-client` y `src/modules/inventory-client`: clientes HTTP internos.
- `src/modules/outbox`: procesamiento recuperable de reservas de checkout.
- `src/infrastructure/database`: conexión y esquemas de Drizzle.
- `src/common`: autenticación, permisos y contexto del actor.
- `drizzle/`: migraciones SQL y metadatos de Drizzle Kit.
- `test/`: pruebas HTTP de extremo a extremo.

## Requisitos

- Node.js y pnpm. La configuración actual se ha comprobado localmente con Node.js 24 y pnpm 12; el proyecto no declara una versión mínima propia.
- PostgreSQL accesible y una base de datos creada para Commerce.
- Instancias accesibles de Catalog e Inventory y sus credenciales para ejecutar los flujos que dependen de esos servicios.

## Instalación y configuración local

1. Instala las dependencias desde la raíz del repositorio:

   ```bash
   pnpm install
   ```

2. Crea el archivo local de configuración y completa sus valores:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Configura la conexión PostgreSQL, los servicios internos, la ubicación de Inventory y los tres tokens descritos a continuación. No almacenes secretos en el repositorio.
4. Aplica las migraciones existentes e inicia el servicio:

   ```bash
   pnpm db:migrate
   pnpm start:dev
   ```

Por defecto, el servicio escucha en `0.0.0.0:3001`. La configuración de ejemplo usa Catalog en `localhost:3002` e Inventory en `localhost:3000`; ajusta estas direcciones al entorno real.

## Variables de entorno

| Variable                      | Propósito                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | URL de conexión PostgreSQL de Commerce; obligatoria para la aplicación y Drizzle Kit.             |
| `NODE_ENV`                    | Entorno de ejecución de Node.js. El ejemplo usa `development`.                                    |
| `HOST`                        | Dirección de escucha; por defecto `0.0.0.0`.                                                      |
| `PORT`                        | Puerto de escucha; por defecto `3001`.                                                            |
| `COMMERCE_INTERNAL_API_TOKEN` | Token compartido con el BFF para autenticar operaciones internas de pedidos y pagos.              |
| `INVENTORY_API_URL`           | URL base HTTP o HTTPS de Inventory, sin ruta, credenciales ni parámetros.                         |
| `INVENTORY_SERVICE_TOKEN`     | Token enviado a Inventory; debe coincidir con `INTERNAL_API_TOKEN` de su despliegue.              |
| `INVENTORY_LOCATION_ID`       | UUID v4 de la ubicación de Inventory usada para las operaciones de stock.                         |
| `INVENTORY_TIMEOUT_MS`        | Tiempo máximo por solicitud a Inventory en milisegundos; por defecto `5000`, entre `1` y `60000`. |
| `CATALOG_API_URL`             | URL base HTTP o HTTPS de Catalog, sin ruta, credenciales ni parámetros.                           |
| `CATALOG_SERVICE_TOKEN`       | Token enviado a Catalog; debe coincidir con `CATALOG_SERVICE_API_TOKEN` de su despliegue.         |
| `CATALOG_TIMEOUT_MS`          | Tiempo máximo por solicitud a Catalog en milisegundos; por defecto `5000`, entre `1` y `60000`.   |
| `POSTGRES_TEST_DATABASE_URL`  | Opcional. URL de una base de datos PostgreSQL exclusiva y desechable para pruebas de integración. |

Los tres tokens obligatorios deben tener al menos 32 caracteres y no contener espacios al principio ni al final. Usa valores independientes y aleatorios.

## Comandos

| Comando            | Uso                                                                           |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm start`       | Iniciar la aplicación.                                                        |
| `pnpm start:dev`   | Iniciar con recarga durante el desarrollo.                                    |
| `pnpm start:debug` | Iniciar en modo de depuración con recarga.                                    |
| `pnpm build`       | Compilar el proyecto.                                                         |
| `pnpm start:prod`  | Ejecutar la aplicación compilada; requiere ejecutar `pnpm build` previamente. |
| `pnpm lint`        | Analizar el código de `src/` y `test/`.                                       |
| `pnpm format`      | Aplicar el formato de Prettier a `src/` y `test/`.                            |
| `pnpm test`        | Ejecutar las pruebas unitarias y de integración configuradas.                 |
| `pnpm test:watch`  | Ejecutar las pruebas en modo de observación.                                  |
| `pnpm test:cov`    | Ejecutar pruebas con cobertura.                                               |
| `pnpm test:debug`  | Ejecutar pruebas con el depurador.                                            |
| `pnpm test:e2e`    | Ejecutar las pruebas HTTP de extremo a extremo.                               |
| `pnpm db:generate` | Generar migraciones a partir del esquema de Commerce.                         |
| `pnpm db:migrate`  | Aplicar las migraciones pendientes.                                           |

## Base de datos y migraciones

Drizzle Kit carga `DATABASE_URL` desde el entorno o `.env`, lee `src/infrastructure/database/schema/commerce.schema.ts` y guarda las migraciones en `drizzle/`. Para una base nueva, créala en PostgreSQL y ejecuta `pnpm db:migrate`. Si cambias el esquema, usa `pnpm db:generate`, revisa la migración generada y aplícala con `pnpm db:migrate`.

Las pruebas con PostgreSQL real se habilitan con `POSTGRES_TEST_DATABASE_URL`. Su base debe ser exclusiva, contener `test` en el nombre y no tener eventos de reserva pendientes: las pruebas aplican migraciones y crean y eliminan sus propios registros. Nunca uses una base compartida o de producción. Las pruebas HTTP también utilizan clientes simulados y no demuestran conectividad real con Catalog o Inventory.

## API y documentación

El prefijo de la API es `/api/commerce`. Con la configuración predeterminada, Swagger se encuentra en `http://localhost:3001/docs` y el documento OpenAPI en `http://localhost:3001/docs-json`.

| Método   | Ruta bajo el prefijo             | Operación                                                     |
| -------- | -------------------------------- | ------------------------------------------------------------- |
| `GET`    | `/`                              | Respuesta básica del servicio; no comprueba sus dependencias. |
| `POST`   | `/carts`                         | Crear un carrito de invitado.                                 |
| `GET`    | `/carts/{cartId}`                | Consultar un carrito y sus artículos.                         |
| `GET`    | `/carts/{cartId}/availability`   | Consultar disponibilidad en Inventory.                        |
| `POST`   | `/carts/{cartId}/items`          | Agregar una variante o incrementar su cantidad.               |
| `PATCH`  | `/carts/{cartId}/items/{itemId}` | Actualizar la cantidad de un artículo.                        |
| `DELETE` | `/carts/{cartId}/items/{itemId}` | Eliminar un artículo.                                         |
| `POST`   | `/checkout`                      | Iniciar o consultar una compra idempotente para recogida.     |
| `GET`    | `/orders`                        | Consultar pedidos recientes; admite `status` y `limit`.       |
| `GET`    | `/orders/{orderId}`              | Consultar el detalle de un pedido.                            |
| `POST`   | `/orders/{orderId}/actions`      | Ejecutar una acción del pedido.                               |
| `GET`    | `/payments/{paymentId}`          | Consultar un pago.                                            |
| `POST`   | `/payments/{paymentId}/actions`  | Ejecutar una acción del pago.                                 |

Las operaciones de pedidos y pagos exigen `Authorization: Bearer <COMMERCE_INTERNAL_API_TOKEN>`, `x-actor-id` con un UUID v4 y `x-actor-permissions` con permisos separados por comas. El contrato presupone que el BFF de confianza verifica el JWT de Supabase y los permisos del usuario antes de proporcionar este contexto; Commerce no verifica ese JWT. No se debe aceptar el contexto directamente desde un navegador. Los permisos requeridos se detallan en Swagger.

Las acciones de pedido son `CONFIRM`, `START_PREPARATION`, `MARK_READY`, `DISPATCH`, `PICKUP`, `DELIVER`, `DELIVERY_FAILED`, `RETURN_TO_STORE`, `RETRY_DELIVERY` y `CANCEL`. `DELIVERY_FAILED`, `RETURN_TO_STORE` y `CANCEL` requieren `reason`; `RETURN_TO_STORE` también requiere `items` con las cantidades devueltas. Las acciones de pago son `SUBMIT_TRANSFER`, `APPROVE_TRANSFER`, `REJECT_TRANSFER` y `RECORD_CASH`.

## Checkout e integraciones

Commerce consulta `GET /internal/v1/variants/{id}` de Catalog durante el checkout, comprueba que las variantes se puedan comprar y calcula los importes en pesos colombianos como enteros. Al agregar artículos al carrito solo se guarda el identificador de variante; la comprobación en Catalog ocurre al finalizar la compra. Los importes de las respuestas de pedidos y pagos se representan como cadenas.

Envía una `Idempotency-Key` única y no vacía, de hasta 180 caracteres, y consérvala junto con la solicitud original. Commerce guarda en una transacción el pedido, sus artículos, el pago pendiente, la conversión del carrito y el evento `RESERVE_STOCK`:

- `202`: la reserva sigue pendiente; no indica una compra completada.
- Repite la misma solicitud y clave: `200` indica que la reserva ya no está pendiente ni fallida; consulta los estados devueltos.
- `409`: puede indicar falta de stock o un conflicto, como reutilizar la clave con otros datos. La respuesta por falta de stock incluye `inventoryReservationStatus: FAILED`.

El procesador Outbox reintenta los resultados inciertos con la misma clave de Inventory y recupera eventos tras un reinicio. Es necesario vigilar errores persistentes y la tabla `commerce.outbox_events`. **Esta recuperación solo cubre la reserva inicial del checkout**: las cancelaciones, los despachos y las devoluciones todavía pueden quedar desincronizados si Inventory confirma una operación y falla el registro local. La cancelación también se bloquea mientras la reserva inicial está pendiente y después de aprobar un pago, hasta definir la política de reembolso.

Inventory es el responsable de las existencias. Commerce usa su API interna con el token de servicio y los permisos correspondientes; las acciones de pedidos propagan el identificador del actor cuando corresponde.
