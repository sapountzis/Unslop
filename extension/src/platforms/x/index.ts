// X (Twitter) content script entry point
import { createPlatformRuntime } from "../../content/index";
import { xPlugin } from "./plugin";
import "../../styles/content.css";

createPlatformRuntime(xPlugin);
