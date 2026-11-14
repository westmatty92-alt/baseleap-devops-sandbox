// MSW for Vitest / Node (component tests). Usage: server.listen() in a test setup file.
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
