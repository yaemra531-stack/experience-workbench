'use strict';
// Run the original Python parser and data operations in the browser. No data is sent to a server.
const BROWSER_KEY = 'experience-workbench-data-v1';
let runtimePromise;
let apiQueue = Promise.resolve();
async function initBrowserRuntime() {
  const py = await loadPyodide();
  for (const name of ['mdlib.py', 'server.py']) {
    const response = await fetch(name + '?v=20261128-3');
    if (!response.ok) throw new Error('无法加载应用文件：' + name);
    py.FS.writeFile(name, await response.text());
  }
  await py.runPythonAsync(`
import json
import server
class BrowserStore(server.Store):
    def save(self):
        self.data['saved_at'] = server.now_iso()
    def backup(self, force=False, reason='auto'):
        return None
server.STORE = BrowserStore('/nonexistent/experiences.json')
server.CONFIG = {'harness_dir': '', 'port': 0}
class BrowserHandler:
    api = server.Handler.api
    def read_json(self): return self.body
    def send_json(self, data, code=200): self.result = data
handler = BrowserHandler()
def browser_call(method, path, body, state):
    server.STORE.data = json.loads(state)
    handler.body = json.loads(body)
    handler.result = None
    handler.api(method, path, {})
    return json.dumps({'result': handler.result, 'state': server.STORE.data}, ensure_ascii=False)
`);
  return py;
}
function browserApi(method, url, body) {
  const task = apiQueue.then(async () => {
    runtimePromise ||= initBrowserRuntime();
    const py = await runtimePromise;
    const state = localStorage.getItem(BROWSER_KEY) || JSON.stringify({version: 1, entries: [], not_duplicates: []});
    const call = py.globals.get('browser_call');
    let out;
    try { out = JSON.parse(call(method, url, JSON.stringify(body || {}), state)); }
    finally { call.destroy(); }
    if (!out.result || out.result.ok === false) throw new Error(out.result?.error || '操作失败');
    if (method !== 'GET') localStorage.setItem(BROWSER_KEY, JSON.stringify(out.state));
    return out.result;
  });
  apiQueue = task.catch(() => {});
  return task;
}
