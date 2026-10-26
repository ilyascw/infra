import type { Model, RuleDefinition, Violation } from "aact";

export interface StoreException {
  readonly from: string;
  readonly to: string;
  /** Access the exception grants: read, write or readwrite. */
  readonly access: "read" | "write" | "readwrite";
  /** Where the exception is recorded. An exception without a reference does not count. */
  readonly adr: string;
}

export interface StoreOwnershipOptions {
  /** Owner tag prefix. Default "owner:". */
  readonly ownerPrefix?: string;
  /** Declared read-only accessor tag prefix. Default "reader:". */
  readonly readerPrefix?: string;
  /** Agreed exceptions: a non-owner service accessing a store. */
  readonly exceptions?: readonly StoreException[];
}

const ACCESS_TAGS = ["read", "write", "readwrite"] as const;
type Access = (typeof ACCESS_TAGS)[number];

const covers = (granted: Access, used: Access) =>
  granted === "readwrite" || granted === used;

/**
 * AR-02 — every store has one owner.
 *
 * A store (ContainerDb) is tagged `owner:<service>`; the owner may access it
 * in any way. A service tagged `reader:<service>` on the store may only read.
 * Any other service needs an exception from the options that references a
 * decision and is no wider than granted: a read exception does not cover
 * write. A relation without a read / write / readwrite tag counts as
 * readwrite — unknown access is treated as the widest.
 */
export const storeOwnershipRule: RuleDefinition<StoreOwnershipOptions> = {
  name: "storeOwnership",
  description: "Only the owner may access a store; declared readers may only read",
  rationale:
    "A store shared between services becomes an undeclared contract: the owner can no longer change its schema safely. Sources: infra/README.md (PostgreSQL schema owned by api migrations, one Redis db per service), the Storage rows of each service README.",

  check(model: Model, options?: StoreOwnershipOptions) {
    const ownerPrefix = options?.ownerPrefix ?? "owner:";
    const readerPrefix = options?.readerPrefix ?? "reader:";
    const exceptions = options?.exceptions ?? [];

    const listed = (name: string, prefix: string) =>
      (model.elements[name]?.tags ?? [])
        .filter((t) => t.startsWith(prefix))
        .map((t) => t.slice(prefix.length));
    const ownersOf = (name: string) => listed(name, ownerPrefix);
    const isStore = (kind: string | undefined) =>
      kind === "ContainerDb" || kind === "ComponentDb";

    const violations: Violation[] = [];
    for (const element of Object.values(model.elements)) {
      if (isStore(element.kind) && ownersOf(element.name).length === 0)
        violations.push({
          target: element.name,
          targetKind: "element",
          message: `store has no "${ownerPrefix}<service>" tag (AR-02)`,
          sourceLocation: element.sourceLocation,
        });
    }

    for (const element of Object.values(model.elements)) {
      for (const rel of element.relations) {
        const store = model.elements[rel.to];
        if (!store || !isStore(store.kind)) continue;
        const owners = ownersOf(store.name);
        if (owners.length === 0 || owners.includes(element.name)) continue;

        const access: Access =
          ACCESS_TAGS.find((t) => rel.tags.includes(t)) ?? "readwrite";
        if (access === "read" && listed(store.name, readerPrefix).includes(element.name))
          continue;
        const exception = exceptions.find(
          (e) =>
            e.from === element.name &&
            e.to === store.name &&
            covers(e.access, access),
        );
        if (exception) continue;

        violations.push({
          target: element.name,
          targetKind: "element",
          message: `${access} access to "${store.name}" owned by ${owners.join(", ")} — go through the owner or record an exception (AR-02)`,
          sourceLocation: rel.sourceLocation,
        });
      }
    }
    return violations;
  },
};
