Liquor Commerce — Modelo físico y migración inicial
Documento: Especificación física de base de datos
Versión: 1.0
Modelo de referencia: MER Licorera Online v1.2
Servicio propietario: liquor-commerce-service
Base de datos: PostgreSQL / Supabase
ORM: Drizzle ORM
Comunicación: REST interno con liquor-inventory
Estado: Especificación para implementación

1. Alcance
Este documento define la persistencia inicial del servicio liquor-commerce-service, responsable de gestionar el ciclo comercial de Licorera Online.
El servicio administra el esquema PostgreSQL commerce y sus nueve entidades:
    1. carts
    2. cart_items
    3. orders
    4. order_inventory_reservations
    5. order_items
    6. payments
    7. order_deliveries
    8. delivery_attempts
    9. outbox_events
Se incluyen:
    • Tipos ENUM.
    • Definición física de las tablas.
    • Claves primarias y relaciones internas.
    • Restricciones de integridad.
    • Índices.
    • Migración SQL inicial.
    • Configuración de Drizzle ORM.
    • Reglas transaccionales.
    • Estrategia de idempotencia.
    • Contratos de integración con Inventory.
    • Criterios de aceptación.
1.1 Responsabilidades y límites
Commerce es propietario de:
    • Carritos y sus productos.
    • Checkout.
    • Pedidos y detalles.
    • Datos históricos del cliente y entrega.
    • Pagos y su estado.
    • Estados comerciales de los pedidos.
    • Intentos de entrega.
    • Coordinación de operaciones distribuidas mediante Outbox.
Commerce no administra las existencias físicas ni las cantidades reservadas. Estas operaciones pertenecen exclusivamente a liquor-inventory.
1.2 Referencias entre servicios
Las siguientes referencias serán UUID lógicos, sin claves foráneas físicas:
Referencia	Servicio propietario
customer_id	app.profiles
variant_id	catalog.product_variants
performed_by / usuario responsable	app.profiles
location_id	inventory.inventory_locations
reservation_id	inventory.stock_reservations
Las relaciones físicas mediante FK se limitarán a tablas del propio esquema commerce.

2. Tipos de datos
Concepto	PostgreSQL	Justificación
Identificadores	UUID	Identificación distribuida
Cantidades	INTEGER	Unidades enteras
Valores monetarios	BIGINT	Valores enteros en COP
Estados	ENUM	Valores controlados
Fechas	TIMESTAMPTZ	Fecha con zona horaria
Coordenadas	NUMERIC(10,7)	Precisión geográfica
Información adicional	JSONB	Payload de operaciones distribuidas
Motivos y referencias	VARCHAR / TEXT	Información descriptiva
Claves idempotentes	VARCHAR(180)	Identificación de operaciones
Los valores monetarios se almacenarán como enteros en pesos colombianos, sin utilizar tipos de punto flotante.

3. Tipos ENUM
3.1 Tipo de cliente
CREATE TYPE commerce.customer_type AS ENUM (
  'REGISTERED',
  'GUEST'
);
3.2 Estado del carrito
CREATE TYPE commerce.cart_status AS ENUM (
  'ACTIVE',
  'CONVERTED',
  'ABANDONED'
);
CONVERTED indica que el carrito fue utilizado para generar un pedido. ABANDONED permite conservar el registro de carritos que dejaron de utilizarse.
3.3 Tipo de cumplimiento
CREATE TYPE commerce.fulfillment_type AS ENUM (
  'DELIVERY',
  'PICKUP'
);
3.4 Estado comercial del pedido
CREATE TYPE commerce.order_status AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'ON_DELIVERY',
  'DELIVERY_FAILED',
  'RETURNED_TO_STORE',
  'DELIVERED',
  'PICKED_UP',
  'CANCELLED'
);
3.5 Estado de coordinación con Inventory
CREATE TYPE commerce.inventory_reservation_status AS ENUM (
  'PENDING',
  'RESERVED',
  'RELEASED',
  'DISPATCHED',
  'FAILED'
);
Este estado representa la coordinación técnica con Inventory. No sustituye el estado comercial del pedido.
3.6 Método de pago
CREATE TYPE commerce.payment_method AS ENUM (
  'CASH',
  'BANK_TRANSFER'
);
3.7 Estado del pago
CREATE TYPE commerce.payment_status AS ENUM (
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REFUNDED',
  'CANCELLED'
);
3.8 Estado del intento de entrega
CREATE TYPE commerce.delivery_attempt_status AS ENUM (
  'PENDING',
  'IN_TRANSIT',
  'FAILED',
  'RETURNED_TO_STORE',
  'DELIVERED'
);
3.9 Estado del Outbox
CREATE TYPE commerce.outbox_event_status AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

4. Migración SQL inicial
Archivos versionados:
drizzle/0000_create_commerce_schema.sql
drizzle/0001_add_inventory_reservation_history.sql
La migración crea exclusivamente el esquema commerce. No debe modificar tablas pertenecientes a app, catalog o inventory.
Las instrucciones de creación son idempotentes frente a objetos equivalentes ya existentes. No reparan objetos con columnas, tipos o restricciones incompatibles; esos cambios requieren migraciones explícitas.
4.1 Creación del esquema y ENUM
CREATE SCHEMA IF NOT EXISTS commerce;

CREATE TYPE commerce.customer_type AS ENUM (
  'REGISTERED',
  'GUEST'
);

CREATE TYPE commerce.cart_status AS ENUM (
  'ACTIVE',
  'CONVERTED',
  'ABANDONED'
);

CREATE TYPE commerce.fulfillment_type AS ENUM (
  'DELIVERY',
  'PICKUP'
);

CREATE TYPE commerce.order_status AS ENUM (
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'ON_DELIVERY',
  'DELIVERY_FAILED',
  'RETURNED_TO_STORE',
  'DELIVERED',
  'PICKED_UP',
  'CANCELLED'
);

CREATE TYPE commerce.inventory_reservation_status AS ENUM (
  'PENDING',
  'RESERVED',
  'RELEASED',
  'DISPATCHED',
  'FAILED'
);

CREATE TYPE commerce.payment_method AS ENUM (
  'CASH',
  'BANK_TRANSFER'
);

CREATE TYPE commerce.payment_status AS ENUM (
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REFUNDED',
  'CANCELLED'
);

CREATE TYPE commerce.delivery_attempt_status AS ENUM (
  'PENDING',
  'IN_TRANSIT',
  'FAILED',
  'RETURNED_TO_STORE',
  'DELIVERED'
);

CREATE TYPE commerce.outbox_event_status AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);
4.2 Carts
Representa los carritos de compra de clientes registrados o invitados.
CREATE TABLE commerce.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_id UUID,
  customer_type commerce.customer_type NOT NULL,

  session_id VARCHAR(180),

  status commerce.cart_status NOT NULL DEFAULT 'ACTIVE',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_carts_customer_reference
    CHECK (
      (customer_type = 'REGISTERED' AND customer_id IS NOT NULL)
      OR
      (customer_type = 'GUEST' AND customer_id IS NULL)
    )
);

CREATE INDEX idx_carts_customer
  ON commerce.carts(customer_id);

CREATE INDEX idx_carts_session
  ON commerce.carts(session_id);

CREATE INDEX idx_carts_status
  ON commerce.carts(status);
customer_id es una referencia lógica a app.profiles.id.
Para invitados, session_id permite asociar el carrito con la sesión del cliente sin requerir una cuenta.
4.3 Cart items
Representa las variantes y cantidades agregadas al carrito.
CREATE TABLE commerce.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cart_id UUID NOT NULL,

  -- Referencia lógica a catalog.product_variants.id
  variant_id UUID NOT NULL,

  quantity INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_cart_items_cart
    FOREIGN KEY (cart_id)
    REFERENCES commerce.carts(id)
    ON DELETE CASCADE,

  CONSTRAINT uq_cart_items_variant
    UNIQUE (cart_id, variant_id),

  CONSTRAINT chk_cart_items_quantity
    CHECK (quantity > 0)
);

CREATE INDEX idx_cart_items_variant
  ON commerce.cart_items(variant_id);
El precio definitivo no depende del valor almacenado en el carrito. Durante checkout, Commerce debe consultar los datos y precios vigentes de Catalog.
4.4 Orders
Representa el pedido comercial y su ciclo de vida.
CREATE TABLE commerce.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_number VARCHAR(40) NOT NULL UNIQUE,

  -- Referencia lógica a app.profiles.id
  customer_id UUID,

  customer_type commerce.customer_type NOT NULL,

  customer_name VARCHAR(180) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL,
  customer_email VARCHAR(180),

  status commerce.order_status NOT NULL DEFAULT 'PENDING',

  fulfillment_type commerce.fulfillment_type NOT NULL,

  inventory_reservation_status
    commerce.inventory_reservation_status
    NOT NULL DEFAULT 'PENDING',

  subtotal_cop BIGINT NOT NULL,
  discount_cop BIGINT NOT NULL DEFAULT 0,
  delivery_fee_cop BIGINT NOT NULL DEFAULT 0,
  total_cop BIGINT NOT NULL,

  notes TEXT,

  cancellation_reason VARCHAR(180),

  -- Clave para evitar pedidos duplicados durante checkout.
  checkout_idempotency_key VARCHAR(180) NOT NULL UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_orders_customer_reference
    CHECK (
      (customer_type = 'REGISTERED' AND customer_id IS NOT NULL)
      OR
      (customer_type = 'GUEST' AND customer_id IS NULL)
    ),

  CONSTRAINT chk_orders_subtotal
    CHECK (subtotal_cop >= 0),

  CONSTRAINT chk_orders_discount
    CHECK (discount_cop >= 0),

  CONSTRAINT chk_orders_delivery_fee
    CHECK (delivery_fee_cop >= 0),

  CONSTRAINT chk_orders_total
    CHECK (total_cop >= 0),

  CONSTRAINT chk_orders_total_calculation
    CHECK (
      total_cop =
      subtotal_cop - discount_cop + delivery_fee_cop
    )
);

CREATE INDEX idx_orders_customer
  ON commerce.orders(customer_id);

CREATE INDEX idx_orders_status
  ON commerce.orders(status);

CREATE INDEX idx_orders_reservation_status
  ON commerce.orders(inventory_reservation_status);

CREATE INDEX idx_orders_created_at
  ON commerce.orders(created_at DESC);

CREATE INDEX idx_orders_fulfillment
  ON commerce.orders(fulfillment_type);
Consideraciones:
    • Los datos del cliente son snapshots históricos. No deben depender de cambios posteriores en el perfil.
    • customer_id es nullable para permitir checkout de invitados.
    • checkout_idempotency_key evita generar pedidos duplicados cuando el cliente reintenta una operación.
    • inventory_reservation_status representa la coordinación con Inventory.
    • Los valores monetarios quedan registrados en el momento de creación del pedido.
4.5 Order items
Representa los productos incluidos en el pedido.
Los campos de snapshot permiten conservar la información comercial original incluso si Catalog modifica posteriormente el producto.
CREATE TABLE commerce.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL,

  -- Referencia lógica a catalog.product_variants.id
  variant_id UUID NOT NULL,

  product_name_snapshot VARCHAR(180) NOT NULL,
  variant_name_snapshot VARCHAR(180) NOT NULL,
  sku_snapshot VARCHAR(100) NOT NULL,

  quantity INTEGER NOT NULL,

  unit_price_cop BIGINT NOT NULL,

  discount_amount_cop BIGINT NOT NULL DEFAULT 0,

  line_total_cop BIGINT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id)
    REFERENCES commerce.orders(id),

  CONSTRAINT chk_order_items_quantity
    CHECK (quantity > 0),

  CONSTRAINT chk_order_items_unit_price
    CHECK (unit_price_cop >= 0),

  CONSTRAINT chk_order_items_discount
    CHECK (discount_amount_cop >= 0),

  CONSTRAINT chk_order_items_line_total
    CHECK (line_total_cop >= 0),

  CONSTRAINT chk_order_items_total_calculation
    CHECK (
      line_total_cop =
      (quantity * unit_price_cop) - discount_amount_cop
    )
);

CREATE INDEX idx_order_items_order
  ON commerce.order_items(order_id);

CREATE INDEX idx_order_items_variant
  ON commerce.order_items(variant_id);
variant_id conserva una referencia lógica a Catalog. No se establece una FK física entre servicios.
4.6 Payments
Registra los pagos asociados a los pedidos.
Se mantiene una relación 1 entre pedidos y pagos para permitir una futura evolución hacia pagos parciales o múltiples registros de pago.
CREATE TABLE commerce.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL,

  method commerce.payment_method NOT NULL,

  status commerce.payment_status NOT NULL DEFAULT 'PENDING',

  amount_cop BIGINT NOT NULL,

  reference VARCHAR(180),

  -- Ruta del comprobante en Supabase Storage.
  proof_path TEXT,

  paid_at TIMESTAMPTZ,

  -- Referencia lógica a app.profiles.id
  verified_by UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id)
    REFERENCES commerce.orders(id),

  CONSTRAINT chk_payments_amount
    CHECK (amount_cop > 0)
);

CREATE INDEX idx_payments_order
  ON commerce.payments(order_id);

CREATE INDEX idx_payments_status
  ON commerce.payments(status);

CREATE INDEX idx_payments_method
  ON commerce.payments(method);

CREATE INDEX idx_payments_created_at
  ON commerce.payments(created_at DESC);
Reglas:
    • CASH representa efectivo.
    • BANK_TRANSFER representa transferencia bancaria.
    • El comprobante, cuando se habilite, se conserva mediante una ruta privada de Supabase Storage.
    • verified_by identifica al usuario responsable de verificar o registrar el pago.
    • El estado del pago es independiente del estado comercial del pedido.
    • Solo los pagos APPROVED representan dinero recibido y confirmado.
4.7 Order deliveries
Almacena la información de entrega de un pedido.
Esta tabla solo se utiliza cuando fulfillment_type = DELIVERY.
CREATE TABLE commerce.order_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL UNIQUE,

  recipient_name VARCHAR(180),
  recipient_phone VARCHAR(30),

  municipality VARCHAR(120) NOT NULL,
  neighborhood VARCHAR(120) NOT NULL,

  address TEXT NOT NULL,
  address_reference TEXT,

  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_order_deliveries_order
    FOREIGN KEY (order_id)
    REFERENCES commerce.orders(id),

  CONSTRAINT chk_order_deliveries_latitude
    CHECK (
      latitude IS NULL
      OR latitude BETWEEN -90 AND 90
    ),

  CONSTRAINT chk_order_deliveries_longitude
    CHECK (
      longitude IS NULL
      OR longitude BETWEEN -180 AND 180
    )
);

CREATE INDEX idx_order_deliveries_municipality
  ON commerce.order_deliveries(municipality);

CREATE INDEX idx_order_deliveries_neighborhood
  ON commerce.order_deliveries(neighborhood);
La relación es 1:1: un pedido tiene como máximo un registro de entrega.
Los pedidos con PICKUP no requieren una dirección de entrega.
4.8 Delivery attempts
Registra cada intento de entrega de forma independiente.
Permite conservar el historial cuando una entrega falla y posteriormente se vuelve a intentar.
CREATE TABLE commerce.delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  delivery_id UUID NOT NULL,

  attempt_number INTEGER NOT NULL,

  status commerce.delivery_attempt_status
    NOT NULL DEFAULT 'PENDING',

  failure_reason VARCHAR(180),

  started_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Referencia lógica a app.profiles.id
  registered_by UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_delivery_attempts_delivery
    FOREIGN KEY (delivery_id)
    REFERENCES commerce.order_deliveries(id),

  CONSTRAINT uq_delivery_attempts_number
    UNIQUE (delivery_id, attempt_number),

  CONSTRAINT chk_delivery_attempts_number
    CHECK (attempt_number > 0)
);

CREATE INDEX idx_delivery_attempts_delivery
  ON commerce.delivery_attempts(delivery_id);

CREATE INDEX idx_delivery_attempts_status
  ON commerce.delivery_attempts(status);

CREATE INDEX idx_delivery_attempts_created_at
  ON commerce.delivery_attempts(created_at DESC);
Cada intento tiene su propio identificador. La devolución registrada en Inventory puede conservar una referencia lógica al intento correspondiente.
4.9 Outbox events
Permite coordinar operaciones distribuidas y recuperar procesos incompletos entre Commerce e Inventory.
CREATE TABLE commerce.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_type VARCHAR(120) NOT NULL,

  aggregate_id UUID NOT NULL,

  payload JSONB NOT NULL,

  idempotency_key VARCHAR(180) NOT NULL UNIQUE,

  status commerce.outbox_event_status
    NOT NULL DEFAULT 'PENDING',

  attempts INTEGER NOT NULL DEFAULT 0,

  next_attempt_at TIMESTAMPTZ,

  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  processed_at TIMESTAMPTZ,

  CONSTRAINT chk_outbox_attempts
    CHECK (attempts >= 0)
);

CREATE INDEX idx_outbox_events_status_next_attempt
  ON commerce.outbox_events(status, next_attempt_at);

CREATE INDEX idx_outbox_events_aggregate
  ON commerce.outbox_events(aggregate_id);

CREATE INDEX idx_outbox_events_created_at
  ON commerce.outbox_events(created_at);
Reglas:
    • aggregate_id identifica el pedido relacionado.
    • event_type identifica la operación que debe ejecutarse.
    • payload conserva los datos necesarios para procesarla.
    • idempotency_key evita ejecutar dos veces la misma operación lógica.
    • attempts permite controlar los reintentos.
    • next_attempt_at permite programar la siguiente ejecución.
    • last_error conserva información del último fallo.
    • processed_at registra la finalización.
El Outbox no reemplaza las entidades de pedidos ni de pagos.

4.10 Order inventory reservations
Conserva la relación entre cada pedido y las reservas creadas por Inventory, incluidos sus reintentos. Cada fila representa una reserva confirmada; el estado de orders.inventory_reservation_status sigue representando la coordinación más reciente del pedido.
CREATE TABLE commerce.order_inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL,

  -- Referencias lógicas a inventory.stock_reservations.id e inventory.inventory_locations.id.
  reservation_id UUID NOT NULL UNIQUE,
  location_id UUID NOT NULL,

  status commerce.inventory_reservation_status
    NOT NULL DEFAULT 'RESERVED',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_order_inventory_reservations_order
    FOREIGN KEY (order_id)
    REFERENCES commerce.orders(id)
);

CREATE INDEX idx_order_inventory_reservations_order
  ON commerce.order_inventory_reservations(order_id);

CREATE INDEX idx_order_inventory_reservations_location
  ON commerce.order_inventory_reservations(location_id);

CREATE INDEX idx_order_inventory_reservations_status
  ON commerce.order_inventory_reservations(status);
reservation_id y location_id no tienen claves foráneas físicas porque pertenecen a Inventory. La relación única de reservation_id evita asociar la misma reserva a más de un registro de Commerce.

5. Relaciones del modelo
Tabla origen	Tabla destino	Relación
carts	cart_items	1
orders	order_items	1
orders	payments	1
orders	order_deliveries	1:0..1
orders	order_inventory_reservations	1:N
order_deliveries	delivery_attempts	1
Las relaciones con app, catalog e inventory se manejan mediante identificadores UUID lógicos.
5.1 Consideraciones sobre integridad
    • Un carrito puede contener múltiples variantes.
    • Una variante aparece una sola vez por carrito; su cantidad se actualiza.
    • Un pedido conserva sus propios detalles y snapshots.
    • Un pedido puede tener uno o varios registros de pago.
    • Un pedido de tipo DELIVERY debe contar con información de entrega.
    • Un pedido de tipo PICKUP no necesita dirección.
    • Cada intento de entrega conserva su propio historial.
    • Las operaciones de Inventory se registran y recuperan mediante Outbox.
La validación de condiciones que involucran varias tablas, como la correspondencia entre fulfillment_type y order_deliveries, debe realizarse en la capa de aplicación dentro de las transacciones correspondientes.

6. Reglas de negocio y estados
6.1 Ciclo de vida del pedido
PENDING
   |
   v
CONFIRMED
   |
   v
PREPARING
   |
   v
READY
   |
   v
ON_DELIVERY
   |
   +----------------------+
   |                      |
   v                      v
DELIVERED          DELIVERY_FAILED
                          |
                          v
                  RETURNED_TO_STORE
                          |
                  +-------+-------+
                  |               |
                  v               v
              CANCELLED       PREPARING
Para recogida en tienda, el pedido puede pasar a PICKED_UP después de completar la entrega al cliente.
Las transiciones deben validarse en Commerce. No se debe permitir modificar arbitrariamente el estado desde el cliente.
6.2 Coordinación de reservas
inventory_reservation_status mantiene un ciclo técnico independiente:
PENDING
   |
   +------------------+
   |                  |
   v                  v
RESERVED            FAILED
   |
   +------------------+
   |                  |
   v                  v
RELEASED          DISPATCHED
Reglas:
    • Un pedido no puede pasar a preparación si no tiene reserva confirmada.
    • Una reserva liberada no puede utilizarse nuevamente.
    • Una reserva despachada no se libera.
    • Después de una devolución y un reintento se crea una nueva reserva en Inventory.
    • Commerce conserva el estado de coordinación, pero Inventory es la autoridad sobre el estado real de la reserva.
6.3 Checkout
El proceso de checkout debe ejecutarse de forma recuperable:
    1. El cliente confirma el carrito.
    2. Commerce valida los datos.
    3. Commerce consulta Catalog para obtener productos, variantes y precios vigentes.
    4. Commerce calcula los valores definitivos.
    5. Commerce crea el pedido y sus detalles.
    6. Commerce crea el pago en estado PENDING.
    7. Commerce registra el evento RESERVE_STOCK en Outbox.
    8. Commerce solicita la reserva a Inventory.
    9. Inventory confirma o rechaza la operación.
    10. Commerce actualiza inventory_reservation_status.
    11. Si la reserva se confirma, el pedido puede continuar su ciclo comercial.
    12. Si no hay existencias, el pedido se cancela y se conserva el motivo.
El checkout no debe responder como exitoso mientras la reserva no esté confirmada.
Si se presenta un timeout y no se conoce el resultado de Inventory, Commerce mantiene la operación pendiente y recuperable. Debe reutilizar la misma clave idempotente.
6.4 Cancelación
    1. El operador solicita cancelar el pedido.
    2. Commerce valida que el pedido pueda cancelarse.
    3. Commerce registra la operación de liberación en Outbox.
    4. Inventory libera la reserva activa.
    5. Commerce actualiza inventory_reservation_status = RELEASED.
    6. Commerce actualiza status = CANCELLED.
    7. Se registra el motivo y el responsable.
Si el pedido ya fue despachado, no se libera la reserva. Debe gestionarse mediante el proceso de devolución física.
El tratamiento de pagos previamente recibidos queda sujeto a la política comercial de cancelaciones.
6.5 Despacho
    1. El operador confirma que el pedido está listo.
    2. Commerce verifica que la reserva esté en RESERVED.
    3. El operador confirma la salida del pedido.
    4. Commerce solicita el despacho a Inventory.
    5. Inventory descuenta existencias físicas y reservadas en una transacción.
    6. Inventory registra los movimientos OUT.
    7. Commerce actualiza inventory_reservation_status = DISPATCHED.
    8. Commerce actualiza el pedido a ON_DELIVERY.
Si Inventory rechaza el despacho, Commerce no debe avanzar el pedido a ON_DELIVERY.
6.6 Entrega fallida y devolución
    1. El operador registra la entrega fallida.
    2. Commerce actualiza el pedido a DELIVERY_FAILED.
    3. El producto regresa físicamente al establecimiento.
    4. El operador verifica las unidades recibidas.
    5. Commerce solicita registrar la devolución a Inventory.
    6. Inventory reintegra únicamente las unidades aptas.
    7. Commerce actualiza el pedido a RETURNED_TO_STORE.
Desde este estado existen dos posibilidades:
Reintentar entrega
    • Crear una nueva reserva.
    • Confirmar la nueva reserva.
    • Volver a preparar el pedido.
    • Registrar un nuevo intento de entrega.
Cancelar pedido
    • Actualizar el pedido a CANCELLED.
    • Conservar el historial de reservas, despacho, intentos y devolución.
6.7 Pagos
Transferencia bancaria
    • El cliente puede registrar el comprobante si la funcionalidad está habilitada.
    • El pago pasa a UNDER_REVIEW.
    • El operador verifica el ingreso real del dinero.
    • Solo después de la verificación pasa a APPROVED.
    • No se despacha un pedido con transferencia pendiente de verificación.
Efectivo contraentrega
    • El pedido puede entregarse antes de que el dinero regrese al establecimiento.
    • El pago permanece PENDING.
    • El operador registra APPROVED cuando recibe el dinero del domiciliario.
Recogida en tienda
    • El operador registra el pago cuando recibe el efectivo.
    • El pedido pasa a PICKED_UP una vez completada la entrega.
El estado del pedido y el estado del pago son independientes.

7. Reglas transaccionales
Las operaciones críticas deben ejecutarse dentro de transacciones PostgreSQL.
7.1 Creación del pedido
BEGIN

1. Validar checkout_idempotency_key.
2. Consultar información vigente en Catalog.
3. Calcular subtotal, descuentos y total.
4. Crear orders.
5. Crear order_items.
6. Crear payments con estado PENDING.
7. Crear evento RESERVE_STOCK en outbox_events.
8. Confirmar transacción.

COMMIT
La creación del pedido y su evento Outbox deben persistirse en una única transacción local.
7.2 Coordinación de reserva
1. Obtener evento RESERVE_STOCK.
2. Cambiar evento a PROCESSING.
3. Invocar Inventory mediante HTTP interno.
4. Enviar la misma idempotency key en cada reintento.
5. Interpretar la respuesta.
6. Actualizar inventory_reservation_status.
7. Completar el evento Outbox.
Si la respuesta es desconocida por timeout, no se debe generar otra clave ni asumir que la reserva falló.
La operación debe permanecer recuperable.
7.3 Cancelación
BEGIN

1. Bloquear el pedido.
2. Validar que pueda cancelarse.
3. Crear evento RELEASE_STOCK en Outbox.
4. Confirmar transacción.

COMMIT

5. Procesar la liberación en Inventory.
6. Confirmar resultado.
7. Actualizar estado de reserva y pedido.
8. Completar evento Outbox.
La transición comercial a CANCELLED debe coordinarse con el resultado de la liberación para evitar inconsistencias.
7.4 Despacho
1. Consultar pedido.
2. Verificar status = READY.
3. Verificar inventory_reservation_status = RESERVED.
4. Solicitar dispatch a Inventory.
5. Confirmar resultado de Inventory.
6. Actualizar inventory_reservation_status = DISPATCHED.
7. Actualizar status = ON_DELIVERY.
El pedido no debe avanzar si el despacho no fue confirmado.
7.5 Devolución
1. Registrar intento de entrega fallido.
2. Confirmar recepción física de productos.
3. Registrar devolución en Inventory.
4. Esperar resultado de reintegración.
5. Actualizar pedido a RETURNED_TO_STORE.
6. Conservar historial del intento y la devolución.
La cantidad de unidades reintegradas la determina Inventory después de verificar su condición física.

8. Estrategia de idempotencia
Las operaciones críticas deben utilizar claves estables.
Operación	Clave sugerida
Checkout	checkout:{operationId}
Reservar inventario	reserve:{orderId}:{attempt}
Liberar reserva	release:{reservationId}
Despachar reserva	dispatch:{reservationId}
Registrar devolución	return:{returnId}
Procesar evento Outbox	outbox:{eventId}
Reglas:
    1. La misma operación debe reutilizar la misma clave cuando se reintenta.
    2. Una operación repetida con la misma clave y el mismo contenido debe devolver el resultado original.
    3. Una operación con la misma clave y contenido diferente debe rechazarse como conflicto.
    4. El servicio debe conservar suficiente información para identificar operaciones ya procesadas.
    5. Los reintentos deben ser controlados y limitados.
    6. Los errores permanentes deben detener el procesamiento y generar una incidencia operativa.
Se recomienda almacenar un hash del contenido de la solicitud (request_hash) para detectar reutilización de claves con payload diferente. Su incorporación queda como recomendación técnica previa a producción.

9. Configuración Drizzle ORM
9.1 Estructura sugerida
src/
└── infrastructure/
    └── database/
        ├── database.module.ts
        ├── database.provider.ts
        └── schema/
            ├── commerce.schema.ts
            └── index.ts

drizzle/
├── 0000_create_commerce_schema.sql
├── 0001_add_inventory_reservation_history.sql
└── meta/
9.2 Configuración drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/infrastructure/database/schema/commerce.schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
La configuración debe cargar exclusivamente las tablas pertenecientes a Commerce.
No se deben incorporar las definiciones de Inventory, Catalog o App como entidades propietarias de sus migraciones.
9.3 Definición TypeScript
Archivo: commerce.schema.ts
La definición TypeScript debe utilizar pgSchema('commerce') y declarar los mismos ENUM y tablas descritos en la migración SQL.
Ejemplo de estructura:
import { sql } from 'drizzle-orm';

import {
  pgSchema,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  timestamp,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

export const commerceSchema = pgSchema('commerce');

export const customerTypeEnum = commerceSchema.enum(
  'customer_type',
  ['REGISTERED', 'GUEST'],
);

export const cartStatusEnum = commerceSchema.enum(
  'cart_status',
  ['ACTIVE', 'CONVERTED', 'ABANDONED'],
);

export const fulfillmentTypeEnum = commerceSchema.enum(
  'fulfillment_type',
  ['DELIVERY', 'PICKUP'],
);

export const orderStatusEnum = commerceSchema.enum(
  'order_status',
  [
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'ON_DELIVERY',
    'DELIVERY_FAILED',
    'RETURNED_TO_STORE',
    'DELIVERED',
    'PICKED_UP',
    'CANCELLED',
  ],
);

export const inventoryReservationStatusEnum =
  commerceSchema.enum(
    'inventory_reservation_status',
    [
      'PENDING',
      'RESERVED',
      'RELEASED',
      'DISPATCHED',
      'FAILED',
    ],
  );

export const paymentMethodEnum = commerceSchema.enum(
  'payment_method',
  ['CASH', 'BANK_TRANSFER'],
);

export const paymentStatusEnum = commerceSchema.enum(
  'payment_status',
  [
    'PENDING',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'REFUNDED',
    'CANCELLED',
  ],
);

export const deliveryAttemptStatusEnum =
  commerceSchema.enum(
    'delivery_attempt_status',
    [
      'PENDING',
      'IN_TRANSIT',
      'FAILED',
      'RETURNED_TO_STORE',
      'DELIVERED',
    ],
  );

export const outboxEventStatusEnum =
  commerceSchema.enum(
    'outbox_event_status',
    [
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
    ],
  );
A continuación se deben declarar las nueve tablas:
carts
cartItems
orders
orderItems
payments
orderDeliveries
orderInventoryReservations
deliveryAttempts
outboxEvents
Cada definición debe reproducir las columnas, nombres SQL, tipos, valores por defecto, índices y restricciones de la migración inicial.
Las relaciones Drizzle deben reflejar las FK internas del esquema Commerce. Los UUID de otros servicios deben declararse como campos UUID sin .references().
9.4 Sincronización
El SQL versionado es la fuente de verdad de la migración inicial.
Después de incorporarlo:
    • Mantener sincronizado SQL con TypeScript.
    • Validar los cambios mediante Drizzle Kit.
    • No modificar directamente tablas de otros servicios.
    • Probar la migración desde una base de datos limpia.
    • Conservar las migraciones ya aplicadas.

10. Integración con Inventory
Commerce utiliza un cliente HTTP interno para comunicarse con liquor-inventory.
10.1 Responsabilidades del cliente
InventoryClientService debe:
    • Centralizar URLs y configuración.
    • Aplicar timeout.
    • Adjuntar autenticación de servicio.
    • Propagar claves idempotentes.
    • Normalizar errores.
    • Permitir reintentos controlados.
    • Mantener trazabilidad de cada operación.
10.2 Contratos principales
Operación	Endpoint de Inventory
Consultar disponibilidad	GET /internal/v1/stock/availability
Reservar	POST /internal/v1/stock/reservations
Liberar	POST /internal/v1/stock/reservations/{orderId}/release
Despachar	POST /internal/v1/stock/reservations/{orderId}/dispatch
Registrar devolución	POST /internal/v1/stock/returns
Commerce no debe escribir directamente en inventory.stock_balances, inventory.stock_reservations ni inventory.stock_movements.
10.3 Seguridad
    • Las rutas internas requieren autenticación entre servicios.
    • El BFF valida el JWT de Supabase y los roles antes de reenviar la identidad.
    • Commerce valida la autenticación de servicio recibida.
    • Los identificadores de usuario no se deben confiar si provienen libremente del navegador.
    • Los datos de actor utilizados en operaciones sensibles deben provenir de un contexto autenticado y confiable.
    • Las claves privilegiadas de Supabase nunca deben exponerse al cliente.

11. Estrategia de pruebas
11.1 Persistencia
Caso	Resultado esperado
Crear carrito	Carrito persistido
Agregar variante	Item asociado al carrito
Repetir variante	Se actualiza cantidad, no se duplica item
Crear pedido	Pedido y snapshots persistidos
Crear pedido invitado	customer_id nullable
Crear pedido registrado	Referencia de cliente persistida
Crear pago	Pago asociado al pedido
Crear entrega	Una entrega por pedido
Registrar intento	Intento asociado a entrega
Crear evento Outbox	Evento persistido
11.2 Checkout y coordinación
Caso	Resultado esperado
Checkout válido	Pedido y reserva confirmados
Checkout sin stock	Pedido cancelado con motivo
Checkout repetido	No duplica pedidos
Checkout con timeout	Operación recuperable
Inventory no responde	Outbox pendiente
Reintento con misma clave	No duplica reserva
Error al actualizar Commerce	Recuperación mediante Outbox
11.3 Cancelación y despacho
Caso	Resultado esperado
Cancelación con reserva activa	Reserva liberada
Cancelación repetida	No duplica operación
Cancelación después del despacho	No libera reserva
Despacho confirmado	Pedido ON_DELIVERY
Despacho rechazado	Pedido no avanza
Pedido sin reserva	No puede pasar a preparación
11.4 Pagos y entregas
Caso	Resultado esperado
Transferencia pendiente	Pago UNDER_REVIEW
Transferencia verificada	Pago APPROVED
Efectivo contraentrega	Pago pendiente hasta recepción
Efectivo recibido	Pago aprobado
Entrega fallida	Historial conservado
Devolución verificada	Stock reintegrado según condición
Reintento de entrega	Nuevo intento trazable
Recogida en tienda	Pedido PICKED_UP

12. Decisiones pendientes
Las siguientes decisiones no quedan definidas por el modelo físico inicial y no deben asumirse como reglas definitivas.
Decisión	Estado
Política de expiración de carritos	Pendiente
Política de eliminación o conservación de carritos abandonados	Pendiente
Política de cancelación comercial	Pendiente
Tratamiento de pagos recibidos al cancelar	Pendiente
Política de reembolsos	Pendiente
Tarifas de entrega	Pendiente
Zonas y cobertura de entrega	Pendiente
Reintentos y costos de entrega	Pendiente
Tiempo máximo de procesamiento de checkout	Pendiente
Política de conservación de comprobantes	Pendiente
Configuración del punto de recogida	Pendiente
Proveedor de despliegue	Pendiente

13. Definition of Done
La persistencia inicial de Commerce se considera implementada cuando:
    • El esquema commerce puede crearse independientemente.
    • Todos los ENUM están definidos.
    • Las nueve tablas están creadas.
    • Todas las tablas tienen PK.
    • Las relaciones internas tienen FK.
    • Las referencias a otros servicios son UUID lógicos.
    • Las restricciones de cantidades y valores monetarios funcionan.
    • Los pedidos conservan snapshots históricos.
    • Los pagos tienen estados independientes del pedido.
    • Los intentos de entrega conservan su historial.
    • El Outbox permite recuperar operaciones incompletas.
    • El checkout es idempotente.
    • Las operaciones críticas tienen manejo de errores.
    • Drizzle puede consultar todas las entidades.
    • SQL y TypeScript están sincronizados.
    • Las migraciones son reproducibles desde una base limpia.
    • Las pruebas de persistencia y transacciones pasan.
Resultado esperado: una base de persistencia independiente para liquor-commerce-service, capaz de administrar carritos, checkout, pedidos, pagos y entregas, y coordinar las operaciones de inventario mediante contratos internos recuperables e idempotentes.


