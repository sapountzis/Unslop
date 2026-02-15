// extension/src/lib/storage.ts
import { DecisionCacheService } from "./decision-cache";
import { UserDataService } from "./user-data";

export const decisionCache = new DecisionCacheService();
export const userData = new UserDataService();
