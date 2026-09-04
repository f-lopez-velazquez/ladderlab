import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, ArchiveRestore, BookOpen, Box, Check, ChevronDown, CircuitBoard,
  ChevronRight, CircleStop, Cloud, CloudOff, Download, FilePlus2, FolderOpen,
  Gauge, History, Layers3, ListTree, LockKeyhole, Menu, PanelBottomClose, Pause,
  Play, Plus, RefreshCcw, Save, Search, Settings2, ShieldCheck,
  Trash2, Upload, Wifi, X
} from 'lucide-react';
import {
  createProject, downloadProject, listProjects, listSnapshots, loadImmediate, loadIndexed,
  readProjectFile, requestDurableStorage, saveImmediate, saveIndexed, validateProject
} from './storage';
import GeneralLab from './GeneralLab';
import './styles.css';

const firebaseConfigured = Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_APP_ID);
const cloudApi = () => import('./firebase');

const palette = [
  { type: 'NO', label: 'Contacto NO', symbol: '—| |—' },
  { type: 'NC', label: 'Contacto NC', symbol: '—|/|—' },
  { type: 'COIL', label: 'Bobina', symbol: '—( )—' },
  { type: 'SET', label: 'Set', symbol: '—(S)—' },
  { type: 'RESET', label: 'Reset', symbol: '—(R)—' },
  { type: 'TON', label: 'Temporizador TON', symbol: '[ TON ]' },
  { type: 'CTU', label: 'Contador CTU', symbol: '[ CTU ]' },
];

const starterRungs = [
  { id: 1, nodes: [{ type: 'NO', tag: 'Start' }, { type: 'NC', tag: 'E_Stop' }, { type: 'NC', tag: 'Gate' }, { type: 'COIL', tag: 'Motor' }] },
  { id: 2, nodes: [{ type: 'NO', tag: 'Motor' }, { type: 'TON', tag: 'T1', value: '3s' }] },
  { id: 3, nodes: [{ type: 'NO', tag: 'Sensor_1' }, { type: 'CTU', tag: 'Counter', value: '999' }] },
];

const practices = [
  { n: '01', title: 'Arranque seguro', desc: 'Enclavamiento, paro y relé térmico', level: 'Básico', nodes: starterRungs.slice(0, 1) },
  { n: '02', title: 'Banda transportadora', desc: 'Sensores, movimiento y temporización', level: 'Básico', nodes: starterRungs },
  { n: '03', title: 'Secuencia industrial', desc: 'Etapas temporizadas y señalización', level: 'Intermedio', nodes: [starterRungs[0], starterRungs[1]] },
  { n: '04', title: 'Clasificador de cajas', desc: 'Conteo, lectura y desvío de producto', level: 'Intermedio', nodes: starterRungs },
];

const fallbackProject = { name: 'Banda transportadora', selectedPractice: 1, speed: 1, rungs: starterRungs };
const cloneRungs = rungs => rungs.map((rung, ri) => ({ ...rung, id: Date.now() + ri, nodes: rung.nodes.map(node => ({ ...node })) }));

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="fatal-error"><ShieldCheck size={36} /><h1>LadderLab protegió tu sesión</h1><p>La interfaz encontró un error inesperado. Tu último guardado local continúa intacto.</p><button onClick={() => location.reload()}>Recargar de forma segura</button></main>;
    return this.props.children;
  }
}

function Instruction({ node, active, onRemove, onEdit }) {
  const isCoil = ['COIL', 'SET', 'RESET'].includes(node.type);
  const isBlock = ['TON', 'CTU'].includes(node.type);
  return <div className={`instruction ${isCoil ? 'coil' : ''} ${isBlock ? 'block' : ''} ${active ? 'energized' : ''}`}>
    <span className="wire before" />
    <div className="node-actions"><button onClick={onEdit} aria-label={`Editar ${node.tag}`}><Settings2 size={10} /></button><button onClick={onRemove} aria-label={`Eliminar ${node.tag}`}><X size={10} /></button></div>
    {!isBlock && <span className="tag">{node.tag}</span>}
    {node.type === 'NO' && <span className="contact-mark"><i /><i /></span>}
    {node.type === 'NC' && <span className="contact-mark nc"><i /><i /><b /></span>}
    {isCoil && <span className="coil-mark"><i>{node.type === 'SET' ? 'S' : node.type === 'RESET' ? 'R' : ''}</i></span>}
    {isBlock && <span className="logic-block"><b>{node.type}</b><small>{node.tag} · {node.value || '0'}</small></span>}
    <span className="wire after" />
  </div>;
}

function ProjectManager({ open, onClose, project, projects, onLoadProject, onRename, onSave, onExport, onImport, onNew, snapshots, onRestore, storageStatus, cloudStatus, onConnect, fileRef }) {
  if (!open) return null;
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="project-drawer" onMouseDown={event => event.stopPropagation()} aria-label="Administrar proyecto">
    <div className="drawer-head"><div><span className="step">PROYECTO SEGURO</span><h2>Respaldo y recuperación</h2></div><button onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div>
    <label className="field-label">NOMBRE DEL PROYECTO<input value={project.name} maxLength={72} onChange={event => onRename(event.target.value)} /></label>
    <div className="protection-grid">
      <div className="protection-item"><ShieldCheck size={19} /><span><b>Copia local</b><small>{storageStatus === 'saving' ? 'Guardando cambios…' : 'Protegida en 2 capas'}</small></span><Check size={15} /></div>
      <button className={`protection-item ${cloudStatus === 'error' ? 'warning' : ''}`} onClick={onConnect} disabled={cloudStatus === 'ready' || cloudStatus === 'connecting' || cloudStatus === 'disabled'}>{cloudStatus === 'ready' ? <Cloud size={19} /> : <CloudOff size={19} />}<span><b>Nube Firebase</b><small>{cloudStatus === 'ready' ? 'Sincronización privada activa' : cloudStatus === 'connecting' ? 'Conectando…' : cloudStatus === 'error' ? 'Firebase Auth requiere configuración' : firebaseConfigured ? 'Pulsa para conectar de forma privada' : 'Configura .env.local'}</small></span>{cloudStatus === 'ready' && <Check size={15} />}</button>
    </div>
    <div className="project-actions">
      <button className="primary" onClick={onSave}><Save size={16} /><span><b>Guardar versión</b><small>Crea un punto de recuperación</small></span></button>
      <button onClick={onExport}><Download size={16} /><span><b>Exportar .ladderlab</b><small>Respaldo portable y validado</small></span></button>
      <button onClick={() => fileRef.current?.click()}><Upload size={16} /><span><b>Importar proyecto</b><small>Máximo 1 MB</small></span></button>
      <button onClick={onNew}><FilePlus2 size={16} /><span><b>Proyecto nuevo</b><small>Conserva una copia del actual</small></span></button>
    </div>
    <input ref={fileRef} className="visually-hidden" type="file" accept=".ladderlab,application/json" onChange={onImport} />
    <div className="history-title"><FolderOpen size={14} /><span>PROYECTOS DEL DISPOSITIVO</span><small>{projects.length}</small></div>
    <div className="device-projects">{projects.map(item => <button className={item.id === project.id ? 'current' : ''} key={item.id} onClick={() => onLoadProject(item)}><span><b>{item.name}</b><small>{new Date(item.updatedAt).toLocaleString('es-MX')} · {item.rungs.length} rungs</small></span>{item.id === project.id ? <Check size={14} /> : <ChevronRight size={14} />}</button>)}</div>
    <div className="history-title"><History size={14} /><span>HISTORIAL LOCAL</span><small>{snapshots.length}/12 versiones</small></div>
    <div className="history-list">{snapshots.length === 0 && <p>Aún no hay versiones manuales. El autoguardado ya está activo.</p>}{snapshots.map(snapshot => <button key={snapshot.snapshotId} onClick={() => onRestore(snapshot)}><ArchiveRestore size={15} /><span><b>{snapshot.name}</b><small>{new Date(snapshot.updatedAt).toLocaleString('es-MX')}</small></span><ChevronRight size={14} /></button>)}</div>
    <div className="drawer-note"><LockKeyhole size={15} /><p>Los proyectos en Firebase solo pueden ser leídos o modificados por su usuario autenticado. Nunca se almacenan contraseñas en este cliente.</p></div>
  </aside></div>;
}

function NodeEditor({ selection, onClose, onApply }) {
  const [tag, setTag] = useState(selection?.node.tag || '');
  const [value, setValue] = useState(selection?.node.value || '');
  useEffect(() => { setTag(selection?.node.tag || ''); setValue(selection?.node.value || ''); }, [selection]);
  if (!selection) return null;
  return <div className="mini-modal-backdrop" onMouseDown={onClose}><form className="node-editor" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); onApply(tag, value); }}>
    <div className="modal-head"><div><span className="step">INSTRUCCIÓN {selection.node.type}</span><h2>Editar bloque</h2></div><button type="button" onClick={onClose}><X size={18} /></button></div>
    <label className="field-label">ETIQUETA<input autoFocus value={tag} maxLength={40} pattern="[^<>]*" onChange={event => setTag(event.target.value)} required /></label>
    {['TON', 'CTU'].includes(selection.node.type) && <label className="field-label">PRESET<input value={value} maxLength={16} pattern="[0-9A-Za-z._ -]*" onChange={event => setValue(event.target.value)} placeholder={selection.node.type === 'TON' ? '3s' : '10'} /></label>}
    <button className="apply-button" type="submit"><Check size={15} />Aplicar cambios</button>
  </form></div>;
}

function Simulation({ processLive, paused, emergency, gateOpen, jam, speed, boxes, completed, detections, sensorActive, onEmergency, onGate, onJam, onReset, onSpeed }) {
  const state = emergency ? 'PARO DE EMERGENCIA' : gateOpen ? 'PUERTA ABIERTA' : jam ? 'ATASCO DETECTADO' : paused ? 'EN PAUSA' : processLive ? 'EN MARCHA' : 'DETENIDO';
  const alarm = emergency || gateOpen || jam;
  return <aside className="sim-pane">
    <div className="sim-header"><div><span className="step">GEMELO DIGITAL · EN VIVO</span><h2>Línea de transporte A</h2></div><div className={`safety-state ${alarm ? 'alarm' : 'safe'}`}><ShieldCheck size={15} />{alarm ? 'INTERLOCK' : 'SEGURO'}</div></div>
    <div className={`sim-stage ${alarm ? 'stage-alarm' : ''}`} style={{ '--belt-speed': `${0.65 / speed}s` }}>
      <div className="stage-grid" /><div className="ambient-glow" /><div className={`stack-light ${processLive ? 'on' : ''} ${alarm ? 'alarm' : ''}`}><i /><i /><i /></div>
      <div className="safety-fence fence-back"><i /><i /><i /><i /><i /><i /></div>
      <button className={`safety-gate ${gateOpen ? 'open' : ''}`} onClick={onGate} title="Abrir o cerrar puerta de seguridad"><span>G1</span><i /></button>
      <div className={`scanner ${sensorActive ? 'active' : ''}`}><i /><span>S1</span></div>
      <div className={`conveyor ${processLive ? 'moving' : ''} ${jam ? 'jammed' : ''}`}><div className="belt"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="frame"><i /><i /><i /><i /></div>{boxes.map((position, index) => <div className={`product-box product-${index + 1} ${sensorActive && position > 37 && position < 47 ? 'scanned' : ''}`} key={index} style={{ left: `${position}%` }}><Box size={42 + index * 3} strokeWidth={1.35} /><span>BX-{String(index + 1).padStart(2, '0')}</span></div>)}</div>
      <div className={`motor-unit ${processLive ? 'spinning' : ''}`}><div className="motor-body"><i /><i /><i /><i /></div><span>M1</span></div><div className={`diverter ${sensorActive && processLive ? 'active' : ''}`}><i /><span>D1</span></div>
      <button className={`emergency-stop ${emergency ? 'pressed' : ''}`} onClick={onEmergency} aria-label="Paro de emergencia"><i /><b>EMERGENCY</b><span>STOP</span></button>
      {alarm && <div className="alarm-banner"><AlertTriangle size={16} />{state}<span>La potencia del motor fue aislada</span></div>}
      <div className="floor-label"><span>ZONE 01 / SAFETY CAT. 3</span><b>TRANSFER LINE A</b></div>
    </div>
    <div className="sim-readout"><div><span>ESTADO</span><b className={processLive ? 'good' : alarm ? 'danger' : paused ? 'warn' : ''}>{state}</b></div><div><span>VELOCIDAD</span><b>{processLive ? (0.42 * speed).toFixed(2) : '0.00'} m/s</b></div><div><span>PRODUCCIÓN</span><b>{completed} cajas</b></div></div>
    <div className="safety-console"><div className="console-top"><span>CONTROL DE PROCESO</span><small>{detections} detecciones</small></div><label className="speed-control"><Gauge size={15} /><span>Velocidad</span><input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={event => onSpeed(Number(event.target.value))} /><b>{speed.toFixed(1)}×</b></label><div className="safety-buttons"><button className={gateOpen ? 'unsafe' : ''} onClick={onGate}><LockKeyhole size={14} />{gateOpen ? 'Cerrar puerta' : 'Abrir puerta'}</button><button className={jam ? 'unsafe' : ''} onClick={onJam}><AlertTriangle size={14} />{jam ? 'Atasco activo' : 'Simular atasco'}</button><button onClick={onReset} disabled={!alarm}><RefreshCcw size={14} />Reset alarmas</button></div></div>
  </aside>;
}

function LadderApp({ onOpenGeneral }) {
  const initial = useMemo(() => loadImmediate(fallbackProject), []);
  const [projectId, setProjectId] = useState(initial.id);
  const [projectName, setProjectName] = useState(initial.name);
  const [rungs, setRungs] = useState(initial.rungs.length ? initial.rungs : starterRungs);
  const [selectedPractice, setSelectedPractice] = useState(initial.selectedPractice);
  const [speed, setSpeed] = useState(initial.speed);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [jam, setJam] = useState(false);
  const [boxes, setBoxes] = useState([-18, 20, 58]);
  const [completed, setCompleted] = useState(0);
  const [detections, setDetections] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState('editor');
  const [bottomTab, setBottomTab] = useState('symbols');
  const [bottomOpen, setBottomOpen] = useState(true);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [showPractices, setShowPractices] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [selection, setSelection] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [projects, setProjects] = useState([]);
  const [storageStatus, setStorageStatus] = useState('saved');
  const [cloudStatus, setCloudStatus] = useState(firebaseConfigured ? 'available' : 'disabled');
  const [logs, setLogs] = useState([{ time: new Date(), type: 'ok', text: 'Sesión local protegida y lista.' }]);
  const fileRef = useRef(null);
  const projectRef = useRef(initial);
  const detectedRef = useRef(false);
  const unsafe = emergency || gateOpen || jam;
  const processLive = running && !paused && !unsafe;
  const sensorActive = boxes.some(position => position > 37 && position < 47);
  const notify = useCallback(message => setToast(message), []);
  const addLog = useCallback((text, type = 'info') => setLogs(previous => [{ time: new Date(), type, text }, ...previous].slice(0, 40)), []);
  const currentProject = useCallback((updatedAt = Date.now()) => validateProject(createProject({ id: projectId, name: projectName, selectedPractice, speed, rungs, updatedAt })), [projectId, projectName, selectedPractice, speed, rungs]);

  useEffect(() => {
    let cancelled = false;
    loadIndexed(projectId).then(indexed => { if (!cancelled && indexed?.updatedAt > initial.updatedAt) { setProjectName(indexed.name); setRungs(indexed.rungs); setSelectedPractice(indexed.selectedPractice); setSpeed(indexed.speed); notify('Se recuperó una versión local más reciente'); } });
    listSnapshots(projectId).then(items => !cancelled && setSnapshots(items));
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const project = currentProject(); projectRef.current = project; setStorageStatus('saving');
    try { saveImmediate(project); } catch { setStorageStatus('error'); return undefined; }
    const indexedTimer = setTimeout(() => saveIndexed(project).then(() => setStorageStatus('saved')).catch(() => setStorageStatus('local-only')), 450);
    const cloudTimer = cloudStatus === 'ready' ? setTimeout(() => cloudApi().then(api => api.saveCloudProject(project)).catch(() => setCloudStatus('error')), 2600) : null;
    return () => { clearTimeout(indexedTimer); if (cloudTimer) clearTimeout(cloudTimer); };
  }, [currentProject, cloudStatus]);

  useEffect(() => { const handlePageHide = () => { try { saveImmediate(projectRef.current); } catch { /* browser storage unavailable */ } }; window.addEventListener('pagehide', handlePageHide); return () => window.removeEventListener('pagehide', handlePageHide); }, []);
  useEffect(() => { if (showProjects) listProjects().then(setProjects); }, [showProjects, storageStatus, projectId]);
  useEffect(() => { if (!processLive) return undefined; const timer = setInterval(() => { setElapsed(value => value + 0.06 * speed); setBoxes(previous => previous.map(position => { const next = position + 0.34 * speed; if (next > 108) { setCompleted(value => value + 1); return -18; } return next; })); }, 60); return () => clearInterval(timer); }, [processLive, speed]);
  useEffect(() => { if (sensorActive && !detectedRef.current) { detectedRef.current = true; setDetections(value => value + 1); } if (!sensorActive) detectedRef.current = false; }, [sensorActive]);
  useEffect(() => { if (unsafe && running) addLog(emergency ? 'Paro de emergencia activado: motor aislado.' : gateOpen ? 'Puerta G1 abierta: interlock activo.' : 'Atasco simulado: línea detenida.', 'alarm'); }, [unsafe]);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);

  const run = () => { if (unsafe) { notify('Restablece los dispositivos de seguridad antes de arrancar'); addLog('Arranque rechazado por el circuito de seguridad.', 'alarm'); return; } setRunning(true); setPaused(false); addLog('Motor M1 energizado. Producción iniciada.', 'ok'); };
  const stop = () => { setRunning(false); setPaused(false); addLog('Parada controlada del proceso.'); };
  const resetSafety = () => { setEmergency(false); setGateOpen(false); setJam(false); setPaused(false); addLog('Circuito de seguridad restablecido.', 'ok'); notify('Alarmas restablecidas'); };
  const saveVersion = async () => { const project = currentProject(); try { saveImmediate(project); await saveIndexed(project, true); await requestDurableStorage(); if (cloudStatus === 'ready') await cloudApi().then(api => api.saveCloudProject(project)).catch(() => setCloudStatus('error')); setSnapshots(await listSnapshots(project.id)); setStorageStatus('saved'); notify('Versión protegida correctamente'); addLog('Punto de recuperación creado.', 'ok'); } catch { notify('La copia local básica se conserva; no se pudo crear la versión'); } };
  const connectCloud = async () => {
    if (!firebaseConfigured || cloudStatus === 'connecting') return;
    setCloudStatus('connecting');
    try {
      const api = await cloudApi(); await api.initializeCloud(); setCloudStatus('ready');
      const cloud = await api.loadCloudProject(projectId);
      if (cloud?.updatedAt > projectRef.current.updatedAt) { const safe = validateProject(cloud); setProjectName(safe.name); setRungs(safe.rungs); setSelectedPractice(safe.selectedPractice); setSpeed(safe.speed); notify('Se recuperó la copia más reciente de Firebase'); }
      else await api.saveCloudProject(currentProject());
      addLog('Sincronización privada con Firebase activada.', 'ok'); notify('Nube privada conectada');
    } catch { setCloudStatus('error'); notify('Firebase Auth aún no está habilitado para este proyecto'); addLog('Firebase rechazó la conexión; las copias locales siguen protegidas.', 'alarm'); }
  };
  const importProject = async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { await saveIndexed(currentProject(), true); const imported = await readProjectFile(file); setProjectId(imported.id); setProjectName(imported.name); setRungs(imported.rungs); setSelectedPractice(imported.selectedPractice); setSpeed(imported.speed); setShowProjects(false); notify('Proyecto validado e importado'); addLog(`Proyecto ${imported.name} importado.`, 'ok'); } catch (error) { notify(error instanceof SyntaxError ? 'El archivo está dañado o no es JSON válido' : error.message); } };
  const newProject = async () => { await saveIndexed(currentProject(), true).catch(() => {}); const fresh = createProject({ name: 'Proyecto sin título', selectedPractice: 0, speed: 1, rungs: [{ id: Date.now(), nodes: [] }] }); setProjectId(fresh.id); setProjectName(fresh.name); setRungs(fresh.rungs); setSelectedPractice(0); setSpeed(1); setShowProjects(false); stop(); notify('Proyecto nuevo creado; el anterior quedó respaldado'); };
  const restoreSnapshot = snapshot => { const safe = validateProject({ ...snapshot, updatedAt: Date.now() }); setProjectName(safe.name); setRungs(safe.rungs); setSelectedPractice(safe.selectedPractice); setSpeed(safe.speed); setShowProjects(false); notify('Versión restaurada'); addLog('Se restauró un punto del historial.', 'ok'); };
  const loadSavedProject = async saved => { await saveIndexed(currentProject()).catch(() => {}); const safe = validateProject(saved); setProjectId(safe.id); setProjectName(safe.name); setRungs(safe.rungs); setSelectedPractice(safe.selectedPractice); setSpeed(safe.speed); setShowProjects(false); stop(); notify(`Proyecto abierto: ${safe.name}`); };
  const addNode = (rungIndex, item) => setRungs(previous => previous.map((rung, index) => index === rungIndex ? { ...rung, nodes: [...rung.nodes, { type: item.type, tag: item.type === 'NO' ? 'Input' : item.type === 'COIL' ? 'Output' : item.type, value: item.type === 'TON' ? '2s' : item.type === 'CTU' ? '10' : undefined }] } : rung));
  const removeNode = (ri, ni) => setRungs(previous => previous.map((rung, index) => index === ri ? { ...rung, nodes: rung.nodes.filter((_, nodeIndex) => nodeIndex !== ni) } : rung));
  const editNode = (tag, value) => { const cleanTag = tag.trim().slice(0, 40); setRungs(previous => previous.map((rung, ri) => ri === selection.rung ? { ...rung, nodes: rung.nodes.map((node, ni) => ni === selection.index ? { ...node, tag: cleanTag, ...(value.trim() ? { value: value.trim().slice(0, 16) } : {}) } : node) } : rung)); setSelection(null); notify('Instrucción actualizada'); };
  const clearProgram = async () => { await saveIndexed(currentProject(), true).catch(() => {}); setRungs([{ id: Date.now(), nodes: [] }]); stop(); notify('Lienzo limpio; se conservó una versión anterior'); };
  const loadPractice = (practice, index) => { setSelectedPractice(index); setProjectName(practice.title); setRungs(cloneRungs(practice.nodes)); setShowPractices(false); stop(); setCompleted(0); setDetections(0); notify(`Práctica cargada: ${practice.title}`); };

  const timerValue = processLive ? Math.min(3, Math.floor(elapsed) % 4) : 0;
  const variables = useMemo(() => [
    { name: 'Start', addr: '%I0.0', type: 'BOOL', value: running }, { name: 'E_Stop', addr: '%I0.1', type: 'BOOL', value: emergency }, { name: 'Gate', addr: '%I0.2', type: 'BOOL', value: gateOpen }, { name: 'Sensor_1', addr: '%I0.3', type: 'BOOL', value: sensorActive }, { name: 'Motor', addr: '%Q0.0', type: 'BOOL', value: processLive }, { name: 'T1', addr: '%TM1', type: 'TIMER', value: `${timerValue}.0 s` }, { name: 'Counter', addr: '%C0', type: 'INT', value: completed }, { name: 'Safety_OK', addr: '%M0.0', type: 'BOOL', value: !unsafe },
  ], [running, emergency, gateOpen, sensorActive, processLive, timerValue, completed, unsafe]);
  const project = currentProject(projectRef.current.updatedAt || Date.now());

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><ListTree size={19} /></span><span>LADDER<b>LAB</b></span></div><nav className="module-switch" aria-label="Áreas del laboratorio"><button className="active"><Layers3 size={14} />Ladder</button><button onClick={onOpenGeneral}><CircuitBoard size={14} />General</button></nav><button className="mobile-menu" onClick={() => setMobileNav(value => !value)} aria-label="Abrir navegación"><Menu size={19} /></button><div className="project-control"><span className="eyebrow">PROYECTO</span><button onClick={() => setShowProjects(true)}>{projectName}<ChevronDown size={14} /></button></div><button className="icon-btn save-btn" onClick={saveVersion} title="Guardar versión"><Save size={18} /></button><nav className="workspace-tabs" aria-label="Vistas"><button className={activeTab === 'editor' ? 'active' : ''} onClick={() => setActiveTab('editor')}><ListTree size={15} />Editor</button><button className={activeTab === 'simulation' ? 'active' : ''} onClick={() => setActiveTab('simulation')}><Activity size={15} />Simulación</button></nav><div className="run-controls"><button className={`run ${processLive ? 'active' : ''}`} onClick={run}><Play size={15} fill="currentColor" />Ejecutar</button><button className={paused ? 'active-pause' : ''} onClick={() => running && setPaused(value => !value)} title="Pausar"><Pause size={16} /></button><button onClick={stop} title="Detener"><CircleStop size={16} /></button></div><button className={`cloud-indicator ${cloudStatus}`} onClick={() => setShowProjects(true)} title="Estado del respaldo"><span className="status-dot" />{cloudStatus === 'ready' ? 'Nube privada' : 'Guardado local'}<small>{storageStatus === 'saving' ? 'guardando…' : 'protegido'}</small></button><button className="user-avatar" aria-label="Perfil">ZK</button></header>
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}><div className="sidebar-heading"><span>EXPLORADOR</span><button onClick={() => setMobileNav(false)} aria-label="Cerrar navegación"><X size={16} /></button></div><button className="search"><Search size={15} /><span>Buscar práctica...</span><kbd>⌘K</kbd></button><button className="library" onClick={() => setShowProjects(true)}><FolderOpen size={16} />Mis proyectos <span>LOCAL</span></button><div className="section-label"><span>PRÁCTICAS</span><button onClick={() => setShowPractices(true)}>VER TODAS</button></div><div className="practice-list">{practices.map((practice, index) => <button key={practice.n} className={selectedPractice === index ? 'selected' : ''} onClick={() => loadPractice(practice, index)}><span className="practice-no">{practice.n}</span><span><b>{practice.title}</b><small>{practice.level}</small></span>{selectedPractice === index && <ChevronRight size={15} />}</button>)}</div><div className="system-health"><div><ShieldCheck size={15} /><span>PROTECCIÓN DE SESIÓN</span></div><ul><li><i />Autoguardado inmediato</li><li><i />Historial recuperable</li><li><i />Validación de archivos</li></ul></div><div className="sidebar-footer"><button onClick={() => setShowPractices(true)}><BookOpen size={15} />Guía de prácticas</button><a href="https://zolvek.com.mx" target="_blank" rel="noreferrer">Creado por zolvek.com.mx</a></div></aside>
    <main className="workspace">
      <section className={`editor-pane ${activeTab === 'simulation' ? 'mobile-hidden' : ''}`}><div className="pane-header"><div><span className="step">PRÁCTICA {String(selectedPractice + 1).padStart(2, '0')} · IEC 61131-3</span><h1>{projectName}</h1><p>Programa, prueba interlocks y observa el ciclo en tiempo real.</p></div><button className={`save-state ${storageStatus}`} onClick={() => setShowProjects(true)}><span className="status-dot" />{storageStatus === 'saving' ? 'Guardando cambios…' : 'Cambios protegidos'}</button></div><div className="editor-toolbar"><div className="palette-title"><Layers3 size={15} />INSTRUCCIONES</div><div className="palette-scroll">{palette.map(item => <button key={item.type} draggable onClick={() => addNode(rungs.length - 1, item)} onDragStart={event => event.dataTransfer.setData('application/json', JSON.stringify(item))} title={`Arrastrar o pulsar: ${item.label}`} aria-label={`Agregar ${item.label}`}><span>{item.symbol}</span><small>{item.type}</small></button>)}</div><button className="toolbar-icon" onClick={clearProgram} title="Limpiar programa"><Trash2 size={15} /></button></div><div className="ladder-canvas"><div className="rail left-rail" /><div className="rail right-rail" />{rungs.map((rung, ri) => <div className={`rung ${processLive && ri <= timerValue ? 'rung-live' : ''}`} key={rung.id} onDragOver={event => { event.preventDefault(); event.currentTarget.classList.add('drag-over'); }} onDragLeave={event => event.currentTarget.classList.remove('drag-over')} onDrop={event => { event.preventDefault(); event.currentTarget.classList.remove('drag-over'); try { addNode(ri, JSON.parse(event.dataTransfer.getData('application/json'))); } catch { notify('La instrucción arrastrada no es válida'); } }}><span className="rung-no">{String(ri + 1).padStart(3, '0')}</span><div className="nodes">{rung.nodes.map((node, ni) => <Instruction key={`${node.tag}-${ni}`} node={node} active={processLive && (node.tag !== 'Sensor_1' || sensorActive)} onRemove={() => removeNode(ri, ni)} onEdit={() => setSelection({ rung: ri, index: ni, node })} />)}{!rung.nodes.length && <span className="drop-hint">Arrastra una instrucción aquí</span>}</div></div>)}<button className="add-rung" onClick={() => setRungs(previous => [...previous, { id: Date.now(), nodes: [] }])}><Plus size={15} />Agregar rung</button></div></section>
      <div className={activeTab === 'editor' ? 'mobile-hidden-sim sim-wrapper' : 'sim-wrapper'}><Simulation processLive={processLive} paused={paused} emergency={emergency} gateOpen={gateOpen} jam={jam} speed={speed} boxes={boxes} completed={completed} detections={detections} sensorActive={sensorActive} onEmergency={() => setEmergency(value => !value)} onGate={() => setGateOpen(value => !value)} onJam={() => setJam(value => !value)} onReset={resetSafety} onSpeed={setSpeed} /></div>
      <section className={`bottom-panel ${bottomOpen ? '' : 'collapsed'}`}><div className="bottom-tabs"><button className={bottomTab === 'terminal' ? 'active' : ''} onClick={() => setBottomTab('terminal')}>Eventos <span>{logs.length}</span></button><button className={bottomTab === 'symbols' ? 'active' : ''} onClick={() => setBottomTab('symbols')}>Símbolos <span>{variables.length}</span></button><button className={bottomTab === 'instructions' ? 'active' : ''} onClick={() => setBottomTab('instructions')}>Diagnóstico</button><button className="collapse-btn" onClick={() => setBottomOpen(value => !value)} aria-label="Contraer panel"><PanelBottomClose size={16} /></button></div>{bottomOpen && <div className="bottom-content">{bottomTab === 'symbols' && <div className="symbol-table"><div className="table-head"><span>NOMBRE</span><span>DIRECCIÓN</span><span>TIPO</span><span>VALOR</span></div>{variables.map(variable => <div className="table-row" key={variable.name}><span><i className={`tiny-dot ${variable.value === true ? 'active' : ''}`} />{variable.name}</span><code>{variable.addr}</code><span>{variable.type}</span><b>{typeof variable.value === 'boolean' ? (variable.value ? 'TRUE' : 'FALSE') : variable.value}</b></div>)}</div>}{bottomTab === 'terminal' && <div className="terminal">{logs.map((log, index) => <p className={log.type} key={`${log.time.getTime()}-${index}`}><span>[{log.time.toLocaleTimeString('es-MX')}]</span>{log.text}</p>)}</div>}{bottomTab === 'instructions' && <div className="diagnostics"><div><ShieldCheck size={20} /><span><b>Safety chain</b><small>{unsafe ? 'Interlock abierto' : 'Todos los dispositivos OK'}</small></span></div><div><Wifi size={20} /><span><b>Scan virtual</b><small>12 ms · Sin pérdida de ciclo</small></span></div><div><Save size={20} /><span><b>Persistencia</b><small>LocalStorage + IndexedDB + archivo</small></span></div></div>}</div>}</section>
    </main>
    {showPractices && <div className="modal-backdrop" onMouseDown={() => setShowPractices(false)}><div className="practice-modal" onMouseDown={event => event.stopPropagation()}><div className="modal-art"><div><span>LABORATORIO DE AUTOMATIZACIÓN</span><h2>Entrena con procesos que reaccionan</h2><p>Prueba fallos, interlocks y secuencias sin poner una máquina real en riesgo.</p></div></div><div className="modal-content"><div className="modal-head"><div><span className="step">BIBLIOTECA</span><h2>Prácticas disponibles</h2></div><button onClick={() => setShowPractices(false)}><X size={18} /></button></div><div className="practice-grid">{practices.map((practice, index) => <button key={practice.n} onClick={() => loadPractice(practice, index)}><span>{practice.n}</span><div><small>{practice.level}</small><h3>{practice.title}</h3><p>{practice.desc}</p></div><ChevronRight size={16} /></button>)}</div></div></div></div>}
    <ProjectManager open={showProjects} onClose={() => setShowProjects(false)} project={project} projects={projects} onLoadProject={loadSavedProject} onRename={setProjectName} onSave={saveVersion} onExport={() => downloadProject(currentProject())} onImport={importProject} onNew={newProject} snapshots={snapshots} onRestore={restoreSnapshot} storageStatus={storageStatus} cloudStatus={cloudStatus} onConnect={connectCloud} fileRef={fileRef} />
    <NodeEditor selection={selection} onClose={() => setSelection(null)} onApply={editNode} />{toast && <div className="toast"><span className="status-dot" />{toast}</div>}
  </div>;
}

function App() {
  const [module, setModule] = useState(() => {
    if (location.hash === '#general') return 'general';
    try { return sessionStorage.getItem('ladderlab.active-module') === 'general' ? 'general' : 'ladder'; } catch { return 'ladder'; }
  });
  const openModule = next => {
    setModule(next);
    history.replaceState(null, '', next === 'general' ? '#general' : `${location.pathname}${location.search}`);
    try { sessionStorage.setItem('ladderlab.active-module', next); } catch { /* Session storage can be disabled. */ }
  };
  useEffect(() => {
    const handleHash = () => setModule(location.hash === '#general' ? 'general' : 'ladder');
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);
  return module === 'general'
    ? <GeneralLab onOpenLadder={() => openModule('ladder')} />
    : <LadderApp onOpenGeneral={() => openModule('general')} />;
}

if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true });
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
