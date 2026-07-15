# Dynatrace API Client

Dual-transport API client layer for Dynatrace API operations. This is **not** a general-purpose SDK — it only implements the endpoints needed by the extension.

The layer supports two deployment models:
- **Managed** — Axios-based `HttpClient` for Dynatrace Managed environments (REST APIs)
- **SaaS** — Dynatrace SDK clients for the SaaS platform (`@dynatrace-internal/client-extensions`, `@dynatrace-sdk/client-environment-v2`)

Both paths implement the `DynatraceClient` interface so that upstream consumers are deployment-model agnostic.

## Structure

```
dynatrace-api/
├── dynatrace.ts              # DynatraceClient interface, ManagedDynatraceClient, createDynatraceClient() factory
├── http_client.ts            # Axios-based HTTP transport (Managed only)
├── errors.ts                 # DynatraceAPIError class + wrapSdkError() helper
├── environment_v2/           # Environment API v2 services (Managed)
│   ├── activegates.ts        #   ActiveGatesService
│   ├── extensions.ts         #   ExtensionsServiceV2
│   ├── metrics.ts            #   MetricService
│   ├── monitoredEntities.ts  #   EntityServiceV2
│   └── settings.ts           #   SettingsService
├── configuration_v1/         # Configuration API v1 services (Managed)
│   ├── credentialVault.ts    #   CredentialVaultService
│   ├── dashboards.ts         #   DashboardService
│   └── extensions.ts         #   ExtensionsServiceV1
├── sdk/                      # SaaS platform transport
│   ├── sdkClientFactory.ts   #   Creates PlatformHttpClient + SDK client instances
│   ├── sdkDynatraceClient.ts #   SaaSDynatraceClient implementing DynatraceClient
│   ├── extensionsAdapter.ts  #   Adapts @dynatrace-internal/client-extensions → ExtensionsServiceV2Interface
│   ├── settingsAdapter.ts    #   Adapts @dynatrace-sdk/client-environment-v2 → SettingsServiceInterface
│   └── stubs.ts              #   Stub implementations for services not yet available on SaaS
└── interfaces/               # Request/response DTOs and service contracts
    ├── services.ts           #   Service interfaces (shared contract between Managed and SaaS)
    ├── dynatrace.ts          #   Transport types (request config, pagination, errors)
    ├── extensions.ts         #   Extension DTOs
    ├── monitoredEntities.ts  #   Entity/EntityType DTOs
    ├── settings.ts           #   Settings DTOs
    ├── activegates.ts        #   ActiveGate DTOs
    ├── credentialVault.ts    #   Credential DTOs
    └── dashboards.ts         #   Dashboard DTOs
```

## How it works

1. **`DynatraceClient`** is the common interface all consumers interact with. It defines property accessors for each service (e.g., `extensionsV2`, `settings`, `entitiesV2`).

2. **`createDynatraceClient(url, token, deploymentModel)`** is the factory that returns the appropriate implementation:
   - `"managed"` → `ManagedDynatraceClient` (Axios-backed)
   - `"saas"` → `SaaSDynatraceClient` (SDK-backed)

3. **Managed path:** `ManagedDynatraceClient` creates a single `HttpClient` and composes all `environment_v2/` and `configuration_v1/` service classes, same as the original architecture.

4. **SaaS path:** `SaaSDynatraceClient` creates SDK clients via `createSdkClients()`, then wraps them in adapter classes (`SdkExtensionsServiceV2`, `SdkSettingsService`) that conform to the same service interfaces. Services not yet available on SaaS (entities, metrics, credential vault, v1 extensions, dashboards, ActiveGates) use stub implementations.

5. **Access** from elsewhere in the extension is through the tree view layer:
   ```typescript
   import { getDynatraceClient } from "../treeViews/tenantsTreeView";

   const dtClient = await getDynatraceClient();
   const extensions = await dtClient.extensionsV2.list();
   ```

## Adding a new endpoint

### For Managed environments

If a feature needs a new REST API operation for Managed:

#### 1. Add or update DTOs in `interfaces/`

Define TypeScript interfaces for the request parameters and response body. They don't need to be exhaustive — only include the fields the extension actually uses.

```typescript
// interfaces/myEndpoint.ts
export interface MyResource {
  id: string;
  name: string;
}
```

#### 2. Add the method to the service interface

If the endpoint belongs to an existing service, add the method signature to its interface in `interfaces/services.ts`. Otherwise, create a new interface.

```typescript
// interfaces/services.ts
export interface MyEndpointServiceInterface {
  list(signal?: AbortSignal): Promise<MyResource[]>;
}
```

#### 3. Create or extend the Managed service class

If the endpoint belongs to an existing API group, add a method to that service. Otherwise, create a new service file in the appropriate API version folder. The class must implement its interface.

```typescript
// environment_v2/myEndpoint.ts
import { HttpClient } from "../http_client";
import { MyEndpointServiceInterface } from "../interfaces/services";
import { MyResource } from "../interfaces/myEndpoint";

export class MyEndpointService implements MyEndpointServiceInterface {
  private readonly endpoint = "/api/v2/myEndpoint";
  private readonly httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  async list(): Promise<MyResource[]> {
    return this.httpClient.paginatedCall<MyResource>({
      path: this.endpoint,
      item: "resources",
    });
  }
}
```

#### 4. Register the service

Add the new service to `DynatraceClient` interface and both implementations:
- In `dynatrace.ts`: add to `DynatraceClient` interface and `ManagedDynatraceClient`
- In `sdk/sdkDynatraceClient.ts`: add a stub or adapter to `SaaSDynatraceClient`

#### 5. Use it

```typescript
const dtClient = await getDynatraceClient();
if (dtClient) {
  const resources = await dtClient.myEndpoint.list();
}
```

### For SaaS environments

To add or extend an SDK-based service for SaaS:

1. Add the SDK client to `sdk/sdkClientFactory.ts` (if not already present)
2. Create an adapter in `sdk/` that implements the corresponding service interface from `interfaces/services.ts`
3. Map SDK response types to the existing DTOs in `interfaces/`
4. Wrap errors using `wrapSdkError()` from `errors.ts`
5. Wire the adapter into `SaaSDynatraceClient`

## Error handling

All API errors are wrapped in `DynatraceAPIError` (from `errors.ts`), which provides:
- HTTP status code
- Dynatrace error message
- Constraint violations (if any)

For SDK clients, `wrapSdkError()` converts SDK exceptions into `DynatraceAPIError`, ensuring a uniform error type regardless of deployment model.

Callers should `catch` and handle these for user-facing error reporting.

## Rate limit retry (SaaS)

The SaaS SDK path includes automatic retry handling for HTTP 429 (Too Many Requests) responses via `RateLimitRetryHandler` (from `rateLimitHandler.ts`).

### Behaviour

When an SDK call returns 429, the handler waits with exponential backoff before retrying:
- **Delay formula**: `initialDelayMs × backoffMultiplier^attempt` (e.g. 1s, 2s, 4s with defaults)
- **AbortSignal-aware**: cancels backoff sleep if the signal fires
- **Non-429 errors pass through** unchanged

### Default configuration

| Parameter          | Default | Description                                    |
| ------------------ | ------- | ---------------------------------------------- |
| `initialDelayMs`   | 1000    | Delay before the first retry (ms)              |
| `backoffMultiplier`| 2       | Multiplier applied per attempt                 |
| `maxRetries`       | 3       | Maximum retry attempts (total calls = 1 + max) |

### Custom configuration

Pass a partial `RateLimitConfig` to `createDynatraceClient()`:

```typescript
const client = createDynatraceClient(url, token, "saas", {
  initialDelayMs: 2000,
  maxRetries: 5,
});
```

The config is forwarded to `SaaSDynatraceClient`, which creates a single `RateLimitRetryHandler` shared by all SaaS adapters. The Managed path is not affected.
