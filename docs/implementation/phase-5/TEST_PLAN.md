# TEST PLAN — PHASE 5

## BopIAgency — Dashboard Principal

**Fecha:** 2026-07-31

---

## 1. FRAMEWORK Y CONVENCIONES

- **Unit tests (domain + application + infrastructure):** Vitest (ya configurado)
- **Component tests:** Vitest + React Testing Library (apps/web)
- **E2E:** Playwright (a instalar — no existe todavía)
- **Cobertura mínima:** 80% en domain y application; 60% en infrastructure
- **Archivos:** `__tests__/` junto a cada módulo, sufijo `.test.ts`

---

## 2. DOMAIN TESTS

### 2.1 TaskStatus — transiciones válidas

```typescript
// packages/domain/src/__tests__/task-transitions.test.ts
describe('Task status transitions', () => {
  it('pending → in_progress: válido');
  it('pending → cancelled: válido');
  it('in_progress → done: válido');
  it('in_progress → blocked: válido');
  it('blocked → in_progress: válido');
  it('done → in_progress: inválido (ya terminada)');
  it('cancelled → pending: inválido (ya cancelada)');
});
```

> Requiere implementar `canTransitionTask(from: TaskStatus, to: TaskStatus): boolean` en domain.

### 2.2 AlertStatus — transiciones válidas

```typescript
// packages/domain/src/__tests__/alert-transitions.test.ts
describe('Alert status transitions', () => {
  it('active → acknowledged: válido');
  it('active → resolved: válido (operator)');
  it('acknowledged → resolved: válido');
  it('acknowledged → snoozed: válido');
  it('resolved → active: inválido (irreversible)');
  it('snoozed → active: válido (reactivar después de snooze)');
});
```

### 2.3 MetricValues — validación

```typescript
describe('MetricValues', () => {
  it('roas = 0 cuando spend = 0 (sin división por cero)');
  it('cpl = null cuando leads = 0');
  it('campaigns array puede ser vacío');
  it('campaigns con 55 items: mapper no falla');
});
```

---

## 3. APPLICATION TESTS

### 3.1 listAlerts

```typescript
// packages/application/src/__tests__/list-alerts.test.ts
describe('listAlerts', () => {
  it('filtra por organizationId (multi-tenant)');
  it('no devuelve alertas de otra org');
  it('filtra por status=active por defecto');
  it('acepta filtro status=resolved');
  it('acepta filtro clientId');
  it('aplica paginación');
  it('devuelve PaginatedResult con total correcto');
  it('devuelve ok([]) si no hay alertas');
  it('propaga error del repositorio como err()');
});
```

### 3.2 acknowledgeAlert

```typescript
describe('acknowledgeAlert', () => {
  it('llama alertRepository.acknowledge con alertId correcto');
  it('verifica que la alerta pertenece a la organización');
  it('devuelve error si alerta no existe');
  it('devuelve error si alerta ya está resuelta');
  it('devuelve error si usuario no tiene permisos');
  it('no acepta organizationId del input (debe venir de userId)');
});
```

### 3.3 resolveAlert

```typescript
describe('resolveAlert', () => {
  it('requiere rol operator o superior');
  it('acepta alertas en estado active, acknowledged, snoozed');
  it('rechaza alertas ya resueltas');
  it('devuelve error si alerta no existe');
});
```

### 3.4 updateTaskStatus

```typescript
describe('updateTaskStatus', () => {
  it('aplica transición válida pending → in_progress');
  it('rechaza transición inválida done → pending');
  it('verifica que la tarea pertenece a la organización');
  it('verifica que la tarea no está deleted_at');
  it('requiere rol operator mínimo');
  it('propaga error del repositorio');
  it('devuelve la tarea actualizada');
});
```

### 3.5 listClientMetrics

```typescript
describe('listClientMetrics', () => {
  it('filtra por organizationId');
  it('filtra por clientId opcional');
  it('filtra por periodStart/periodEnd opcional');
  it('filtra por platform opcional');
  it('devuelve lista vacía si no hay métricas');
  it('NO carga campo campaigns en lista (solo id+platform+period+metrics)');
  it('paginación correcta');
});
```

### 3.6 getAgencyDashboardSummary

```typescript
describe('getAgencyDashboardSummary', () => {
  it('devuelve clientsActive count');
  it('devuelve alertsActive count');
  it('devuelve tasksPending count');
  it('devuelve tasksOverdue count (due_date < now)');
  it('devuelve reportsThisMonth count');
  it('solo incluye clientes de la organización activa');
  it('devuelve ceros si no hay datos');
});
```

---

## 4. INFRASTRUCTURE TESTS

### 4.1 SupabaseMetricsRepository

```typescript
// packages/infrastructure/src/__tests__/supabase-metrics.repository.test.ts
describe('SupabaseMetricsRepository', () => {
  describe('findByOrganization', () => {
    it('query incluye organization_id filter');
    it('query NO incluye campaigns en select (para lista)');
    it('devuelve PaginatedResult correctamente');
    it('devuelve empty list si no hay filas');
  });
  describe('findByClient', () => {
    it('query incluye client_id y organization_id');
    it('ordena por period_start DESC');
  });
  describe('rowToMetric mapper', () => {
    it('parsea metrics JSONB a MetricValues correctamente');
    it('maneja traffic/engagement/conversations opcionales');
    it('maneja campaigns vacío []');
    it('lanza error si metrics no es object JSON válido');
  });
});
```

### 4.2 SupabaseAlertRepository

```typescript
describe('SupabaseAlertRepository', () => {
  describe('findActive', () => {
    it('filtra status = "active"');
    it('incluye organization_id filter');
  });
  describe('acknowledge', () => {
    it('llama rpc("acknowledge_alert") NO UPDATE directo');
    it('maneja error de RPC correctamente');
  });
  describe('resolve', () => {
    it('llama rpc("resolve_alert") NO UPDATE directo');
    it('mapea error "sin permisos" a FORBIDDEN');
  });
  describe('rowToAlert mapper', () => {
    it('mapea status "active" correctamente');
    it('mapea acknowledged_at null a undefined');
    it('mapea metadata {} a Record<string, unknown>');
  });
});
```

### 4.3 SupabaseTaskRepository

```typescript
describe('SupabaseTaskRepository', () => {
  describe('findByOrganization', () => {
    it('excluye deleted_at IS NOT NULL');
    it('filtra por organization_id');
  });
  describe('updateStatus', () => {
    it('solo actualiza status y updated_at');
    it('incluye eq organization_id como doble barrera');
  });
  describe('rowToTask mapper', () => {
    it('mapea status "done" a TaskStatus correctamente');
    it('mapea due_date string a Date');
    it('mapea tags array a string[]');
    it('deleted_at null → deletedAt undefined');
  });
});
```

---

## 5. COMPONENT TESTS

### 5.1 AlertsTable

```typescript
// apps/web/src/__tests__/AlertsTable.test.tsx
describe('AlertsTable', () => {
  it('renderiza lista de alertas');
  it('muestra badge de severidad con color correcto (critical=rojo, warning=amarillo, info=azul)');
  it('botón "Reconocer" solo visible si status=active');
  it('botón "Resolver" solo visible si status IN (active, acknowledged, snoozed)');
  it('estado vacío: muestra mensaje si alerts.length === 0');
  it('botones deshabilitados mientras acción está en curso (isPending)');
  it('mobile: tabla scroll horizontal en pantallas pequeñas');
});
```

### 5.2 TasksTable

```typescript
describe('TasksTable', () => {
  it('renderiza lista de tareas con status badge');
  it('dropdown de cambio de status con opciones válidas');
  it('estado vacío: muestra EmptyState si tasks.length === 0');
  it('tareas vencidas: due_date pasada resaltada en rojo');
  it('responsive: columnas colapsables en mobile');
});
```

### 5.3 MetricsCards

```typescript
describe('MetricsSummaryCards', () => {
  it('muestra spend formateado con moneda');
  it('muestra 0 si spend es null');
  it('muestra roas con 2 decimales');
  it('muestra leads y conversiones');
  it('no muestra tasa de conversión si leads=0 (evitar NaN)');
});
```

### 5.4 DashboardPage

```typescript
describe('DashboardPage (Server Component)', () => {
  it('muestra StatCards con valores reales (no placeholder)');
  it('redirige a /login si no hay sesión');
  it('redirige a /onboarding si no hay org activa');
  it('muestra alertas activas en panel lateral');
  it('muestra clientes activos');
});
```

---

## 6. E2E TESTS (Playwright)

### 6.1 Setup requerido

```
npm install -D playwright @playwright/test
npx playwright install chromium
```

### 6.2 Flujo: Ver métricas

```typescript
// e2e/metrics.spec.ts
test('usuario ve métricas de su organización', async ({ page }) => {
  await loginAs('test-user@bopagency.com', page);
  await page.goto('/metrics');

  await expect(page.getByTestId('metrics-page')).toBeVisible();
  await expect(page.getByText('magic-bungalow')).toBeVisible();
  await expect(page.getByText('legalink-col')).toBeVisible();

  // Selector de período
  await page.selectOption('[data-testid="period-select"]', '2026-06');
  await expect(page.getByTestId('spend-total')).toHaveText(/COP/);

  // Filtro por cliente
  await page.selectOption('[data-testid="client-filter"]', 'magic-bungalow');
  await expect(page.getByText('legalink-col')).not.toBeVisible();
});
```

### 6.3 Flujo: Resolver alerta

```typescript
test('operador puede resolver una alerta', async ({ page }) => {
  await loginAs('operator@bopagency.com', page);
  await page.goto('/alerts');

  // Ver alerta activa
  const alertRow = page.getByTestId('alert-row').first();
  await expect(alertRow).toBeVisible();

  // Acknowledger
  await alertRow.getByRole('button', { name: 'Reconocer' }).click();
  await expect(alertRow.getByText('acknowledged')).toBeVisible();

  // Resolver
  await alertRow.getByRole('button', { name: 'Resolver' }).click();
  await expect(page.getByText('Alerta resuelta')).toBeVisible(); // toast
  await expect(alertRow).not.toBeVisible(); // removida de lista activa
});
```

### 6.4 Flujo: Cambiar estado de tarea

```typescript
test('operador puede cambiar estado de una tarea', async ({ page }) => {
  await loginAs('operator@bopagency.com', page);
  await page.goto('/tasks');

  const taskRow = page.getByTestId('task-row').first();
  await taskRow.getByRole('combobox', { name: 'Estado' }).selectOption('in_progress');

  await expect(page.getByText('Estado actualizado')).toBeVisible(); // toast
  await expect(taskRow.getByText('in_progress')).toBeVisible();
});
```

### 6.5 Flujo: Aislamiento multi-tenant

```typescript
test('usuario de org A no ve datos de org B', async ({ page }) => {
  await loginAs('user-org-a@test.com', page);
  await page.goto('/alerts');

  const alertsOrgA = await page.getByTestId('alert-row').count();

  await supabase.auth.signOut();
  await loginAs('user-org-b@test.com', page);
  await page.goto('/alerts');

  // Si ambas orgs tienen alertas, no deben solaparse
  // Este test requiere setup de fixtures separadas por org
});
```

---

## 7. MATRIZ DE RIESGOS DE TESTING

| Área               | Riesgo                                       | Mitigación                                        |
| ------------------ | -------------------------------------------- | ------------------------------------------------- |
| campaigns JSONB    | 55 items → tests lentos o timeout            | Mock con 3 campañas en tests unitarios            |
| RPCs de alertas    | Sin acceso a Supabase en CI                  | Mock con `vi.fn()` en tests de application        |
| Tipos desalineados | `'completed'` vs `'done'`                    | Test explícito de mapper antes de implementar UI  |
| Recharts SSR       | Componentes de chart pueden fallar en Server | Usar `dynamic(() => import(...), { ssr: false })` |
| Playwright en CI   | Sin base de datos de test                    | Usar Supabase local o fixtures en memoria         |

---

## 8. ORDEN DE EJECUCIÓN DE TESTS

```
1. npm run test -w packages/shared    # TaskStatus, AlertStatus corregidos
2. npm run test -w packages/domain    # Entidades + transiciones
3. npm run test -w packages/application # Use cases Phase 5
4. npm run test -w packages/infrastructure # Repos + mappers
5. npm run test -w apps/web           # Componentes
6. npx playwright test                # E2E (requiere Supabase local corriendo)
```
