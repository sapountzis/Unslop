// LinkedIn content script entry point
import { createPlatformRuntime } from "../../content/runtime";
import { registerContentDiagnosticsHost } from "../../content/diagnostics-host";
import { linkedinPlugin } from "./plugin";
import "../../styles/content.css";

registerContentDiagnosticsHost(linkedinPlugin);
createPlatformRuntime(linkedinPlugin);
