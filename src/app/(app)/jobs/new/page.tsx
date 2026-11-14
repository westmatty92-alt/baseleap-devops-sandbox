import type { Metadata } from 'next';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export const metadata: Metadata = { title: 'New job' };

export default function NewJobPage() {
  return <PlaceholderScreen id="SCR-05" title="New job" />;
}
