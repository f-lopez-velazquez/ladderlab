import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

let environment;

const validProject = {
  format: 'ladderlab-project',
  version: 2,
  id: 'project-1',
  name: 'Banda segura',
  selectedPractice: 1,
  speed: 1,
  rungs: [{ id: 1, nodes: [{ type: 'NO', tag: 'Start' }] }],
  updatedAt: Date.now(),
  serverUpdatedAt: serverTimestamp(),
};

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  environment = await initializeTestEnvironment({ projectId: 'demo-ladderlab', firestore: { rules } });
  await environment.clearFirestore();
});

after(async () => environment?.cleanup());

test('un usuario autenticado puede guardar y leer solamente su proyecto', async () => {
  const database = environment.authenticatedContext('alice').firestore();
  const reference = doc(database, 'users', 'alice', 'projects', 'project-1');
  await assertSucceeds(setDoc(reference, validProject));
  const snapshot = await assertSucceeds(getDoc(reference));
  assert.equal(snapshot.data().name, 'Banda segura');
});

test('otro usuario no puede leer el proyecto', async () => {
  const database = environment.authenticatedContext('mallory').firestore();
  await assertFails(getDoc(doc(database, 'users', 'alice', 'projects', 'project-1')));
});

test('una sesión no autenticada no puede leer proyectos', async () => {
  const database = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(database, 'users', 'alice', 'projects', 'project-1')));
});

test('las reglas rechazan campos inesperados y nombres excesivos', async () => {
  const database = environment.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(database, 'users', 'alice', 'projects', 'invalid-extra'), { ...validProject, id: 'invalid-extra', privileged: true }));
  await assertFails(setDoc(doc(database, 'users', 'alice', 'projects', 'invalid-name'), { ...validProject, id: 'invalid-name', name: 'x'.repeat(73) }));
});
