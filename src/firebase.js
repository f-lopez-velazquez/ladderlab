import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, serverTimestamp, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let services;

export async function initializeCloud() {
  if (!firebaseConfigured) return null;
  if (services) return services;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, {});
  }
  const user = auth.currentUser || await new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, current => { if (current) { stop(); resolve(current); } }, reject);
    signInAnonymously(auth).catch(error => { stop(); reject(error); });
  });
  services = { auth, db, user };
  return services;
}

export async function saveCloudProject(project) {
  const cloud = await initializeCloud();
  if (!cloud) return { configured: false };
  const payload = {
    format: project.format,
    version: project.version,
    id: project.id,
    name: project.name,
    selectedPractice: project.selectedPractice,
    speed: project.speed,
    rungs: project.rungs,
    updatedAt: project.updatedAt,
    serverUpdatedAt: serverTimestamp(),
  };
  await setDoc(doc(cloud.db, 'users', cloud.user.uid, 'projects', project.id), payload, { merge: false });
  return { configured: true, uid: cloud.user.uid };
}

export async function loadCloudProject(projectId) {
  const cloud = await initializeCloud();
  if (!cloud || !projectId) return null;
  const snapshot = await getDoc(doc(cloud.db, 'users', cloud.user.uid, 'projects', projectId));
  return snapshot.exists() ? snapshot.data() : null;
}
