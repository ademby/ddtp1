import assert from 'node:assert/strict';
import test from 'node:test';
import Feature from 'ol/Feature.js';
import { AdminNode } from '../.test-dist/apps/frontend/src/domain/AdminNode.js';
import { shouldUseDefaultTransition } from '../.test-dist/apps/frontend/src/workflows/navigationTransition.js';
import { MissionWorkflow } from '../.test-dist/apps/frontend/src/workflows/MissionWorkflow.js';
import { HeatmapWorkflow } from '../.test-dist/apps/frontend/src/workflows/HeatmapWorkflow.js';
import { rankLocationOptions } from '../.test-dist/apps/frontend/src/search/locationSearchRanking.js';
import { AdminTree } from '../.test-dist/apps/frontend/src/domain/AdminTree.js';
import { HttpMissionApi } from '../.test-dist/apps/frontend/src/data/HttpMissionApi.js';
import { MockMissionApi } from '../.test-dist/apps/frontend/src/data/MockMissionApi.js';
import { droneId, missionId } from '../.test-dist/apps/frontend/src/domain/missionIds.js';

function node(id, parent = null) {
  const value = new AdminNode({ id, level: parent ? parent.level + 1 : 0, feature: new Feature() });
  value.parent = parent;
  parent?.children.push(value);
  return value;
}

test('uses the default transition for root and ancestor navigation', () => {
  const root = node('root');
  const country = node('country', root);
  const region = node('region', country);
  const otherCountry = node('other-country', root);

  assert.equal(shouldUseDefaultTransition(null, root), true);
  assert.equal(shouldUseDefaultTransition(country, region), true);
  assert.equal(shouldUseDefaultTransition(region, country), true);
  assert.equal(shouldUseDefaultTransition(country, otherCountry), false);
});

test('admin tree returns stable paths, siblings, and depth-first nodes', () => {
  const root = node('root');
  const first = node('first', root);
  const second = node('second', root);
  const leaf = node('leaf', first);
  const tree = new AdminTree(root);

  assert.deepEqual(tree.pathTo(leaf).map((item) => item.id), ['root', 'first', 'leaf']);
  assert.deepEqual(tree.siblingsOf(first).map((item) => item.id), ['second']);
  assert.deepEqual(tree.allNodes().map((item) => item.id), ['root', 'first', 'leaf', 'second']);
});

test('ranks location options by label relevance and path fallback', () => {
  const options = [
    { value: 'path', label: 'District', path: 'Tunisia / North' },
    { value: 'exact', label: 'Tunis', path: 'Tunisia / Tunis' },
    { value: 'prefix', label: 'Tunis Centre', path: 'Tunisia / Tunis Centre' },
    { value: 'contains', label: 'Grand Tunis', path: 'Tunisia / Grand Tunis' },
  ];

  assert.deepEqual(
    rankLocationOptions(options, 'tunis').map((option) => option.value),
    ['exact', 'prefix', 'contains', 'path'],
  );
  assert.deepEqual(
    rankLocationOptions(options, 'north').map((option) => option.value),
    ['path'],
  );
  assert.deepEqual(rankLocationOptions(options, 't'), []);
});

test('mission workflow loads missions and selects one through its view seam', async () => {
  const mission = createMission('mission-1');
  const rendered = [];
  const editors = [];
  let listShown = 0;
  const api = {
    list: async () => [mission],
    get: async () => mission,
    create: async () => mission,
    updateDraft: async () => mission,
    plan: async () => ({ ...mission, state: 'PLANNED' }),
    cancel: async () => ({ ...mission, state: 'CANCELLED' }),
    deriveFromFailure: async () => mission,
  };
  const view = {
    renderMissions: (missions) => rendered.push(missions),
    setEditor: (_value, title) => editors.push(title),
    setActiveTool: () => undefined,
    showMissionList: () => { listShown += 1; },
  };
  const editor = fakeEditor();
  const workflow = new MissionWorkflow({
    mapWorkspace: { fitMission: () => undefined, clearMission: () => undefined, setEditorMode: () => undefined },
    missionApi: api,
    missionEditor: editor,
    view,
    setAdminSelectionEnabled: () => undefined,
  });

  await workflow.load();
  workflow.select(mission.id);

  assert.equal(rendered.length, 2);
  assert.deepEqual(rendered[0], [mission]);
  assert.deepEqual(editors, ['Edit mission']);
  assert.deepEqual(editor.loaded, [mission]);

  workflow.back();
  assert.equal(listShown, 1);
});

test('mission workflow cancels a mission through the API and reflects a derived retry', async () => {
  const planned = { ...createMission('mission-1'), state: 'PLANNED' };
  const failed = { ...createMission('mission-2'), state: 'FAILED', failureReason: 'EXECUTION_FAILED' };
  const derived = { ...createMission('mission-3'), derivedFrom: failed.id };
  const cancelCalls = [];
  const deriveCalls = [];
  const editors = [];
  const api = {
    list: async () => [planned, failed],
    get: async () => planned,
    create: async () => planned,
    updateDraft: async () => planned,
    plan: async () => planned,
    cancel: async (id, key) => { cancelCalls.push([id, key]); return { ...planned, state: 'CANCELLED' }; },
    deriveFromFailure: async (id, key) => { deriveCalls.push([id, key]); return derived; },
  };
  const editor = fakeEditor();
  const workflow = new MissionWorkflow({
    mapWorkspace: { fitMission: () => undefined, clearMission: () => undefined, setEditorMode: () => undefined },
    missionApi: api,
    missionEditor: editor,
    view: {
      renderMissions: () => undefined,
      setEditor: (_value, title) => editors.push(title),
      setActiveTool: () => undefined,
      showMissionList: () => undefined,
    },
    setAdminSelectionEnabled: () => undefined,
  });

  await workflow.load();
  workflow.select(planned.id);
  await workflow.cancelMission();
  assert.deepEqual(cancelCalls, [[planned.id, `cancel-${planned.id}`]]);
  assert.ok(editors.includes('Cancelled mission'));

  workflow.select(failed.id);
  await workflow.retry();
  assert.deepEqual(deriveCalls, [[failed.id, `derive-${failed.id}`]]);
  assert.deepEqual(editor.loaded.at(-1), derived);
});

test('heatmap workflow loads data, initializes hidden state, and toggles visibility', async () => {
  const dataset = { metric: 'Signal Quality', crs: 'EPSG:3857', min: -110, max: -40, measurements: [] };
  const visibility = [];
  const ranges = [];
  const assigned = [];
  const legend = { element: { style: {} }, setRange: (min, max) => ranges.push([min, max]) };
  const workflow = new HeatmapWorkflow({
    mapWorkspace: {
      isVisible: () => visibility.at(-1) ?? false,
      setVisible: (visible) => visibility.push(visible),
    },
    dataSource: { load: async () => dataset },
    renderer: { setDataset: (value) => assigned.push(value) },
    legend,
  });

  await workflow.load();
  await workflow.toggle();
  await workflow.toggle();

  assert.deepEqual(assigned, [dataset]);
  assert.deepEqual(ranges, [[-110, -40]]);
  assert.deepEqual(visibility, [false, true, false]);
  assert.equal(legend.element.style.display, 'none');
});

test('heatmap workflow propagates loading failures', async () => {
  const failure = new Error('network unavailable');
  const workflow = new HeatmapWorkflow({
    mapWorkspace: { isVisible: () => false, setVisible: () => undefined },
    dataSource: { load: async () => { throw failure; } },
    renderer: { setDataset: () => undefined },
    legend: { element: { style: {} }, setRange: () => undefined },
  });

  await assert.rejects(workflow.load(), failure);
});

test('HTTP mission API encodes queries and idempotent commands', async () => {
  const requests = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push([String(input), init]);
    return new Response(JSON.stringify({ id: 'mission-1' }), { status: 200 });
  };

  try {
    const api = new HttpMissionApi('https://api.example.test/');
    await api.list({ state: 'DRAFT', droneId: droneId('drone-alpha') });
    await api.plan(missionId('mission-1'), 'plan-key');
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(requests[0][0], 'https://api.example.test/missions?state=DRAFT&droneId=drone-alpha');
  assert.equal(requests[0][1].method, undefined);
  assert.equal(requests[1][0], 'https://api.example.test/missions/mission-1/plan');
  assert.equal(requests[1][1].headers['Idempotency-Key'], 'plan-key');
});

test('mission contract enforces route and lifecycle rules with idempotent commands', async () => {
  const api = new MockMissionApi();
  const command = {
    name: 'Contract mission',
    droneId: droneId('drone-alpha'),
    earliestStart: '2026-01-01T00:00:00.000Z',
    dispatchDeadline: null,
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  };

  await assert.rejects(
    api.create({ ...command, geometry: { type: 'LineString', coordinates: [[0, 0]] } }),
    /at least two coordinates/,
  );
  const draft = await api.create(command);
  const planned = await api.plan(draft.id, 'plan-1');
  assert.equal(planned.state, 'PLANNED');
  assert.equal(await api.plan(draft.id, 'plan-1'), planned);
  await assert.rejects(api.plan(draft.id, 'plan-2'), /Only draft missions/);
  const cancelled = await api.cancel(draft.id, 'cancel-1');
  assert.equal(cancelled.state, 'CANCELLED');
  await assert.rejects(api.cancel(draft.id, 'cancel-2'), /terminal mission/);
});

function createMission(id) {
  const createdAt = '2026-01-01T00:00:00.000Z';
  return {
    id: missionId(id),
    name: 'Test mission',
    state: 'DRAFT',
    droneId: droneId('drone-alpha'),
    earliestStart: createdAt,
    dispatchDeadline: null,
    activeRoute: {
      id: 'route-1',
      revision: 1,
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      createdAt,
    },
    routeHistory: [],
    failureReason: null,
    derivedFrom: null,
  };
}

function fakeEditor() {
  const loaded = [];
  return {
    loaded,
    startNew: () => undefined,
    load: (mission) => loaded.push(mission),
    startDraw: () => undefined,
    startModify: () => undefined,
    startTranslate: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    stop: () => undefined,
    hasValidGeometry: () => true,
    getGeometry: () => ({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
  };
}
