// LinkedIn content script entry point
import { createPlatformRuntime } from "../../content/index";
import { linkedinPlugin } from "./plugin";
import "../../styles/content.css";

createPlatformRuntime(linkedinPlugin);
