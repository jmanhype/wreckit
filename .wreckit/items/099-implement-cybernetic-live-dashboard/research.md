# Research: Implement Cybernetic Live Dashboard

**Date**: 2025-01-28
**Item**: 099-implement-cybernetic-live-dashboard

## Research Question
Create a real-time web UI to visualize the autonomous system status. It should expose the Phoenix LiveDashboard and add a custom page to stream the 'life.log' and show the current 'Dream/Act/Heal' phase.

## Summary

The Cybernetic system is a Phoenix-based Elixir application implementing the Viable System Model (VSM) with five systems (S1-S5). The autonomous lifecycle follows a Dream/Act/Heal pattern managed by a bash script (`bin/life`) that logs to `life.log`. Phoenix LiveDashboard (v0.8.7) is already a dependency in `mix.exs:68`, but it is not yet configured or exposed in the router.

The implementation requires:
1. **Configure LiveView** in the Endpoint with a signing salt
2. **Add LiveDashboard route** to the router with authentication
3. **Create a custom LiveDashboard page** to display:
   - Real-time streaming of `life.log` contents
   - Current lifecycle phase (Dream/Act/Heal)
   - VSM system status (already available via `/health/vsm`)
4. **Integrate with existing telemetry** infrastructure

The system already has:
- Phoenix Endpoint at `lib/cybernetic/edge/gateway/endpoint.ex:1`
- Router at `lib/cybernetic/edge/gateway/router.ex:1`
- Health check endpoints with VSM status at `lib/cybernetic/edge/gateway/controllers/health_controller.ex:1`
- SSE streaming infrastructure at `lib/cybernetic/edge/gateway/controllers/events_controller.ex:1`
- Telemetry dashboard GenServer at `lib/cybernetic/telemetry/dashboard.ex:1`

## Current State Analysis

### Existing Implementation

**Phoenix Infrastructure:**
- Phoenix Endpoint (`lib/cybernetic/edge/gateway/endpoint.ex:1`) is configured with:
  - Plug pipeline for API, SSE, MCP, and metrics routes
  - No LiveView socket declaration yet
  - No LiveView signing salt configured
  - TLS enforcement, CORS, and telemetry integration

- Router (`lib/cybernetic/edge/gateway/router.ex:1`) has:
  - Pipeline architecture: `:api`, `:sse`, `:mcp`
  - No `:browser` pipeline for LiveView/LiveDashboard
  - No LiveDashboard routes

**Lifecycle Management:**
- `bin/life:1` - Bash script managing the autonomous cycle:
  - Phase 1: **Dreaming** - Runs `./dist/index.js dream` to generate ideas via S4
  - Phase 2: **Acting** - Checks for pending items, optionally runs `./dist/index.js next`
  - Phase 3: **Healing** - Runs `mix cyb.doctor` for health checks
  - Logs all activity to `life.log` in project root
  - Default interval: 300 seconds (5 minutes)

**Existing Telemetry:**
- `lib/cybernetic/telemetry/dashboard.ex:1` - GenServer for metrics collection
- OpenTelemetry integration configured
- Prometheus metrics exporter on port 9568
- VSM event telemetry for all 5 systems

**Health Status APIs:**
- `GET /health` - Basic health check
- `GET /health/detailed` - Full system health with confidence score
- `GET /health/vsm` - VSM systems status (S1-S5)
- `GET /health/resilience` - Circuit breaker and Telegram agent status

### Key Files

- `mix.exs:68` - Phoenix LiveDashboard dependency `{:phoenix_live_dashboard, "~> 0.8"}`
- `lib/cybernetic/edge/gateway/endpoint.ex:1` - Phoenix Endpoint (needs LiveView socket)
- `lib/cybernetic/edge/gateway/router.ex:1` - Router (needs LiveDashboard routes)
- `lib/cybernetic/edge/gateway/controllers/health_controller.ex:1` - VSM status endpoints
- `bin/life:1` - Autonomous lifecycle script
- `life.log:1` - Lifecycle log file (in project root)
- `config/dev.exs:16` - Dev endpoint config
- `config/config.exs:66` - Base endpoint config
- `config/runtime.exs:261` - Runtime endpoint config

## Technical Considerations

### Dependencies

**Already Available:**
- `phoenix_live_dashboard` v0.8.7 (in mix.exs:68)
- `phoenix_live_view` v0.20 (in mix.exs:67)
- `telemetry` - For metrics collection
- `jason` - JSON encoder
- Ecto/PostgreSQL - For persistent data storage

**Needed:**
- File watcher for `life.log` tailing (can use `FileSystem` or Elixir's `File.Stream`)
- LiveView page for custom dashboard
- Authentication/authorization pipeline

### Patterns to Follow

**Existing Router Pattern:**
```elixir
# From lib/cybernetic/edge/gateway/router.ex:11-29
pipeline :api do
  plug(:accepts, ["json"])
  plug(Cybernetic.Edge.Gateway.Plugs.RequestId)
  plug(Cybernetic.Edge.Gateway.Plugs.OIDC)
  plug(Cybernetic.Edge.Gateway.Plugs.TenantIsolation)
  plug(Cybernetic.Edge.Gateway.Plugs.RateLimiter)
  plug(Cybernetic.Edge.Gateway.Plugs.CircuitBreaker)
end
```

**Existing Controller Pattern:**
```elixir
# From lib/cybernetic/edge/gateway/controllers/health_controller.ex:13-21
def index(conn, _params) do
  conn
  |> put_status(:ok)
  |> json(%{
    status: "ok",
    service: "cybernetic-amcp",
    version: Application.spec(:cybernetic, :vsn) |> to_string(),
    timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
  })
end
```

**SSE Streaming Pattern:**
- EventsController (`lib/cybernetic/edge/gateway/controllers/events_controller.ex:1`) demonstrates real-time streaming
- Uses Phoenix.PubSub for broadcasting
- Implements connection tracking with ETS
- Heartbeat mechanism for long-lived connections

**Authentication Pattern:**
- OIDC plug at `lib/cybernetic/edge/gateway/plugs/oidc.ex`
- JWT verification via JWKS cache
- Tenant isolation middleware

## Implementation Approach

### Phase 1: LiveView and LiveDashboard Setup

1. **Update Endpoint Configuration:**
   - Add LiveView socket declaration to `lib/cybernetic/edge/gateway/endpoint.ex`
   - Configure `live_view: [signing_salt: "..."]` in config files
   - Generate signing salt for production (use `:crypto.strong_rand_bytes`)

2. **Add Browser Pipeline to Router:**
   - Create `:browser` pipeline in `lib/cybernetic/edge/gateway/router.ex`
   - Include authentication (OIDC or basic auth for dev)
   - Add LiveDashboard route at `/dashboard`

### Phase 2: Custom Dashboard Page

1. **Create LifecyclePage Module:**
   - Path: `lib/cybernetic/edge/gateway/pages/lifecycle_page.ex`
   - Use `Phoenix.LiveDashboard.PageBuilder` (from `deps/phoenix_live_dashboard/lib/phoenix/live_dashboard/page_builder.ex:1`)
   - Implement `menu_link/1` for navigation menu

2. **Implement LiveView for Lifecycle Display:**
   - Path: `lib/cybernetic/edge/gateway/live/lifecycle_live.ex`
   - Use `Phoenix.LiveView`
   - Subscribe to Phoenix.PubSub for real-time updates
   - Parse `life.log` to extract current phase

3. **Create Log Streaming GenServer:**
   - Path: `lib/cybernetic/edge/gateway/log_watcher.ex`
   - Watch `life.log` for changes (using `File.stat` + `File.stream`)
   - Broadcast new lines to PubSub topic `events:life.log`
   - Handle log rotation

4. **Create HEEX Template:**
   - Path: `lib/cybernetic/edge/gateway/live/lifecycle_live.html.heex`
   - Display current phase (Dream/Act/Heal) with visual indicator
   - Show log stream (last N lines)
   - VSM status badges (healthy/degraded/down)
   - Auto-scroll for new log entries

### Phase 3: Integration

1. **Register Custom Page:**
   ```elixir
   # In router
   live_dashboard "/dashboard",
     additional_pages: [
       lifecycle: Cybernetic.Edge.Gateway.Pages.LifecyclePage
     ]
   ```

2. **Wire Up Lifecycle Broadcasting:**
   - Modify `bin/life` to emit events to PubSub
   - Or create a GenServer that monitors `life.log` and broadcasts phase changes
   - Topics: `events:lifecycle:dream`, `events:lifecycle:act`, `events:lifecycle:heal`

3. **Add VSM Status Integration:**
   - Reuse existing health check logic from `health_controller.ex:45-112`
   - Display S1-S5 status in dashboard
   - Click to navigate to `/health/vsm` for details

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   Phoenix LiveDashboard                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │ Home          │  │ Metrics       │  │ Lifecycle     │   │
│  │ (built-in)    │  │ (built-in)    │  │ (custom)      │   │
│  └───────────────┘  └───────────────┘  └───────┬───────┘   │
│                                                   │           │
└───────────────────────────────────────────────────┼───────────┘
                                                    │
                                                    ▼
┌───────────────────────────────────────────────────────────────┐
│              LifecycleLive (Phoenix.LiveView)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Phase       │  │ VSM Status  │  │ Log Stream          │  │
│  │ Dream/Act   │  │ S1: Healthy  │  │ 🟢 System Online    │  │
│  │ /Heal       │  │ S2: Healthy  │  │ 🧠 Phase 1: Dream   │  │
│  │ (active)    │  │ S3: Healthy  │  │ ...                 │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
         │                   │                   │
         │                   │                   │
         ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ bin/life     │    │ Health API   │    │ LogWatcher   │
│ (script)     │    │ /health/vsm  │    │ GenServer    │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Life.log location** - File is in project root, not inside cybernetic-system directory | Medium | Create configuration option for log path, default to `../../../life.log` from cybernetic-system dir |
| **Authentication** - LiveDashboard exposes sensitive system info | High | Reuse existing OIDC plug, add admin-only pipeline, consider basic auth for dev |
| **Performance** - Tailing large log files could be expensive | Medium | Limit to last N lines (e.g., 1000), implement ring buffer, use ETS for cached entries |
| **Cross-node access** - LiveDashboard across distributed nodes | Low | LiveDashboard supports this natively, ensure EPMD connectivity |
| **Token leakage** - Life.log may contain sensitive tokens | High | Implement log redaction, filter out API keys/secrets before display |
| **File system polling** - Watching file may be inefficient | Low | Use `File.Stream` with interval, or consider inotify via `FileSystem` package |

## Open Questions

1. **Authentication Strategy:**
   - Should the dashboard use the existing OIDC pipeline or a separate admin auth?
   - Should it be accessible in production or dev-only?
   - Recommendation: Use OIDC with admin role check for production

2. **Log File Access:**
   - The `life.log` is in `/home/user/project/life.log` but the app runs in `/home/user/project/cybernetic-system`
   - Need to handle relative path correctly: `../../life.log`
   - Should we add a config option `CYBERNETIC_LIFE_LOG_PATH`?

3. **Lifecycle Detection:**
   - Currently the lifecycle is implicit in log format (e.g., "🧠 Phase 1: Dreaming")
   - Should we add explicit markers or a state file?
   - Alternative: Create a GenServer that runs the lifecycle and broadcasts state

4. **Dashboard Scope:**
   - Just lifecycle page or additional custom pages?
   - Suggested: Start with lifecycle, add VSM details page later

5. **Real-time Updates:**
   - Use Phoenix.PubSub for lifecycle phase changes?
   - Poll `life.log` every N seconds?
   - Hybrid: PubSub for explicit events, polling for log tail

## Recommended Next Steps

1. **Create feature branch:** `wreckit/099-implement-cybernetic-live-dashboard`
2. **Setup LiveView:**
   - Add signing salt to `config/dev.exs` and `config/runtime.exs`
   - Add LiveView socket to endpoint
   - Add browser pipeline to router
   - Add basic LiveDashboard route at `/dashboard`
3. **Implement Custom Page:**
   - Create `LifecyclePage` module following PageBuilder pattern
   - Create `LifecycleLive` LiveView
   - Create `LogWatcher` GenServer
   - Create HEEX template
4. **Integration:**
   - Wire up lifecycle detection
   - Add authentication
   - Test with running system
5. **Documentation:**
   - Update README with dashboard access info
   - Document lifecycle phase detection logic
   - Add screenshots to docs

## File Structure (Proposed)

```
lib/cybernetic/edge/gateway/
├── endpoint.ex (modify - add LiveView socket)
├── router.ex (modify - add browser pipeline and LiveDashboard route)
├── pages/
│   └── lifecycle_page.ex (create - PageBuilder implementation)
├── live/
│   ├── lifecycle_live.ex (create - LiveView for lifecycle display)
│   └── lifecycle_live.html.heex (create - UI template)
└── log_watcher.ex (create - GenServer for monitoring life.log)

config/
├── dev.exs (modify - add LiveView signing_salt)
└── runtime.exs (modify - add production signing_salt)

test/cybernetic/edge/gateway/
├── pages/
│   └── lifecycle_page_test.exs (create)
└── live/
    └── lifecycle_live_test.exs (create)
```

## References

- Phoenix LiveDashboard docs: https://hexdocs.pm/phoenix_live_dashboard
- Phoenix.LiveDashboard.PageBuilder: `deps/phoenix_live_dashboard/lib/phoenix/live_dashboard/page_builder.ex:1`
- Phoenix LiveView docs: https://hexdocs.pm/phoenix_live_view
- Existing SSE implementation: `lib/cybernetic/edge/gateway/controllers/events_controller.ex:1`
- VSM Architecture: `cybernetic-system/docs/architecture.md:1`
- Lifecycle script: `bin/life:1`
