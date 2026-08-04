import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { TasksTable } from '@/components/tasks/TasksTable';
import { TasksFilters } from '@/components/tasks/TasksFilters';
import { Pagination } from '@/components/common/Pagination';
import { RepositoryErrorState } from '@/components/common/RepositoryErrorState';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createDashboardComposition } from '@/lib/composition/dashboard.composition';
import type { OrganizationId } from '@bop-agency/domain';
import type { TaskStatus } from '@bop-agency/shared';
import { TASK_STATUSES } from '@bop-agency/shared';

export const metadata: Metadata = { title: 'Tareas' };

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

function validateEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Roles con permiso operator o superior para mutar tareas. */
const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);

export default async function TasksPage({ searchParams }: Props) {
  const { organization, membership } = await requireOrganization();
  const params = await searchParams;

  const status = validateEnum(params.status, TASK_STATUSES);
  const overdue = params.overdue === 'true' ? true : undefined;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 20;

  const supabase = await createServerSupabaseClient();
  const { useCases } = createDashboardComposition(supabase);
  const orgId = organization.id as OrganizationId;

  const tasksResult = await useCases.listTasks({
    organizationId: orgId,
    ...(status !== undefined && { status: status as TaskStatus }),
    ...(overdue !== undefined && { overdue }),
    pagination: { page, pageSize },
  });

  const tasks = tasksResult.success ? tasksResult.value.data : [];
  const total = tasksResult.success ? tasksResult.value.total : 0;
  const totalPages = Math.ceil(total / pageSize);
  const canMutate = OPERATOR_ROLES.has(membership.role);

  return (
    <>
      <Header breadcrumbs={[{ label: 'Tareas' }]} />
      <main className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Tareas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gestiona las tareas de la agencia.</p>
          </div>
          <TasksFilters status={params.status ?? ''} overdue={params.overdue ?? ''} />
        </div>

        {!tasksResult.success && (
          <RepositoryErrorState message="No se pudieron cargar las tareas. Intenta recargar la página." />
        )}

        {tasksResult.success && (
          <>
            <div aria-live="polite" aria-atomic="true">
              <TasksTable tasks={tasks} canMutate={canMutate} />
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              itemLabel="tarea"
            />
          </>
        )}
      </main>
    </>
  );
}
