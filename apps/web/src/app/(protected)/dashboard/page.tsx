import Link from 'next/link';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { DemoBanner } from '@/components/common/DemoBanner';
import {
  demoClients,
  demoCampaigns,
  demoAlerts,
  demoAutomations,
  demoMetrics,
} from '@/lib/placeholder-data';

export const metadata: Metadata = { title: 'Dashboard' };

function StatCard({ label, value, change }: { label: string; value: string; change: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {change !== 0 && (
        <p className={`text-xs mt-1 ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change > 0 ? '▲' : '▼'} {Math.abs(change)} vs. período anterior
        </p>
      )}
    </div>
  );
}

const severityColors = {
  critical: 'text-red-700 bg-red-50 border-red-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  info: 'text-blue-700 bg-blue-50 border-blue-200',
};

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  paused: 'bg-slate-100 text-slate-700',
  active: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
  onboarding: 'bg-blue-100 text-blue-800',
  inactive: 'bg-gray-100 text-gray-600',
};

export default function DashboardPage() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Dashboard' }]} />
      <div className="p-6 space-y-6">
        <DemoBanner />

        {/* Metrics row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {demoMetrics.map((m, i) => (
            <StatCard key={i} label={m.label} value={m.value} change={m.change} />
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Clientes activos */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Clientes activos</h2>
              <Link href="/clients" className="text-xs text-red-600 hover:text-red-700">
                Ver todos →
              </Link>
            </div>
            <ul className="divide-y divide-gray-100">
              {demoClients.map((client) => (
                <li key={client.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{client.name}</p>
                    <p className="text-xs text-gray-500">{client.industry}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{client.activeCampaigns} campañas</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[client.status]}`}
                    >
                      {client.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Campañas en borrador */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Campañas recientes</h2>
              <a href="/campaigns" className="text-xs text-red-600 hover:text-red-700">
                Ver todas →
              </a>
            </div>
            <ul className="divide-y divide-gray-100">
              {demoCampaigns.map((camp) => (
                <li key={camp.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{camp.name}</p>
                    <p className="text-xs text-gray-500 uppercase">{camp.platform}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[camp.status]}`}
                  >
                    {camp.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Alertas demo */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Alertas recientes</h2>
              <a href="/alerts" className="text-xs text-red-600 hover:text-red-700">
                Ver todas →
              </a>
            </div>
            <ul className="divide-y divide-gray-100">
              {demoAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`px-5 py-3 border-l-4 ${severityColors[alert.severity]}`}
                >
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs mt-0.5 opacity-75">
                    {new Date(alert.createdAt).toLocaleDateString('es-CO')}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Automatizaciones */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Automatizaciones</h2>
              <a href="/automations" className="text-xs text-red-600 hover:text-red-700">
                Ver todas →
              </a>
            </div>
            <ul className="divide-y divide-gray-100">
              {demoAutomations.map((auto) => (
                <li key={auto.id} className="px-5 py-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 truncate flex-1 mr-3">
                    {auto.name}
                  </p>
                  <span
                    className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[auto.status]}`}
                  >
                    {auto.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
