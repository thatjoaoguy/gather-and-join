/**
 * Offscreen document (Chrome): mounts the long-lived host. See host.ts.
 */
import { mountOffscreenHost, reportBadgeToWorker } from './host';

mountOffscreenHost({ reportBadge: reportBadgeToWorker });
