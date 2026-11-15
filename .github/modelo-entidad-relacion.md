Modelo físico de datos — Licorera Online
Versión 1.0 · Propuesta para MVP · PostgreSQL + Drizzle ORM
1. Distribución física por esquemas
Mantendremos un proyecto Supabase y distribuiremos las tablas por responsabilidad.
catalog — Catalog Service
Productos y estructura comercial
brands · categories · products · product_variants · product_images · product_categories
inventory — Inventory Service
Existencias y trazabilidad
inventory_locations · stock_balances · stock_movements
commerce — Commerce Service
Compras y transacciones comerciales
carts · cart_items · orders · order_inventory_reservations · order_items · payments · order_deliveries
app — Datos de aplicación
Perfiles y autorización
profiles · roles · user_roles
No crearemos un esquema de promociones independiente en el MVP. Los descuentos aplicados quedarán registrados en el pedido y podremos incorporar la gestión de cupones cuando definamos su alcance.
2. Modelo relacional
2.1 Catalog Service
Este dominio será la fuente de verdad de la información comercial de los productos.


 [VEASE IMAGEN MER-CATALOG CARPETA FASE DE ANÁLISIS]


brands
Campo	Tipo	Restricción
id	UUID	PK
name	VARCHAR(120)	NOT NULL
slug	VARCHAR(140)	UNIQUE
is_active	BOOLEAN	DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
categories
Campo	Tipo	Restricción
id	UUID	PK
parent_id	UUID	FK a categories.id, NULL
name	VARCHAR(100)	NOT NULL
slug	VARCHAR(120)	UNIQUE
description	TEXT	NULL
is_active	BOOLEAN	DEFAULT TRUE
sort_order	INTEGER	DEFAULT 0
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
La relación parent_id permite categorías jerárquicas. Por ejemplo: Whisky → Escocés → Single Malt.
products
Campo	Tipo	Restricción
id	UUID	PK
brand_id	UUID	FK a brands.id, NULL
name	VARCHAR(180)	NOT NULL
slug	VARCHAR(200)	UNIQUE
description	TEXT	NULL
is_active	BOOLEAN	DEFAULT TRUE
is_featured	BOOLEAN	DEFAULT FALSE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
product_categories
Tabla intermedia para soportar más de una categoría por producto.
Campo	Tipo	Restricción
product_id	UUID	PK, FK
category_id	UUID	PK, FK
La clave primaria compuesta evita asignar dos veces la misma categoría al mismo producto.
product_variants
Campo	Tipo	Restricción
id	UUID	PK
product_id	UUID	FK a products.id
sku	VARCHAR(80)	UNIQUE
name	VARCHAR(120)	NOT NULL
volume_ml	INTEGER	NULL
price_cop	BIGINT	NOT NULL
compare_at_price_cop	BIGINT	NULL
is_active	BOOLEAN	DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Ejemplo de variantes:
Producto	Variante	SKU	Precio
Whisky A	375 ml	WHA-375	45.000
Whisky A	750 ml	WHA-750	78.000
Whisky A	1 litro	WHA-1000	105.000
El precio pertenece a la variante, porque cada presentación puede tener un precio diferente.
product_images
Campo	Tipo	Restricción
id	UUID	PK
product_id	UUID	FK
variant_id	UUID	FK, NULL
storage_path	TEXT	NOT NULL
alt_text	VARCHAR(180)	NULL
sort_order	INTEGER	DEFAULT 0
is_primary	BOOLEAN	DEFAULT FALSE
created_at	TIMESTAMPTZ	NOT NULL
variant_id será opcional: una imagen puede pertenecer al producto en general o a una presentación concreta. Guardaremos la ruta de Storage, no la imagen binaria en PostgreSQL.
Regla: un producto inactivo no se podrá comprar. La disponibilidad comercial y la existencia física serán conceptos separados.

2.2 Inventory Service
Aunque inicialmente exista una sola tienda, el inventario se administrará por ubicación. Esto evita migraciones estructurales cuando se habilite otro punto de venta.
[VÉASE IMAGEN MER-INVENTORY DE LA CARPETA FASE DE ANÁLISIS]
inventory_locations
Campo	Tipo	Restricción
id	UUID	PK
code	VARCHAR(30)	UNIQUE
name	VARCHAR(120)	NOT NULL
address	TEXT	NULL
is_active	BOOLEAN	DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Desde el inicio tendremos un registro para la ubicación principal. No significa que debamos implementar una interfaz multi-sucursal todavía.
stock_balances
Campo	Tipo	Restricción
id	UUID	PK
location_id	UUID	FK a inventory_locations.id
variant_id	UUID	ID externo de Catalog
quantity_on_hand	INTEGER	DEFAULT 0
quantity_reserved	INTEGER	DEFAULT 0
updated_at	TIMESTAMPTZ	NOT NULL
Restricciones:
    • UNIQUE(location_id, variant_id).
    • quantity_on_hand >= 0.
    • quantity_reserved >= 0.
    • quantity_reserved <= quantity_on_hand.
La disponibilidad se calculará así:
\[ \text{Disponible} = \text{En existencia} - \text{Reservado} \]
No almacenaría quantity_available como columna adicional, porque es un valor derivado y podría desincronizarse.
stock_movements
Campo	Tipo	Restricción
id	UUID	PK
location_id	UUID	FK
variant_id	UUID	ID externo de Catalog
movement_type	VARCHAR(20)	NOT NULL
quantity	INTEGER	NOT NULL
reason	VARCHAR(180)	NOT NULL
reference_id	UUID	NULL
performed_by	UUID	NULL
created_at	TIMESTAMPTZ	NOT NULL
Tipos iniciales:
    • IN: entrada.
    • OUT: salida.
    • ADJUSTMENT: ajuste.
    • RESERVATION: reserva.
    • RELEASE: liberación de reserva.
La cantidad será siempre positiva; el tipo define el efecto del movimiento. Para los ajustes, debemos guardar también si el ajuste incrementa o disminuye las existencias, o definir un subtipo explícito.
reference_id puede relacionarse lógicamente con un pedido u otra operación externa, pero no tendrá FK hacia commerce.
Decisión importante: los movimientos no se editan ni eliminan. Si se registra una operación incorrecta, se genera un movimiento compensatorio.
La reserva no es indispensable para registrar un ajuste manual, pero sí es conveniente para el checkout: evita que dos clientes compren simultáneamente la última unidad.


2.3 Commerce Service
Este dominio será propietario de la operación comercial. Es especialmente importante separar los datos del cliente, el carrito y la transacción final.
[VÉASE IMAGEN MER-COMMERCE DE LA CARPETA FASE DE ANÁLISIS]
carts
Campo	Tipo	Restricción
id	UUID	PK
customer_id	UUID	NULL
session_token_hash	VARCHAR(255)	NULL
status	VARCHAR(20)	NOT NULL
currency	VARCHAR(3)	DEFAULT 'COP'
expires_at	TIMESTAMPTZ	NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Un carrito puede pertenecer a un usuario autenticado o a una sesión de invitado.
No guardaremos el token de sesión en texto plano. El carrito debe poder recuperarse durante la sesión y expirar después de un periodo definido.
cart_items
Campo	Tipo	Restricción
id	UUID	PK
cart_id	UUID	FK a carts.id
variant_id	UUID	ID externo de Catalog
quantity	INTEGER	NOT NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Restricciones:
    • UNIQUE(cart_id, variant_id).
    • quantity > 0.
El precio del carrito se consulta desde Catalog al calcular el checkout. No se considera precio definitivo hasta que se confirme el pedido.
orders
Campo	Tipo	Restricción
id	UUID	PK
order_number	VARCHAR(30)	UNIQUE
customer_id	UUID	NULL
customer_type	VARCHAR(20)	NOT NULL
customer_name	VARCHAR(160)	NOT NULL
customer_phone	VARCHAR(30)	NOT NULL
customer_email	VARCHAR(180)	NULL
status	VARCHAR(30)	NOT NULL
subtotal_cop	BIGINT	NOT NULL
discount_cop	BIGINT	DEFAULT 0
delivery_fee_cop	BIGINT	DEFAULT 0
total_cop	BIGINT	NOT NULL
customer_notes	TEXT	NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
El customer_id será opcional y representará el identificador de Supabase Auth cuando exista un usuario registrado.
¿Por qué guardar nombre y teléfono en orders si ya tenemos un perfil?
Porque el pedido debe conservar los datos proporcionados en el momento de la compra. Si un cliente cambia su teléfono o dirección después, no debemos alterar el historial de sus pedidos.
customer_type distinguirá REGISTERED y GUEST.
order_items
Campo	Tipo	Restricción
id	UUID	PK
order_id	UUID	FK a orders.id
variant_id	UUID	ID externo de Catalog
product_name_snapshot	VARCHAR(180)	NOT NULL
variant_name_snapshot	VARCHAR(120)	NOT NULL
sku_snapshot	VARCHAR(80)	NOT NULL
quantity	INTEGER	NOT NULL
unit_price_cop	BIGINT	NOT NULL
discount_amount_cop	BIGINT	DEFAULT 0
line_total_cop	BIGINT	NOT NULL
Restricciones:
    • quantity > 0.
    • unit_price_cop >= 0.
    • discount_amount_cop >= 0.
    • line_total_cop >= 0.
variant_id es una referencia histórica al catálogo, no una FK física. Si la variante se desactiva, el pedido seguirá conservando sus datos originales.
El detalle debe conservar también la descripción comercial relevante o la presentación que se mostró al comprador si necesitamos reproducir exactamente la factura o comprobante.
payments
Campo	Tipo	Restricción
id	UUID	PK
order_id	UUID	FK a orders.id
method	VARCHAR(20)	NOT NULL
status	VARCHAR(20)	NOT NULL
amount_cop	BIGINT	NOT NULL
reference	VARCHAR(120)	NULL
proof_storage_path	TEXT	NULL
paid_at	TIMESTAMPTZ	NULL
created_at	TIMESTAMPTZ	NOT NULL
Métodos iniciales:
    • CASH.
    • BANK_TRANSFER.
Estados sugeridos:
    • PENDING.
    • UNDER_REVIEW.
    • APPROVED.
    • REJECTED.
    • REFUNDED.
No confundiremos el estado del pedido con el estado del pago. Un pedido puede estar pendiente de preparación y tener un pago aprobado.
order_deliveries
Campo	Tipo	Restricción
id	UUID	PK
order_id	UUID	UNIQUE, FK
recipient_name	VARCHAR(160)	NOT NULL
recipient_phone	VARCHAR(30)	NOT NULL
delivery_address	TEXT	NOT NULL
delivery_reference	TEXT	NULL
delivery_notes	TEXT	NULL
recipient_is_customer	BOOLEAN	DEFAULT TRUE
status	VARCHAR(20)	NOT NULL
delivered_at	TIMESTAMPTZ	NULL
La dirección de entrega no debe depender del perfil del usuario. Se registra como una fotografía de la información de entrega del pedido.
Descuentos
En el MVP, los descuentos pueden quedar representados en orders.discount_cop y en order_items.discount_amount_cop. Si posteriormente hay cupones, añadiremos coupons y una tabla de aplicación de cupones con una fotografía del código y las condiciones utilizadas.

2.4 App: perfiles y roles
Supabase Auth administrará las credenciales. El esquema app almacenará información propia de la aplicación.
Tabla	Campos principales
profiles	id, full_name, phone, created_at, updated_at
roles	id, name, description
user_roles	user_id, role_id, created_at
profiles.id corresponderá al auth.users.id de Supabase y podrá tener una FK hacia esa tabla, ya que ambos forman parte de la gestión de identidad de la plataforma.
Para comenzar, los roles pueden ser ADMIN, MANAGER y OPERATOR. No incorporaría permisos granulares hasta que los flujos administrativos lo necesiten.
3. Restricciones e índices
Las tablas no son suficientes por sí solas. Necesitamos restricciones que hagan imposible guardar estados inválidos, incluso cuando dos solicitudes lleguen simultáneamente.
3.1 Restricciones de integridad
Tabla	Restricción
products	Slug único.
product_variants	SKU único.
product_variants	Precio mayor o igual a cero.
product_categories	PK compuesta.
stock_balances	Una combinación única de ubicación y variante.
stock_balances	Existencias y reservas no negativas.
cart_items	Una variante por carrito.
cart_items	Cantidad mayor que cero.
orders	Número de pedido único.
order_items	Cantidad mayor que cero.
payments	Importe mayor que cero.
order_deliveries	Un registro de entrega por pedido.
user_roles	Una asignación única de usuario y rol.
También estableceremos restricciones CHECK para los valores de estados y tipos de movimientos, evitando que se guarden valores arbitrarios.
3.2 Índices recomendados
No se indexa todas las columnas. Los índices se deben diseñar según las consultas que realmente ejecutará cada aplicación.
Tabla	Índice	Justificación
products	slug	Consulta por URL.
products	brand_id	Filtro por marca.
products	is_active	Catálogo publicado.
product_variants	product_id	Consultar presentaciones.
product_variants	sku	Búsqueda por SKU.
categories	parent_id	Navegación jerárquica.
stock_balances	(location_id, variant_id)	Consulta de disponibilidad.
stock_movements	(variant_id, created_at)	Historial de movimientos.
orders	(status, created_at)	Administración de pedidos.
orders	(customer_id, created_at)	Historial del cliente.
order_items	order_id	Detalle del pedido.
payments	(order_id, status)	Consulta de pagos.
carts	(customer_id, status)	Recuperación de carritos.
Para el buscador, inicialmente utilizaremos búsqueda PostgreSQL. Si el catálogo crece y necesitamos búsqueda textual más avanzada, podremos evaluar índices GIN con tsvector o un motor especializado.
4. Reglas de consistencia entre servicios
Esta parte es especialmente importante: aunque compartamos instancia PostgreSQL, no debemos permitir que los servicios se conviertan en una aplicación monolítica que consulta y modifica cualquier tabla.
Operación	Servicio propietario
Crear producto	Catalog
Cambiar precio	Catalog
Desactivar presentación	Catalog
Registrar entrada de inventario	Inventory
Ajustar existencias	Inventory
Consultar disponibilidad	Inventory
Crear pedido	Commerce
Registrar pago	Commerce
Consultar historial de pedidos	Commerce
Ejemplo de compra

[VÉASE IMAGEN FLUJO-DE-COMPRA DE LA CARPETA FASE DE ANÁLISIS]

Hay un detalle de implementación que debemos respetar: la reserva y actualización del inventario deben ejecutarse atómicamente dentro de Inventory. La creación del pedido es otra transacción, propiedad de Commerce.
Si Commerce falla después de reservar, debe liberar la reserva. Para fallos de red o interrupciones, necesitaremos expiración de reservas y reconciliación. Esto es una coordinación entre servicios, no una transacción distribuida.
5. Estrategia de normalización
La propuesta sigue estos criterios:
Forma normal	Aplicación
1FN	Campos atómicos; no listas de productos en columnas.
2FN	Los atributos dependen de la clave completa en relaciones compuestas.
3FN	Los datos descriptivos se mantienen en sus entidades correspondientes.
Excepciones controladas	Fotografías históricas en pedidos y saldos calculados para consultas rápidas.
Hay dos excepciones importantes:
    1. Snapshots comerciales: los pedidos guardan nombre, SKU y precio histórico para conservar el contexto de compra.
    2. Saldos de inventario: stock_balances es una proyección operativa que se mantiene junto con el registro histórico de movimientos.
La segunda excepción requiere controles estrictos: nunca debe actualizarse el saldo sin registrar el movimiento correspondiente.
6. Gestión de datos con Drizzle ORM
Cada repositorio backend mantendrá su propia definición de esquema, migraciones y acceso a datos.

liquor-catalog/
└── src/
    ├── modules/
    │   ├── products/
    │   ├── categories/
    │   ├── brands/
    │   └── variants/
    ├── database/
    │   ├── schema/
    │   │   ├── brands.schema.ts
    │   │   ├── products.schema.ts
    │   │   ├── categories.schema.ts
    │   │   ├── product-variants.schema.ts
    │   │   └── product-images.schema.ts
    │   ├── migrations/
    │   ├── database.module.ts
    │   └── drizzle.config.ts
    └── main.ts
La misma convención se aplicará a Commerce e Inventory.
Reglas de implementación:
    • Cada servicio ejecuta sus propias migraciones.
    • No se comparte un único objeto Drizzle entre repositorios.
    • Cada servicio usa credenciales PostgreSQL con permisos limitados.
    • Los cambios de esquema se versionan y revisan antes de desplegar.
    • Las migraciones no se ejecutan automáticamente desde cada instancia de la aplicación al arrancar.
    • Se utilizarán transacciones para operaciones que modifiquen múltiples tablas del mismo dominio.
6.1 Convenciones
Elemento	Convención
Tablas	snake_case, plural
Columnas	snake_case
IDs	UUID
Claves primarias	id
Claves foráneas	{entity}_id
Fechas	created_at, updated_at
Booleanos	is_active, is_featured
Importes	Sufijo _cop
Snapshots	Sufijo _snapshot
7. Decisiones a mantener bajo observación
Hay algunos puntos que no bloquearán el MVP, pero conviene resolver antes de implementar las funcionalidades correspondientes.
Tema	Recomendación
Historial de precios	Incorporar variant_prices si necesitamos consultar precios anteriores o programar cambios.
Compras a proveedores	No crear todavía un módulo de abastecimiento completo; comenzar con entradas manuales.
Promociones	Diseñar cupones cuando se definan reglas y restricciones comerciales.
Direcciones guardadas	Incorporarlas cuando los usuarios registrados puedan gestionar varias direcciones.
Domiciliarios	Mantener la asignación fuera del sistema durante el MVP.
Impuestos	Definir las reglas contables y tributarias antes de construir facturación.
Auditoría	Incorporar trazabilidad de operaciones administrativas desde el inicio.
Consideración adicional: al ser una licorera, el control de mayoría de edad no debe depender exclusivamente de un checkbox del frontend. Debemos definir cómo se valida la edad, qué datos se conservan y qué controles se aplican durante la entrega, teniendo en cuenta las obligaciones legales
8. Orden recomendado de implementación
    1. Fase 1 — Estructura de datos
       Esquemas PostgreSQL, roles, permisos y configuración Drizzle.
    2. Fase 2 — Catálogo
       Marcas, categorías, productos, variantes e imágenes.
    3. Fase 3 — Inventario
       Ubicaciones, saldos, movimientos y ajustes manuales.
    4. Fase 4 — Identidad y comercio
       Perfiles, carritos, clientes invitados, pedidos y detalles.
    5. Fase 5 — Pagos y entrega
       Métodos de pago, comprobantes, direcciones y destinatarios.
    6. Fase 6 — Integración
       Checkout, reservas, idempotencia, pruebas de concurrencia y consistencia.
Recomendación arquitectónica final
No se empieza creando todas las tablas simultáneamente. Construiría primero Catalog, después Inventory y finalmente Commerce, validando los contratos entre servicios en cada etapa.
Hay una distinción que quiero preservar durante todo el desarrollo:
    • El catálogo determina qué vendemos y a qué precio.
    • El inventario determina cuánto tenemos disponible.
    • Commerce determina qué compró el cliente y bajo qué condiciones.
    • App determina quién puede acceder y qué puede administrar.
Esta separación es el fundamento del modelo, no simplemente una organización de carpetas.


Modelo Entidad-Relación — Modelo Relacional Físico
Licorera Online — Versión 1.1
Fecha: 13 de noviembre de 2026
Motor: PostgreSQL
Plataforma: Supabase
ORM: Drizzle ORM
Estado: Actualización del modelo v1.0
1. Arquitectura de datos
Se conserva una única base de datos PostgreSQL con separación lógica por esquemas:
Esquema	Responsabilidad
app	Perfiles, roles y control de acceso.
catalog	Marcas, categorías, productos, variantes e imágenes.
inventory	Existencias, reservas y movimientos.
commerce	Carritos, órdenes, pagos y datos de entrega.
Las tablas mantienen sus propietarios funcionales. No se incorporan bases de datos independientes ni escrituras cruzadas entre servicios.
Convenciones
    • Identificadores: UUID.
    • Fechas: TIMESTAMPTZ.
    • Importes: BIGINT en COP.
    • Cantidades: INTEGER.
    • Restricciones y claves foráneas físicas dentro del mismo esquema.
    • Referencias entre dominios: UUID lógicos, sin FK físicas cross-schema.
    • Snapshots comerciales en order_items para conservar el histórico.
2. Esquema catalog
Sin cambios respecto a v1.0.
Tabla	Responsabilidad
brands	Marcas comerciales.
categories	Categorías de productos.
products	Información general de productos.
product_categories	Relación productos-categorías.
product_variants	Presentaciones, SKU y precios.
product_images	Imágenes del catálogo.
El inventario continúa identificando variantes mediante variant_id, sin FK física al esquema catalog.
3. Esquema inventory
3.1. Tabla inventory_locations
Se conserva para permitir múltiples ubicaciones en el futuro.
La operación inicial utiliza una ubicación principal correspondiente a la tienda.
3.2. Tabla stock_balances
Se conservan sus campos:
Campo	Tipo	Restricción
id	UUID	PK
location_id	UUID	FK a inventory_locations.id
variant_id	UUID	Referencia lógica a catalog.product_variants.id
quantity_on_hand	INTEGER	NOT NULL, DEFAULT 0, >= 0
quantity_reserved	INTEGER	NOT NULL, DEFAULT 0, >= 0
updated_at	TIMESTAMPTZ	NOT NULL
Restricciones:
    • UNIQUE (location_id, variant_id).
    • quantity_on_hand >= 0.
    • quantity_reserved >= 0.
    • quantity_reserved <= quantity_on_hand.
Disponibilidad:
quantity_available = quantity_on_hand - quantity_reserved
La disponibilidad es calculada, no almacenada.
3.3. Tabla stock_movements
Se conserva la estructura:
Campo	Tipo	Restricción
id	UUID	PK
location_id	UUID	FK a inventory_locations.id
variant_id	UUID	Referencia lógica a variante
movement_type	VARCHAR(20)	NOT NULL
quantity	INTEGER	NOT NULL, > 0
reason	VARCHAR(180)	NOT NULL
reference_id	UUID	NULL, referencia lógica
performed_by	UUID	NULL, referencia lógica a usuario
created_at	TIMESTAMPTZ	NOT NULL
Tipos de movimiento existentes:
    • IN
    • OUT
    • ADJUSTMENT
    • RESERVATION
    • RELEASE
Se mantienen los movimientos inmutables. Los errores se corrigen mediante movimientos compensatorios.
Semántica actualizada de movimientos
Movimiento	Efecto en quantity_on_hand	Efecto en quantity_reserved
IN	Aumenta	Sin cambio
OUT	Disminuye	Sin cambio, salvo conversión de reserva en despacho
ADJUSTMENT	Ajusta según operación	No debe invalidar reservas
RESERVATION	Sin cambio	Aumenta
RELEASE	Sin cambio	Disminuye
La conversión de una reserva en una salida física se realiza en una sola operación transaccional:
    1. Disminuir quantity_on_hand.
    2. Disminuir quantity_reserved.
    3. Registrar un movimiento OUT asociado a la orden.
No se debe tratar el despacho como una liberación ordinaria de reserva, porque las unidades ya salieron físicamente de la tienda.
Razones de movimientos recomendadas
Tipo	reason
RESERVATION	ORDER_CREATED
RELEASE	ORDER_CANCELLED
OUT	ORDER_DISPATCHED
IN	FAILED_DELIVERY_RETURN
ADJUSTMENT	INVENTORY_CORRECTION
reference_id contiene el identificador lógico de la orden cuando el movimiento se origina en una operación comercial.
4. Esquema commerce
4.1. Tabla carts
Se conserva el carrito como entidad independiente de la orden.
4.2. Tabla cart_items
Se conservan las líneas del carrito y sus referencias lógicas a variantes.
4.3. Tabla orders
Se conserva la estructura original y se agregan los campos necesarios para identificar la modalidad de recepción.
Campo	Tipo	Restricción
id	UUID	PK
order_number	VARCHAR(30)	UNIQUE, NOT NULL
customer_id	UUID	NULL, referencia lógica a app.profiles.id
customer_type	VARCHAR(20)	NOT NULL: REGISTERED, GUEST
customer_name	VARCHAR(160)	NOT NULL
customer_phone	VARCHAR(30)	NOT NULL
customer_email	VARCHAR(180)	NULL
status	VARCHAR(30)	NOT NULL
fulfillment_type	VARCHAR(20)	NOT NULL: DELIVERY, PICKUP
subtotal_cop	BIGINT	NOT NULL
discount_cop	BIGINT	NOT NULL, DEFAULT 0
delivery_fee_cop	BIGINT	NOT NULL, DEFAULT 0
total_cop	BIGINT	NOT NULL
notes	TEXT	NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Restricciones y reglas:
    • customer_type admite REGISTERED o GUEST.
    • fulfillment_type admite DELIVERY o PICKUP.
    • customer_id puede ser NULL para compras de invitados.
    • Los importes no pueden ser negativos.
    • total_cop debe corresponder al cálculo comercial de la orden.
    • La modalidad de recepción se define al completar checkout.
    • El estado se valida mediante transiciones de negocio en backend.
Estados admitidos para orders.status:
    • PENDING
    • CONFIRMED
    • PREPARING
    • READY
    • ON_DELIVERY
    • DELIVERY_FAILED
    • RETURNED_TO_STORE
    • DELIVERED
    • PICKED_UP
    • CANCELLED
4.4. Tabla order_items
Se conserva la estructura de snapshots históricos.
Campo	Tipo	Restricción
id	UUID	PK
order_id	UUID	FK a orders.id
variant_id	UUID	Referencia lógica a variante
product_name_snapshot	VARCHAR(180)	NOT NULL
variant_name_snapshot	VARCHAR(120)	NOT NULL
sku_snapshot	VARCHAR(80)	NOT NULL
quantity	INTEGER	NOT NULL, > 0
unit_price_cop	BIGINT	NOT NULL, >= 0
discount_amount_cop	BIGINT	NOT NULL, >= 0
line_total_cop	BIGINT	NOT NULL, >= 0
La orden conserva los datos comerciales originales aunque el producto, su variante o su precio cambien posteriormente.
4.5. Tabla payments
Se conserva la relación 1 entre orders y payments.
Una orden genera inicialmente un registro de pago con estado pendiente. La estructura admite múltiples registros asociados a una orden para facilitar futuras ampliaciones.
Campo	Tipo	Restricción
id	UUID	PK
order_id	UUID	FK a orders.id
method	VARCHAR(20)	CASH, BANK_TRANSFER
status	VARCHAR(20)	Estado del pago
amount_cop	BIGINT	NOT NULL, > 0
reference	VARCHAR(120)	NULL
proof_path	TEXT	NULL
paid_at	TIMESTAMPTZ	NULL
verified_by	UUID	NULL, referencia lógica a app.profiles.id
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Estados propuestos:
    • PENDING
    • UNDER_REVIEW
    • APPROVED
    • REJECTED
    • REFUNDED
    • CANCELLED
Se conserva UNDER_REVIEW para posibles revisiones operativas, aunque la transferencia del MVP se validará directamente en tienda y no mediante conciliación automática.
Interpretación de campos
    • paid_at: fecha y hora en la que se confirma la recepción efectiva del dinero.
    • verified_by: usuario interno que registra y confirma la recepción.
    • reference: referencia de transferencia u observación identificadora.
    • proof_path: ruta privada del comprobante, disponible para una futura funcionalidad de carga.
Para el efectivo, paid_at corresponde al momento en que el operador recibe el dinero entregado por el domiciliario o directamente del cliente en tienda.
Para transferencia, corresponde al momento en que el operador verifica su recepción.
Regla: un pago solo representa dinero recibido cuando su estado es APPROVED.
Un pago pendiente no debe sumarse a los ingresos.
4.6. Tabla order_deliveries
Se conserva la relación de cero o una entrega por orden. Se utiliza para almacenar los datos y la trazabilidad de los pedidos con modalidad DELIVERY.
Campos existentes:
    • id
    • order_id
    • recipient_name
    • recipient_phone
    • Datos de dirección.
    • status
    • delivered_at
Se recomienda completar o ajustar la tabla con los siguientes campos:
Campo	Tipo	Propósito
municipality	VARCHAR(100)	Municipio de entrega.
neighborhood	VARCHAR(120)	Barrio o zona.
address	VARCHAR(240)	Dirección completa.
address_reference	TEXT	Indicaciones para localizar el domicilio.
latitude	NUMERIC(10,7)	Coordenada opcional.
longitude	NUMERIC(10,7)	Coordenada opcional.
status	VARCHAR(30)	Estado operativo de la entrega.
attempt_count	INTEGER	Número de intentos de entrega.
failure_reason	TEXT	Motivo del fallo.
failed_at	TIMESTAMPTZ	Fecha del intento fallido.
returned_at	TIMESTAMPTZ	Fecha de retorno a tienda.
delivered_at	TIMESTAMPTZ	Fecha de entrega exitosa.
created_at	TIMESTAMPTZ	Creación.
updated_at	TIMESTAMPTZ	Actualización.
Estados operativos sugeridos para order_deliveries.status:
    • PENDING
    • IN_TRANSIT
    • FAILED
    • RETURNED_TO_STORE
    • DELIVERED
La recogida en tienda no requiere un registro de domicilio. Su estado se controla mediante orders.status = PICKED_UP.
El estado de entrega debe permanecer coherente con el estado comercial de la orden. No debe ser posible marcar una entrega como exitosa si la orden no se encuentra en una etapa compatible.
5. Esquema app
Se conservan las tablas:
    • profiles
    • roles
    • user_roles
Los usuarios operativos se relacionan con app.profiles mediante referencias lógicas desde otros dominios.
La asignación de roles y permisos continúa siendo responsabilidad del esquema app y de los mecanismos de autorización definidos para NestJS.
6. Relaciones principales
Relación	Cardinalidad
orders → order_items	1
orders → payments	1
orders → order_deliveries	0:1
orders → order_inventory_reservations	1:N
inventory_locations → stock_balances	1
inventory_locations → stock_movements	1
profiles → user_roles	1
roles → user_roles	1
Las referencias a variantes y perfiles entre esquemas se mantienen como UUID lógicos, sin claves foráneas físicas entre dominios.
7. Operaciones transaccionales de inventario
7.1. Crear orden y reservar
La operación debe garantizar:
    1. Validar todas las variantes y cantidades.
    2. Bloquear o actualizar de forma segura las filas de stock_balances.
    3. Comprobar quantity_on_hand - quantity_reserved.
    4. Incrementar quantity_reserved.
    5. Crear la orden y sus líneas.
    6. Crear el pago pendiente.
    7. Registrar movimientos RESERVATION.
    8. Confirmar la transacción.
Si una variante no tiene disponibilidad suficiente, la transacción debe revertirse completamente.
La creación de la orden y la reserva deben evitar que un reintento del checkout genere órdenes duplicadas. Se recomienda implementar una clave de idempotencia para la operación.
7.2. Cancelar orden antes del despacho
En una única operación consistente:
    1. Validar que no exista una salida física.
    2. Consultar las reservas asociadas a la orden.
    3. Disminuir quantity_reserved.
    4. Registrar movimientos RELEASE.
    5. Actualizar la orden a CANCELLED.
    6. Actualizar el pago pendiente a CANCELLED, cuando corresponda.
    7. Registrar el motivo y responsable.
No se modifica quantity_on_hand.
7.3. Despachar orden
En una única operación consistente:
    1. Validar que la orden esté en estado READY.
    2. Validar la existencia de reservas activas.
    3. Para transferencia, exigir pago APPROVED.
    4. Para efectivo, permitir la salida con pago PENDING.
    5. Disminuir quantity_on_hand.
    6. Disminuir quantity_reserved.
    7. Registrar movimientos OUT con referencia a la orden.
    8. Actualizar la orden a ON_DELIVERY o mantener READY según la modalidad.
    9. Actualizar la entrega a IN_TRANSIT, cuando corresponda.
El cambio de estado, la actualización de saldos y los movimientos deben ser atómicos dentro de Inventory. La coordinación entre servicios debe manejarse mediante operaciones idempotentes y compensaciones, sin escrituras directas entre servicios.
7.4. Entrega fallida y retorno
El flujo será:
    1. Commerce registra el intento fallido.
    2. La orden pasa a DELIVERY_FAILED.
    3. El pedido retorna físicamente a la tienda.
    4. El operador verifica cantidades y estado de los productos.
    5. La orden pasa a RETURNED_TO_STORE.
    6. Inventory registra movimientos IN por las unidades recibidas y aptas.
    7. Se incrementa quantity_on_hand.
Si se programa otro intento:
    1. Se valida la disponibilidad.
    2. Se crea una nueva reserva.
    3. Se actualiza la orden a READY.
    4. Se conserva el historial del intento anterior.
Si se cancela:
    1. Se valida que no existan reservas activas.
    2. Se actualiza la orden a CANCELLED.
    3. Se conserva el inventario ya reintegrado.
    4. Se aplica el tratamiento correspondiente al pago, si existía uno aprobado.
8. Índices y restricciones recomendados
commerce.orders
    • UNIQUE (order_number).
    • INDEX (status, created_at).
    • INDEX (customer_id, created_at).
    • INDEX (fulfillment_type, status).
    • CHECK de importes no negativos.
    • CHECK de valores permitidos para customer_type y fulfillment_type.
commerce.order_items
    • INDEX (order_id).
    • INDEX (variant_id).
    • CHECK (quantity > 0).
    • CHECK de importes no negativos.
commerce.payments
    • INDEX (order_id).
    • INDEX (status, created_at).
    • INDEX (method, status).
    • CHECK (amount_cop > 0).
commerce.order_deliveries
    • UNIQUE (order_id).
    • INDEX (status).
    • INDEX (municipality, neighborhood).
    • CHECK (attempt_count >= 0).
inventory.stock_balances
    • UNIQUE (location_id, variant_id).
    • CHECK de cantidades no negativas.
    • CHECK (quantity_reserved <= quantity_on_hand).
inventory.stock_movements
    • INDEX (location_id, variant_id, created_at).
    • INDEX (reference_id).
    • INDEX (movement_type, created_at).
    • CHECK (quantity > 0).
9. Decisiones de diseño
    1. No se incorpora una tabla independiente de reservas en esta versión. El saldo reservado se mantiene en stock_balances y su trazabilidad en stock_movements.
    2. No se incorpora un servicio de pagos independiente. Los pagos pertenecen a Commerce.
    3. No se incorpora un servicio logístico independiente. La gestión de entregas permanece en Commerce y el backoffice.
    4. La entrega en tienda se representa con fulfillment_type = PICKUP y orders.status = PICKED_UP.
    5. Las órdenes conservan snapshots de productos y precios.
    6. Los pagos pendientes no representan ingresos recibidos.
    7. La salida física y la devolución de productos se registran en Inventory.
    8. Los movimientos de inventario no se eliminan ni se modifican retrospectivamente.
10. Consideraciones para implementación
    • Las operaciones de inventario deben ejecutarse con transacciones y bloqueos apropiados para prevenir sobreventa.
    • Los cambios de estado deben validarse en backend.
    • Los servicios deben ser idempotentes ante reintentos.
    • La reserva no tiene expiración automática en el MVP.
    • No se debe permitir una cancelación que libere dos veces la misma reserva.
    • El registro de efectivo debe identificar al operador que recibió el dinero.
    • El registro de una entrega exitosa no debe aprobar automáticamente un pago pendiente.
    • Los comprobantes y documentos privados deben almacenarse en Supabase Storage con acceso restringido.
    • Los servicios no deben utilizar privilegios administrativos globales para operaciones cotidianas.
11. Resumen de cambios de v1.0 a v1.1
Componente	Cambio
orders	Se incorpora fulfillment_type.
orders.status	Se agregan DELIVERY_FAILED y RETURNED_TO_STORE; se incorpora PICKED_UP.
payments	Se formaliza el registro de recepción y verificación mediante paid_at y verified_by; se contempla CANCELLED.
order_deliveries	Se amplían los datos de ubicación y trazabilidad de intentos y retornos.
stock_balances	Se formaliza el uso de quantity_reserved como reserva activa.
stock_movements	Se define la semántica de reserva, liberación, despacho y retorno.
Operación	Se establece la coordinación transaccional e idempotente entre Commerce e Inventory.
Resultado: el modelo soporta compras a domicilio y recogida en tienda, clientes invitados y registrados, reservas sin vencimiento automático, pagos en efectivo y transferencia con validación operativa, cancelaciones y devoluciones por entregas fallidas.


Modelo Entidad-Relación — Licorera Online
Versión: 1.2
Estado: Propuesta de modelo físico actualizado
Motor: PostgreSQL
ORM: Drizzle ORM
Infraestructura: Supabase
Arquitectura: Multiservicio · Base de datos compartida · Esquemas independientes
Nombre de plataforma: LicoresYaaa. La base local autogestionada se denomina `licoresyaaa`; en Supabase se mantiene el nombre de base `postgres` y los esquemas independientes por servicio.

1. Objetivo
Definir el modelo de datos de Licorera Online, estableciendo las entidades, atributos, relaciones, restricciones y responsabilidades de persistencia de cada servicio.
El modelo contempla:
    • Catálogo de productos y variantes.
    • Gestión manual de inventario.
    • Reservas y movimientos de existencias.
    • Devoluciones y reintentos de entrega.
    • Carritos y pedidos.
    • Pagos y comprobantes.
    • Usuarios, perfiles y control de acceso.
    • Coordinación de operaciones entre servicios.
1.1 Organización de esquemas
Esquema	Servicio responsable	Propósito
app	Plataforma / Access	Perfiles, roles, permisos y auditoría.
catalog	liquor-catalog	Productos, categorías, marcas y variantes.
inventory	liquor-inventory	Existencias, reservas, movimientos y devoluciones.
commerce	liquor-commerce-service	Carritos, pedidos, entregas, pagos y coordinación.
auth	Supabase	Identidad y autenticación administrada.
storage	Supabase	Archivos y comprobantes.
Los esquemas auth y storage son administrados por Supabase y no forman parte de las migraciones de los servicios.

2. Esquema app
Responsable de los perfiles de usuario, autorización y auditoría.
2.1 Entidades
app.profiles
Extiende la identidad proporcionada por Supabase Auth.
Campo	Tipo	Restricciones
id	UUID	PK, referencia a auth.users.id
full_name	VARCHAR(150)	NOT NULL
phone	VARCHAR(30)	NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
app.roles
Campo	Tipo	Restricciones
id	UUID	PK
name	VARCHAR(50)	UNIQUE, NOT NULL
description	TEXT	NULL
created_at	TIMESTAMPTZ	NOT NULL
Roles iniciales: ADMIN, MANAGER y OPERATOR.
app.permissions
Campo	Tipo	Restricciones
id	UUID	PK
code	VARCHAR(120)	UNIQUE, NOT NULL
description	TEXT	NULL
Ejemplos:
    • catalog.products.read
    • inventory.stock.adjust
    • commerce.orders.update_status
    • commerce.payments.approve
    • access.roles.assign
    • audit.logs.read
app.user_roles
Campo	Tipo	Restricciones
user_id	UUID	FK a profiles.id
role_id	UUID	FK a roles.id
assigned_by	UUID	FK lógica a profiles.id, NULL
created_at	TIMESTAMPTZ	NOT NULL
PK compuesta: (user_id, role_id).
app.role_permissions
Campo	Tipo	Restricciones
role_id	UUID	FK a roles.id
permission_id	UUID	FK a permissions.id
created_at	TIMESTAMPTZ	NOT NULL
PK compuesta: (role_id, permission_id).
app.audit_logs
Campo	Tipo	Restricciones
id	UUID	PK
user_id	UUID	Referencia lógica a profiles.id
action	VARCHAR(120)	NOT NULL
resource	VARCHAR(120)	NOT NULL
resource_id	UUID	NULL
metadata	JSONB	NULL
ip_address	INET	NULL
created_at	TIMESTAMPTZ	NOT NULL
Registra acciones sensibles como ajustes de inventario, cambios de precios, cancelaciones, aprobación de pagos y modificaciones de permisos.

3. Esquema catalog
Responsable de la información comercial de los productos.
3.1 Entidades
catalog.brands
Campo	Tipo	Restricciones
id	UUID	PK
name	VARCHAR(120)	UNIQUE, NOT NULL
description	TEXT	NULL
image_path	TEXT	NULL
is_active	BOOLEAN	NOT NULL, DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
catalog.categories
Campo	Tipo	Restricciones
id	UUID	PK
name	VARCHAR(120)	NOT NULL
slug	VARCHAR(140)	UNIQUE, NOT NULL
description	TEXT	NULL
image_path	TEXT	NULL
parent_id	UUID	FK autorreferenciada, NULL
is_active	BOOLEAN	NOT NULL, DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Permite jerarquías de categorías.
catalog.products
Campo	Tipo	Restricciones
id	UUID	PK
brand_id	UUID	FK a brands.id, NULL
name	VARCHAR(180)	NOT NULL
slug	VARCHAR(200)	UNIQUE, NOT NULL
description	TEXT	NULL
alcohol_percentage	NUMERIC(5,2)	NULL
is_active	BOOLEAN	NOT NULL, DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
catalog.product_categories
Campo	Tipo	Restricciones
product_id	UUID	FK a products.id
category_id	UUID	FK a categories.id
created_at	TIMESTAMPTZ	NOT NULL
PK compuesta: (product_id, category_id).
catalog.product_variants
Cada variante representa una presentación comercial independiente y tiene su propio SKU, precio e inventario.
Campo	Tipo	Restricciones
id	UUID	PK
product_id	UUID	FK a products.id
name	VARCHAR(120)	NOT NULL
sku	VARCHAR(80)	UNIQUE, NOT NULL
barcode	VARCHAR(80)	NULL
unit_size	VARCHAR(60)	NULL
price_cop	BIGINT	NOT NULL, >= 0
is_active	BOOLEAN	NOT NULL, DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
El precio se almacena como entero en pesos colombianos, evitando problemas de precisión decimal en operaciones monetarias.
catalog.product_images
Campo	Tipo	Restricciones
id	UUID	PK
product_id	UUID	FK a products.id
variant_id	UUID	FK a product_variants.id, NULL
storage_path	TEXT	NOT NULL
alt_text	VARCHAR(180)	NULL
position	INTEGER	NOT NULL, DEFAULT 0
is_primary	BOOLEAN	NOT NULL, DEFAULT FALSE
created_at	TIMESTAMPTZ	NOT NULL
Las imágenes se almacenan en Supabase Storage. La base de datos conserva su ruta.

4. Esquema inventory
Responsable exclusivo de la gestión física y lógica de existencias.
4.1 Entidades
inventory.inventory_locations
Permite administrar ubicaciones de inventario. Inicialmente existirá una ubicación principal, pero el modelo soporta futuras ubicaciones.
Campo	Tipo	Restricciones
id	UUID	PK
name	VARCHAR(120)	NOT NULL
code	VARCHAR(50)	UNIQUE, NOT NULL
address	TEXT	NULL
is_active	BOOLEAN	NOT NULL, DEFAULT TRUE
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
inventory.stock_balances
Representa el estado actual de existencias por variante y ubicación.
Campo	Tipo	Restricciones
id	UUID	PK
location_id	UUID	FK a inventory_locations.id
variant_id	UUID	Referencia lógica a catalog.product_variants.id
quantity_on_hand	INTEGER	NOT NULL, >= 0
quantity_reserved	INTEGER	NOT NULL, >= 0
updated_at	TIMESTAMPTZ	NOT NULL
Restricciones:
    • UNIQUE (location_id, variant_id).
    • quantity_reserved <= quantity_on_hand.
Existencia disponible:
quantity_available = quantity_on_hand - quantity_reserved
No se almacena quantity_available; se calcula para evitar inconsistencias.
inventory.stock_reservations
Registra cada intento de reserva asociado a un pedido.
Campo	Tipo	Restricciones
id	UUID	PK
order_id	UUID	Referencia lógica a commerce.orders.id
location_id	UUID	FK a inventory_locations.id
status	VARCHAR(20)	NOT NULL
idempotency_key	VARCHAR(180)	UNIQUE, NOT NULL
reserved_at	TIMESTAMPTZ	NULL
released_at	TIMESTAMPTZ	NULL
dispatched_at	TIMESTAMPTZ	NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Estados:
    • ACTIVE
    • RELEASED
    • DISPATCHED
Reglas:
    • Cada intento genera un registro independiente.
    • Un pedido puede tener reservas históricas.
    • Solo puede existir una reserva ACTIVE por pedido.
    • Una reserva liberada o despachada no puede volver a activarse.
    • Un nuevo intento de preparación genera una nueva reserva.
Índice único parcial:
UNIQUE (order_id) WHERE status = 'ACTIVE'
inventory.stock_reservation_items
Detalle de las variantes y cantidades incluidas en cada reserva.
Campo	Tipo	Restricciones
id	UUID	PK
reservation_id	UUID	FK a stock_reservations.id
variant_id	UUID	Referencia lógica a catalog.product_variants.id
quantity	INTEGER	NOT NULL, > 0
created_at	TIMESTAMPTZ	NOT NULL
Restricciones:
    • UNIQUE (reservation_id, variant_id).
    • No se permiten cantidades iguales o inferiores a cero.
inventory.stock_movements
Registro histórico e inmutable de movimientos de inventario.
Campo	Tipo	Restricciones
id	UUID	PK
location_id	UUID	FK a inventory_locations.id
variant_id	UUID	Referencia lógica a catalog.product_variants.id
reservation_id	UUID	FK a stock_reservations.id, NULL
stock_return_id	UUID	FK a stock_returns.id, NULL
movement_type	VARCHAR(30)	NOT NULL
quantity	INTEGER	NOT NULL, > 0
reason	VARCHAR(180)	NOT NULL
order_id	UUID	Referencia lógica a commerce.orders.id, NULL
idempotency_key	VARCHAR(180)	UNIQUE, NOT NULL
performed_by	UUID	Referencia lógica a app.profiles.id, NULL
created_at	TIMESTAMPTZ	NOT NULL
Tipos de movimiento:
    • IN
    • OUT
    • ADJUSTMENT_IN
    • ADJUSTMENT_OUT
    • RESERVATION
    • RELEASE
Reglas:
    • Los movimientos no se actualizan ni eliminan.
    • Las correcciones se registran mediante movimientos compensatorios.
    • RESERVATION y RELEASE modifican la cantidad reservada.
    • IN y OUT modifican la cantidad física.
    • ADJUSTMENT_IN y ADJUSTMENT_OUT modifican la cantidad física.
    • El movimiento OUT de un despacho debe quedar relacionado con su reserva.
inventory.stock_returns
Representa una devolución física asociada a un pedido.
Campo	Tipo	Restricciones
id	UUID	PK
order_id	UUID	Referencia lógica a commerce.orders.id
location_id	UUID	FK a inventory_locations.id
delivery_attempt_id	UUID	Referencia lógica a commerce.delivery_attempts.id, NULL
idempotency_key	VARCHAR(180)	UNIQUE, NOT NULL
reason	VARCHAR(180)	NOT NULL
status	VARCHAR(20)	NOT NULL
received_by	UUID	Referencia lógica a app.profiles.id
received_at	TIMESTAMPTZ	NOT NULL
created_at	TIMESTAMPTZ	NOT NULL
Estados:
    • RECEIVED
    • PROCESSED
    • CANCELLED
Una devolución debe ser procesada una sola vez. La recepción física y la reintegración al inventario son eventos diferenciados.
inventory.stock_return_items
Detalle de las unidades recibidas y su condición.
Campo	Tipo	Restricciones
id	UUID	PK
stock_return_id	UUID	FK a stock_returns.id
variant_id	UUID	Referencia lógica a catalog.product_variants.id
quantity_received	INTEGER	NOT NULL, > 0
quantity_restockable	INTEGER	NOT NULL, >= 0
reason	VARCHAR(180)	NULL
created_at	TIMESTAMPTZ	NOT NULL
Restricciones:
    • UNIQUE (stock_return_id, variant_id).
    • quantity_restockable <= quantity_received.
Las unidades dañadas o no aptas no se reintegran al inventario disponible.
La cantidad reintegrable genera un movimiento IN. La cantidad no reintegrable permanece registrada en el historial de devolución.

5. Esquema commerce
Responsable de la experiencia de compra y de la operación comercial de los pedidos.
5.1 Entidades
commerce.carts
Campo	Tipo	Restricciones
id	UUID	PK
customer_id	UUID	Referencia lógica a app.profiles.id, NULL
session_id	VARCHAR(180)	NULL
status	VARCHAR(20)	NOT NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Un carrito puede pertenecer a un cliente registrado o a una sesión de invitado.
commerce.cart_items
Campo	Tipo	Restricciones
id	UUID	PK
cart_id	UUID	FK a carts.id
variant_id	UUID	Referencia lógica a catalog.product_variants.id
quantity	INTEGER	NOT NULL, > 0
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Restricción:
    • UNIQUE (cart_id, variant_id).
Los precios definitivos se validan nuevamente durante el checkout.
commerce.orders
Entidad central del proceso comercial.
Campo	Tipo	Restricciones
id	UUID	PK
order_number	VARCHAR(40)	UNIQUE, NOT NULL
customer_id	UUID	Referencia lógica a app.profiles.id, NULL
customer_type	VARCHAR(20)	NOT NULL
customer_name	VARCHAR(150)	NOT NULL
customer_phone	VARCHAR(30)	NOT NULL
customer_email	VARCHAR(180)	NULL
status	VARCHAR(30)	NOT NULL
fulfillment_type	VARCHAR(20)	NOT NULL
inventory_reservation_status	VARCHAR(20)	NOT NULL
subtotal_cop	BIGINT	NOT NULL, >= 0
discount_cop	BIGINT	NOT NULL, DEFAULT 0
delivery_fee_cop	BIGINT	NOT NULL, DEFAULT 0
total_cop	BIGINT	NOT NULL, >= 0
notes	TEXT	NULL
cancellation_reason	TEXT	NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Valores de customer_type:
    • REGISTERED
    • GUEST
Valores de fulfillment_type:
    • DELIVERY
    • PICKUP
Estados comerciales:
    • PENDING
    • CONFIRMED
    • PREPARING
    • READY
    • ON_DELIVERY
    • DELIVERY_FAILED
    • RETURNED_TO_STORE
    • DELIVERED
    • PICKED_UP
    • CANCELLED
Estados de coordinación con Inventory:
    • PENDING
    • RESERVED
    • RELEASED
    • DISPATCHED
    • FAILED
El estado comercial y el estado de reserva son independientes.
Un pedido no puede pasar a PREPARING si no tiene su reserva confirmada.
Los datos del cliente se conservan como fotografía del momento de la compra. Los pedidos históricos no deben depender de que el perfil del cliente permanezca sin cambios.
commerce.order_items
Conserva una fotografía de los productos comprados.
Campo	Tipo	Restricciones
id	UUID	PK
order_id	UUID	FK a orders.id
variant_id	UUID	Referencia lógica a catalog.product_variants.id
product_name_snapshot	VARCHAR(180)	NOT NULL
variant_name_snapshot	VARCHAR(120)	NOT NULL
sku_snapshot	VARCHAR(80)	NOT NULL
quantity	INTEGER	NOT NULL, > 0
unit_price_cop	BIGINT	NOT NULL, >= 0
discount_amount_cop	BIGINT	NOT NULL, DEFAULT 0
line_total_cop	BIGINT	NOT NULL, >= 0
created_at	TIMESTAMPTZ	NOT NULL
Los nombres, SKU y precios se conservan aunque el catálogo cambie posteriormente.
commerce.payments
Campo	Tipo	Restricciones
id	UUID	PK
order_id	UUID	FK a orders.id
method	VARCHAR(30)	NOT NULL
status	VARCHAR(30)	NOT NULL
amount_cop	BIGINT	NOT NULL, > 0
reference	VARCHAR(180)	NULL
proof_path	TEXT	NULL
paid_at	TIMESTAMPTZ	NULL
verified_by	UUID	Referencia lógica a app.profiles.id, NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
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
Un pedido puede tener múltiples pagos para permitir futuras operaciones parciales.
Solo los pagos aprobados se consideran dinero recibido.
En efectivo contraentrega, el pedido puede estar DELIVERED mientras el pago permanece PENDING, hasta que el operador recibe el dinero del domiciliario.
commerce.order_deliveries
Conserva la información principal de entrega de un pedido.
Campo	Tipo	Restricciones
id	UUID	PK
order_id	UUID	UNIQUE, FK a orders.id
recipient_name	VARCHAR(150)	NULL
recipient_phone	VARCHAR(30)	NULL
municipality	VARCHAR(120)	NULL
neighborhood	VARCHAR(120)	NULL
address	TEXT	NULL
address_reference	TEXT	NULL
latitude	NUMERIC(10,7)	NULL
longitude	NUMERIC(10,7)	NULL
created_at	TIMESTAMPTZ	NOT NULL
updated_at	TIMESTAMPTZ	NOT NULL
Solo se crea para pedidos con fulfillment_type = DELIVERY.
La dirección y los datos del destinatario se conservan como fotografía de la compra.
commerce.delivery_attempts
Registra cada intento de entrega de un pedido.
Campo	Tipo	Restricciones
id	UUID	PK
delivery_id	UUID	FK a order_deliveries.id
attempt_number	INTEGER	NOT NULL, > 0
status	VARCHAR(30)	NOT NULL
failure_reason	TEXT	NULL
started_at	TIMESTAMPTZ	NULL
failed_at	TIMESTAMPTZ	NULL
returned_at	TIMESTAMPTZ	NULL
delivered_at	TIMESTAMPTZ	NULL
registered_by	UUID	Referencia lógica a app.profiles.id
created_at	TIMESTAMPTZ	NOT NULL
Restricciones:
    • UNIQUE (delivery_id, attempt_number).
Estados:
    • PENDING
    • IN_TRANSIT
    • FAILED
    • RETURNED_TO_STORE
    • DELIVERED
Cada intento tiene su propio registro. No se sobrescribe el historial anterior cuando se reintenta una entrega.
commerce.outbox_events
Permite recuperar operaciones distribuidas pendientes entre Commerce e Inventory.
Campo	Tipo	Restricciones
id	UUID	PK
event_type	VARCHAR(100)	NOT NULL
aggregate_id	UUID	NOT NULL
payload	JSONB	NOT NULL
idempotency_key	VARCHAR(180)	UNIQUE, NOT NULL
status	VARCHAR(20)	NOT NULL
attempts	INTEGER	NOT NULL, DEFAULT 0
next_attempt_at	TIMESTAMPTZ	NULL
last_error	TEXT	NULL
created_at	TIMESTAMPTZ	NOT NULL
processed_at	TIMESTAMPTZ	NULL
Estados:
    • PENDING
    • PROCESSING
    • COMPLETED
    • FAILED
El Outbox es responsabilidad exclusiva de Commerce.
Permite recuperar operaciones como:
    • RESERVE_STOCK
    • RELEASE_STOCK
    • DISPATCH_STOCK
    • REGISTER_STOCK_RETURN
El procesamiento debe ser idempotente y admitir reintentos controlados.

6. Relaciones entre entidades
6.1 app
    • profiles 1 user_roles
    • roles 1 user_roles
    • roles 1 role_permissions
    • permissions 1 role_permissions
    • profiles 1 audit_logs
6.2 catalog
    • brands 1 products
    • categories 1 categories mediante parent_id
    • products N categories mediante product_categories
    • products 1 product_variants
    • products 1 product_images
    • product_variants 1 product_images
6.3 inventory
    • inventory_locations 1 stock_balances
    • inventory_locations 1 stock_reservations
    • inventory_locations 1 stock_movements
    • inventory_locations 1 stock_returns
    • stock_balances 1 stock_movements mediante location_id y variant_id como referencia lógica
    • stock_reservations 1 stock_reservation_items
    • stock_reservations 1 stock_movements
    • stock_returns 1 stock_return_items
    • stock_returns 1 stock_movements
    • product_variants 1 stock_balances mediante referencia lógica
    • product_variants 1 stock_reservation_items mediante referencia lógica
6.4 commerce
    • carts 1 cart_items
    • orders 1 order_items
    • orders 1 order_inventory_reservations
    • orders 1 payments
    • orders 1:1 order_deliveries para pedidos de entrega
    • order_deliveries 1 delivery_attempts
    • orders 1 outbox_events
    • profiles 1 orders mediante customer_id, opcional
    • product_variants 1 cart_items mediante referencia lógica
    • product_variants 1 order_items mediante referencia lógica
6.5 Relaciones entre esquemas
Las referencias entre servicios son referencias lógicas mediante UUID.
Ejemplos:
    • inventory.stock_balances.variant_id → catalog.product_variants.id
    • inventory.stock_reservations.order_id → commerce.orders.id
    • commerce.order_inventory_reservations.reservation_id → inventory.stock_reservations.id
    • commerce.order_inventory_reservations.location_id → inventory.inventory_locations.id
    • commerce.orders.customer_id → app.profiles.id
    • inventory.stock_movements.performed_by → app.profiles.id
No se crean claves foráneas físicas entre esquemas propiedad de servicios diferentes.
Cada servicio valida estas referencias mediante sus contratos de integración.

7. Reglas de integridad y negocio
7.1 Inventario
    1. No se permiten cantidades físicas negativas.
    2. No se permiten cantidades reservadas negativas.
    3. Las cantidades reservadas nunca pueden superar las físicas.
    4. Una reserva debe afectar todas sus variantes o ninguna.
    5. Solo una reserva activa puede existir por pedido.
    6. Una reserva liberada no se libera nuevamente.
    7. Una reserva despachada no se despacha nuevamente.
    8. El despacho descuenta simultáneamente cantidad física y reservada.
    9. Las devoluciones solo reintegran unidades físicamente verificadas y aptas.
    10. Los movimientos son inmutables.
    11. Las operaciones críticas requieren idempotency key.
7.2 Pedidos
    1. Los pedidos pueden ser de clientes registrados o invitados.
    2. El cliente invitado no requiere profile.
    3. Los pedidos conservan la información del cliente y sus productos.
    4. Los pedidos de recogida no requieren dirección de entrega.
    5. Un pedido solo puede prepararse con reserva confirmada.
    6. Un pedido cancelado conserva su historial.
    7. Las devoluciones no eliminan ni revierten el pedido histórico.
    8. Los intentos de entrega se registran individualmente.
7.3 Pagos
    1. El pago se administra independientemente del estado del pedido.
    2. La transferencia debe verificarse antes del despacho.
    3. El efectivo contraentrega se aprueba cuando el operador recibe el dinero.
    4. Un pago pendiente no se contabiliza como ingreso recibido.
    5. Las modificaciones de estado de pago deben quedar auditadas.
7.4 Operaciones distribuidas
    1. Commerce coordina el proceso de compra.
    2. Inventory administra el inventario.
    3. Cada servicio confirma sus propias transacciones.
    4. Las solicitudes internas son idempotentes.
    5. Los errores de red no deben generar operaciones duplicadas.
    6. Outbox permite recuperar operaciones incompletas.
    7. Las compensaciones deben respetar el estado real de la operación original.

8. Índices y restricciones recomendadas
Además de las claves primarias, foráneas y restricciones únicas de las entidades:
Catalog
    • products.slug UNIQUE.
    • product_variants.sku UNIQUE.
    • categories.slug UNIQUE.
    • Índice en products.brand_id.
    • Índice en product_categories.category_id.
    • Índice en product_variants.product_id.
Inventory
    • UNIQUE (location_id, variant_id) en stock_balances.
    • UNIQUE (order_id) WHERE status = 'ACTIVE' en stock_reservations.
    • UNIQUE (idempotency_key) en stock_reservations.
    • UNIQUE (reservation_id, variant_id) en stock_reservation_items.
    • UNIQUE (idempotency_key) en stock_movements.
    • UNIQUE (idempotency_key) en stock_returns.
    • UNIQUE (stock_return_id, variant_id) en stock_return_items.
    • Índice en stock_movements.variant_id, created_at.
    • Índice en stock_movements.order_id.
    • Índice en stock_reservations.order_id.
    • Índice en stock_returns.order_id.
Commerce
    • UNIQUE orders.order_number.
    • UNIQUE (cart_id, variant_id) en cart_items.
    • UNIQUE order_deliveries.order_id.
    • UNIQUE (delivery_id, attempt_number) en delivery_attempts.
    • UNIQUE outbox_events.idempotency_key.
    • Índice en orders.status, created_at.
    • Índice en orders.customer_id.
    • Índice en orders.inventory_reservation_status.
    • Índice en payments.order_id, status.
    • Índice en delivery_attempts.delivery_id.
    • Índice en outbox_events.status, next_attempt_at.
Los índices únicos parciales y sus predicados deben definirse explícitamente en las migraciones PostgreSQL. Drizzle permite declarar índices con condiciones where; cuando sea necesario, se puede usar SQL explícito en la migración.

9. Decisiones de persistencia
Decisión	Definición
Base de datos	PostgreSQL
Infraestructura	Supabase
ORM	Drizzle ORM
Identificadores	UUID
Fechas	TIMESTAMPTZ
Moneda	BIGINT en COP
Cantidades	INTEGER
Datos flexibles	JSONB solo cuando corresponda
Identidad	Supabase Auth
Archivos	Supabase Storage
Relaciones entre servicios	Referencias lógicas
Migraciones	Propiedad de cada servicio
Inventario	Gestión manual
Ubicaciones	Modelo preparado para expansión
Variantes	Sí
Clientes	Registrados e invitados
Reservas	Hasta despacho o cancelación
Expiración automática	No incluida en MVP

10. Distribución de propiedad
Tabla	Servicio propietario
profiles	Plataforma / Access
roles	Plataforma / Access
permissions	Plataforma / Access
user_roles	Plataforma / Access
role_permissions	Plataforma / Access
audit_logs	Plataforma / Access
brands	liquor-catalog
categories	liquor-catalog
products	liquor-catalog
product_categories	liquor-catalog
product_variants	liquor-catalog
product_images	liquor-catalog
inventory_locations	liquor-inventory
stock_balances	liquor-inventory
stock_reservations	liquor-inventory
stock_reservation_items	liquor-inventory
stock_movements	liquor-inventory
stock_returns	liquor-inventory
stock_return_items	liquor-inventory
carts	liquor-commerce-service
cart_items	liquor-commerce-service
orders	liquor-commerce-service
order_items	liquor-commerce-service
payments	liquor-commerce-service
order_deliveries	liquor-commerce-service
delivery_attempts	liquor-commerce-service
outbox_events	liquor-commerce-service

11. Decisiones pendientes
Tema	Estado
Zonas exactas de cobertura	Pendiente
Tarifas de domicilio	Pendiente
Horarios de operación	Pendiente
Política de cancelación	Pendiente
Tratamiento de pagos al cancelar	Pendiente
Política de productos dañados	Pendiente
Verificación de edad en entrega	Pendiente
Punto de recogida	Pendiente
Conservación de comprobantes	Pendiente
Proveedor de despliegue	Pendiente

12. Criterios de aceptación del modelo
El MER se considera listo para implementación cuando:
    • Todas las tablas tienen propietario definido.
    • Las relaciones internas tienen claves foráneas.
    • Las relaciones entre servicios están documentadas como referencias lógicas.
    • Las restricciones de integridad están definidas.
    • Los índices críticos están identificados.
    • Las reservas permiten reintentos.
    • Las devoluciones tienen trazabilidad.
    • Los intentos de entrega conservan historial.
    • El Outbox permite recuperar operaciones distribuidas.
    • Las migraciones pueden ejecutarse independientemente por servicio.
Resultado: modelo de datos preparado para implementar el ciclo completo de compra, reserva, despacho, devolución y recuperación de operaciones en Licorera Online.
Cambios principales respecto a v1.1
Área	Cambio
Inventory	Se agregan stock_reservations y stock_reservation_items.
Inventory	Se agregan stock_returns y stock_return_items.
Inventory	Se relacionan los movimientos con reservas y devoluciones.
Commerce	Se agrega inventory_reservation_status a orders.
Commerce	Se agrega outbox_events.
Commerce	Se agrega delivery_attempts.
Integridad	Se incorporan restricciones de idempotencia y reserva activa.


Una precisión importante: la reserva activa se controla con un índice único parcial. Esto permite conservar reservas históricas y crear una nueva después de una devolución sin permitir dos reservas activas simultáneas para el mismo pedido. PostgreSQL soporta esta restricción y Drizzle permite declararla mediante condiciones where. 
PostgreSQL+1
