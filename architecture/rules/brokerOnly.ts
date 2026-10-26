import type { Model, RuleDefinition, Violation } from "aact";

export interface BrokerOnlyOptions {
  /** Tag marking a PingTower service. Default "service". */
  readonly serviceTag?: string;
  /** Direct service-to-service calls that are allowed, as [from, to] pairs. */
  readonly allowed?: readonly (readonly [string, string])[];
}

/**
 * AR-01 — services talk to each other only through RabbitMQ.
 *
 * A direct service → service relation is a violation unless the pair is in
 * `allowed` (frontend → api: browser traffic, not service-to-service).
 * Stores, channels and external systems are left to AR-02 and AR-03.
 */
export const brokerOnlyRule: RuleDefinition<BrokerOnlyOptions> = {
  name: "brokerOnly",
  description: "Services must talk to each other only through RabbitMQ",
  rationale:
    "PingTower services are deployed and changed independently. A direct call couples their release cycles and availability; an event over RabbitMQ does not. Source: .github/profile/README.md — \"Services talk to each other only through RabbitMQ\".",

  check(model: Model, options?: BrokerOnlyOptions) {
    const serviceTag = options?.serviceTag ?? "service";
    const allowed = new Set(
      (options?.allowed ?? []).map(([from, to]) => `${from}->${to}`),
    );
    const isService = (name: string) =>
      model.elements[name]?.tags.includes(serviceTag) ?? false;

    const violations: Violation[] = [];
    for (const element of Object.values(model.elements)) {
      if (!isService(element.name)) continue;
      for (const rel of element.relations) {
        if (!isService(rel.to)) continue;
        if (allowed.has(`${element.name}->${rel.to}`)) continue;
        violations.push({
          target: element.name,
          targetKind: "element",
          message: `calls service "${rel.to}" directly — publish an event to RabbitMQ instead (AR-01)`,
          sourceLocation: rel.sourceLocation,
        });
      }
    }
    return violations;
  },
};
