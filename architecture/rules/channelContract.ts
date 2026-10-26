import type { Model, RuleDefinition, Violation } from "aact";

export interface ChannelContractOptions {
  /** Default "publisher:". */
  readonly publisherPrefix?: string;
  /** Default "consumer:". */
  readonly consumerPrefix?: string;
}

/**
 * AR-03 — every RabbitMQ channel has a fixed set of publishers and consumers.
 *
 * A channel (ContainerQueue) lists them with `publisher:<service>` and
 * `consumer:<service>` tags — the Event bus table of infra/README.md. A
 * relation tagged publish is allowed only for a publisher, consume only for a
 * consumer. An untagged relation (e.g. from a model built from configs, where
 * the direction is not visible) is allowed for any participant.
 */
export const channelContractRule: RuleDefinition<ChannelContractOptions> = {
  name: "channelContract",
  description: "Only declared publishers may publish to a channel, only declared consumers may consume it",
  rationale:
    "The event bus topology is a contract between services. A new publisher on someone else's channel, or a new consumer of a work queue, silently changes who sees which messages. Sources: infra/README.md (Event bus), rabbitmq/config/definitions.json.",

  check(model: Model, options?: ChannelContractOptions) {
    const publisherPrefix = options?.publisherPrefix ?? "publisher:";
    const consumerPrefix = options?.consumerPrefix ?? "consumer:";

    const listed = (name: string, prefix: string) =>
      (model.elements[name]?.tags ?? [])
        .filter((t) => t.startsWith(prefix))
        .map((t) => t.slice(prefix.length));

    const violations: Violation[] = [];
    for (const element of Object.values(model.elements)) {
      for (const rel of element.relations) {
        const channel = model.elements[rel.to];
        if (!channel || (channel.kind !== "ContainerQueue" && channel.kind !== "ComponentQueue"))
          continue;

        const publishers = listed(channel.name, publisherPrefix);
        const consumers = listed(channel.name, consumerPrefix);
        const publishes = rel.tags.includes("publish");
        const consumes = rel.tags.includes("consume");

        let problem: string | undefined;
        if (publishes && !publishers.includes(element.name))
          problem = `publishes to "${channel.name}" but is not its declared publisher (${publishers.join(", ") || "none"})`;
        else if (consumes && !consumers.includes(element.name))
          problem = `consumes "${channel.name}" but is not its declared consumer (${consumers.join(", ") || "none"})`;
        else if (
          !publishes &&
          !consumes &&
          !publishers.includes(element.name) &&
          !consumers.includes(element.name)
        )
          problem = `uses "${channel.name}" but is neither its publisher nor its consumer`;

        if (problem)
          violations.push({
            target: element.name,
            targetKind: "element",
            message: `${problem} (AR-03)`,
            sourceLocation: rel.sourceLocation,
          });
      }
    }
    return violations;
  },
};
