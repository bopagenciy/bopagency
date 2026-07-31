/**
 * Phase 4 — clients-index.json audit & classification tests
 *
 * Reads shared-data/clients-index.json and .agencia-ai/clients/ from the
 * real repository. No PII or secrets are logged.
 *
 * Classifications:
 *   migrate        — in index AND folder exists AND not template/demo/archived
 *   archived       — status === 'archived'
 *   template       — slug starts with '_'
 *   missing-index  — folder exists but NOT in clients-index
 *   missing-folder — in clients-index but folder does NOT exist
 *   manual-review  — flagged issues (duplicates, isValid === false, etc.)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  resolveRepositoryRoot,
  resolveSharedDataPath,
  resolveAgencyAiPath,
} from '../adapters/repository-root';
import type { RawClientIndex, RawClientEntry } from '../types';

// ── Setup ─────────────────────────────────────────────────────────────────────

let root: string;
let indexData: RawClientIndex;
let indexEntries: RawClientEntry[];
let agencyAiClientsDir: string;
let folderSlugs: string[];

beforeAll(() => {
  root = resolveRepositoryRoot();
  agencyAiClientsDir = resolveAgencyAiPath(root, 'clients');

  const indexPath = resolveSharedDataPath(root, 'clients-index.json');
  const raw = fs.readFileSync(indexPath, 'utf-8');
  indexData = JSON.parse(raw) as RawClientIndex;
  indexEntries = indexData.clients ?? [];

  // Folder slugs: all subdirectories under .agencia-ai/clients/
  folderSlugs = fs.existsSync(agencyAiClientsDir)
    ? fs
        .readdirSync(agencyAiClientsDir)
        .filter((d) => fs.statSync(path.join(agencyAiClientsDir, d)).isDirectory())
    : [];
});

// ── Audit: structure ──────────────────────────────────────────────────────────

describe('clients-index.json structure', () => {
  it('has a schemaVersion field', () => {
    expect(indexData.schemaVersion).toBeDefined();
  });

  it('has a non-empty clients array', () => {
    expect(Array.isArray(indexEntries)).toBe(true);
    expect(indexEntries.length).toBeGreaterThan(0);
  });

  it('every entry has an id field (which serves as slug)', () => {
    for (const entry of indexEntries) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry has a name field', () => {
    for (const entry of indexEntries) {
      expect(typeof entry.name).toBe('string');
    }
  });

  it('every entry has a status field', () => {
    for (const entry of indexEntries) {
      expect(typeof entry.status).toBe('string');
    }
  });

  it('has no duplicate ids', () => {
    const ids = indexEntries.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('does not contain slug field (real schema uses id)', () => {
    for (const entry of indexEntries) {
      // Cast to access possible legacy field
      const raw = entry as Record<string, unknown>;
      expect(raw['slug']).toBeUndefined();
    }
  });
});

// ── Audit: fields ─────────────────────────────────────────────────────────────

describe('clients-index.json field audit (no PII logged)', () => {
  it('reports count and available field names', () => {
    const fieldSets = indexEntries.map((e) => new Set(Object.keys(e)));
    const allFields = new Set(fieldSets.flatMap((s) => [...s]));
    // We only assert structure, not specific values
    expect(allFields.has('id')).toBe(true);
    expect(allFields.has('name')).toBe(true);
    expect(allFields.has('status')).toBe(true);
  });

  it('none of the entries have contactEmail or contactPhone at root level', () => {
    for (const entry of indexEntries) {
      const raw = entry as Record<string, unknown>;
      expect(raw['contactEmail']).toBeUndefined();
      expect(raw['contactPhone']).toBeUndefined();
    }
  });
});

// ── Classification ────────────────────────────────────────────────────────────

type ClientClass =
  'migrate' | 'archived' | 'template' | 'missing-index' | 'missing-folder' | 'manual-review';

interface ClassifiedClient {
  id: string;
  classification: ClientClass;
  inIndex: boolean;
  hasFolder: boolean;
}

function classifyClients(entries: RawClientEntry[], folders: string[]): ClassifiedClient[] {
  const indexIds = new Set(entries.map((e) => e.id));
  const folderSet = new Set(folders);
  const result: ClassifiedClient[] = [];

  // Classify entries from the index
  for (const entry of entries) {
    const hasFolder = folderSet.has(entry.id);
    let classification: ClientClass;

    if (entry.id.startsWith('_')) {
      classification = 'template';
    } else if (entry.status === 'archived') {
      classification = 'archived';
    } else if (!hasFolder) {
      classification = 'missing-folder';
    } else if (entry.isValid === false) {
      classification = 'manual-review';
    } else {
      classification = 'migrate';
    }

    result.push({ id: entry.id, classification, inIndex: true, hasFolder });
  }

  // Classify folders NOT in the index
  for (const folder of folders) {
    if (!indexIds.has(folder)) {
      const classification: ClientClass = folder.startsWith('_') ? 'template' : 'missing-index';
      result.push({ id: folder, classification, inIndex: false, hasFolder: true });
    }
  }

  return result;
}

describe('client classification', () => {
  let classified: ClassifiedClient[];

  beforeAll(() => {
    classified = classifyClients(indexEntries, folderSlugs);
  });

  it('produces a classification for every index entry', () => {
    expect(classified.filter((c) => c.inIndex).length).toBe(indexEntries.length);
  });

  it('_template-client is classified as template', () => {
    const t = classified.find((c) => c.id === '_template-client');
    expect(t).toBeDefined();
    expect(t?.classification).toBe('template');
  });

  it('legalink-col is classified as migrate', () => {
    const c = classified.find((c) => c.id === 'legalink-col');
    expect(c).toBeDefined();
    expect(c?.classification).toBe('migrate');
  });

  it('magic-bungalow is classified as migrate', () => {
    const c = classified.find((c) => c.id === 'magic-bungalow');
    expect(c).toBeDefined();
    expect(c?.classification).toBe('migrate');
  });

  it('bop-soluciones is classified as missing-index (folder exists but not in index)', () => {
    const c = classified.find((c) => c.id === 'bop-soluciones');
    expect(c).toBeDefined();
    expect(c?.classification).toBe('missing-index');
  });

  it('the-industrial-depot is classified as missing-index', () => {
    const c = classified.find((c) => c.id === 'the-industrial-depot');
    expect(c).toBeDefined();
    expect(c?.classification).toBe('missing-index');
  });

  it('no entries are classified as missing-folder (all index entries have folders)', () => {
    const missing = classified.filter((c) => c.classification === 'missing-folder');
    // Log the slugs if any are missing so the developer can investigate
    if (missing.length > 0) {
      const ids = missing.map((m) => m.id);
      // These must be investigated — they're in the index but have no local data
      expect(ids).toEqual([]); // fail with the actual missing list
    }
    expect(missing.length).toBe(0);
  });

  it('counts at least 2 migrate candidates (approved list)', () => {
    const migratable = classified.filter((c) => c.classification === 'migrate');
    expect(migratable.length).toBeGreaterThanOrEqual(2);
  });
});
