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
