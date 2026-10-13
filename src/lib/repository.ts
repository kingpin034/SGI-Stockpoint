import { createSandboxRepository } from './sandbox';

// A standalone interactive frontend: all activity stays in this tab's memory.
export const mode = 'sandbox' as const;
export const repository = createSandboxRepository();
