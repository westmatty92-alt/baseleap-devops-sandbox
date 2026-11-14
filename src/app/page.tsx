import { redirect } from 'next/navigation';

// The app opens on today's board (user-flows: installed app opens SCR-03).
export default function Home() {
  redirect('/board');
}
