import Axios from "axios";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";

/**
 * A utility class for caching reusable data that other components depend on.
 * The idea is that shared, cacheable data should only be fetched once.
 */
export class CachedDataProvider {
  private readonly environments: EnvironmentsTreeDataProvider;
  private builtinEntities: EntityType[] = [];
  private baristaIcons: string[] = [];

  /**
   * @param environments a Dynatrace Environments provider
   */
  constructor(environments: EnvironmentsTreeDataProvider) {
    this.environments = environments;
    this.loadBuiltinEntities();
    this.loadBaristaIcons();
  }

  /**
   * Gets a list of Dynatrace built-in entities and their details.
   * @returns list of entities
   */
  public getBuiltinEntities(): EntityType[] {
    if (this.builtinEntities.length === 0) {
      this.loadBuiltinEntities();
    }

    return this.builtinEntities;
  }

  /**
   * Gets a list of Dynatrace Barista icon IDs.
   * @returns list of icon IDs
   */
  public getBaristaIcons(): string[] {
    if (this.baristaIcons.length === 0) {
      this.loadBaristaIcons();
    }

    return this.baristaIcons;
  }

  /**
   * Loads the list of Dynatrace built-in entities from
   * the currently connected environment, if any.
   */
  private async loadBuiltinEntities() {
    this.environments.getDynatraceClient().then((dt) => {
      if (dt) {
        dt.entitiesV2.listTypes().then((types: EntityType[]) => {
          if (types.length > 0) {
            this.builtinEntities = types;
          }
        });
      }
    });
  }

  /**
   * Loads the names of all available Barista Icons.
   * The internal Barista endpoint is tried first, before the public one.
   */
  private loadBaristaIcons() {
    const publicURL = "https://barista.dynatrace.com/data/resources/icons.json";
    const internalURL = "https://barista.lab.dynatrace.org/data/resources/icons.json";
    interface BaristaMeta {
      title: string;
      public: boolean;
      tags: string[];
      name: string;
    }

    Axios.get(internalURL)
      .then((res) => {
        if (res.data.icons) {
          this.baristaIcons = res.data.icons.map((i: BaristaMeta) => i.name);
        }
      })
      .catch(async (err) => {
        console.log("Internal Barista not accessible. Trying public one.");

        Axios.get(publicURL)
          .then((res) => {
            if (res.data.icons) {
              this.baristaIcons = res.data.icons.map((i: BaristaMeta) => i.name);
            }
          })
          .catch((err) => {
            console.log("Public Barista not accessible.");
            console.log(err.message);
          });
      });
  }
}
