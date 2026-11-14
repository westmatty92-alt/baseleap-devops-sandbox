import 'server-only';

// Structured JSON logs (docs/architecture.md "Observability"). Fields are ids, route names, outcomes and
// durations only: never emails, names, phones, addresses, titles, notes, tokens or cookies.
export type LogFields = {
  request_id: string;
  route: string;
  outcome: 'ok' | 'client_error' | 'server_error';
  status: number;
  duration_ms: number;
  org_id?: string;
  member_id?: string;
  code?: string;
};

// Handlers learn who the caller is after the wrapper started the clock; this carries it back.
const actors = new WeakMap<Request, { org_id: string; member_id: string }>();

export function annotateActor(req: Request, actor: { org_id: string; member_id: string }) {
  actors.set(req, actor);
}

export function actorOf(req: Request) {
  return actors.get(req);
}

export function logRequest(fields: LogFields) {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ level: fields.outcome === 'server_error' ? 'error' : 'info', ...fields });
  if (fields.outcome === 'server_error') console.error(line);
  else console.log(line);
}
