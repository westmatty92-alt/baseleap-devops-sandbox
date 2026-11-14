import type { Metadata } from 'next';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export const metadata: Metadata = { title: 'Not allowed' };

export default function NotAllowedPage() {
  return <PlaceholderScreen id="SCR-08" title="Not allowed" />;
}
