// Pure test helpers shared by route-handler tests. Nothing here touches vi.mock
// (those must live in the test file so Vitest can hoist them); this only holds
// utilities that are safe to import normally and are used inside test bodies.

/** Build a Request whose .json() yields `body` (or {} when omitted). */
export function jsonRequest(body?: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
