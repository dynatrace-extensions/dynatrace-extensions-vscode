import * as vscode from "vscode";
import * as yaml from "yaml";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import { EnvironmentsTreeDataProvider } from "../treeViews/environmentsTreeView";
import { getAttributesKeysFromTopology, getRelationships } from "../utils/extensionParsing";
import { isCursorAt } from "../utils/yamlParsing";

const TRIGGER_SUGGEST_CMD: vscode.Command = {
  command: "editor.action.triggerSuggest",
  title: "Re-trigger suggestions...",
};

/**
 * Provider for code auto-completions within entity selectors.
 */
export class EntitySelectorCompletionProvider implements vscode.CompletionItemProvider {
  builtinEntities: EntityType[];
  environments: EnvironmentsTreeDataProvider;

  /**
   * @param environments Dynatrace Environments Tree Provide
   */
  constructor(environments: EnvironmentsTreeDataProvider) {
    this.builtinEntities = [];
    this.environments = environments;
  }

  /**
   * Provides the actual completion items related to the currently typed entity selector.
   * @param document
   * @param position
   * @param token
   * @param context
   * @returns
   */
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    var completionItems: vscode.CompletionItem[] = [];
    var extension = yaml.parse(document.getText()) as ExtensionStub;

    if (this.builtinEntities.length === 0) {
      this.loadBuiltinEntities();
    }

    if (document.lineAt(position.line).text.includes("entitySelectorTemplate:")) {
      var line = document.lineAt(position.line).text;
      var currentSelector = this.getMostRecentSelector(line, position.character);

      if (
        isCursorAt(document, position, "entitySelectorTemplate:") ||
        (isCursorAt(document, position, "(") &&
          this.isCursorAtRelationshipStart(document, position))
      ) {
        completionItems.push(this.createBaseSelectorCompletion());
      }
      if (isCursorAt(document, position, "type(")) {
        completionItems.push(this.createTypeCompletion(extension, currentSelector));
      }
      if (isCursorAt(document, position, "),")) {
        completionItems.push(this.createOperatorCompletion(currentSelector, extension));
      }
      if (
        isCursorAt(document, position, "fromRelationships.") ||
        isCursorAt(document, position, "toRelationships.")
      ) {
        this.createRelationshipCompletion(currentSelector, extension);
      }
    }

    return completionItems;
  }

  /**
   * Loads the details of all entity types available in Dynatrace
   */
  private loadBuiltinEntities() {
    this.environments.getDynatraceClient().then((dt) => {
      if (dt) {
        dt.entitiesV2.listTypes().then((types: EntityType[]) => {
          this.builtinEntities.push(...types);
        });
      }
    });
  }

  /**
   * Creates a completion item that should trigger a the beginning of a new entity selector.
   * Can and should be used with nested selectors too.
   * @returns completion item
   */
  private createBaseSelectorCompletion(): vscode.CompletionItem {
    const selectorCompletion = new vscode.CompletionItem(
      "entitySelectorTemplate: ",
      vscode.CompletionItemKind.Constant
    );
    selectorCompletion.detail = "Begin building selector";

    selectorCompletion.insertText = new vscode.SnippetString(
      "${1|type(,entityId(,$(entityConditions)|}"
    );
    selectorCompletion.command = TRIGGER_SUGGEST_CMD;

    return selectorCompletion;
  }

  /**
   * Creates a completion item that suggest entity types.
   * To be used whenever the "type(" keyword has been typed.
   * @param extension extension yaml serialized as object
   * @param selector the most recent selector chunk typed already
   * @returns Completion item
   */
  private createTypeCompletion(extension: ExtensionStub, selector: string): vscode.CompletionItem {
    var customEntities = extension.topology.types.map((type) => type.name);
    var entities = [
      ...customEntities,
      ...this.builtinEntities.map((type) => type.type!.toLowerCase()),
    ];
    var usedTypes = this.getTypesFromSelector(selector);
    entities = entities.filter((entity) => !usedTypes.includes(entity));

    const typeCompletion = new vscode.CompletionItem("type(", vscode.CompletionItemKind.Constant);
    typeCompletion.detail = "Browse detected entity types";
    typeCompletion.insertText = new vscode.SnippetString();
    typeCompletion.insertText.appendText('"');
    typeCompletion.insertText.appendChoice(entities);
    typeCompletion.insertText.appendText('")');
    typeCompletion.commitCharacters = [","];
    typeCompletion.command = TRIGGER_SUGGEST_CMD;

    return typeCompletion;
  }

  /**
   * Creates a completion item suggesting operators and attributes relevant to the current
   * position within the most recent entity selector typed already.
   * @param selector the most recent selector chunk already typed
   * @param extension extension yaml serialized as object
   * @returns
   */
  private createOperatorCompletion(
    selector: string,
    extension: ExtensionStub
  ): vscode.CompletionItem {
    var operators = this.getAvailableOperators(selector, extension);

    const operatorCompletion = new vscode.CompletionItem("),", vscode.CompletionItemKind.Constant);
    operatorCompletion.detail = "Continue entity selector";
    operatorCompletion.insertText = new vscode.SnippetString();
    operatorCompletion.insertText.appendChoice(operators);
    operatorCompletion.command = TRIGGER_SUGGEST_CMD;

    return operatorCompletion;
  }

  /**
   * Creates a completion item suggesting relationship types that apply to the entity type
   * referenced within the most recently typed entity selector that triggered the completion.
   * If not type can be successfully inferred, or the type does not have relationships in that
   * direction, no suggestions are offered.
   * @param selector the most recent selector chunk already typed
   * @param extension extension yaml serialized as object
   * @returns Completion item
   */
  private createRelationshipCompletion(
    selector: string,
    extension: ExtensionStub
  ): vscode.CompletionItem {
    const relationshipCompletion = new vscode.CompletionItem(
      selector.endsWith("fromRelationships.") ? "fromRelationships." : "toRelationships.",
      vscode.CompletionItemKind.Constant
    );

    var entityType = this.getMostRecentEntityType(selector);
    if (entityType) {
      relationshipCompletion.detail = "Browse relationships";
      relationshipCompletion.insertText = new vscode.SnippetString();

      let relations = getRelationships(
        entityType,
        selector.endsWith("fromRelationships.") ? "from" : "to",
        extension
      );

      if (relations) {
        if (relations.length > 1) {
          relationshipCompletion.insertText.appendChoice(relations);
        } else {
          relationshipCompletion.insertText.appendText(relations[0]);
        }
        relationshipCompletion.insertText.appendText("(");
      }
      relationshipCompletion.command = TRIGGER_SUGGEST_CMD;
    }

    return relationshipCompletion;
  }

  /**
   * Parses an entity selector string and extracts the types found within.
   * @param selector the entity selector typed so far
   * @returns list of entity types found
   */
  private getTypesFromSelector(selector: string) {
    var types: string[] = [];
    let re = new RegExp('type\\("?(.*?)"?\\)', "g");
    let matchIter = selector.matchAll(re);
    let match = matchIter.next();
    while (!match.done) {
      types.push(match.value[1]);
      match = matchIter.next();
    }

    return types;
  }

  /**
   * Parses an entity selector and returns a list of operators that can be used given
   * the current position and what's already been typed. If an entity type can be
   * reasonably inferred, entity attributes are also included.
   * @param selector the most recent selector chunk already typed
   * @param extension extension yaml serialized as object
   * @returns list of operators that can be used within the selector
   */
  private getAvailableOperators(selector: string, extension: ExtensionStub) {
    const singleUseOperators = [
      "type(",
      "entityId(",
      "fromRelationships.",
      "toRelationships.",
      "$(entityConditions)",
    ];
    const otherOperators = ["entityName", "tag(", "mzId(", "mzName(", "healthState(", "not("];
    const attributes = getAttributesKeysFromTopology(
      this.getMostRecentEntityType(selector),
      extension
    );

    return [
      ...singleUseOperators.filter((operator) => !selector.includes(operator)),
      ...otherOperators,
      ...attributes,
    ];
  }

  /**
   * Checks whether the cursor is at the start of a (to or from) relationship declaration.
   * @param document document that triggered the completion
   * @param position position at which completion was triggered
   * @returns status of check
   */
  private isCursorAtRelationshipStart(
    document: vscode.TextDocument,
    position: vscode.Position
  ): boolean {
    var cursor = position.character;

    for (let i = cursor; i > 0; i--) {
      let line = document.lineAt(position.line).text.substring(i - 1, cursor);
      if (line.includes(",")) {
        return false;
      }
      if (line.includes("fromRelationships.") || line.includes("toRelationships.")) {
        return true;
      }
    }

    return false;
  }

  /**
   * Given an already typed entity selector, works its way backwards to find the
   * most recently referenced entity type and returns it.
   * @param selector the most recent selector chunk already typed
   * @returns entity type if found else ""
   */
  private getMostRecentEntityType(selector: string): string {
    for (let i = selector.length - 1; i > 0; i--) {
      let line = selector.substring(i - 1, selector.length - 1);
      if (line.includes("type(")) {
        let matches = /type\("?(.*?)"?\)/.exec(line);
        if (matches && matches.length > 1) {
          return matches[1];
        }
      }
    }
    return "";
  }

  /**
   * Gets the inner most entity selector closest to the triggering character.
   * This is done by working backwards and matching declarations that typically start
   * a new selector. If no nested selectors exist, the original selector is returned.
   * @param selector the most recent selector chunk already typed
   * @param character character position at which the completion was triggered
   * @returns entity selector
   */
  private getMostRecentSelector(selector: string, character: number): string {
    for (let i = character; i > 0; i--) {
      let line = selector.substring(i - 1, character);
      let re = new RegExp("(?:from|to)Relationships\\..*?\\(");
      if (re.test(line)) {
        let matches = re.exec(line);
        if (matches) {
          return line.substring(matches[0].indexOf("(") + 1, line.length);
        }
      }
      if (line.includes("entitySelectorTemplate: ")) {
        return selector.substring(24, character);
      }
    }
    return selector;
  }
}
