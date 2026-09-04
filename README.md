# LadderLab

Laboratorio web abierto para aprender y practicar programación PLC en Ladder Logic con un gemelo digital de una línea transportadora.

**Aplicación pública:** [ladderbasic.web.app](https://ladderbasic.web.app)

## Funciones principales

- Editor visual de contactos, bobinas, SET/RESET, temporizadores y contadores.
- Simulación continua con banda, cajas, sensores, desviador y velocidad variable.
- Circuito de seguridad didáctico: paro de emergencia, puerta con interlock, atasco y reset.
- Autoguardado inmediato en `localStorage` y copia transaccional en IndexedDB.
- Historial local con hasta 12 puntos de recuperación.
- Importación y exportación validada en formato `.ladderlab`.
- Caché offline mediante Service Worker.
- Sincronización opcional con Firebase, aislada por usuario autenticado.

> LadderLab es una herramienta educativa. No debe controlar maquinaria real ni sustituir un PLC, relé de seguridad o análisis de riesgos certificado.

## Desarrollo local

Requiere Node.js 20 o superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

La aplicación funciona sin Firebase. En ese modo conserva los proyectos únicamente en el dispositivo y permite exportarlos como archivo.

## Firebase

1. Crea un proyecto de Firebase y una aplicación web.
2. Activa **Authentication → Sign-in method → Anonymous**.
3. Crea una base Firestore en modo producción.
4. Copia `.env.example` a `.env.local` y completa los valores `VITE_FIREBASE_*`.
5. Revisa el alias de proyecto en `.firebaserc`.
6. Despliega reglas y hosting:

```bash
npm run build
npx firebase-tools deploy --only auth,firestore:rules,hosting
```

Las variables `.env*` están excluidas de Git. La configuración web de Firebase no sustituye las reglas: `firestore.rules` niega todo por defecto y limita cada proyecto a su UID autenticado.

Analytics está desactivado deliberadamente para evitar telemetría sin consentimiento.

Las reglas incluyen pruebas automatizadas de aislamiento entre usuarios. Para ejecutarlas con el emulador local:

```bash
npx firebase-tools emulators:exec --only firestore --project demo-ladderlab "npm run test:rules"
```

## Formato portable

Los archivos `.ladderlab` son JSON versionado. Al importar se limitan tamaño, número de rungs, número de instrucciones, tipos admitidos y longitud de etiquetas antes de modificar el proyecto activo.

## Seguridad

- No se aceptan secretos en el repositorio.
- Firestore aplica separación por UID.
- Firebase Hosting envía CSP, HSTS, protección contra clickjacking, `nosniff`, Referrer Policy y Permissions Policy.
- El contenido proporcionado por usuarios se representa como texto de React; no se usa `innerHTML`.
- Las dependencias se revisan con `npm run audit`.

Consulta [SECURITY.md](SECURITY.md) para reportar vulnerabilidades.

## Licencia

MIT. Consulta [LICENSE](LICENSE).

Creado por [zolvek.com.mx](https://zolvek.com.mx).
