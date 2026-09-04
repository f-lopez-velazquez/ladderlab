export const componentTerminals = {
  dc: ['p', 'n'],
  ac: ['p', 'n'],
  resistor: ['a', 'b'],
  potentiometer: ['a', 'b'],
  ldr: ['a', 'b'],
  thermistor: ['a', 'b'],
  fuse: ['a', 'b'],
  diode: ['a', 'k'],
  zener: ['a', 'k'],
  switch: ['a', 'b'],
  button: ['a', 'b'],
  led: ['a', 'k'],
  lamp: ['a', 'b'],
  motor: ['a', 'b'],
  buzzer: ['a', 'b'],
  capacitor: ['a', 'b'],
  inductor: ['a', 'b'],
  voltmeter: ['p', 'n'],
  ammeter: ['a', 'b'],
  ground: ['g'],
};

const terminalKey = (componentId, terminal) => `${componentId}:${terminal}`;

class UnionFind {
  constructor(keys) { this.parent = new Map(keys.map(key => [key, key])); }
  find(key) {
    const parent = this.parent.get(key);
    if (parent === undefined) return key;
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }
  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function solveLinear(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) continue;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let cell = column; cell <= size; cell += 1) rows[column][cell] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      if (Math.abs(factor) < 1e-16) continue;
      for (let cell = column; cell <= size; cell += 1) rows[row][cell] -= factor * rows[column][cell];
    }
  }
  return rows.map((row, index) => Number.isFinite(row[size]) && Math.abs(row[index]) > 1e-12 ? row[size] : 0);
}

const resistanceFor = component => {
  switch (component.type) {
    case 'resistor': return Math.max(0.01, component.value || 1000);
    case 'potentiometer': return Math.max(0.01, component.value || 10000);
    case 'ldr': return Math.max(0.01, component.value || 5000);
    case 'thermistor': return Math.max(0.01, component.value || 10000);
    case 'fuse': return component.state === false ? Infinity : 0.03;
    case 'diode':
    case 'zener': return Math.max(40, component.value || 80);
    case 'switch': return component.state ? 0.05 : Infinity;
    case 'button': return component.state ? 0.05 : Infinity;
    case 'led': return Math.max(80, component.value || 120);
    case 'lamp': return Math.max(1, component.value || 120);
    case 'motor': return Math.max(1, component.value || 90);
    case 'buzzer': return Math.max(1, component.value || 220);
    case 'voltmeter': return 1e9;
    case 'ammeter': return 0.02;
    case 'capacitor': return 1e12;
    case 'inductor': return 0.2;
    default: return Infinity;
  }
};

export function solveCircuit(components, wires, powered) {
  const keys = components.flatMap(component => (componentTerminals[component.type] || []).map(terminal => terminalKey(component.id, terminal)));
  const union = new UnionFind(keys);
  wires.forEach(wire => union.union(terminalKey(wire.from.componentId, wire.from.terminal), terminalKey(wire.to.componentId, wire.to.terminal)));
  const sources = components.filter(component => component.type === 'dc' || component.type === 'ac');
  const ground = components.find(component => component.type === 'ground');
  const referenceRoot = ground
    ? union.find(terminalKey(ground.id, 'g'))
    : sources[0]
      ? union.find(terminalKey(sources[0].id, 'n'))
      : union.find(keys[0]);
  const roots = [...new Set(keys.map(key => union.find(key)))];
  const voltageRoots = roots.filter(root => root !== referenceRoot);
  const voltageIndex = new Map(voltageRoots.map((root, index) => [root, index]));
  const size = voltageRoots.length + sources.length;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const vector = Array(size).fill(0);

  const indexFor = (component, terminal) => voltageIndex.get(union.find(terminalKey(component.id, terminal)));
  const stampConductance = (component, terminalA, terminalB, resistance) => {
    if (!Number.isFinite(resistance)) return;
    const conductance = 1 / Math.max(resistance, 1e-6);
    const a = indexFor(component, terminalA);
    const b = indexFor(component, terminalB);
    if (a !== undefined) matrix[a][a] += conductance;
    if (b !== undefined) matrix[b][b] += conductance;
    if (a !== undefined && b !== undefined) { matrix[a][b] -= conductance; matrix[b][a] -= conductance; }
  };

  components.forEach(component => {
    if (!['dc', 'ac', 'ground'].includes(component.type)) {
      const terminals = componentTerminals[component.type];
      stampConductance(component, terminals[0], terminals[1], resistanceFor(component));
    }
  });

  sources.forEach((source, sourceIndex) => {
    const row = voltageRoots.length + sourceIndex;
    const positive = indexFor(source, 'p');
    const negative = indexFor(source, 'n');
    if (positive !== undefined) { matrix[positive][row] += 1; matrix[row][positive] += 1; }
    if (negative !== undefined) { matrix[negative][row] -= 1; matrix[row][negative] -= 1; }
    vector[row] = powered
      ? source.type === 'ac' ? (source.value || 0) : Math.max(0, source.value || 0)
      : 0;
  });

  voltageRoots.forEach((_, index) => { matrix[index][index] += 1e-10; });
  const solution = size ? solveLinear(matrix, vector) : [];
  const voltageAt = (component, terminal) => {
    const index = indexFor(component, terminal);
    return index === undefined ? 0 : solution[index] || 0;
  };
  const readings = new Map();
  components.forEach((component, index) => {
    const terminals = componentTerminals[component.type];
    const voltage = terminals.length > 1 ? voltageAt(component, terminals[0]) - voltageAt(component, terminals[1]) : voltageAt(component, terminals[0]);
    const resistance = resistanceFor(component);
    let current = Number.isFinite(resistance) ? voltage / resistance : 0;
    if (component.type === 'dc' || component.type === 'ac') current = -(solution[voltageRoots.length + sources.indexOf(component)] || 0);
    const brightness = component.type === 'led'
      ? Math.max(0, Math.min(1, (voltage - 1.4) / 1.6))
      : component.type === 'lamp'
        ? Math.max(0, Math.min(1, Math.abs(voltage * current) / 0.6))
        : ['motor', 'buzzer'].includes(component.type)
          ? Math.max(0, Math.min(1, Math.abs(voltage * current) / 0.35))
        : 0;
    readings.set(component.id, { voltage, current, brightness, index });
  });
  const sourceCurrent = Math.max(0, ...sources.map(source => Math.abs(readings.get(source.id)?.current || 0)));
  return {
    readings,
    powered,
    shortCircuit: powered && sourceCurrent > 5,
    sourceCurrent,
    nets: roots.length,
  };
}
