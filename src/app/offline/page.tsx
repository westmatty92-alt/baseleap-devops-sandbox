import type { Metadata } from 'next';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export const metadata: Metadata = { title: 'Offline' };

export default function OfflinePage() {
  return <PlaceholderScreen id="SCR-07" title="You're offline" />;
}
