// Minimal DOM shim for bun tests that need HTMLElement.
// Sets up just enough globals so instanceof HTMLElement works
// and basic element methods are available.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
