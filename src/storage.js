export const PROJECT_VERSION = 2;
export const PROJECT_EXTENSION = '.ladderlab';
export const STORAGE_KEY = 'ladderlab.current.v2';
const LEGACY_KEY = 'ladderlab.project.v1';
const DB_NAME = 'ladderlab-safe-store';
const DB_VERSION = 1;
const MAX_RUNGS = 100;
const MAX_NODES = 24;
const ALLOWED_TYPES = new Set(['NO', 'NC', 'COIL', 'SET', 'RESET', 'TON', 'CTU']);

const cleanText = (value, max = 40) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

export function createProject(overrides = {}) {
  return {
    format: 'ladderlab-project',
    version: PROJECT_VERSION,
    id: overrides.id || globalThis.crypto?.randomUUID?.() || `project-${Date.now()}`,
    name: cleanText(overrides.name || 'Banda transportadora', 72),
    selectedPractice: Number.isInteger(overrides.selectedPractice) ? Math.max(0, Math.min(3, overrides.selectedPractice)) : 1,
    speed: Number.isFinite(overrides.speed) ? Math.max(0.5, Math.min(2, overrides.speed)) : 1,
    rungs: Array.isArray(overrides.rungs) ? overrides.rungs : [],
    updatedAt: Number.isFinite(overrides.updatedAt) ? overrides.updatedAt : Date.now(),
  };
}

export function validateProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('El archivo no contiene un proyecto válido.');
  if (input.format && input.format !== 'ladderlab-project') throw new Error('Formato de proyecto no reconocido.');
  if (!Array.isArray(input.rungs) || input.rungs.length > MAX_RUNGS) throw new Error(`El proyecto debe contener entre 0 y ${MAX_RUNGS} rungs.`);

  const rungs = input.rungs.map((rung, ri) => {
    if (!rung || typeof rung !== 'object' || !Array.isArray(rung.nodes) || rung.nodes.length > MAX_NODES) {
      throw new Error(`El rung ${ri + 1} no es válido.`);
    }
    return {
      id: Number.isFinite(Number(rung.id)) ? Number(rung.id) : Date.now() + ri,
      nodes: rung.nodes.map((node, ni) => {
        if (!node || typeof node !== 'object' || !ALLOWED_TYPES.has(node.type)) throw new Error(`La instrucción ${ni + 1} del rung ${ri + 1} no es compatible.`);
        return { type: node.type, tag: cleanText(node.tag || node.type), ...(node.value ? { value: cleanText(node.value, 16) } : {}) };
      }),
    };
  });

  return createProject({ ...input, rungs });
}

export function loadImmediate(fallback) {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return validateProject(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      return createProject({ ...fallback, rungs: parsed.rungs, selectedPractice: parsed.selectedPractice, updatedAt: parsed.saved });
    }
  } catch {
    // Corrupt browser storage must never prevent the editor from opening.
  }
  return createProject(fallback);
}

export function saveImmediate(project) {
  const safe = validateProject(project);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB no disponible'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) {
        const store = db.createObjectStore('snapshots', { keyPath: 'snapshotId' });
        store.createIndex('projectId', 'projectId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local'));
  });
}

function transact(storeName, mode, operation) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  }));
}

export async function saveIndexed(project, withSnapshot = false) {
  const safe = validateProject(project);
  await transact('projects', 'readwrite', store => store.put(safe));
  if (withSnapshot) {
    const snapshot = { ...safe, projectId: safe.id, snapshotId: `${safe.id}:${safe.updatedAt}`, reason: 'manual' };
    await transact('snapshots', 'readwrite', store => store.put(snapshot));
    await trimSnapshots(safe.id);
  }
  return safe;
}

export async function loadIndexed(projectId) {
  if (!projectId) return null;
  try { return await transact('projects', 'readonly', store => store.get(projectId)); } catch { return null; }
}

export async function listProjects() {
  try {
    const projects = await transact('projects', 'readonly', store => store.getAll());
    return projects.map(validateProject).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export async function listSnapshots(projectId) {
  try {
    const snapshots = await transact('snapshots', 'readonly', store => store.index('projectId').getAll(projectId));
    return snapshots.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

async function trimSnapshots(projectId) {
  const snapshots = await listSnapshots(projectId);
  await Promise.all(snapshots.slice(12).map(snapshot => transact('snapshots', 'readwrite', store => store.delete(snapshot.snapshotId))));
}

export function downloadProject(project) {
  const safe = validateProject({ ...project, updatedAt: Date.now() });
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const fileName = cleanText(safe.name, 60).replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ_-]+/g, '-').replace(/^-|-$/g, '') || 'proyecto';
  anchor.href = url;
  anchor.download = `${fileName}${PROJECT_EXTENSION}`;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file) {
  if (!file || file.size > 1024 * 1024) throw new Error('El archivo excede el límite seguro de 1 MB.');
  const text = await file.text();
  return validateProject(JSON.parse(text));
}

export async function requestDurableStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch { return false; }
}
