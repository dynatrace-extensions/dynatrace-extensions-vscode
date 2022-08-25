import { CredentialVaultService } from "./configuration_v1/credentialVault";
import { ExtensionsServiceV2 } from "./environment_v2/extensions";
import { EntityServiceV2 } from "./environment_v2/monitoredEntities";
import { HttpClient } from "./http_client";

/**
 * Implentation of a Dynatrace Client to facilitate calls to Dynatrace APIs
 */
export class Dynatrace {
  _httpClient: HttpClient;
  extensionsV2: ExtensionsServiceV2;
  credentialVault: CredentialVaultService;
  entitiesV2: EntityServiceV2;

  constructor(baseUrl: string, apiToken: string) {
    this._httpClient = new HttpClient(baseUrl, apiToken);
    this.extensionsV2 = new ExtensionsServiceV2(this._httpClient);
    this.credentialVault = new CredentialVaultService(this._httpClient);
    this.entitiesV2 = new EntityServiceV2(this._httpClient);
  }
}
