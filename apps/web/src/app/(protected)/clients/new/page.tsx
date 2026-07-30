import { requireOrganizationRole } from '@/lib/auth/server';
import { Header } from '@/components/layout/Header';
import { ClientForm } from '@/components/clients/ClientForm';
import { createClientAction } from '../actions';

export const metadata = { title: 'Nuevo cliente' };

export default async function NewClientPage() {
  // Verify the user has at least operator role to create clients
  await requireOrganizationRole('operator');

  return (
    <>
      <Header breadcrumbs={[{ label: 'Clientes', href: '/clients' }, { label: 'Nuevo cliente' }]} />
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Nuevo cliente</h1>
          <p className="text-sm text-gray-500 mt-1">
            Completa la información para registrar un nuevo cliente en la agencia.
          </p>
        </div>
        <ClientForm action={createClientAction} mode="create" />
      </div>
    </>
  );
}
