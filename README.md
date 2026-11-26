<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

REST API for the LicoresYaaa Commerce service, built with NestJS, PostgreSQL and Drizzle ORM.

## Project setup

```bash
$ pnpm install
```

## Database setup

Create a local environment file from the example and set `DATABASE_URL` to your PostgreSQL connection string:

```powershell
Copy-Item .env.example .env
```

Drizzle Kit reads schema definitions from `src/infrastructure/database/schema/` and writes migrations to `drizzle/`. After adding or changing schema definitions, generate and apply migrations with:

```bash
pnpm db:generate
pnpm db:migrate
```

The application requires a valid PostgreSQL `DATABASE_URL` at startup.

## Commerce API

Copy `.env.example` to `.env` and configure the PostgreSQL, Catalog and Inventory service
settings before starting the API:

```powershell
Copy-Item .env.example .env
pnpm db:migrate
pnpm start:dev
```

`INVENTORY_API_URL`, `INVENTORY_SERVICE_TOKEN` and `INVENTORY_LOCATION_ID` must
point to the real Inventory service and configured location. The service token
must match Inventory's `INTERNAL_API_TOKEN`. `COMMERCE_INTERNAL_API_TOKEN` is a
separate shared credential for the trusted BFF. `CATALOG_API_URL` points to
Catalog and `CATALOG_SERVICE_TOKEN` must match Catalog's
`CATALOG_SERVICE_API_TOKEN`. All three tokens must contain at least 32
characters. `HOST` defaults to `0.0.0.0`; OpenAPI is available at
`http://localhost:3001/docs`, and the API base path is
`http://localhost:3001/api/commerce`.

Available operations:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/carts` | Create a guest cart |
| `GET` | `/carts/{cartId}` | Read a cart |
| `GET` | `/carts/{cartId}/availability` | Check cart quantities against Inventory |
| `POST` | `/carts/{cartId}/items` | Add or increase a variant quantity |
| `PATCH` | `/carts/{cartId}/items/{itemId}` | Set a cart item quantity |
| `DELETE` | `/carts/{cartId}/items/{itemId}` | Remove a cart item |
| `POST` | `/checkout` | Start or check an idempotent pickup checkout |
| `GET` | `/orders` | List recent orders; supports `status` and `limit`; requires `commerce.orders.read` |
| `GET` | `/orders/{orderId}` | Read order, items, payment, delivery and reservation history; requires `commerce.orders.read` |
| `POST` | `/orders/{orderId}/actions` | Execute a validated order lifecycle action; requires `commerce.orders.update_status` |
| `GET` | `/payments/{paymentId}` | Read payment state; requires `commerce.payments.read` |
| `POST` | `/payments/{paymentId}/actions` | Execute an authorized payment action |

Order and payment endpoints require `Authorization: Bearer <COMMERCE_INTERNAL_API_TOKEN>`,
`x-actor-id` and comma-separated `x-actor-permissions` headers. These headers
must be injected only by a trusted BFF after it verifies the user's Supabase JWT
and resolves permissions. Do not expose this internal contract directly to a
browser or accept actor context from public requests. The Commerce API checks
permissions for each operation and propagates the corresponding Inventory
permission with the actor ID to Inventory.

Checkout supports guest pickup only. Delivery is rejected until coverage and
fees are defined. Commerce resolves each variant using Catalog, rejects
non-purchasable variants, and calculates order snapshots with integer COP
prices. Cart operations persist variant IDs without validating them against
Catalog until checkout.

Send a unique, unpredictable `Idempotency-Key` header and retain it with the
original request. The order, items, payment, cart conversion and `RESERVE_STOCK`
event are saved in one transaction. The response is `202` with an order ID and
`inventoryReservationStatus: PENDING` while Inventory is being processed.
Repeat the same request and key to check the result: `200` means the reservation
was confirmed; `409` with status `FAILED` means Inventory definitively rejected
it for insufficient stock. Reusing the key with a different request returns
`409`. Do not treat `202` as a completed purchase.

The worker retries uncertain results with the same Inventory idempotency key.
Events remain recoverable after a process restart, and competing workers use
database leases. Operational errors are logged and retried; monitor the
`commerce.outbox_events` table for persistent failures. This worker currently
handles checkout reservations only: existing cancellation, pickup dispatch,
delivery dispatch and return operations do not yet have the same distributed
recovery guarantee.

Order actions: `CONFIRM`, `START_PREPARATION`, `MARK_READY`, `DISPATCH`,
`PICKUP`, `DELIVER`, `DELIVERY_FAILED`, `RETURN_TO_STORE`, `RETRY_DELIVERY`,
`CANCEL`. `DELIVERY_FAILED`, `RETURN_TO_STORE` and `CANCEL` require a `reason`.
`RETURN_TO_STORE` also requires `items`, with `variantId`, `quantityReceived`
and `quantityRestockable`; quantities are checked against the order before
Commerce invokes Inventory's return endpoint.
Payment actions: `SUBMIT_TRANSFER`, `APPROVE_TRANSFER`, `REJECT_TRANSFER`,
`RECORD_CASH`. Payment actions require `commerce.payments.review`,
`commerce.payments.approve` or `commerce.payments.record_cash` according to
the requested action.

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

PostgreSQL checkout integration tests run only when
`POSTGRES_TEST_DATABASE_URL` points to a dedicated database whose name contains
`test`. The tests apply the existing migrations, create and delete their own
rows, and refuse to run if reservation events are already pending. Never use a
production or shared database. The regular e2e tests mock checkout persistence
and do not establish end-to-end connectivity to Catalog or Inventory.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It installs `@nestjs/observe`, wires it into `AppModule` and `main.ts`, and writes the app key and secret into `.env`, which every `nest start` script (`start`, `start:dev`, `start:debug`) then loads. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand:

```bash
$ pnpm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/sdk) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
