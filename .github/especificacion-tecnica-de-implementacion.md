3. liquor-commerce-service
3.1 Responsabilidades
    • Administrar carritos.
    • Procesar checkout.
    • Crear pedidos.
    • Registrar información de clientes y entrega.
    • Gestionar pagos.
    • Administrar estados comerciales.
    • Coordinar reservas y despachos con Inventory.
    • Recuperar operaciones incompletas.
    • Mantener el historial de pedidos.
Commerce es el servicio que coordina el proceso comercial, pero no administra cantidades de inventario.
3.2 Estructura de módulos
src/
├── modules/
│   ├── carts/
│   │   ├── carts.module.ts
│   │   ├── carts.controller.ts
│   │   ├── carts.service.ts
│   │   └── repositories/
│   │
│   ├── checkout/
│   │   ├── checkout.module.ts
│   │   ├── checkout.controller.ts
│   │   ├── checkout.service.ts
│   │   └── dto/
│   │
│   ├── orders/
│   │   ├── orders.module.ts
│   │   ├── orders.controller.ts
│   │   ├── orders.service.ts
│   │   └── repositories/
│   │
│   ├── payments/
│   │   ├── payments.module.ts
│   │   ├── payments.controller.ts
│   │   ├── payments.service.ts
│   │   └── dto/
│   │
│   ├── inventory-client/
│   │   ├── inventory-client.module.ts
│   │   ├── inventory-client.service.ts
│   │   └── dto/
│   │
│   └── outbox/
│       ├── outbox.module.ts
│       ├── outbox.service.ts
│       ├── outbox.processor.ts
│       └── outbox.repository.ts
│
├── infrastructure/
│   ├── database/
│   ├── security/
│   └── http/
│
├── common/
│   ├── enums/
│   ├── exceptions/
│   ├── filters/
│   └── guards/
│
└── app.module.ts

3.3 Modelo de persistencia
Commerce conserva sus tablas principales:
    • commerce.carts
    • commerce.cart_items
    • commerce.orders
    • commerce.order_items
    • commerce.payments
    • commerce.order_deliveries
Se propone agregar:
Campo inventory_reservation_status en orders
Este campo representa la coordinación técnica con Inventory, no el estado comercial.
Valores:
    • PENDING
    • RESERVED
    • RELEASED
    • DISPATCHED
    • FAILED
Un pedido solo puede pasar a preparación si su reserva está confirmada.
commerce.outbox_events
Permite guardar operaciones pendientes de ejecutar o recuperar.
Campo	Tipo	Descripción
id	UUID	PK
event_type	VARCHAR	Tipo de operación
aggregate_id	UUID	ID del pedido
payload	JSONB	Datos de operación
idempotency_key	VARCHAR	UNIQUE
status	ENUM	PENDING, PROCESSING, COMPLETED, FAILED
attempts	INTEGER	Intentos
next_attempt_at	TIMESTAMP	Próximo intento
last_error	TEXT	Último error
created_at	TIMESTAMP	Creación
processed_at	TIMESTAMP	Finalización
El Outbox no reemplaza las tablas de pedidos ni de pagos. Es un mecanismo de recuperación de operaciones distribuidas.

4. Flujo de checkout
4.1 Proceso
El checkout debe coordinar la creación del pedido y la reserva del inventario.
    1. El cliente confirma el carrito.
    2. Commerce valida la información del pedido.
    3. Commerce obtiene los datos y precios vigentes de Catalog.
    4. Commerce calcula y persiste los valores definitivos del pedido.
    5. Commerce crea el pedido y sus detalles.
    6. Commerce crea el pago en estado PENDING.
    7. Commerce registra un evento RESERVE_STOCK en Outbox.
    8. Commerce intenta ejecutar la reserva en Inventory.
    9. Inventory confirma o rechaza la operación.
    10. Commerce actualiza inventory_reservation_status.
    11. Si se confirma, el pedido queda disponible para operación.
    12. Si no hay existencias suficientes, el pedido se cancela y se informa al cliente.
Importante: el checkout no debe responder como exitoso mientras la reserva no esté confirmada.
Si la comunicación presenta un timeout y no se conoce el resultado, Commerce debe responder con un estado de procesamiento. No debe cancelar ni repetir la operación con una clave diferente.
4.2 Diagrama de secuencia
sequenceDiagram
    participant Client
    participant Commerce
    participant DB as Commerce DB
    participant Inventory
    participant InvDB as Inventory DB

    Client->>Commerce: POST /checkout
    Commerce->>DB: Crear pedido + items + pago
    Commerce->>DB: Crear Outbox RESERVE_STOCK
    Commerce->>Inventory: POST /stock/reservations
    Inventory->>InvDB: Validar disponibilidad y reservar
    InvDB-->>Inventory: Reserva confirmada
    Inventory-->>Commerce: ACTIVE
    Commerce->>DB: Actualizar reserva = RESERVED
    Commerce->>DB: Completar Outbox
    Commerce-->>Client: Pedido confirmado
4.3 Manejo de fallos
Situación	Comportamiento
No hay existencias	Cancelar pedido y registrar motivo.
Inventory no responde	Mantener operación pendiente y recuperar mediante Outbox.
Timeout después de reservar	Reintentar con la misma idempotency key.
Error al actualizar Commerce	Recuperar mediante Outbox y consultar resultado de Inventory.
El cliente repite checkout	Evitar duplicados mediante idempotencia del checkout.
El Outbox debe ejecutarse mediante un worker de NestJS. No es necesario incorporar RabbitMQ o Kafka.

5. Flujo de cancelación
    1. El operador solicita cancelar el pedido.
    2. Commerce valida que el pedido pueda cancelarse.
    3. Commerce registra la operación pendiente en Outbox.
    4. Inventory libera la reserva.
    5. Commerce actualiza inventory_reservation_status = RELEASED.
    6. Commerce actualiza status = CANCELLED.
    7. Se registra el motivo y el usuario responsable.
Si el pedido ya fue despachado, no se libera una reserva: debe gestionarse como devolución física.
La política de devolución de dinero o tratamiento de pagos ya recibidos debe quedar sujeta a las reglas comerciales pendientes.

6. Flujo de despacho
    1. El operador confirma que el pedido está listo.
    2. Commerce verifica que la reserva esté en estado RESERVED.
    3. El operador confirma la salida del pedido.
    4. Commerce solicita el despacho a Inventory.
    5. Inventory descuenta existencias y reserva en una transacción.
    6. Inventory registra el movimiento OUT.
    7. Commerce actualiza la reserva a DISPATCHED.
    8. Commerce actualiza el estado del pedido a ON_DELIVERY.
Si el despacho falla, el pedido no debe pasar a ON_DELIVERY.

7. Flujo de entrega fallida y devolución
    1. El operador registra la entrega fallida.
    2. Commerce actualiza el pedido a DELIVERY_FAILED.
    3. El producto regresa físicamente al establecimiento.
    4. El operador verifica las unidades recibidas.
    5. Commerce solicita registrar la devolución.
    6. Inventory registra la devolución y reintegra únicamente las unidades aptas.
    7. Commerce actualiza el pedido a RETURNED_TO_STORE.
A partir de este estado existen dos posibilidades:
Reintentar entrega
    • Crear una nueva reserva para el pedido.
    • Confirmar la nueva reserva.
    • Volver a preparar el pedido.
    • Registrar un nuevo intento de entrega.
Cancelar pedido
    • Actualizar el estado comercial a CANCELLED.
    • Mantener el historial de reservas, despacho y devolución.
Cada intento de entrega debe tener trazabilidad independiente. Se recomienda incorporar commerce.delivery_attempts en lugar de depender únicamente de un contador dentro de order_deliveries.

8. Pagos
8.1 Estados
Métodos:
    • CASH
    • BANK_TRANSFER
Estados:
    • PENDING
    • UNDER_REVIEW
    • APPROVED
    • REJECTED
    • REFUNDED
    • CANCELLED
8.2 Reglas operativas
Transferencia bancaria
    • El cliente registra el comprobante, si se habilita esa funcionalidad.
    • El pago pasa a UNDER_REVIEW.
    • El operador verifica el ingreso real del dinero.
    • Solo entonces cambia a APPROVED.
    • No se despacha un pedido con transferencia pendiente de verificación.
Efectivo contraentrega
    • El pedido puede entregarse antes de que el efectivo regrese al establecimiento.
    • El pago permanece PENDING.
    • El operador registra APPROVED cuando recibe el dinero del domiciliario.
Recogida en tienda
    • El operador registra el pago cuando recibe el efectivo.
    • El pedido pasa a PICKED_UP una vez completada la entrega.
El estado del pago y el estado del pedido son independientes.

9. Seguridad y comunicación interna
9.1 Autenticación
    • Las rutas públicas utilizan la autenticación y autorización correspondientes al cliente.
    • Las rutas internas requieren credenciales de servicio.
    • Los JWT de Supabase deben verificarse en NestJS.
    • Las claves privilegiadas de Supabase nunca se exponen al navegador.
    • Los servicios no deben confiar en identificadores de usuario enviados libremente por el cliente.
9.2 Comunicación
Commerce se comunica con Inventory mediante un cliente HTTP interno.
Responsabilidades de InventoryClientService:
    • Centralizar URLs y configuración.
    • Aplicar timeout.
    • Adjuntar autenticación de servicio.
    • Normalizar errores.
    • Propagar idempotency keys.
    • Permitir reintentos controlados.
No se deben realizar reintentos ilimitados. Los errores permanentes deben detener el procesamiento y generar una incidencia operativa.

10. Estrategia de pruebas
Inventory
Caso	Resultado esperado
Reservar stock disponible	Reserva ACTIVE
Reservar stock insuficiente	Operación rechazada sin cambios
Reservar varias variantes	Todas o ninguna
Reservar dos veces con misma clave	Mismo resultado sin duplicar
Liberar reserva	Cantidad reservada disminuye
Liberar dos veces	No duplica el movimiento
Despachar reserva	Disminuyen on_hand y reserved
Despachar reserva liberada	Operación rechazada
Devolver unidades aptas	Aumenta on_hand
Devolver unidades dañadas	No aumenta stock disponible
Reservas concurrentes	No existe sobreventa
Commerce
Caso	Resultado esperado
Checkout válido	Pedido y reserva confirmados
Checkout sin stock	Pedido cancelado con motivo
Checkout con timeout	Operación recuperable
Checkout repetido	No duplica pedidos
Cancelación con reserva activa	Reserva liberada
Despacho confirmado	Pedido ON_DELIVERY
Despacho rechazado	Pedido no avanza
Entrega fallida	Se conserva el historial
Devolución verificada	Stock reintegrado según condición
Reintento de entrega	Nueva reserva trazable
Pago en efectivo	Aprobación al recibir dinero

11. Orden de implementación
Fase 1 — Fundamentos de Inventory
    • Crear esquema y migraciones.
    • Configurar Drizzle.
    • Implementar stock balances.
    • Implementar stock movements.
    • Implementar reservas.
    • Implementar liberación.
    • Implementar despacho.
    • Crear pruebas transaccionales y de concurrencia.
Criterio de salida: Inventory puede reservar, liberar y despachar de forma atómica e idempotente.
Fase 2 — Fundamentos de Commerce
    • Crear migraciones.
    • Implementar carritos.
    • Implementar pedidos.
    • Implementar detalles del pedido.
    • Implementar pagos.
    • Implementar cliente HTTP de Inventory.
    • Implementar Outbox.
Criterio de salida: Commerce puede crear pedidos y coordinar reservas de forma recuperable.
Fase 3 — Integración
    • Integrar checkout con Inventory.
    • Implementar cancelaciones.
    • Implementar despacho.
    • Implementar devoluciones.
    • Implementar reintentos de entrega.
    • Validar recuperación ante fallos.
Criterio de salida: el ciclo completo de compra funciona sin inconsistencias de inventario.
Fase 4 — Operación y calidad
    • Integrar autorización de operadores.
    • Implementar auditoría.
    • Agregar observabilidad y logs.
    • Ejecutar pruebas de integración.
    • Ejecutar pruebas de concurrencia.
    • Validar escenarios de recuperación.
    • Documentar contratos OpenAPI.
Criterio de salida: los procesos pueden ser ejecutados y auditados desde el backoffice.

12. Decisiones pendientes antes de producción
Decisión	Estado
Ubicación inicial de inventario	Pendiente de configuración
Política de cancelación	Pendiente
Tratamiento de pagos al cancelar	Pendiente
Política de productos dañados	Pendiente
Reintentos y costos de entrega	Pendiente
Tiempo máximo de procesamiento de checkout	Pendiente
Proveedor de despliegue	Pendiente
Estrategia de autenticación entre servicios	Definir mecanismo y secretos
Política de conservación de comprobantes	Pendiente

13. Definition of Done general
Una funcionalidad se considera terminada cuando:
    • Tiene migración versionada.
    • Tiene validaciones de entrada.
    • Respeta la propiedad del esquema.
    • Tiene autorización y autenticación adecuadas.
    • Tiene manejo de errores.
    • Tiene pruebas unitarias.
    • Tiene pruebas de integración cuando aplica.
    • Considera idempotencia en operaciones críticas.
    • Registra auditoría cuando modifica información sensible.
    • Está documentada en OpenAPI.
    • No rompe los contratos de integración existentes.
Resultado esperado: dos servicios independientes, con límites de responsabilidad claros y un proceso de compra consistente, recuperable y trazable.
