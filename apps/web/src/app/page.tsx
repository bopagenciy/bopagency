import { redirect } from 'next/navigation';

/**
 * Raíz — redirige al dashboard
 */
export default function RootPage() {
  redirect('/dashboard');
}
