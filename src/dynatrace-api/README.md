# Dynatrace API Client

Internal HTTP client for Dynatrace API operations. This is **not** a general-purpose SDK — it only implements the endpoints needed by the extension.

## Structure

```
dynatrace-api/
├── dynatrace.ts            # Facade class — composes all services
├── http_client.ts           # Axios-based HTTP transport
├── errors.ts                # DynatraceAPIError class
├── environment_v2/          # Environment API v2 services
│   ├── activegates.ts       #   ActiveGatesService
│   ├── extensions.ts        #   ExtensionsServiceV2
│   ├── metrics.ts           #   MetricService
│   ├── monitoredEntities.ts #   EntityServiceV2
│   └── settings.ts          #   SettingsService
├── configuration_v1/        # Configuration API v1 services
│   ├── credentialVault.ts   #   CredentialVaultService
│   ├── dashboards.ts        #   DashboardService
│   └── extensions.ts        #   ExtensionsServiceV1
└── interfaces/              # Request/response DTOs
    ├── dynatrace.ts         #   Transport types (request config, pagination, errors)
    ├── extensions.ts         #   Extension DTOs
    ├── monitoredEntities.ts  #   Entity/EntityType DTOs
    ├── settings.ts           #   Settings DTOs
    ├── activegates.ts        #   ActiveGate DTOs
    ├── credentialVault.ts    #   Credential DTOs
    └── dashboards.ts         #   Dashboard DTOs
```

## How it works

1. **`HttpClient`** handles raw HTTP. It wraps Axios, injects `Api-Token` authorization, and provides:
   - `makeRequest<T>()` — single request with typed response
   - `paginatedCall<T>()` — automatic iteration over paginated responses using `nextPageKey`

2. **Service classes** each own one API endpoint group. They receive an `HttpClient` and expose typed async methods.

3. **`Dynatrace`** is the facade. It creates a single `HttpClient` and composes all services:
   ```typescript
   const dt = new Dynatrace("https://abc123.apps.dynatrace.com", "dt0c01.xxx");
   const entities = await dt.entitiesV2.list({ entitySelector: "type(HOST)" });
   ```

4. **Access** from elsewhere in the extension is through the tree view layer:
   ```typescript
   import { getDynatraceClient } from "../treeViews/tenantsTreeView";

   const dtClient = await getDynatraceClient();
   ```

## Adding a new endpoint

If a feature needs an API operation that isn't implemented yet:

### 1. Add or update DTOs in `interfaces/`

Define TypeScript interfaces for the request parameters and response body. They don't need to be exhaustive — only include the fields the extension actually uses.

```typescript
// interfaces/myEndpoint.ts
export interface MyResource {
  id: string;
  name: string;
}
```

### 2. Create or extend a service class

If the endpoint belongs to an existing API group, add a method to that service. Otherwise, create a new service file in the appropriate API version folder.

```typescript
// environment_v2/myEndpoint.ts
import { HttpClient } from "../http_client";
import { MyResource } from "../interfaces/myEndpoint";

export class MyEndpointService {
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

### 3. Register the service in `Dynatrace`

Add the new service as a property on the `Dynatrace` facade class in `dynatrace.ts`:

```typescript
export class Dynatrace {
  // ... existing services
  myEndpoint: MyEndpointService;

  constructor(baseUrl: string, apiToken: string) {
    const httpClient = new HttpClient(baseUrl, apiToken);
    // ... existing assignments
    this.myEndpoint = new MyEndpointService(httpClient);
  }
}
```

### 4. Use it

```typescript
const dtClient = await getDynatraceClient();
if (dtClient) {
  const resources = await dtClient.myEndpoint.list();
}
```

## Error handling

All API errors are wrapped in `DynatraceAPIError` (from `errors.ts`), which provides:
- HTTP status code
- Dynatrace error message
- Constraint violations (if any)

Callers should `catch` and handle these for user-facing error reporting.
