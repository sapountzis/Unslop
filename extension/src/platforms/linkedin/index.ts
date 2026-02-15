// LinkedIn content script entry point
import { createPlatformRuntime } from "../../content/runtime";
import { linkedinPlugin } from "./plugin";
import "../../styles/content.css";

createPlatformRuntime(linkedinPlugin);
