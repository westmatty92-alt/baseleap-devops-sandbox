// orval.config.ts: generates the front-end's whole API layer from the locked contract.
// Owned by bl-architect (scaffold step). Output is GENERATED: never edit src/lib/api/generated/ by hand.
// Run via `npm run gen:types`. Re-run after every contract change; a diff in generated files
// without a contract change means someone edited generated code.
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: { target: './docs/openapi.yaml' },
    output: {
      mode: 'tags-split',                       // one folder per OpenAPI tag (e.g. bookings/)
      target: './src/lib/api/generated',
      schemas: './src/lib/api/generated/model',
      client: 'react-query',                    // TanStack Query hooks: useListBookings, useCreateBooking, …
      httpClient: 'fetch',
      mock: true,                               // MSW handlers + faker data, built from the contract's examples
      clean: true,
      prettier: true,
      override: {
        mutator: {                              // the one hand-written piece: base URL, auth, problem+json errors
          path: './src/lib/api/fetcher.ts',
          name: 'apiFetch',
        },
        query: { useQuery: true, useMutation: true, signal: true },
      },
    },
  },
  apiZod: {                                     // Zod schemas for runtime validation at the trust boundary
    input: { target: './docs/openapi.yaml' },
    output: {
      mode: 'tags-split',
      client: 'zod',
      target: './src/lib/api/generated',
      fileExtension: '.zod.ts',
    },
  },
});
