import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Cable, ChevronRight, CircleGauge, CircuitBoard, Download, FilePlus2,
  Gauge, Info, Lightbulb, ListTree, MousePointer2, Pause, Play, Power, RotateCw,
  Save, Search, ShieldCheck, Trash2, Undo2, Upload, Zap
} from 'lucide-react';
import { componentTerminals, solveCircuit } from './circuitEngine';
import {
  backupGeneralProject, createGeneralProject, downloadGeneralProject, loadGeneralBackup,
  loadGeneralImmediate, loadGeneralIndexed, readGeneralProject, saveGeneralImmediate,
  saveGeneralIndexed, starterGeneralProject, validateGeneralProject
} from './generalStorage';
import './general.css';

const definitions = {
  dc: { name: 'Fuente DC', prefix: 'V', unit: 'V', initial: 9, category: 'Alimentación', icon: Power },
  ground: { name: 'Tierra', prefix: 'GND', unit: '', initial: 0, category: 'Alimentación', icon: Zap },
  resistor: { name: 'Resistencia', prefix: 'R', unit: 'Ω', initial: 1000, category: 'Pasivos', icon: Activity },
  capacitor: { name: 'Capacitor', prefix: 'C', unit: 'µF', initial: 100, category: 'Pasivos', icon: CircuitBoard },
  switch: { name: 'Interruptor', prefix: 'SW', unit: '', initial: 0, category: 'Control', icon: Power },
  button: { name: 'Pulsador', prefix: 'PB', unit: '', initial: 0, category: 'Control', icon: MousePointer2 },
  led: { name: 'LED', prefix: 'LED', unit: '', initial: 120, category: 'Salidas', icon: Lightbulb },
  lamp: { name: 'Lámpara', prefix: 'L', unit: 'Ω', initial: 120, category: 'Salidas', icon: Lightbulb },
  voltmeter: { name: 'Voltímetro', prefix: 'VM', unit: 'V', initial: 0, category: 'Instrumentos', icon: Gauge },
  ammeter: { name: 'Amperímetro', prefix: 'AM', unit: 'A', initial: 0, category: 'Instrumentos', icon: CircleGauge },
};

const categories = ['Alimentación', 'Pasivos', 'Control', 'Salidas', 'Instrumentos'];
const terminalSide = (type, terminal) => {
  if (type === 'ground') return 'top';
  if (type === 'dc') return terminal === 'p' ? 'right' : 'left';
  return ['a', 'p'].includes(terminal) ? 'left' : 'right';
};
const terminalPosition = (component, terminal) => {
  const side = terminalSide(component.type, terminal);
  if (side === 'left') return { x: component.x, y: component.y + 35 };
  if (side === 'right') return { x: component.x + 96, y: component.y + 35 };
  return { x: component.x + 48, y: component.y };
};
const endpointPosition = (endpoint, components) => {
  const component = components.find(item => item.id === endpoint?.componentId);
  return component ? terminalPosition(component, endpoint.terminal) : null;
};
const wirePath = (from, to) => {
  if (!from || !to) return '';
  const bend = Math.max(42, Math.abs(to.x - from.x) * 0.45);
  const direction = to.x >= from.x ? 1 : -1;
  return `M ${from.x} ${from.y} C ${from.x + bend * direction} ${from.y}, ${to.x - bend * direction} ${to.y}, ${to.x} ${to.y}`;
};
const formatValue = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '0';

function DefinitionIcon({ type, size = 18 }) {
  const Icon = definitions[type]?.icon || CircuitBoard;
  return <Icon size={size} />;
}

function ComponentSymbol({ component, reading, powered, onToggle }) {
  const active = powered && (reading?.brightness > 0.05 || ['dc', 'voltmeter', 'ammeter'].includes(component.type));
  if (component.type === 'resistor') return <svg viewBox="0 0 70 30" aria-hidden="true"><path d="M1 15h10l5-9 9 18 9-18 9 18 9-18 7 9h10" /></svg>;
  if (component.type === 'capacitor') return <svg viewBox="0 0 70 30" aria-hidden="true"><path d="M2 15h27M29 4v22M41 4v22M41 15h27" /></svg>;
  if (component.type === 'dc') return <svg viewBox="0 0 70 34" aria-hidden="true"><path d="M2 17h25M43 17h25M28 5v24M42 10v14" /><text x="18" y="11">−</text><text x="48" y="11">+</text></svg>;
  if (component.type === 'ground') return <svg viewBox="0 0 70 40" aria-hidden="true"><path d="M35 2v15M18 18h34M24 25h22M30 32h10" /></svg>;
  if (component.type === 'switch' || component.type === 'button') return <button className={`circuit-toggle ${component.state ? 'closed' : ''}`} onClick={event => { event.stopPropagation(); onToggle(); }} aria-label={`${component.state ? 'Abrir' : 'Cerrar'} ${component.label}`}><svg viewBox="0 0 70 30" aria-hidden="true"><path d={component.state ? 'M2 20h17M51 20h17M19 20h32' : 'M2 20h17M51 20h17M19 20L51 7'} /><circle cx="19" cy="20" r="3" /><circle cx="51" cy="20" r="3" /></svg></button>;
  if (component.type === 'led') return <div className={`led-symbol ${active ? 'lit' : ''}`} style={{ '--intensity': reading?.brightness || 0 }}><svg viewBox="0 0 70 38" aria-hidden="true"><path d="M2 19h18M50 19h18M20 6v26l30-13zM50 6v26M48 3l8-3M52 8l8-3" /></svg></div>;
  if (component.type === 'lamp') return <div className={`lamp-symbol ${active ? 'lit' : ''}`} style={{ '--intensity': reading?.brightness || 0 }}><svg viewBox="0 0 70 38" aria-hidden="true"><path d="M2 19h15M53 19h15M17 19a18 18 0 1 0 36 0 18 18 0 1 0-36 0M23 7l24 24M47 7L23 31" /></svg></div>;
  if (component.type === 'voltmeter' || component.type === 'ammeter') return <div className="meter-symbol"><span>{component.type === 'voltmeter' ? 'V' : 'A'}</span><b>{formatValue(component.type === 'voltmeter' ? reading?.voltage : reading?.current, 3)}</b></div>;
  return null;
}

function CircuitComponent({ component, selected, connection, reading, powered, onSelect, onMove, onTerminal, onToggle }) {
  const drag = useRef(null);
  const terminals = componentTerminals[component.type] || [];
  const handlePointerDown = event => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelect();
    drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: component.x, y: component.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = event => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    onMove(
      Math.max(4, Math.min(900, drag.current.x + event.clientX - drag.current.startX)),
      Math.max(8, Math.min(510, drag.current.y + event.clientY - drag.current.startY))
    );
  };
  const stopDrag = event => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  };
  return <article
    className={`circuit-component type-${component.type} ${selected ? 'selected' : ''} ${powered ? 'powered' : ''}`}
    style={{ transform: `translate(${component.x}px, ${component.y}px)` }}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={stopDrag}
    onPointerCancel={stopDrag}
    aria-label={`${definitions[component.type]?.name}: ${component.label}`}
  >
    <span className="component-label">{component.label}</span>
    <div className="component-symbol-wrap" style={{ transform: `rotate(${component.rotation || 0}deg)` }}><ComponentSymbol component={component} reading={reading} powered={powered} onToggle={onToggle} /></div>
    {terminals.map(terminal => <button
      key={terminal}
      className={`component-terminal side-${terminalSide(component.type, terminal)} ${connection?.componentId === component.id && connection?.terminal === terminal ? 'connecting' : ''}`}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); onTerminal(terminal); }}
      aria-label={`Terminal ${terminal} de ${component.label}`}
      title={`Conectar terminal ${terminal}`}
    ><i /><small>{terminal}</small></button>)}
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
  const [samples, setSamples] = useState(Array(90).fill(0));
  const fileRef = useRef(null);
  const projectRef = useRef(initial);
  const surfaceRef = useRef(null);
  const activePower = powered && !paused && !tripped;
  const simulation = useMemo(() => solveCircuit(components, wires, activePower), [components, wires, activePower]);
  const selected = components.find(component => component.id === selectedId) || null;
  const probe = selected ? simulation.readings.get(selected.id)?.voltage || 0 : simulation.readings.get('vm1')?.voltage || 0;
  const notify = useCallback(message => setToast(message), []);
  const currentProject = useCallback(() => validateGeneralProject(createGeneralProject({ id: projectId, name, components, wires })), [projectId, name, components, wires]);

  useEffect(() => {
    let cancelled = false;
    loadGeneralIndexed(projectId).then(saved => {
      if (!cancelled && saved?.updatedAt > initial.updatedAt) {
        setName(saved.name); setComponents(saved.components); setWires(saved.wires); notify('Se recuperó una copia local más reciente');
      }
    });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const project = currentProject();
    projectRef.current = project;
    setStorageStatus('saving');
    try { saveGeneralImmediate(project); } catch { setStorageStatus('error'); return undefined; }
    const timer = setTimeout(() => saveGeneralIndexed(project).then(() => setStorageStatus('saved')).catch(() => setStorageStatus('local-only')), 450);
    return () => clearTimeout(timer);
  }, [currentProject]);

  useEffect(() => {
    const saveBeforeLeave = () => { try { saveGeneralImmediate(projectRef.current); } catch { /* Storage can be blocked by browser policy. */ } };
    window.addEventListener('pagehide', saveBeforeLeave);
    return () => window.removeEventListener('pagehide', saveBeforeLeave);
  }, []);
  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!activePower) return undefined;
    const timer = setInterval(() => setSamples(previous => [...previous.slice(-89), probe]), 90);
    return () => clearInterval(timer);
  }, [activePower, probe]);
  useEffect(() => {
    if (simulation.shortCircuit && powered) {
      setTripped(true); setPowered(false); notify('Protección activada: cortocircuito detectado');
    }
  }, [simulation.shortCircuit, powered]);
  useEffect(() => {
    const handleKey = event => {
      if (event.key === 'Escape') { setConnection(null); setSelectedWire(null); return; }
      if (!['Delete', 'Backspace'].includes(event.key) || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (selectedWire) { setWires(previous => previous.filter(wire => wire.id !== selectedWire)); setSelectedWire(null); }
      else if (selectedId) removeComponent(selectedId);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedId, selectedWire]);

  const addComponent = useCallback((type, x = 430, y = 245) => {
    const definition = definitions[type];
    if (!definition) return;
    setComponents(previous => {
      const count = previous.filter(component => component.type === type).length + 1;
      const id = `${type}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      const component = { id, type, label: `${definition.prefix}${count}`, value: definition.initial, x, y, rotation: 0, state: type === 'switch' };
      setSelectedId(id); setSelectedWire(null);
      return [...previous, component];
    });
  }, []);
  const moveComponent = useCallback((id, x, y) => setComponents(previous => previous.map(component => component.id === id ? { ...component, x, y } : component)), []);
  const updateComponent = patch => setComponents(previous => previous.map(component => component.id === selectedId ? { ...component, ...patch } : component));
  const removeComponent = id => {
    setComponents(previous => previous.filter(component => component.id !== id));
    setWires(previous => previous.filter(wire => wire.from.componentId !== id && wire.to.componentId !== id));
    setSelectedId(null); setConnection(null);
  };
  const handleTerminal = (componentId, terminal) => {
    const endpoint = { componentId, terminal };
    if (!connection) { setConnection(endpoint); notify('Selecciona el segundo terminal'); return; }
    if (connection.componentId === componentId && connection.terminal === terminal) { setConnection(null); return; }
    const duplicate = wires.some(wire =>
      (wire.from.componentId === connection.componentId && wire.from.terminal === connection.terminal && wire.to.componentId === componentId && wire.to.terminal === terminal)
      || (wire.to.componentId === connection.componentId && wire.to.terminal === connection.terminal && wire.from.componentId === componentId && wire.from.terminal === terminal));
    if (!duplicate) setWires(previous => [...previous, { id: globalThis.crypto?.randomUUID?.() || `wire-${Date.now()}`, from: connection, to: endpoint }]);
    setConnection(null); notify(duplicate ? 'Esos terminales ya están conectados' : 'Cable conectado');
  };
  const saveNow = async () => {
    const project = currentProject();
    try { saveGeneralImmediate(project); await saveGeneralIndexed(project); await navigator.storage?.persist?.(); setStorageStatus('saved'); notify('Circuito protegido en el dispositivo'); } catch { notify('La copia inmediata se conserva; IndexedDB no está disponible'); }
  };
  const loadStarter = () => {
    backupGeneralProject(currentProject());
    const fresh = validateGeneralProject(createGeneralProject({ ...starterGeneralProject, id: projectId }));
    setName(fresh.name); setComponents(fresh.components); setWires(fresh.wires); setSelectedId(null); setPowered(false); setTripped(false); notify('Ejemplo LED cargado; puedes deshacerlo');
  };
  const newCircuit = () => {
    backupGeneralProject(currentProject());
    setProjectId(globalThis.crypto?.randomUUID?.() || `circuit-${Date.now()}`); setName('Circuito sin título'); setComponents([]); setWires([]); setSelectedId(null); setPowered(false); setTripped(false); notify('Lienzo nuevo; el circuito anterior puede restaurarse');
  };
  const restoreBackup = () => {
    const backup = loadGeneralBackup();
    if (!backup) { notify('Todavía no hay una copia para restaurar'); return; }
    setName(backup.name); setComponents(backup.components); setWires(backup.wires); setSelectedId(null); setPowered(false); notify('Circuito anterior restaurado');
  };
  const importCircuit = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      backupGeneralProject(currentProject());
      const imported = await readGeneralProject(file);
      setProjectId(imported.id); setName(imported.name); setComponents(imported.components); setWires(imported.wires); setPowered(false); setSelectedId(null); notify('Circuito validado e importado');
    } catch (error) { notify(error instanceof SyntaxError ? 'El archivo no contiene JSON válido' : error.message); }
  };
  const powerOn = () => { setTripped(false); setPaused(false); setPowered(true); };

  const filteredDefinitions = Object.entries(definitions).filter(([, definition]) => definition.name.toLowerCase().includes(search.trim().toLowerCase()));
  const scopePoints = samples.map((value, index) => `${(index / (samples.length - 1)) * 100},${42 - Math.max(-12, Math.min(12, value)) * 2.5}`).join(' ');
  const pointerPosition = event => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (rect) setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return <div className="general-shell">
    <header className="general-topbar">
      <div className="general-brand"><span><CircuitBoard size={18} /></span><strong>LADDER<b>LAB</b></strong></div>
      <nav className="module-switch" aria-label="Áreas del laboratorio"><button onClick={onOpenLadder}><ListTree size={14} />Ladder</button><button className="active"><CircuitBoard size={14} />General</button></nav>
      <div className="general-project-name"><small>CIRCUITO</small><input value={name} maxLength={72} onChange={event => setName(event.target.value)} aria-label="Nombre del circuito" /></div>
      <div className="general-run-controls"><button className={activePower ? 'active' : ''} onClick={powerOn}><Play size={14} fill="currentColor" />Energizar</button><button onClick={() => powered && setPaused(value => !value)} aria-label="Pausar simulación"><Pause size={15} /></button><button onClick={() => { setPowered(false); setPaused(false); }} aria-label="Desenergizar"><Power size={15} /></button></div>
      <button className={`general-save-state ${storageStatus}`} onClick={saveNow}><span />{storageStatus === 'saving' ? 'Guardando' : 'Local protegido'}</button>
    </header>

    <aside className="component-library">
      <div className="general-panel-title"><span>BIBLIOTECA</span><small>{Object.keys(definitions).length} elementos</small></div>
      <label className="component-search"><Search size={14} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar componente" /></label>
      <div className="component-groups">{categories.map(category => {
        const items = filteredDefinitions.filter(([, definition]) => definition.category === category);
        if (!items.length) return null;
        return <section key={category}><h2>{category}</h2>{items.map(([type, definition]) => { const Icon = definition.icon; return <button key={type} draggable onDragStart={event => event.dataTransfer.setData('application/x-ladderlab-component', type)} onClick={() => addComponent(type)}><span><Icon size={15} /></span><b>{definition.name}</b><ChevronRight size={13} /></button>; })}</section>;
      })}</div>
      <div className="simulide-credit"><Info size={15} /><p>Flujo inspirado en <a href="https://github.com/Arcachofo/SimulIDE-dev" target="_blank" rel="noreferrer">SimulIDE</a>. Implementación web independiente.</p></div>
      <a className="general-zolvek" href="https://zolvek.com.mx" target="_blank" rel="noreferrer">Creado por zolvek.com.mx</a>
    </aside>

    <main className="general-workspace">
      <div className="general-toolbar">
        <div><span className="step">BANCO DE ELECTRÓNICA · DC</span><h1>Simulador general</h1></div>
        <div className="general-actions"><button onClick={newCircuit} title="Circuito nuevo"><FilePlus2 size={15} /><span>Nuevo</span></button><button onClick={loadStarter} title="Cargar ejemplo"><CircuitBoard size={15} /><span>Ejemplo</span></button><button onClick={restoreBackup} title="Restaurar circuito anterior"><Undo2 size={15} /><span>Deshacer</span></button><button onClick={saveNow} title="Guardar"><Save size={15} /></button><button onClick={() => downloadGeneralProject(currentProject())} title="Exportar .circuitlab"><Download size={15} /></button><button onClick={() => fileRef.current?.click()} title="Importar"><Upload size={15} /></button><input className="visually-hidden" ref={fileRef} type="file" accept=".circuitlab,application/json" aria-label="Importar circuito" onChange={importCircuit} /></div>
      </div>
      <div className="circuit-viewport">
        <div
          className={`circuit-surface ${connection ? 'wire-mode' : ''}`}
          ref={surfaceRef}
          onPointerMove={pointerPosition}
          onClick={() => { setSelectedId(null); setSelectedWire(null); setConnection(null); }}
          onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); const type = event.dataTransfer.getData('application/x-ladderlab-component'); const rect = surfaceRef.current.getBoundingClientRect(); addComponent(type, Math.max(4, event.clientX - rect.left - 48), Math.max(8, event.clientY - rect.top - 35)); }}
        >
          <div className="surface-origin"><span>0,0</span></div>
          <svg className="wire-layer" viewBox="0 0 1000 590" preserveAspectRatio="none" aria-label="Cableado del circuito">
            {wires.map(wire => {
              const path = wirePath(endpointPosition(wire.from, components), endpointPosition(wire.to, components));
              return <g key={wire.id} className={selectedWire === wire.id ? 'selected' : ''} onClick={event => { event.stopPropagation(); setSelectedWire(wire.id); setSelectedId(null); }}><path className="wire-hit" d={path} /><path className={`wire-line ${activePower ? 'energized' : ''}`} d={path} /></g>;
            })}
            {connection && pointer && <path className="wire-preview" d={wirePath(endpointPosition(connection, components), pointer)} />}
          </svg>
          {components.map(component => <CircuitComponent key={component.id} component={component} selected={selectedId === component.id} connection={connection} reading={simulation.readings.get(component.id)} powered={activePower} onSelect={() => { setSelectedId(component.id); setSelectedWire(null); }} onMove={(x, y) => moveComponent(component.id, x, y)} onTerminal={terminal => handleTerminal(component.id, terminal)} onToggle={() => setComponents(previous => previous.map(item => item.id === component.id ? { ...item, state: !item.state } : item))} />)}
          {!components.length && <button className="empty-circuit" onClick={loadStarter}><CircuitBoard size={28} /><b>El lienzo está vacío</b><span>Carga el ejemplo o arrastra un componente aquí.</span></button>}
          {connection && <div className="connection-tip"><Cable size={14} />Selecciona otro terminal · Esc para cancelar</div>}
          {tripped && <div className="circuit-trip"><ShieldCheck size={17} /><span><b>PROTECCIÓN ACTIVADA</b>Cortocircuito mayor a 5 A</span></div>}
        </div>
      </div>
      <section className="scope-panel">
        <div className="scope-meta"><span><Activity size={14} />OSCILOSCOPIO</span><b>{selected?.label || 'VM1'}</b><strong>{formatValue(probe, 3)} V</strong></div>
        <svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-label="Señal de voltaje"><defs><pattern id="scopeGrid" width="10" height="11.5" patternUnits="userSpaceOnUse"><path d="M10 0H0V11.5" /></pattern></defs><rect width="100" height="46" fill="url(#scopeGrid)" /><line x1="0" y1="23" x2="100" y2="23" /><polyline points={scopePoints} /></svg>
        <div className="scope-stats"><span>VENTANA<b>8.0 s</b></span><span>MUESTRA<b>90 ms</b></span><span>REDES<b>{simulation.nets}</b></span><span>CORRIENTE<b>{formatValue(simulation.sourceCurrent * 1000, 1)} mA</b></span></div>
      </section>
    </main>

    <aside className="component-inspector">
      <div className="general-panel-title"><span>INSPECTOR</span><small>{selected ? selected.label : selectedWire ? 'Cable' : 'Nada seleccionado'}</small></div>
      {selected ? <div className="inspector-content">
        <div className="inspector-kind"><span><DefinitionIcon type={selected.type} /></span><div><small>{definitions[selected.type].category}</small><b>{definitions[selected.type].name}</b></div></div>
        <label>REFERENCIA<input value={selected.label} maxLength={32} onChange={event => updateComponent({ label: event.target.value.replace(/[<>]/g, '').slice(0, 32) })} /></label>
        {definitions[selected.type].unit && !['voltmeter', 'ammeter'].includes(selected.type) && <label>VALOR<div className="value-input"><input type="number" min="0" max="1000000000" value={selected.value} onChange={event => updateComponent({ value: Math.max(0, Math.min(1e9, Number(event.target.value) || 0)) })} /><span>{definitions[selected.type].unit}</span></div></label>}
        <div className="live-reading"><span><small>VOLTAJE</small><b>{formatValue(simulation.readings.get(selected.id)?.voltage, 3)} V</b></span><span><small>CORRIENTE</small><b>{formatValue((simulation.readings.get(selected.id)?.current || 0) * 1000, 2)} mA</b></span></div>
        {['switch', 'button'].includes(selected.type) && <button className={`inspector-switch ${selected.state ? 'on' : ''}`} onClick={() => updateComponent({ state: !selected.state })}><span />{selected.state ? 'Contacto cerrado' : 'Contacto abierto'}</button>}
        <div className="inspector-actions"><button onClick={() => updateComponent({ rotation: ((selected.rotation || 0) + 90) % 360 })}><RotateCw size={14} />Rotar</button><button className="delete" onClick={() => removeComponent(selected.id)}><Trash2 size={14} />Eliminar</button></div>
      </div> : selectedWire ? <div className="wire-inspector"><Cable size={26} /><b>Cable seleccionado</b><p>Conexión ideal entre dos nodos. Puedes eliminarla y volver a cablear los terminales.</p><button onClick={() => { setWires(previous => previous.filter(wire => wire.id !== selectedWire)); setSelectedWire(null); }}><Trash2 size={14} />Eliminar cable</button></div> : <div className="inspector-empty"><MousePointer2 size={25} /><b>Selecciona un elemento</b><p>Haz clic en un componente para editar sus propiedades o consultar sus mediciones.</p></div>}
      <div className={`simulation-health ${activePower ? 'active' : ''}`}><span /><div><small>SIMULACIÓN</small><b>{tripped ? 'PROTECCIÓN' : paused ? 'EN PAUSA' : activePower ? 'ENERGIZADA' : 'SIN ENERGÍA'}</b></div><Zap size={16} /></div>
    </aside>
    {toast && <div className="toast"><span className="status-dot" />{toast}</div>}
  </div>;
}

export default GeneralLab;
