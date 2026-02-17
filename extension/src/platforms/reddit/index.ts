// Reddit content script entry point
import { createPlatformRuntime } from "../../content/runtime";
import { registerContentDiagnosticsHost } from "../../content/diagnostics-host";
import { redditPlugin } from "./plugin";
import "../../styles/content.css";

registerContentDiagnosticsHost(redditPlugin);
createPlatformRuntime(redditPlugin);
