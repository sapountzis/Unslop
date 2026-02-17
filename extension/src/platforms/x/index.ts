// X (Twitter) content script entry point
import { createPlatformRuntime } from "../../content/runtime";
import { registerContentDiagnosticsHost } from "../../content/diagnostics-host";
import { xPlugin } from "./plugin";
import "../../styles/content.css";

registerContentDiagnosticsHost(xPlugin);
createPlatformRuntime(xPlugin);
