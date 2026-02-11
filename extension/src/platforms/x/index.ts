// X (Twitter) content script entry point
import { createPlatformRuntime } from '../../content/runtime';
import { xPlugin } from './plugin';
import '../../styles/content.css';

createPlatformRuntime(xPlugin);
