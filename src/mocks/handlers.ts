// MSW handlers built by Orval from docs/openapi.yaml (frontend lane after the scaffold).
// Add hand-tuned overrides in front of these, never by editing src/lib/api/generated/.
import { getBoardMock } from '@/lib/api/generated/board/board.msw';
import { getEventsMock } from '@/lib/api/generated/events/events.msw';
import { getJobsMock } from '@/lib/api/generated/jobs/jobs.msw';
import { getSessionMock } from '@/lib/api/generated/session/session.msw';
import { getSystemMock } from '@/lib/api/generated/system/system.msw';
import { getTeamMock } from '@/lib/api/generated/team/team.msw';

export const handlers = [
  ...getSystemMock(),
  ...getSessionMock(),
  ...getBoardMock(),
  ...getJobsMock(),
  ...getTeamMock(),
  ...getEventsMock(),
];
