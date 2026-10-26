import type { AactConfig } from "aact";
import { brokerOnlyRule } from "./rules/brokerOnly";
import { channelContractRule } from "./rules/channelContract";
import { storeOwnershipRule } from "./rules/storeOwnership";

/**
 * PingTower architecture rules (AR-01…AR-04) on top of the C4 model.
 *
 * aact's built-in crud, dbPerService, acl, apiGateway, cohesion,
 * stableDependencies and commonReuse are off: they encode patterns PingTower
 * never agreed on. storeOwnership replaces dbPerService because it knows
 * about declared readers.
 */
const config: AactConfig = {
  source: { type: "plantuml", path: "./architecture.puml" },

  customRules: [brokerOnlyRule, storeOwnershipRule, channelContractRule],

  rules: {
    acyclic: true, // AR-04
    crud: false,
    dbPerService: false,
    acl: false,
    apiGateway: false,
    cohesion: false,
    stableDependencies: false,
    commonReuse: false,

    brokerOnly: {
      allowed: [["frontend", "api"]],
    },
    storeOwnership: {
      exceptions: [],
    },
    channelContract: true,
  },
};

export default config;
