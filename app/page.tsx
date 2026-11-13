import { cookies } from 'next/headers';
import AppRoot from '@/components/AppRoot';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const initialUser = verifySessionToken(token);

  return <AppRoot initialUser={initialUser} />;
}
