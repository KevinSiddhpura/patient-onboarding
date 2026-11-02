export function streamEvents(req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  req.app.locals.events.add(req.session, req.query.client, res);
}
