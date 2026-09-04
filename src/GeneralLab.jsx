import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Cable, CircuitBoard, Copy, Download, FilePlus2, Grid3X3, Info,
  ListTree, Maximize2, MousePointer2, Pause, Play, Power, Redo2, RotateCw,
  Save, Search, ShieldCheck, Trash2, Undo2, Upload, Zap, ZoomIn, ZoomOut
} from 'lucide-react';
import { componentTerminals, solveCircuit } from './circuitEngine';
import {
  backupGeneralProject, createGeneralProject, downloadGeneralProject, loadGeneralBackup,
  loadGeneralImmediate, loadGeneralIndexed, readGeneralProject, saveGeneralImmediate,
  saveGeneralIndexed, starterGeneralProject, validateGeneralProject
} from './generalStorage';
import './general.css';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 720;
const GRID_SIZE = 20;
const WIRE_COLORS = ['green', 'red', 'blue', 'black', 'orange', 'purple'];

const definitions = {
  dc: { name: 'Fuente DC', prefix: 'V', unit: 'V', initial: 9, category: 'Fuentes' },
  ac: { name: 'Fuente AC', prefix: 'VAC', unit: 'V', initial: 12, category: 'Fuentes' },
  ground: { name: 'Tierra', prefix: 'GND', unit: '', initial: 0, category: 'Fuentes' },
  resistor: { name: 'Resistencia', prefix: 'R', unit: 'Ω', initial: 1000, category: 'Pasivos' },
  potentiometer: { name: 'Potenciómetro', prefix: 'RV', unit: 'Ω', initial: 10000, category: 'Pasivos' },
  capacitor: { name: 'Capacitor', prefix: 'C', unit: 'µF', initial: 100, category: 'Pasivos' },
  inductor: { name: 'Inductor', prefix: 'L', unit: 'mH', initial: 10, category: 'Pasivos' },
  ldr: { name: 'Fotoresistencia', prefix: 'LDR', unit: 'Ω', initial: 5000, category: 'Sensores' },
  thermistor: { name: 'Termistor NTC', prefix: 'RT', unit: 'Ω', initial: 10000, category: 'Sensores' },
  switch: { name: 'Interruptor', prefix: 'SW', unit: '', initial: 0, category: 'Control' },
  button: { name: 'Pulsador', prefix: 'PB', unit: '', initial: 0, category: 'Control' },
  fuse: { name: 'Fusible', prefix: 'F', unit: 'A', initial: 5, category: 'Control' },
  diode: { name: 'Diodo', prefix: 'D', unit: '', initial: 80, category: 'Semiconductores' },
  zener: { name: 'Diodo Zener', prefix: 'DZ', unit: 'V', initial: 5.1, category: 'Semiconductores' },
  led: { name: 'LED', prefix: 'LED', unit: '', initial: 120, category: 'Semiconductores' },
  lamp: { name: 'Lámpara', prefix: 'LA', unit: 'Ω', initial: 120, category: 'Salidas' },
  motor: { name: 'Motor DC', prefix: 'M', unit: 'Ω', initial: 90, category: 'Salidas' },
  buzzer: { name: 'Zumbador', prefix: 'BZ', unit: 'Ω', initial: 220, category: 'Salidas' },
  voltmeter: { name: 'Voltímetro', prefix: 'VM', unit: 'V', initial: 0, category: 'Instrumentos' },
  ammeter: { name: 'Amperímetro', prefix: 'AM', unit: 'A', initial: 0, category: 'Instrumentos' },
};

const categories = ['Fuentes', 'Pasivos', 'Sensores', 'Control', 'Semiconductores', 'Salidas', 'Instrumentos'];
const snapValue = value => Math.round(value / GRID_SIZE) * GRID_SIZE;
const formatValue = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '0';

function rotatePoint(point, degrees) {
  const radians = (degrees || 0) * Math.PI / 180;
  const dx = point.x - 60;
  const dy = point.y - 50;
  return { x: 60 + dx * Math.cos(radians) - dy * Math.sin(radians), y: 50 + dx * Math.sin(radians) + dy * Math.cos(radians) };
}

function terminalPoint(component, terminal) {
  if (component.type === 'ground') return rotatePoint({ x: 60, y: 14 }, component.rotation);
  const terminals = componentTerminals[component.type] || [];
  return rotatePoint({ x: terminals.indexOf(terminal) === 0 ? 12 : 108, y: 50 }, component.rotation);
}

function terminalPosition(component, terminal) {
  const point = terminalPoint(component, terminal);
  return { x: component.x + point.x, y: component.y + point.y };
}

function endpointPosition(endpoint, components) {
  const component = components.find(item => item.id === endpoint?.componentId);
  return component ? terminalPosition(component, endpoint.terminal) : null;
}

function wirePath(from, to) {
  if (!from || !to) return '';
  if (Math.abs(from.x - to.x) < 4 || Math.abs(from.y - to.y) < 4) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const middleX = snapValue((from.x + to.x) / 2);
  return `M ${from.x} ${from.y} H ${middleX} V ${to.y} H ${to.x}`;
}

function CircuitSymbol({ component, reading, powered, compact = false }) {
  const active = powered && (reading?.brightness > 0.05 || ['dc', 'ac', 'voltmeter', 'ammeter'].includes(component.type));
  const common = { viewBox: '0 0 96 54', 'aria-hidden': true };
  const line = <path d="M0 27H20M76 27H96" />;
  if (component.type === 'resistor') return <svg {...common}>{line}<path d="M20 27l6-12 9 24 9-24 9 24 9-24 8 12h6" /></svg>;
  if (component.type === 'potentiometer') return <svg {...common}>{line}<rect x="20" y="18" width="56" height="18" rx="1" /><path d="M48 4v14m-6-7 6 7 6-7" /></svg>;
  if (component.type === 'ldr') return <svg {...common}>{line}<circle cx="48" cy="27" r="22" /><rect x="28" y="20" width="40" height="14" rx="1" /><path d="M69 4l-9 10m11-3-9 10" /></svg>;
  if (component.type === 'thermistor') return <svg {...common}>{line}<rect x="20" y="18" width="56" height="18" rx="1" /><path d="M31 43L61 11m-4 0h10v10" /></svg>;
  if (component.type === 'capacitor') return <svg {...common}>{line}<path d="M39 9v36M57 9v36" /></svg>;
  if (component.type === 'inductor') return <svg {...common}><path d="M0 27h20c0-15 14-15 14 0 0-15 14-15 14 0 0-15 14-15 14 0 0-15 14-15 14 0h20" /></svg>;
  if (component.type === 'dc') return <svg {...common}>{line}<circle cx="48" cy="27" r="22" /><path d="M38 14v26M58 19v16" /><text x="33" y="12">+</text><text x="57" y="13">−</text></svg>;
  if (component.type === 'ac') return <svg {...common}>{line}<circle cx="48" cy="27" r="22" /><path d="M32 28c5-14 11-14 16 0s11 14 16 0" /></svg>;
  if (component.type === 'ground') return <svg {...common}><path d="M48 0v25M24 26h48M32 35h32M40 44h16" /></svg>;
  if (component.type === 'switch' || component.type === 'button') return <svg {...common}>{line}<circle cx="25" cy="27" r="3" /><circle cx="71" cy="27" r="3" /><path className="moving-contact" d={component.state ? 'M25 27H71' : 'M25 27L68 12'} />{component.type === 'button' && <path d="M48 3v11m-12 0h24" />}</svg>;
  if (component.type === 'fuse') return <svg {...common}>{line}<rect x="20" y="18" width="56" height="18" rx="8" /><path d="M28 27c8-8 32 8 40 0" /></svg>;
  if (component.type === 'diode' || component.type === 'zener' || component.type === 'led') return <span className={`semiconductor-symbol ${active ? 'lit' : ''}`} style={{ '--intensity': reading?.brightness || 0 }}><svg {...common}>{line}<path d="M27 10v34l39-17zM66 10v34" />{component.type === 'zener' && <path d="M61 10h10m-10 34h10" />}{component.type === 'led' && <path className="light-rays" d="M61 8l10-7m-5 13 11-7" />}</svg></span>;
  if (component.type === 'lamp') return <span className={`output-symbol ${active ? 'lit' : ''}`} style={{ '--intensity': reading?.brightness || 0 }}><svg {...common}>{line}<circle cx="48" cy="27" r="22" /><path d="M33 12l30 30M63 12L33 42" /></svg></span>;
  if (component.type === 'motor') return <span className={`output-symbol motor ${active ? 'lit' : ''}`} style={{ '--intensity': reading?.brightness || 0 }}><svg {...common}>{line}<circle cx="48" cy="27" r="22" /><text x="40" y="34">M</text></svg></span>;
  if (component.type === 'buzzer') return <span className={`output-symbol buzzer ${active ? 'lit' : ''}`} style={{ '--intensity': reading?.brightness || 0 }}><svg {...common}>{line}<path d="M27 20h10l14-11v36L37 34H27zM59 18c8 5 8 13 0 18m7-25c15 10 15 23 0 33" /></svg></span>;
  if (component.type === 'voltmeter' || component.type === 'ammeter') return <span className="meter-symbol"><svg {...common}>{line}<circle cx="48" cy="27" r="22" /><text x="41" y="34">{component.type === 'voltmeter' ? 'V' : 'A'}</text></svg>{!compact && <b>{formatValue(component.type === 'voltmeter' ? reading?.voltage : reading?.current, 3)}</b>}</span>;
  return null;
}

function CircuitComponent({ component, selected, connection, reading, powered, zoom, snap, onSelect, onMove, onMoveStart, onTerminal, onToggle }) {
  const drag = useRef(null);
  const terminals = componentTerminals[component.type] || [];
  const handlePointerDown = event => {
    if (event.button !== 0 || event.target.closest('.component-terminal') || event.target.closest('.component-interaction')) return;
    event.stopPropagation(); onSelect(); onMoveStart();
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: component.x, y: component.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = event => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    let x = drag.current.x + (event.clientX - drag.current.startX) / zoom;
    let y = drag.current.y + (event.clientY - drag.current.startY) / zoom;
    if (snap) { x = snapValue(x); y = snapValue(y); }
    onMove(Math.max(0, Math.min(CANVAS_WIDTH - 120, x)), Math.max(0, Math.min(CANVAS_HEIGHT - 110, y)));
  };
  const stopDrag = event => { if (drag.current?.pointer === event.pointerId) drag.current = null; };
  return <article className={`circuit-component type-${component.type} ${selected ? 'selected' : ''} ${powered ? 'powered' : ''}`} style={{ transform: `translate(${component.x}px, ${component.y}px)` }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} aria-label={`${definitions[component.type]?.name}: ${component.label}`}>
    <span className="component-label">{component.label}</span>
    <div className="component-symbol-wrap" style={{ transform: `rotate(${component.rotation || 0}deg)` }}>
      {['switch', 'button'].includes(component.type) ? <button className="component-interaction" onClick={event => { event.stopPropagation(); onToggle(); }} aria-label={`${component.state ? 'Abrir' : 'Cerrar'} ${component.label}`}><CircuitSymbol component={component} reading={reading} powered={powered} /></button> : <CircuitSymbol component={component} reading={reading} powered={powered} />}
    </div>
    {terminals.map(terminal => { const point = terminalPoint(component, terminal); return <button key={terminal} className={`component-terminal ${connection?.componentId === component.id && connection?.terminal === terminal ? 'connecting' : ''}`} style={{ left: point.x, top: point.y }} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onTerminal(terminal); }} aria-label={`Terminal ${terminal} de ${component.label}`} title={`Conectar terminal ${terminal}`}><i /><small>{terminal}</small></button>; })}
    {definitions[component.type]?.unit && !['voltmeter', 'ammeter'].includes(component.type) && <span className="component-value">{formatValue(component.value)} {definitions[component.type].unit}</span>}
  </article>;
}

function GeneralLab({ onOpenLadder }) {
  const initial = useMemo(loadGeneralImmediate, []);
  const [projectId, setProjectId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [components, setComponents] = useState(initial.components);
  const [wires, setWires] = useState(initial.wires);
  const [powered, setPowered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tripped, setTripped] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedWire, setSelectedWire] = useState(null);
  const [connection, setConnection] = useState(null);
  const [pointer, setPointer] = useState(null);
  const [search, setSearch] = useState('');
  const [storageStatus, setStorageStatus] = useState('saved');
  const [toast, setToast] = useState('');
  const [samples, setSamples] = useState(Array(100).fill(0));
  const [simTime, setSimTime] = useState(0);
  const [zoom, setZoom] = useState(0.85);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [scopeOpen, setScopeOpen] = useState(true);
  const [, setHistoryVersion] = useState(0);
  const fileRef = useRef(null);
  const projectRef = useRef(initial);
  const surfaceRef = useRef(null);
  const viewportRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const activePower = powered && !paused && !tripped;
  const effectiveComponents = useMemo(() => components.map(component => component.type === 'ac' ? { ...component, value: component.value * Math.sin(2 * Math.PI * simTime) } : component), [components, simTime]);
  const simulation = useMemo(() => solveCircuit(effectiveComponents, wires, activePower), [effectiveComponents, wires, activePower]);
  const selected = components.find(component => component.id === selectedId) || null;
  const selectedWireData = wires.find(wire => wire.id === selectedWire) || null;
  const probe = selected ? simulation.readings.get(selected.id)?.voltage || 0 : simulation.readings.get('vm1')?.voltage || 0;
  const notify = useCallback(message => setToast(message), []);
  const currentProject = useCallback(() => validateGeneralProject(createGeneralProject({ id: projectId, name, components, wires })), [projectId, name, components, wires]);
  const snapshot = useCallback(() => ({ components: components.map(item => ({ ...item })), wires: wires.map(item => ({ ...item, from: { ...item.from }, to: { ...item.to } })) }), [components, wires]);
  const checkpoint = useCallback(() => { historyRef.current.past.push(snapshot()); historyRef.current.past = historyRef.current.past.slice(-60); historyRef.current.future = []; setHistoryVersion(value => value + 1); }, [snapshot]);
  const restoreSnapshot = state => { setComponents(state.components); setWires(state.wires); setSelectedId(null); setSelectedWire(null); setConnection(null); };
  const undo = useCallback(() => { const previous = historyRef.current.past.pop(); if (!previous) return; historyRef.current.future.push(snapshot()); restoreSnapshot(previous); setHistoryVersion(value => value + 1); notify('Cambio deshecho'); }, [snapshot, notify]);
  const redo = useCallback(() => { const next = historyRef.current.future.pop(); if (!next) return; historyRef.current.past.push(snapshot()); restoreSnapshot(next); setHistoryVersion(value => value + 1); notify('Cambio rehecho'); }, [snapshot, notify]);

  useEffect(() => { let cancelled = false; loadGeneralIndexed(projectId).then(saved => { if (!cancelled && saved?.updatedAt > initial.updatedAt) { setName(saved.name); setComponents(saved.components); setWires(saved.wires); notify('Se recuperó una copia local más reciente'); } }); return () => { cancelled = true; }; }, [projectId, initial.updatedAt, notify]);
  useEffect(() => { const project = currentProject(); projectRef.current = project; setStorageStatus('saving'); try { saveGeneralImmediate(project); } catch { setStorageStatus('error'); return undefined; } const timer = setTimeout(() => saveGeneralIndexed(project).then(() => setStorageStatus('saved')).catch(() => setStorageStatus('local-only')), 450); return () => clearTimeout(timer); }, [currentProject]);
  useEffect(() => { const saveBeforeLeave = () => { try { saveGeneralImmediate(projectRef.current); } catch { /* Browser storage can be blocked. */ } }; window.addEventListener('pagehide', saveBeforeLeave); return () => window.removeEventListener('pagehide', saveBeforeLeave); }, []);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!activePower) return undefined; const timer = setInterval(() => setSamples(previous => [...previous.slice(-99), probe]), 90); return () => clearInterval(timer); }, [activePower, probe]);
  useEffect(() => { if (!activePower) return undefined; const timer = setInterval(() => setSimTime(value => value + .032), 32); return () => clearInterval(timer); }, [activePower]);
  useEffect(() => { if (simulation.shortCircuit && powered) { setTripped(true); setPowered(false); notify('Protección activada: cortocircuito detectado'); } }, [simulation.shortCircuit, powered, notify]);

  const addComponent = useCallback((type, x = 480, y = 280) => { const definition = definitions[type]; if (!definition) return; checkpoint(); setComponents(previous => { const count = previous.filter(component => component.type === type).length + 1; const id = `${type}-${globalThis.crypto?.randomUUID?.() || Date.now()}`; const component = { id, type, label: `${definition.prefix}${count}`, value: definition.initial, x: snap ? snapValue(x) : x, y: snap ? snapValue(y) : y, rotation: 0, state: type !== 'button' }; setSelectedId(id); setSelectedWire(null); return [...previous, component]; }); }, [checkpoint, snap]);
  const moveComponent = useCallback((id, x, y) => setComponents(previous => previous.map(component => component.id === id ? { ...component, x, y } : component)), []);
  const updateComponent = patch => setComponents(previous => previous.map(component => component.id === selectedId ? { ...component, ...patch } : component));
  const removeComponent = id => { checkpoint(); setComponents(previous => previous.filter(component => component.id !== id)); setWires(previous => previous.filter(wire => wire.from.componentId !== id && wire.to.componentId !== id)); setSelectedId(null); setConnection(null); };
  const duplicateSelected = () => { if (!selected) return; checkpoint(); const id = `${selected.type}-${globalThis.crypto?.randomUUID?.() || Date.now()}`; const copy = { ...selected, id, label: `${selected.label}_COPY`.slice(0, 32), x: Math.min(CANVAS_WIDTH - 120, selected.x + 40), y: Math.min(CANVAS_HEIGHT - 110, selected.y + 40) }; setComponents(previous => [...previous, copy]); setSelectedId(id); notify('Componente duplicado'); };
  const handleTerminal = (componentId, terminal) => { const endpoint = { componentId, terminal }; if (!connection) { setConnection(endpoint); notify('Selecciona el segundo terminal'); return; } if (connection.componentId === componentId && connection.terminal === terminal) { setConnection(null); return; } const duplicate = wires.some(wire => (wire.from.componentId === connection.componentId && wire.from.terminal === connection.terminal && wire.to.componentId === componentId && wire.to.terminal === terminal) || (wire.to.componentId === connection.componentId && wire.to.terminal === connection.terminal && wire.from.componentId === componentId && wire.from.terminal === terminal)); if (!duplicate) { checkpoint(); setWires(previous => [...previous, { id: globalThis.crypto?.randomUUID?.() || `wire-${Date.now()}`, from: connection, to: endpoint, color: 'green' }]); } setConnection(null); notify(duplicate ? 'Esos terminales ya están conectados' : 'Cable conectado'); };
  const deleteWire = id => { checkpoint(); setWires(previous => previous.filter(wire => wire.id !== id)); setSelectedWire(null); };
  const saveNow = async () => { const project = currentProject(); try { saveGeneralImmediate(project); await saveGeneralIndexed(project); await navigator.storage?.persist?.(); setStorageStatus('saved'); notify('Circuito guardado en este dispositivo'); } catch { notify('La copia inmediata se conserva; IndexedDB no está disponible'); } };
  const loadStarter = () => { backupGeneralProject(currentProject()); checkpoint(); const fresh = validateGeneralProject(createGeneralProject({ ...starterGeneralProject, id: projectId })); setName(fresh.name); setComponents(fresh.components); setWires(fresh.wires); setSelectedId(null); setPowered(false); setTripped(false); notify('Ejemplo LED cargado'); };
  const newCircuit = () => { backupGeneralProject(currentProject()); checkpoint(); setProjectId(globalThis.crypto?.randomUUID?.() || `circuit-${Date.now()}`); setName('Circuito sin título'); setComponents([]); setWires([]); setSelectedId(null); setPowered(false); setTripped(false); notify('Circuito nuevo'); };
  const restoreBackup = () => { const backup = loadGeneralBackup(); if (!backup) { notify('Todavía no hay una copia para restaurar'); return; } checkpoint(); setName(backup.name); setComponents(backup.components); setWires(backup.wires); setSelectedId(null); setPowered(false); notify('Copia anterior restaurada'); };
  const importCircuit = async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { backupGeneralProject(currentProject()); checkpoint(); const imported = await readGeneralProject(file); setProjectId(imported.id); setName(imported.name); setComponents(imported.components); setWires(imported.wires); setPowered(false); setSelectedId(null); notify('Circuito validado e importado'); } catch (error) { notify(error instanceof SyntaxError ? 'El archivo no contiene JSON válido' : error.message); } };
  const fitCanvas = () => { const viewport = viewportRef.current; if (!viewport) return; setZoom(Math.max(0.45, Math.min(1, Math.min((viewport.clientWidth - 30) / CANVAS_WIDTH, (viewport.clientHeight - 30) / CANVAS_HEIGHT)))); };

  useEffect(() => { const handleKey = event => { const editing = ['INPUT', 'TEXTAREA'].includes(event.target.tagName); if (event.key === 'Escape') { setConnection(null); setSelectedWire(null); return; } if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveNow(); return; } if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; } if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; } if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected(); return; } if (!editing && ['Delete', 'Backspace'].includes(event.key)) { if (selectedWire) deleteWire(selectedWire); else if (selectedId) removeComponent(selectedId); } }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); });

  const filteredDefinitions = Object.entries(definitions).filter(([, definition]) => definition.name.toLowerCase().includes(search.trim().toLowerCase()));
  const scopePoints = samples.map((value, index) => `${(index / (samples.length - 1)) * 100},${38 - Math.max(-12, Math.min(12, value)) * 2.2}`).join(' ');
  const pointerPosition = event => { const rect = surfaceRef.current?.getBoundingClientRect(); if (rect) setPointer({ x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }); };
  const nodeCounts = useMemo(() => { const counts = new Map(); wires.forEach(wire => [wire.from, wire.to].forEach(end => { const key = `${end.componentId}:${end.terminal}`; counts.set(key, (counts.get(key) || 0) + 1); })); return counts; }, [wires]);

  return <div className="general-shell">
    <header className="general-menubar">
      <div className="general-brand"><span><CircuitBoard size={17} /></span><strong>LADDER<b>LAB</b></strong></div>
      <nav className="module-switch" aria-label="Áreas del laboratorio"><button onClick={onOpenLadder}><ListTree size={14} />Ladder</button><button className="active"><CircuitBoard size={14} />General</button></nav>
      <div className="desktop-menus" aria-label="Menú de aplicación"><span>Archivo</span><span>Editar</span><span>Circuito</span><span>Ver</span></div>
      <label className="general-project-name"><span>Proyecto</span><input name="general-project-name" value={name} maxLength={72} onChange={event => setName(event.target.value)} aria-label="Nombre del circuito" /></label>
      <button className={`general-save-state ${storageStatus}`} onClick={saveNow}><span />{storageStatus === 'saving' ? 'Guardando…' : storageStatus === 'error' ? 'Error local' : 'Guardado local'}</button>
    </header>
    <div className="general-commandbar">
      <div className="tool-group file-tools"><button onClick={newCircuit} title="Nuevo"><FilePlus2 size={17} /><small>Nuevo</small></button><button onClick={() => fileRef.current?.click()} title="Abrir .circuitlab"><Upload size={17} /><small>Abrir</small></button><button onClick={saveNow} title="Guardar (Ctrl+S)"><Save size={17} /><small>Guardar</small></button><button onClick={() => downloadGeneralProject(currentProject())} title="Exportar .circuitlab"><Download size={17} /><small>Exportar</small></button><input className="visually-hidden" ref={fileRef} name="general-project-file" type="file" accept=".circuitlab,application/json" aria-label="Importar circuito" onChange={importCircuit} /></div>
      <div className="tool-group edit-tools"><button onClick={undo} disabled={!historyRef.current.past.length} title="Deshacer (Ctrl+Z)"><Undo2 size={17} /></button><button onClick={redo} disabled={!historyRef.current.future.length} title="Rehacer (Ctrl+Y)"><Redo2 size={17} /></button><button onClick={duplicateSelected} disabled={!selected} title="Duplicar (Ctrl+D)"><Copy size={17} /></button><button onClick={() => selected && removeComponent(selected.id)} disabled={!selected} title="Eliminar"><Trash2 size={17} /></button></div>
      <div className="tool-group view-tools"><button onClick={() => setZoom(value => Math.max(.45, value - .1))} title="Alejar"><ZoomOut size={17} /></button><output>{Math.round(zoom * 100)}%</output><button onClick={() => setZoom(value => Math.min(1.5, value + .1))} title="Acercar"><ZoomIn size={17} /></button><button onClick={fitCanvas} title="Ajustar al área"><Maximize2 size={17} /></button><button className={grid ? 'toggled' : ''} onClick={() => setGrid(value => !value)} title="Mostrar rejilla"><Grid3X3 size={17} /></button><button className={snap ? 'toggled' : ''} onClick={() => setSnap(value => !value)} title="Ajustar a rejilla"><span className="magnet-icon">∩</span></button></div>
      <div className="general-run-controls"><button className={activePower ? 'active' : ''} onClick={() => { setTripped(false); setPaused(false); setPowered(true); }}><Play size={16} fill="currentColor" />Iniciar</button><button className={paused ? 'paused' : ''} onClick={() => powered && setPaused(value => !value)} title="Pausar"><Pause size={17} /></button><button onClick={() => { setPowered(false); setPaused(false); }} title="Detener"><Power size={17} /></button></div>
    </div>
    <aside className="component-library">
      <div className="general-panel-title"><span>COMPONENTES</span><small>{Object.keys(definitions).length}</small></div>
      <label className="component-search"><Search size={14} /><input name="general-component-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar componente…" aria-label="Buscar componente" /></label>
      <div className="component-groups">{categories.map(category => { const items = filteredDefinitions.filter(([, definition]) => definition.category === category); if (!items.length) return null; return <details key={category} open><summary><span>{category}</span><b>{items.length}</b></summary><div>{items.map(([type, definition]) => <button key={type} draggable onDragStart={event => event.dataTransfer.setData('application/x-ladderlab-component', type)} onClick={() => addComponent(type)} title={`Añadir ${definition.name}`}><span className="library-symbol"><CircuitSymbol compact component={{ type, state: type !== 'button' }} powered={false} /></span><b>{definition.name}</b><small>{definition.prefix}</small></button>)}</div></details>; })}</div>
      <button className="load-example" onClick={loadStarter}><Zap size={14} />Cargar circuito de ejemplo</button>
      <div className="simulide-credit"><Info size={14} /><p>Banco web independiente inspirado en el flujo de <a href="https://github.com/Arcachofo/SimulIDE-dev" target="_blank" rel="noreferrer">SimulIDE</a>.</p></div>
    </aside>
    <main className={`general-workspace ${scopeOpen ? '' : 'scope-closed'}`}>
      <div className="document-tabs"><div className="active"><CircuitBoard size={13} /><h1>{name || 'Circuito sin título'}</h1><span>×</span></div><button onClick={newCircuit} title="Nueva pestaña">+</button></div>
      <div className="circuit-viewport" ref={viewportRef}><div className="circuit-stage" style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}><div className={`circuit-surface ${connection ? 'wire-mode' : ''} ${grid ? '' : 'no-grid'}`} style={{ transform: `scale(${zoom})` }} ref={surfaceRef} onPointerMove={pointerPosition} onClick={() => { setSelectedId(null); setSelectedWire(null); setConnection(null); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const type = event.dataTransfer.getData('application/x-ladderlab-component'); const rect = surfaceRef.current.getBoundingClientRect(); addComponent(type, Math.max(0, (event.clientX - rect.left) / zoom - 60), Math.max(0, (event.clientY - rect.top) / zoom - 50)); }}>
        <svg className="wire-layer" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} aria-label="Cableado del circuito">{wires.map(wire => { const from = endpointPosition(wire.from, components); const to = endpointPosition(wire.to, components); const path = wirePath(from, to); return <g key={wire.id} className={`wire ${wire.color || 'green'} ${selectedWire === wire.id ? 'selected' : ''}`} onClick={event => { event.stopPropagation(); setSelectedWire(wire.id); setSelectedId(null); }}><path className="wire-hit" d={path} /><path className="wire-shadow" d={path} /><path className="wire-line" d={path} />{activePower && <path className="wire-flow" d={path} />}{from && nodeCounts.get(`${wire.from.componentId}:${wire.from.terminal}`) > 1 && <circle className="junction-dot" cx={from.x} cy={from.y} r="4" />}{to && nodeCounts.get(`${wire.to.componentId}:${wire.to.terminal}`) > 1 && <circle className="junction-dot" cx={to.x} cy={to.y} r="4" />}</g>; })}{connection && pointer && <path className="wire-preview" d={wirePath(endpointPosition(connection, components), pointer)} />}</svg>
        {components.map(component => <CircuitComponent key={component.id} component={component} selected={selectedId === component.id} connection={connection} reading={simulation.readings.get(component.id)} powered={activePower} zoom={zoom} snap={snap} onSelect={() => { setSelectedId(component.id); setSelectedWire(null); }} onMove={(x, y) => moveComponent(component.id, x, y)} onMoveStart={checkpoint} onTerminal={terminal => handleTerminal(component.id, terminal)} onToggle={() => { checkpoint(); setComponents(previous => previous.map(item => item.id === component.id ? { ...item, state: !item.state } : item)); }} />)}
        {!components.length && <button className="empty-circuit" onClick={loadStarter}><CircuitBoard size={34} /><b>Hoja de circuito vacía</b><span>Arrastra componentes desde la biblioteca o abre el ejemplo.</span></button>}{connection && <div className="connection-tip"><Cable size={14} />Traza hasta otro terminal · Esc cancela</div>}{tripped && <div className="circuit-trip"><ShieldCheck size={18} /><span><b>PROTECCIÓN ACTIVADA</b>Cortocircuito superior a 5 A</span></div>}
      </div></div></div>
      {scopeOpen && <section className="scope-panel"><div className="scope-head"><span><Activity size={14} />Osciloscopio</span><b>CH1 · {selected?.label || 'VM1'}</b><button onClick={() => setScopeOpen(false)} aria-label="Cerrar osciloscopio">×</button></div><div className="scope-reading"><small>CH1</small><strong>{formatValue(probe, 3)} V</strong><span>DC</span></div><svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-label="Señal de voltaje"><defs><pattern id="scopeGrid" width="10" height="11.5" patternUnits="userSpaceOnUse"><path d="M10 0H0V11.5" /></pattern></defs><rect width="100" height="46" fill="url(#scopeGrid)" /><line x1="0" y1="23" x2="100" y2="23" /><polyline points={scopePoints} /></svg><div className="scope-stats"><span>Tiempo/div<b>800 ms</b></span><span>Muestra<b>90 ms</b></span><span>Corriente<b>{formatValue(simulation.sourceCurrent * 1000, 1)} mA</b></span></div></section>}
      {!scopeOpen && <button className="open-scope" onClick={() => setScopeOpen(true)}><Activity size={14} />Osciloscopio</button>}
    </main>
    <aside className="component-inspector">
      <div className="general-panel-title"><span>PROPIEDADES</span><small>{selected?.label || (selectedWire ? 'Cable' : '—')}</small></div>
      {selected ? <div className="inspector-content"><div className="inspector-preview"><div style={{ transform: `rotate(${selected.rotation || 0}deg)` }}><CircuitSymbol component={selected} reading={simulation.readings.get(selected.id)} powered={activePower} /></div><span>{definitions[selected.type].category}</span><b>{definitions[selected.type].name}</b></div><section><h2>Identificación</h2><label><span>Referencia</span><input name="component-reference" value={selected.label} maxLength={32} onFocus={checkpoint} onChange={event => updateComponent({ label: event.target.value.replace(/[<>]/g, '').slice(0, 32) })} /></label></section>{definitions[selected.type].unit && !['voltmeter', 'ammeter'].includes(selected.type) && <section><h2>Parámetros eléctricos</h2><label><span>Valor</span><div className="value-input"><input name="component-value" type="number" min="0" max="1000000000" value={selected.value} onFocus={checkpoint} onChange={event => updateComponent({ value: Math.max(0, Math.min(1e9, Number(event.target.value) || 0)) })} /><i>{definitions[selected.type].unit}</i></div></label></section>}<section><h2>Medición en tiempo real</h2><div className="live-reading"><span><small>VOLTAJE</small><b>{formatValue(simulation.readings.get(selected.id)?.voltage, 3)} V</b></span><span><small>CORRIENTE</small><b>{formatValue((simulation.readings.get(selected.id)?.current || 0) * 1000, 2)} mA</b></span></div></section>{['switch', 'button', 'fuse'].includes(selected.type) && <button className={`inspector-switch ${selected.state ? 'on' : ''}`} onClick={() => { checkpoint(); updateComponent({ state: !selected.state }); }}><span />{selected.state ? 'Contacto cerrado' : 'Contacto abierto'}</button>}<div className="inspector-actions"><button onClick={() => { checkpoint(); updateComponent({ rotation: ((selected.rotation || 0) + 90) % 360 }); }}><RotateCw size={14} />Rotar 90°</button><button onClick={duplicateSelected}><Copy size={14} />Duplicar</button><button className="delete" onClick={() => removeComponent(selected.id)}><Trash2 size={14} />Eliminar</button></div></div> : selectedWireData ? <div className="wire-inspector"><Cable size={28} /><b>Cable seleccionado</b><p>Conductor ideal con trazado ortogonal automático.</p><label>Color del conductor</label><div className="wire-colors">{WIRE_COLORS.map(color => <button key={color} className={`${color} ${selectedWireData.color === color ? 'active' : ''}`} onClick={() => { checkpoint(); setWires(previous => previous.map(wire => wire.id === selectedWire ? { ...wire, color } : wire)); }} aria-label={`Cable ${color}`} />)}</div><button className="delete-wire" onClick={() => deleteWire(selectedWire)}><Trash2 size={14} />Eliminar cable</button></div> : <div className="inspector-empty"><MousePointer2 size={28} /><b>Sin selección</b><p>Selecciona un componente para editar parámetros, rotarlo, duplicarlo o ver sus mediciones.</p><div className="shortcut-list"><span><kbd>Ctrl</kbd><kbd>Z</kbd> Deshacer</span><span><kbd>Ctrl</kbd><kbd>D</kbd> Duplicar</span><span><kbd>Supr</kbd> Eliminar</span></div></div>}
      <div className={`simulation-health ${activePower ? 'active' : ''}`}><span /><div><small>SIMULACIÓN</small><b>{tripped ? 'PROTECCIÓN' : paused ? 'EN PAUSA' : activePower ? 'EN EJECUCIÓN' : 'DETENIDA'}</b></div><Zap size={16} /></div><a className="general-zolvek" href="https://zolvek.com.mx" target="_blank" rel="noreferrer">Creado por zolvek.com.mx</a>
    </aside>
    <footer className="general-statusbar"><span><i className={activePower ? 'on' : ''} />{activePower ? 'Simulación activa' : 'Listo'}</span><span>Componentes: <b>{components.length}</b></span><span>Cables: <b>{wires.length}</b></span><span>Nodos: <b>{simulation.nets}</b></span><span className="status-spacer" /><button onClick={restoreBackup}>Recuperar copia</button><span>Zoom: <b>{Math.round(zoom * 100)}%</b></span><span>X: {pointer ? Math.round(pointer.x) : 0} · Y: {pointer ? Math.round(pointer.y) : 0}</span></footer>
    {toast && <div className="toast"><span className="status-dot" />{toast}</div>}
  </div>;
}

export default GeneralLab;
