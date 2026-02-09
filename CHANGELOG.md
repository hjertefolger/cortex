# Changelog

## 2.1.3

### Bug Fixes

- **MCP server: ignore JSON-RPC notifications instead of sending invalid responses.**
  After the `initialize` handshake, Claude Code sends a `notifications/initialized`
  message (a JSON-RPC notification with no `id` field). The server incorrectly
  treated this as a request, responded with an error containing `id: undefined`,
  and caused Claude Code to drop the STDIO connection ("1 MCP server failed").
  Notifications are now silently ignored as required by the JSON-RPC 2.0 spec.
