import assert from 'node:assert/strict';
import test from 'node:test';
import { solveCircuit } from '../src/circuitEngine.js';
import { createGeneralProject, starterGeneralProject, validateGeneralProject } from '../src/generalStorage.js';

test('resuelve el circuito LED de ejemplo', () => {
  const result = solveCircuit(starterGeneralProject.components, starterGeneralProject.wires, true);
  assert.ok(result.sourceCurrent > 0.015 && result.sourceCurrent < 0.03);
  assert.ok(result.readings.get('led1').voltage > 2);
  assert.ok(result.readings.get('led1').brightness > 0.4);
  assert.equal(result.shortCircuit, false);
});

test('un interruptor abierto interrumpe la corriente', () => {
  const components = starterGeneralProject.components.map(component => component.id === 'sw1' ? { ...component, state: false } : component);
  const result = solveCircuit(components, starterGeneralProject.wires, true);
  assert.ok(result.sourceCurrent < 0.0001);
  assert.equal(result.readings.get('led1').brightness, 0);
});

test('detecta un cortocircuito a través de un interruptor cerrado', () => {
  const components = [
    { id: 'v1', type: 'dc', value: 9, state: true },
    { id: 'sw1', type: 'switch', value: 0, state: true },
  ];
  const wires = [
    { from: { componentId: 'v1', terminal: 'p' }, to: { componentId: 'sw1', terminal: 'a' } },
    { from: { componentId: 'sw1', terminal: 'b' }, to: { componentId: 'v1', terminal: 'n' } },
  ];
  const result = solveCircuit(components, wires, true);
  assert.ok(result.sourceCurrent > 5);
  assert.equal(result.shortCircuit, true);
});

test('rechaza terminales inexistentes en archivos importados', () => {
  const project = createGeneralProject(starterGeneralProject);
  project.wires = [{ id: 'bad', from: { componentId: 'v1', terminal: 'admin' }, to: { componentId: 'led1', terminal: 'a' } }];
  assert.throws(() => validateGeneralProject(project), /terminal inexistente/);
});

test('resuelve el semiciclo negativo de una fuente AC', () => {
  const components = [
    { id: 'vac1', type: 'ac', value: -6 },
    { id: 'r1', type: 'resistor', value: 1000 },
  ];
  const wires = [
    { from: { componentId: 'vac1', terminal: 'p' }, to: { componentId: 'r1', terminal: 'a' } },
    { from: { componentId: 'r1', terminal: 'b' }, to: { componentId: 'vac1', terminal: 'n' } },
  ];
  const result = solveCircuit(components, wires, true);
  assert.ok(result.readings.get('r1').voltage < -5.9);
  assert.ok(result.sourceCurrent > 0.005 && result.sourceCurrent < 0.007);
});

test('valida componentes ampliados y normaliza el color de cable', () => {
  const project = createGeneralProject({
    name: 'Motor protegido',
    components: [
      { id: 'f1', type: 'fuse', label: 'F1', value: 5, x: 100, y: 100, state: true },
      { id: 'm1', type: 'motor', label: 'M1', value: 90, x: 300, y: 100, state: true },
    ],
    wires: [{ id: 'w1', from: { componentId: 'f1', terminal: 'b' }, to: { componentId: 'm1', terminal: 'a' }, color: 'javascript:red' }],
  });
  const safe = validateGeneralProject(project);
  assert.equal(safe.components[1].type, 'motor');
  assert.equal(safe.wires[0].color, 'green');
});
