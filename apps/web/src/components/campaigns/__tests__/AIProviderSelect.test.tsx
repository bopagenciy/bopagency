/**
 * AIProviderSelect + integración en el wizard — tests (Phase 7D.1).
 *
 * Cobertura (§21 "UI"):
 *   U1. lista solo los proveedores implementados + la opción "usar predeterminado"
 *   U2. la opción por defecto tiene value '' (el servidor decide)
 *   U3. onChange emite el id del proveedor, nunca una etiqueta
 *   U4. NO existe selector de modelo ni campo de API key
 *   U5. el selector es visible en modo IA del wizard
 *   U6. el selector NO se muestra en modo manual
 *   U7. modo manual no requiere ni envía provider
 *   U8. modo IA envía el provider seleccionado
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { AI_PROVIDER_IDS, AI_PROVIDER_LABELS } from '@bop-agency/shared';

const { mockGenerateAction, mockCreateAction, mockPush } = vi.hoisted(() => ({
  mockGenerateAction: vi.fn(),
  mockCreateAction: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/app/(protected)/campaigns/actions', () => ({
  generateCampaignDraftWithAiAction: mockGenerateAction,
  createCampaignDraftAction: mockCreateAction,
  regenerateCampaignContentAction: vi.fn(),
}));

import { AIProviderSelect } from '../AIProviderSelect';
import { CampaignWizardForm } from '../CampaignWizardForm';

const CLIENTS = [{ id: 'client-1', name: 'Cliente Demo' }];

/** Primer argumento con el que se invocó una Server Action mockeada. */
function firstArg(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const [first] = mock.mock.calls as [unknown[]] | [];
  if (first === undefined) throw new Error('la Server Action no fue invocada');
  return first[0] as Record<string, unknown>;
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`No se encontró el elemento #${id}`);
  return element;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateAction.mockResolvedValue({ ok: true, data: { id: 'campaign-1' } });
  mockCreateAction.mockResolvedValue({ ok: true, data: { id: 'campaign-2' } });
});

describe('AIProviderSelect', () => {
  it('U1: lista exactamente los proveedores implementados más la opción por defecto', () => {
    render(<AIProviderSelect value="" onChange={vi.fn()} />);

    const select = screen.getByLabelText('Proveedor de IA') as HTMLSelectElement;
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];

    expect(options).toHaveLength(AI_PROVIDER_IDS.length + 1);
    for (const providerId of AI_PROVIDER_IDS) {
      expect(options.some((o) => o.value === providerId)).toBe(true);
    }
    expect(screen.getByRole('option', { name: AI_PROVIDER_LABELS.openai })).toBeTruthy();
    expect(screen.getByRole('option', { name: AI_PROVIDER_LABELS.gemini })).toBeTruthy();
    expect(screen.getByRole('option', { name: AI_PROVIDER_LABELS.anthropic })).toBeTruthy();
    // "Claude Code" es tooling de desarrollo, nunca un proveedor de runtime.
    expect(select.textContent).not.toContain('Claude Code');
  });

  it('U2: la opción por defecto tiene value vacío (el servidor decide)', () => {
    render(<AIProviderSelect value="" onChange={vi.fn()} defaultOptionLabel="Usar predeterminado" />);

    const option = screen.getByRole('option', { name: 'Usar predeterminado' }) as HTMLOptionElement;
    expect(option.value).toBe('');
  });

  it('U3: onChange emite el id del proveedor, no la etiqueta', () => {
    const onChange = vi.fn();
    render(<AIProviderSelect value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Proveedor de IA'), { target: { value: 'gemini' } });

    expect(onChange).toHaveBeenCalledWith('gemini');
    expect(onChange).not.toHaveBeenCalledWith(AI_PROVIDER_LABELS.gemini);
  });

  it('U4: no expone selector de modelo ni campo de API key', () => {
    const { container } = render(<AIProviderSelect value="" onChange={vi.fn()} />);

    expect(screen.queryByLabelText(/modelo/i)).toBeNull();
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});

describe('CampaignWizardForm — selector de proveedor', () => {
  it('U5: el selector es visible en modo IA (modo por defecto)', () => {
    render(<CampaignWizardForm clients={CLIENTS} />);

    expect(screen.getByLabelText('Proveedor de IA')).toBeTruthy();
  });

  it('U6: el selector no se muestra en modo manual', () => {
    render(<CampaignWizardForm clients={CLIENTS} />);

    fireEvent.click(screen.getByText('📝 Crear manualmente'));

    expect(screen.queryByLabelText('Proveedor de IA')).toBeNull();
  });

  it('U7: modo manual no requiere provider y no lo envía', async () => {
    render(<CampaignWizardForm clients={CLIENTS} />);

    fireEvent.click(screen.getByText('📝 Crear manualmente'));
    fireEvent.change(screen.getByLabelText(/Nombre de la campaña/), {
      target: { value: 'Campaña manual' },
    });
    fireEvent.change(screen.getByLabelText(/Presupuesto/), { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador' }));

    await vi.waitFor(() => expect(mockCreateAction).toHaveBeenCalled());
    expect('provider' in firstArg(mockCreateAction)).toBe(false);
    expect(mockGenerateAction).not.toHaveBeenCalled();
  });

  it('U8: modo IA envía el provider seleccionado', async () => {
    render(<CampaignWizardForm clients={CLIENTS} />);

    fireEvent.change(screen.getByLabelText(/Presupuesto/), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText('Proveedor de IA'), { target: { value: 'openai' } });
    fireEvent.change(requiredElement('brief'), {
      target: { value: 'Brief de prueba con suficiente contenido.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generar borrador con IA' }));

    await vi.waitFor(() => expect(mockGenerateAction).toHaveBeenCalled());
    expect(firstArg(mockGenerateAction).provider).toBe('openai');
  });
});
