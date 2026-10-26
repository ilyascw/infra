# Architecture as code

A C4 model of PingTower and the architecture rules it must follow, checked by
[aact](https://github.com/Byndyusoft/aact).

The model describes the system as the repositories already document it:
`.github/profile/README.md`, this repository's README and RabbitMQ topology,
and the In / Out / Storage table of every service README. The rules encode
only what those documents state.

## Run

```bash
cd architecture
pnpm install
pnpm check       # rules against architecture.puml — expected: no violations
pnpm test        # rule tests: known-broken models must fail the expected rule
```

Requires Node 22+. To view the diagram, open `architecture.puml` with any
PlantUML renderer (for example the PlantUML extension for VS Code).

## Rules

| Rule | What it checks | Where it comes from |
| --- | --- | --- |
| **AR-01** `brokerOnly` | Services do not call each other directly. Only frontend → api is allowed (nginx proxies `/api` and `/hubs`). | `.github/profile/README.md`: "Services talk to each other only through RabbitMQ" |
| **AR-02** `storeOwnership` | Every store has one owner. A declared reader may only read. Anyone else needs a recorded exception. | `infra/README.md`: PostgreSQL schema owned by api migrations, one Redis db per service. Storage rows of service READMEs: ClickHouse written by metrics-writer, read by api. |
| **AR-03** `channelContract` | Only declared publishers publish to a channel, only declared consumers consume it. | Event bus table in `infra/README.md`, `rabbitmq/config/definitions.json` |
| **AR-04** `acyclic` | No dependency cycles. | aact built-in |

aact's other built-in rules are turned off in `aact.config.ts`: they describe
patterns PingTower never agreed on.

## Changing the architecture

When a change adds a service, a store, a queue or a new connection, update
`architecture.puml` in the same pull request:

- a service is a `Container` with `$tags="service"`;
- a store is a `ContainerDb` with `owner:<service>` and optional
  `reader:<service>` tags; a `Rel` to it is tagged `read`, `write` or
  `readwrite`;
- a channel is a `ContainerQueue` with `publisher:<service>` and
  `consumer:<service>` tags; a `Rel` to it is tagged `publish` or `consume`.

If `pnpm check` fails, either the change breaks an agreement, or the agreement
itself changes. In the second case, update the documents the rule comes from
together with the model. An exception for one service goes to
`storeOwnership.exceptions` in `aact.config.ts`, with a reference to where it
was decided.

## Known limitations

- The rules check the model, not the code. A pull request that changes only a
  service's code or `docker-compose.yml` is not checked yet.
- aact's Compose loader derives relations from `depends_on` only. PingTower
  wires services through environment variables (`REDIS_HOST`,
  `ClickHouseSettings__ConnectionString`, queue names), so running aact on the
  compose files directly finds no relations.
- `rabbitmq/asyncapi.yaml` mentions a `message-node` service and a
  `q.message-node.status-events` queue that are not in `definitions.json`. The
  model follows `definitions.json`.
