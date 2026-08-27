import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublicationJobsTable, type JobListItem } from '../PublicationJobsTable';

describe('PublicationJobsTable Component (Phase 8B.4)', () => {
  const sampleJobs: JobListItem[] = [
    {
      id: 'job-queued-1234567890',
      targetId: 'target-1',
      channel: 'meta_ads',
      provider: 'meta',
      status: 'queued',
      retryCount: 0,
      retryOfJobId: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'job-failed-1234567890',
      targetId: 'target-2',
      channel: 'google_ads',
      provider: 'google',
      status: 'failed',
      retryCount: 1,
      retryOfJobId: 'job-orig-1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'job-unknown-1234567890',
      targetId: 'target-3',
      channel: 'meta_ads',
      provider: 'meta',
      status: 'unknown_outcome',
      retryCount: 0,
      retryOfJobId: null,
      createdAt: new Date().toISOString(),
    },
  ];

  it('viewer role sees job details but NO mutation action buttons', () => {
    render(<PublicationJobsTable jobs={sampleJobs} userRole="viewer" onOpenDetails={vi.fn()} />);

    expect(screen.queryByText('Cancelar')).not.toBeInTheDocument();
    expect(screen.queryByText('Reintentar')).not.toBeInTheDocument();
    expect(screen.queryByText('Reconciliar')).not.toBeInTheDocument();
    expect(screen.getAllByText('Detalles').length).toBe(3);
  });

  it('operator role sees cancel for queued jobs but NO retry or reconcile', () => {
    const onCancel = vi.fn();
    render(<PublicationJobsTable jobs={sampleJobs} userRole="operator" onCancel={onCancel} />);

    const cancelButtons = screen.getAllByText('Cancelar');
    expect(cancelButtons.length).toBe(1);

    const firstCancelBtn = cancelButtons[0];
    expect(firstCancelBtn).toBeDefined();
    if (firstCancelBtn) fireEvent.click(firstCancelBtn);
    expect(onCancel).toHaveBeenCalledWith('job-queued-1234567890');

    expect(screen.queryByText('Reintentar')).not.toBeInTheDocument();
    expect(screen.queryByText('Reconciliar')).not.toBeInTheDocument();
  });

  it('strategist role sees retry for failed jobs and reconcile for unknown_outcome', () => {
    const onRetry = vi.fn();
    const onReconcile = vi.fn();

    render(
      <PublicationJobsTable
        jobs={sampleJobs}
        userRole="strategist"
        onRetry={onRetry}
        onOpenReconcile={onReconcile}
      />,
    );

    const retryBtn = screen.getByText('Reintentar');
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledWith('job-failed-1234567890');

    const reconcileBtn = screen.getByText('Reconciliar');
    expect(reconcileBtn).toBeInTheDocument();
    fireEvent.click(reconcileBtn);
    expect(onReconcile).toHaveBeenCalledWith('job-unknown-1234567890');
  });

  it('renders retry lineage icon for retried jobs', () => {
    render(<PublicationJobsTable jobs={sampleJobs} userRole="viewer" />);
    expect(screen.getByText(/#1 🔗/)).toBeInTheDocument();
  });
});
