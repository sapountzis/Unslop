// extension/src/lib/storage.ts
import { DecisionCacheService } from "./decisionCache";
import { UserDataService } from "./userData";

export const decisionCache = new DecisionCacheService();
export const userData = new UserDataService();
