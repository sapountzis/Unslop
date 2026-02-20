// Reddit content script entry point
import { createPlatformRuntime } from "../../content/index";
import { redditPlugin } from "./plugin";
import "../../styles/content.css";

createPlatformRuntime(redditPlugin);
