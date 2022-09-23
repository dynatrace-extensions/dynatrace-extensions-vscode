import * as vscode from "vscode";
import * as yaml from "yaml";
import { CachedDataProvider } from "../utils/dataCaching";
import {
  getAttributesKeysFromTopology,
  getEntityName,
  getRelationships,
  getRelationshipTypes,
} from "../utils/extensionParsing";
import { getBlockItemIndexAtLine, getParentBlocks } from "../utils/yamlParsing";

const TRIGGER_SUGGEST_CMD: vscode.Command = {
  command: "editor.action.triggerSuggest",
  title: "Re-trigger suggestions...",
};

/**
 * Provider for code auto-completions within entity selectors.
 */
export class EntitySelectorCompletionProvider implements vscode.CompletionItemProvider {
  private builtinEntities: EntityType[];
  private readonly cachedData: CachedDataProvider;

  /**
   * @param cachedDataProvider a provider for cacheable data
   */
  constructor(cachedDataProvider: CachedDataProvider) {
    this.cachedData = cachedDataProvider;
    this.builtinEntities = [];
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
  ): vscode.CompletionItem[] {
    var completionItems: vscode.CompletionItem[] = [];
    var extension = yaml.parse(document.getText()) as ExtensionStub;
    var line = document.lineAt(position.line).text.substring(0, position.character);

    this.builtinEntities = this.cachedData.getBuiltinEntities();

    // Completions are possible on any line containing `entitySelectorTemplate`
    if (line.includes("entitySelectorTemplate:")) {
      var currentSelector = this.getMostRecentSelector(line, position.character);

      // If at the start of template, offer pre-defined selectors or option to build
      if (line.endsWith("entitySelectorTemplate: ")) {
        completionItems.push(...this.createKnownSelectorCompletions(position, document));
        completionItems.push(this.createBaseSelectorCompletion());
      }
      // If we just started a relationship definition, assume new selector start
      if (line.endsWith("(") && this.isCursorAtRelationshipStart(document, position)) {
        completionItems.push(this.createBaseSelectorCompletion());
      }
      // `type` will always require a valid entity type
      if (line.endsWith("type(")) {
        completionItems.push(...this.createTypeCompletions(extension, currentSelector));
      }
      // Closing bracket and comma implies continuation, suggest valid operators
      if (line.endsWith("),")) {
        completionItems.push(...this.createOperatorCompletions(currentSelector, extension));
      }
      // Clear markers for suggesting relationships relevant to current selector context
      if (line.endsWith("fromRelationships.") || line.endsWith("toRelationships.")) {
        completionItems.push(this.createRelationshipCompletion(currentSelector, extension));
      }
    }

    return completionItems;
  }

  /**
   * Creates a completion item that should trigger a the beginning of a new entity selector.
   * Can and should be used with nested selectors too.
   * @returns completion item
   */
  private createBaseSelectorCompletion(): vscode.CompletionItem {
    const selectorCompletion = new vscode.CompletionItem("Begin building selector", vscode.CompletionItemKind.Constant);
    selectorCompletion.detail = "Copilot suggestion";
    selectorCompletion.documentation = new vscode.MarkdownString(
      "Begin building an entity selector. You must start with targetting " +
        "either an entity type or ID. `$(entityConditions)` would automatically " +
        "target the entity of the current context."
    );
    selectorCompletion.insertText = new vscode.SnippetString("${1|type(,entityId(,$(entityConditions|}");
    selectorCompletion.insertText.appendText(")");
    selectorCompletion.command = TRIGGER_SUGGEST_CMD;

    return selectorCompletion;
  }

  /**
   * Creates completion items for every relationships that we can deduce for the current entity.
   * The current entity itself is deduced based on the location within the yaml.
   * @param position VSCode Position where provider was triggered
   * @param document VSCode TextDocument in which provider was triggered
   * @returns list of completion items
   */
  private createKnownSelectorCompletions(
    position: vscode.Position,
    document: vscode.TextDocument
  ): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    const extension = yaml.parse(document.getText()) as ExtensionStub;
    const parentBlocks = getParentBlocks(position.line, document.getText());
    const screenIdx = getBlockItemIndexAtLine("screens", position.line, document.getText());

    // Figure out who $(entityConditions) is based on location in yaml
    var entityType = extension.screens![screenIdx].entityType;
    if (
      parentBlocks[parentBlocks.length - 1] === "relation" &&
      parentBlocks[parentBlocks.length - 3] === "entitiesListCards"
    ) {
      const cardIdx = getBlockItemIndexAtLine("entitiesListCards", position.line, document.getText());
      const cardSelector = extension.screens![screenIdx].entitiesListCards![cardIdx].entitySelectorTemplate;
      if (cardSelector) {
        entityType = cardSelector.split("type(")[1].split(")")[0].replace(/"/g, "");
        console.log(`ENTI TYPE: ${entityType}`);
      }
    }

    // Gather relationships of that entity, and convert to completion items
    getRelationships(entityType, extension).forEach((rel) => {
      var relEntityName = getEntityName(rel.entity, extension);
      if (relEntityName === "") {
        relEntityName = rel.entity;
      }
      const relationCompletionItem = new vscode.CompletionItem(
        `Insert relation to ${relEntityName}`,
        vscode.CompletionItemKind.Function
      );
      relationCompletionItem.detail = "Copilot suggestion";
      relationCompletionItem.documentation =
        `Insert an entity selector template to pull all related ${relEntityName} entities. ` +
        "This has been configured based on your yaml file.";
      relationCompletionItem.insertText = `type("${rel.entity}"),${
        rel.direction === "to" ? "from" : "to"
      }Relationships.${rel.relation}($(entityConditions))`;
      completions.push(relationCompletionItem);
    });

    return completions;
  }

  /**
   * Creates a completion item that suggest entity types.
   * To be used whenever the "type(" keyword has been typed.
   * @param extension extension yaml serialized as object
   * @param selector the most recent selector chunk typed already
   * @returns Completion item
   */
  private createTypeCompletions(extension: ExtensionStub, selector: string): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    var usedTypes = this.getTypesFromSelector(selector);
    var customTypes = extension.topology.types.map((type) => type.name).filter((e) => !usedTypes.includes(e));
    var builtinTypes = this.builtinEntities
      .map((type) => type.type!.toLowerCase())
      .filter((e) => !usedTypes.includes(e));

    if (customTypes.length > 0) {
      const customTypeCompletion = new vscode.CompletionItem("Custom entity types", vscode.CompletionItemKind.Class);
      customTypeCompletion.detail = "Copilot suggestion";
      customTypeCompletion.documentation = "Insert one of your custom entity types detected from this yaml file.";
      customTypeCompletion.insertText = new vscode.SnippetString();
      customTypeCompletion.insertText.appendText('"');
      customTypeCompletion.insertText.appendChoice(customTypes);
      customTypeCompletion.insertText.appendText('"');
      customTypeCompletion.command = TRIGGER_SUGGEST_CMD;
      completions.push(customTypeCompletion);
    }
    if (builtinTypes.length > 0) {
      const builtinTypeCompletion = new vscode.CompletionItem("Built-in entity types", vscode.CompletionItemKind.Class);
      builtinTypeCompletion.detail = "Copilot suggestion";
      builtinTypeCompletion.documentation = "Insert one of Dynatrace's built-in entity types";
      builtinTypeCompletion.insertText = new vscode.SnippetString();
      builtinTypeCompletion.insertText.appendText('"');
      builtinTypeCompletion.insertText.appendChoice(builtinTypes);
      builtinTypeCompletion.insertText.appendText('"');
      builtinTypeCompletion.command = TRIGGER_SUGGEST_CMD;
      completions.push(builtinTypeCompletion);
    }

    return completions;
  }

  /**
   * Creates a completion item suggesting operators and attributes relevant to the current
   * position within the most recent entity selector typed already.
   * @param selector the most recent selector chunk already typed
   * @param extension extension yaml serialized as object
   * @returns list of completion items
   */
  private createOperatorCompletions(selector: string, extension: ExtensionStub): vscode.CompletionItem[] {
    var completions: vscode.CompletionItem[] = [];
    var operators = this.getAvailableOperators(selector, extension);

    operators.forEach((operator) => {
      const operatorCompletion = new vscode.CompletionItem(operator.name, vscode.CompletionItemKind.Constant);
      operatorCompletion.detail = "Copilot suggestion";
      operatorCompletion.documentation = operator.description;
      operatorCompletion.insertText = new vscode.SnippetString();
      operatorCompletion.insertText.appendChoice(operator.insertions);
      operatorCompletion.command = TRIGGER_SUGGEST_CMD;
      completions.push(operatorCompletion);
    });

    return completions;
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
  private createRelationshipCompletion(selector: string, extension: ExtensionStub): vscode.CompletionItem {
    const relationshipCompletion = new vscode.CompletionItem(
      selector.endsWith("Browse relationships") ? "fromRelationships." : "toRelationships.",
      vscode.CompletionItemKind.Constant
    );

    var entityType = this.getMostRecentEntityType(selector);
    if (entityType) {
      relationshipCompletion.detail = "Copilot suggestion";
      relationshipCompletion.insertText = new vscode.SnippetString();

      let relations = getRelationshipTypes(
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
        relationshipCompletion.insertText.appendText("()");
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
    type Operator = { name: string; description: string; insertions: string[] };
    const singleUseOperators: Operator[] = [
      {
        name: "Entity type",
        insertions: ["type("],
        description: "Start a new entity selector by targetting an entity type.",
      },
      {
        name: "Entity ID",
        insertions: ["entityId("],
        description: "Start a new entity selector by targetting a specific entity by ID.",
      },
      {
        name: "From relationships",
        insertions: ["fromRelationships."],
        description: "Refine entity selection by matching relationships going from the entity in the current context.",
      },
      {
        name: "To relationships",
        insertions: ["toRelationships."],
        description: "Refine entity selection by matching relationships coming to the entity in the current context.",
      },
      {
        name: "Current entity",
        insertions: ["$(entityConditions)"],
        description:
          "Automatically map the current context entity via this variable. Must be used once for the template to be valid.",
      },
    ];
    const otherOperators: Operator[] = [
      { name: "Entity name", insertions: ["entityName"], description: "Refine entity selection by their name" },
      { name: "Tags", insertions: ["tag("], description: "Refine entity selection by tags" },
      {
        name: "Management zone ID",
        insertions: ["mzId("],
        description: "Refine entity selection by Management Zone ID",
      },
      {
        name: "Management zone name",
        insertions: ["mzName("],
        description: "Refine entity selection by Management Zone name",
      },
      {
        name: "Health state",
        insertions: ["healthState("],
        description: "Refine entity selection by their current health status",
      },
      { name: "Add negation operator", insertions: ["not("], description: "Negate the next condition" },
    ];
    const attributeOperator: Operator = {
      name: "Entity attributes",
      description: "Refine entity selection by the value of its attributes",
      insertions: getAttributesKeysFromTopology(this.getMostRecentEntityType(selector), extension),
    };

    return [
      ...singleUseOperators.filter((operator) => !selector.includes(operator.name)),
      ...otherOperators,
      attributeOperator,
    ];
  }

  /**
   * Checks whether the cursor is at the start of a (to or from) relationship declaration.
   * @param document document that triggered the completion
   * @param position position at which completion was triggered
   * @returns status of check
   */
  private isCursorAtRelationshipStart(document: vscode.TextDocument, position: vscode.Position): boolean {
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
