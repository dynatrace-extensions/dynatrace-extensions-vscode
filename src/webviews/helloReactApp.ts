import * as vscode from "vscode";
import { showMessage } from "../utils/code";

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 *
 * @remarks This function is primarily used to help enforce content security
 * policies for resources/scripts being executed in a webview context.
 *
 * @returns A nonce
 */
export function getNonce() {
  let text = "";
  /* eslint-disable-next-line no-secrets/no-secrets */
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * This class manages the state and behavior of HelloReact webview panels.
 */
export class HelloReactAppPanel {
  public static currentPanel: HelloReactAppPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  /**
   * The HelloWorldPanel class private constructor (called only from the render method).
   *
   * @param panel A reference to the webview panel
   * @param extensionUri The URI of the directory containing the extension
   */
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;

    // Event listener for disposing the panel
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Set the HTML content for the panel
    this.panel.webview.html = this._getWebviewContent(this.panel.webview, extensionUri);

    // Event listener for messages passed from the webview
    this._setWebviewMessageListener(this.panel.webview);
  }

  /**
   * Defines and returns the HTML that should be rendered within the webview panel.
   *
   * @remarks This is also the place where references to the React webview build files
   * are created and inserted into the webview HTML.
   *
   * @param webview A reference to the extension webview
   * @param extensionUri The URI of the directory containing the extension
   * @returns A template string literal containing the HTML that should be
   * rendered within the webview panel
   */
  private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
    // The CSS file from the React build output
    // const stylesUri = webview
    //   .asWebviewUri(
    //     vscode.Uri.joinPath(extensionUri, "webview-ui", "build", "static", "css", "main.css"),
    //   )
    //   .toString();
    // The JS file from the React build output
    const scriptUri = webview
      .asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "webview-ui", "build", "static", "js", "main.js"),
      )
      .toString();
    const nonce = getNonce();

    // es6-string-html extension is needed for HTML highlighting
    return /*html*/ `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
          <meta name="theme-color" content="#000000">
          <meta http-equiv="Content-Security-Policy" content="default-src ${webview.cspSource} https://dt-cdn.net; img-src ${webview.cspSource}; style-src 'unsafe-inline' https://dt-cdn.net; script-src 'nonce-${nonce}';">
          <title>Hello World</title>
        </head>
        <body>
          <noscript>You need to enable JavaScript to run this app.</noscript>
          <div id="root"></div>
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
  }

  /**
   * Sets up an event listener to listen for messages passed from the webview context and
   * executes code based on the message that is recieved.
   *
   * @param webview A reference to the extension webview
   * @param context A reference to the extension context
   */
  private _setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      (message: { command: string; text: string }) => {
        const command = message.command;
        const text = message.text;

        switch (command) {
          case "hello":
            // Code that should run in response to the hello message command
            showMessage("info", text);
            return;
          // Add more switch case statements here as more webview message commands
          // are created within the webview context (i.e. inside media/main.js)
        }
      },
      undefined,
      this.disposables,
    );
  }

  /**
   * Cleans up and disposes of webview resources
   */
  public dispose() {
    HelloReactAppPanel.currentPanel = undefined;

    // Dispose of the current panel
    this.panel.dispose();

    // Dispose of all disposables for the current webivew panel
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Renders the current webview panel if it exists otherwise a new webview panel
   * will be created and displayed.
   *
   * @param extensionUri The URI of the directory containing the extension.
   */
  public static render(extensionUri: vscode.Uri) {
    if (HelloReactAppPanel.currentPanel) {
      // If the webview panel already exists, reveal it
      HelloReactAppPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
    } else {
      // Otherwise, create and show a new one
      const panel = vscode.window.createWebviewPanel(
        "showReactPanel",
        "Hello React App",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            // Enable JS in the webview
            vscode.Uri.joinPath(extensionUri, "out"),
            // Restrict webview to only load resources from the `out` and `webview-ui/build` folders
            vscode.Uri.joinPath(extensionUri, "webview-ui/build"),
          ],
        },
      );

      HelloReactAppPanel.currentPanel = new HelloReactAppPanel(panel, extensionUri);
    }
  }
}
