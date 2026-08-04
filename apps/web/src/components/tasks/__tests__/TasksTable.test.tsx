import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/app/(protected)/tasks/actions', () => ({
  updateTaskStatusAction: vi.fn(),
}));

import { TasksTable } from '../TasksTable';
import type { Task } from '@bop-agency/domain';
import type { TaskId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-uuid-1' as TaskId,
  organizationId: 'org-1' as OrganizationId,
  clientId: null,
  title: 'Preparar informe mensual',
  description: null,
  status: 'pending',
  priority: 'medium',
  dueDate: null,
  tags: [],
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  deletedAt: null,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TasksTable', () => {
  it('muestra empty state cuando no hay tareas', () => {
    render(<TasksTable tasks={[]} canMutate={false} />);
    expect(screen.getByText('Sin tareas')).toBeInTheDocument();
  });

  it('renderiza el título de la tarea', () => {
    render(<TasksTable tasks={[makeTask()]} canMutate={false} />);
    expect(screen.getByText('Preparar informe mensual')).toBeInTheDocument();
  });

  it('muestra el badge de prioridad', () => {
    render(<TasksTable tasks={[makeTask({ priority: 'high' })]} canMutate={false} />);
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('muestra el badge de status', () => {
    render(<TasksTable tasks={[makeTask({ status: 'in_progress' })]} canMutate={false} />);
    expect(screen.getByText('En progreso')).toBeInTheDocument();
  });

  it('NO muestra columna de acción si canMutate=false', () => {
    render(<TasksTable tasks={[makeTask()]} canMutate={false} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('muestra selector de acción si canMutate=true y tarea no está en estado final', () => {
    render(<TasksTable tasks={[makeTask({ status: 'pending' })]} canMutate={true} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('NO muestra selector de acción para tarea en estado final (done)', () => {
    render(<TasksTable tasks={[makeTask({ status: 'done' })]} canMutate={true} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('marca visualmente una tarea vencida', () => {
    const pastDate = new Date('2020-01-01');
    render(
      <TasksTable tasks={[makeTask({ status: 'pending', dueDate: pastDate })]} canMutate={false} />,
    );
    // La fecha vencida tiene ⚠️ y clase red
    expect(screen.getByText(/⚠️/)).toBeInTheDocument();
  });

  it('muestra múltiples tareas', () => {
    const tasks = [
      makeTask({ id: 't1' as TaskId, title: 'Tarea A' }),
      makeTask({ id: 't2' as TaskId, title: 'Tarea B' }),
    ];
    render(<TasksTable tasks={tasks} canMutate={false} />);
    expect(screen.getByText('Tarea A')).toBeInTheDocument();
    expect(screen.getByText('Tarea B')).toBeInTheDocument();
  });

  it('tabla tiene aria-label accesible', () => {
    render(<TasksTable tasks={[makeTask()]} canMutate={false} />);
    expect(screen.getByRole('table', { name: /Lista de tareas/i })).toBeInTheDocument();
  });
});
