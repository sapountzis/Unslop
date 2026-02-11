// Reddit content script entry point
import { createPlatformRuntime } from '../../content/runtime';
import { redditPlugin } from './plugin';
import '../../styles/content.css';

createPlatformRuntime(redditPlugin);
