import { z } from 'zod';

/** Fail fast at boot on a missing var — the same rule the backend applies. */
const schema = z.object({
  VITE_API_URL: z.string().min(1).default('/api'),
  VITE_SOCKET_URL: z.string().default(''),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid frontend environment:\n${issues}`);
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL,
  /** Empty means "same origin" — the Vite dev proxy handles it. */
  socketUrl: parsed.data.VITE_SOCKET_URL,
} as const;
