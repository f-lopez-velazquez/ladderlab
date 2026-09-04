export const GENERAL_FORMAT = 'ladderlab-general-circuit';
export const GENERAL_VERSION = 1;
export const GENERAL_EXTENSION = '.circuitlab';

const STORAGE_KEY = 'ladderlab.general.current.v1';
const BACKUP_KEY = 'ladderlab.general.backup.v1';
const DB_NAME = 'ladderlab-general-store';
const DB_VERSION = 1;
const ALLOWED_TYPES = new Set([
  'dc', 'ac', 'resistor', 'potentiometer', 'ldr', 'thermistor', 'fuse', 'diode', 'zener',
  'switch', 'button', 'led', 'lamp', 'motor', 'buzzer', 'capacitor', 'inductor',
  'voltmeter', 'ammeter', 'ground',
]);
const ALLOWED_TERMINALS = {
  dc: new Set(['p', 'n']), ac: new Set(['p', 'n']), resistor: new Set(['a', 'b']),
  potentiometer: new Set(['a', 'b']), ldr: new Set(['a', 'b']), thermistor: new Set(['a', 'b']),
  fuse: new Set(['a', 'b']), diode: new Set(['a', 'k']), zener: new Set(['a', 'k']),
  switch: new Set(['a', 'b']), button: new Set(['a', 'b']), led: new Set(['a', 'k']),
  lamp: new Set(['a', 'b']), motor: new Set(['a', 'b']), buzzer: new Set(['a', 'b']),
  capacitor: new Set(['a', 'b']), inductor: new Set(['a', 'b']),
  voltmeter: new Set(['p', 'n']), ammeter: new Set(['a', 'b']),
  ground: new Set(['g']),
};
const ALLOWED_WIRE_COLORS = new Set(['green', 'red', 'blue', 'black', 'orange', 'purple']);
const MAX_COMPONENTS = 200;
const MAX_WIRES = 500;

const cleanText = (value, max = 48) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .trim()
  .slice(0, max);

const finite = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

export const starterGeneralProject = {
  name: 'Circuito LED básico',
  components: [
    { id: 'v1', type: 'dc', label: 'V1', value: 9, x: 90, y: 252, state: true },
    { id: 'sw1', type: 'switch', label: 'SW1', value: 0, x: 280, y: 130, state: true },
    { id: 'r1', type: 'resistor', label: 'R1', value: 330, x: 475, y: 130, state: true },
    { id: 'led1', type: 'led', label: 'LED1', value: 120, x: 670, y: 130, state: true },
    { id: 'gnd1', type: 'ground', label: 'GND', value: 0, x: 107, y: 410, state: true },
    { id: 'vm1', type: 'voltmeter', label: 'VM1', value: 0, x: 670, y: 315, state: true },
  ],
  wires: [
    { id: 'w1', from: { componentId: 'v1', terminal: 'p' }, to: { componentId: 'sw1', terminal: 'a' } },
    { id: 'w2', from: { componentId: 'sw1', terminal: 'b' }, to: { componentId: 'r1', terminal: 'a' } },
    { id: 'w3', from: { componentId: 'r1', terminal: 'b' }, to: { componentId: 'led1', terminal: 'a' } },
    { id: 'w4', from: { componentId: 'led1', terminal: 'k' }, to: { componentId: 'v1', terminal: 'n' } },
    { id: 'w5', from: { componentId: 'v1', terminal: 'n' }, to: { componentId: 'gnd1', terminal: 'g' } },
    { id: 'w6', from: { componentId: 'vm1', terminal: 'p' }, to: { componentId: 'led1', terminal: 'a' } },
    { id: 'w7', from: { componentId: 'vm1', terminal: 'n' }, to: { componentId: 'led1', terminal: 'k' } },
  ],
};

export function createGeneralProject(overrides = {}) {
  return {
    format: GENERAL_FORMAT,
    version: GENERAL_VERSION,
    id: cleanText(overrides.id, 80) || globalThis.crypto?.randomUUID?.() || `circuit-${Date.now()}`,
    name: cleanText(overrides.name || 'Circuito general', 72),
    components: Array.isArray(overrides.components) ? overrides.components : [],
    wires: Array.isArray(overrides.wires) ? overrides.wires : [],
    updatedAt: Number.isFinite(overrides.updatedAt) ? overrides.updatedAt : Date.now(),
  };
}

export function validateGeneralProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('El archivo no contiene un circuito válido.');
  if (input.format && input.format !== GENERAL_FORMAT) throw new Error('El formato del circuito no es compatible.');
  if (!Array.isArray(input.components) || input.components.length > MAX_COMPONENTS) throw new Error(`El circuito admite hasta ${MAX_COMPONENTS} componentes.`);
  if (!Array.isArray(input.wires) || input.wires.length > MAX_WIRES) throw new Error(`El circuito admite hasta ${MAX_WIRES} cables.`);

  const ids = new Set();
  const components = input.components.map((component, index) => {
    if (!component || typeof component !== 'object' || !ALLOWED_TYPES.has(component.type)) throw new Error(`El componente ${index + 1} no es compatible.`);
    const id = cleanText(component.id, 80) || `component-${Date.now()}-${index}`;
    if (ids.has(id)) throw new Error('El circuito contiene identificadores duplicados.');
    ids.add(id);
    return {
      id,
      type: component.type,
      label: cleanText(component.label || component.type.toUpperCase(), 32),
      value: finite(component.value, 0, 0, 1_000_000_000),
      x: finite(component.x, 80, 0, 1080),
      y: finite(component.y, 80, 0, 620),
      rotation: finite(component.rotation, 0, 0, 270),
      state: Boolean(component.state),
    };
  });

  const componentById = new Map(components.map(component => [component.id, component]));
  const wireIds = new Set();
  const wires = input.wires.map((wire, index) => {
    const fromId = cleanText(wire?.from?.componentId, 80);
    const toId = cleanText(wire?.to?.componentId, 80);
    const fromTerminal = cleanText(wire?.from?.terminal, 8);
    const toTerminal = cleanText(wire?.to?.terminal, 8);
    const fromComponent = componentById.get(fromId);
    const toComponent = componentById.get(toId);
    if (!fromComponent || !toComponent || !ALLOWED_TERMINALS[fromComponent.type].has(fromTerminal) || !ALLOWED_TERMINALS[toComponent.type].has(toTerminal)) throw new Error(`El cable ${index + 1} apunta a un terminal inexistente.`);
    if (fromId === toId && fromTerminal === toTerminal) throw new Error(`El cable ${index + 1} conecta un terminal consigo mismo.`);
    const id = cleanText(wire.id, 80) || `wire-${Date.now()}-${index}`;
    if (wireIds.has(id)) throw new Error('El circuito contiene cables duplicados.');
    wireIds.add(id);
    return {
      id,
      from: { componentId: fromId, terminal: fromTerminal },
      to: { componentId: toId, terminal: toTerminal },
      color: ALLOWED_WIRE_COLORS.has(wire.color) ? wire.color : 'green',
    };
  });

  return createGeneralProject({ ...input, components, wires });
}

export function loadGeneralImmediate() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return validateGeneralProject(JSON.parse(saved));
  } catch {
    // A corrupted local copy must not prevent the workbench from loading.
  }
  return validateGeneralProject(createGeneralProject(starterGeneralProject));
}

export function saveGeneralImmediate(project) {
  const safe = validateGeneralProject(project);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

export function backupGeneralProject(project) {
  const safe = validateGeneralProject({ ...project, updatedAt: Date.now() });
  localStorage.setItem(BACKUP_KEY, JSON.stringify(safe));
  return safe;
}

export function loadGeneralBackup() {
  try {
    const saved = localStorage.getItem(BACKUP_KEY);
    return saved ? validateGeneralProject(JSON.parse(saved)) : null;
  } catch { return null; }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB no disponible'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('circuits')) request.result.createObjectStore('circuits', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local'));
  });
}

export async function saveGeneralIndexed(project) {
  const safe = validateGeneralProject(project);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('circuits', 'readwrite');
    transaction.objectStore('circuits').put(safe);
    transaction.oncomplete = () => { db.close(); resolve(safe); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export async function loadGeneralIndexed(projectId) {
  if (!projectId) return null;
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('circuits', 'readonly');
      const request = transaction.objectStore('circuits').get(projectId);
      request.onsuccess = () => { db.close(); resolve(request.result ? validateGeneralProject(request.result) : null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch { return null; }
}

export function downloadGeneralProject(project) {
  const safe = validateGeneralProject({ ...project, updatedAt: Date.now() });
  const url = URL.createObjectURL(new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  const name = cleanText(safe.name, 60).replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ_-]+/g, '-').replace(/^-|-$/g, '') || 'circuito';
  anchor.href = url;
  anchor.download = `${name}${GENERAL_EXTENSION}`;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readGeneralProject(file) {
  if (!file || file.size > 1024 * 1024) throw new Error('El archivo excede el límite seguro de 1 MB.');
  return validateGeneralProject(JSON.parse(await file.text()));
}
