import * as vscode from "vscode";
import * as path from "path";
import { env } from "process";
import { GitExtension } from "../interfaces/git";
import { API as BuiltInGitApi } from "../interfaces/git";
import axios from "axios";
import { readFileSync, rmSync, writeFileSync } from "fs";

/**
 * Helper class for managing a Status Bar that allows creating Pull Request on the Dynatrace BitBucket.
 */
export class BitBucketStatus {
  private git: BuiltInGitApi | undefined;
  private readonly context: vscode.ExtensionContext;
  private readonly dtbbpat: string;
  private readonly commandId = "dt-ext-copilot-bitbucket.createBitBucketPR";
  private readonly statusBarItem: vscode.StatusBarItem;

  /**
   * @param context VS Code Extension Context
   */
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.dtbbpat = env.DTBBPAT || "";
    vscode.commands.registerCommand(this.commandId, () => this.createBitBucketPR());
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 999);
    this.statusBarItem.text = "$(git-pull-request-create) Create PR on BitBucket";
    this.statusBarItem.tooltip = "Looks like you can create a PR";
    this.statusBarItem.command = this.commandId;
    this.statusBarItem.hide();
    this.init();
  }

  /**
   * Initialization function. Fetches the API from VS Code's built-in Git extension
   * and then checks the repo state every 1 sec to see if PR is possible.
   */
  private init() {
    this.getBuiltInGitApi().then((git) => (this.git = git));
    // Set interval - every second update status bar
    setInterval(() => this.updateStatusBar(), 1000);
  }

  /**
   * Gets the Git API from VSCode's built-in Git extension.
   * @returns the API as object, or undefined if something goes wrong
   */
  private async getBuiltInGitApi(): Promise<BuiltInGitApi | undefined> {
    try {
      const extension = vscode.extensions.getExtension("vscode.git") as vscode.Extension<GitExtension>;
      if (extension !== undefined) {
        const gitExtension = extension.isActive ? extension.exports : await extension.activate();
        return gitExtension.getAPI(1);
      }
    } catch {}

    return undefined;
  }

  /**
   * Updates the status bar.
   * If the last commit on the remote of the current branch is different from the main one and
   * the current local & remote branches are in sync (not ahead/behind) then chances are you have
   * commits that can be pulled into main, therefore show the status bar item. Otherwise, hide it.
   */
  private updateStatusBar() {
    if (this.git && this.git.state === "initialized") {
      const repo = this.git!.getRepository(vscode.workspace.workspaceFolders![0].uri);
      // This means local & remote branch are synced
      if (repo && repo.state.HEAD && repo.state.HEAD.ahead === 0 && repo.state.HEAD.behind === 0) {
        if (repo.state.HEAD.upstream) {
          const remoteName = repo.state.HEAD.upstream.remote;
          const remoteBranch = `${remoteName}/${repo.state.HEAD.upstream.name}`;
          const remoteBranchRef = repo.state.refs.find((ref) => ref.remote === remoteName && ref.name === remoteBranch);
          const remoteMain = `${remoteName}/main`;
          const remoteMainRef = repo.state.refs.find((ref) => ref.remote === remoteName && ref.name === remoteMain);
          // If commit IDs are different, we can assume you have unsynced changes
          if (remoteBranchRef && remoteMainRef && remoteBranchRef.commit !== remoteMainRef.commit) {
            this.statusBarItem.tooltip = `Request pull: ${repo.state.HEAD.upstream.name} -> main`;
            this.statusBarItem.show();
            return;
          }
        }
      }
    }
    this.statusBarItem.hide();
  }

  /**
   * Workflow for creating a Pull Request in BitBucket.
   * Data is gathered from VS Code's built-in Git extension, and additional details are collected
   * from the user to customize the Pull Request. We then fire and forget about it.
   * @returns
   */
  private async createBitBucketPR() {
    // Gather some details from Git
    this.statusBarItem.text += " $(sync~spin)";
    const repo = this.git!.getRepository(vscode.workspace.workspaceFolders![0].uri);
    var [projectKey, repoSlug] = await repo!.getConfig("remote.origin.url").then((url) => url.split("/").slice(-2));
    projectKey = projectKey.toUpperCase();
    repoSlug = repoSlug.split(".git")[0];
    const fromBranch = repo!.state.HEAD!.upstream!.name;
    const authorName = await repo!.getCommit(repo!.state.refs[0].commit!).then((c) => c.authorName);
    this.statusBarItem.text = this.statusBarItem.text.replace(" $(sync~spin)", "");

    // Allow user to set a custom title for this PR
    const title = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      title: "Create Pull Request (1/3)",
      placeHolder: "Provide a title for this Pull Request",
      value: `Pull ${fromBranch} into main`,
      prompt: "Optional",
    });
    if (!title) {return;}

    // Allow user to set custom description for the PR.
    // TODO: Pre-populate with commits history or something.
    const prDescription = await this.getPullRequestDescription(fromBranch)
      .then((text) => text)
      .catch((message) => {
        vscode.window.showErrorMessage(message);
        return "";
      });
    if (prDescription === "") {return;}

    // Allow user to select whichever reviewers they want
    const reviewers = await vscode.window.showQuickPick(
      extensionsTeam.filter((user) => user.name !== authorName).map((user) => user.name),
      {
        canPickMany: true,
        ignoreFocusOut: true,
        title: "Create Pull Request (3/3)",
        placeHolder: "Add reviewers for this Pull Request",
      }
    );
    if (!reviewers) {return;}
    const finalReviewers = reviewers.map((r) => extensionsTeam.find((user) => user.name === r)!.id);

    // Make the request to BitBucket and create the PR
    axios
      .post(
        `https://bitbucket.lab.dynatrace.org/rest/api/latest/projects/${projectKey}/repos/${repoSlug}/pull-requests`,
        buildPullRequestPayload(
          projectKey as SupportedProject,
          repoSlug,
          fromBranch,
          "main",
          finalReviewers,
          title,
          prDescription
        ),
        {
          headers: {
            // eslint-disable-next-line
            Authorization: `Bearer ${this.dtbbpat}`,
            // eslint-disable-next-line
            "Content-Type": "application/json", 
          },
        }
      )
      .then((res) => {
        if (res.status === 201) {
          vscode.window.showInformationMessage("Pull Request created successfully.");
        } else {
          vscode.window.showErrorMessage(`Could not create Pull Request. HTTP ${res.status}: ${res.statusText}`);
        }
      })
      .catch((err) => {
        vscode.window.showErrorMessage(`Could not create Pull Request: ${err.message}`);
      });
  }

  /**
   * Workflow for collecting a multi-line Pull Request description from the user.
   * A file is created in the vscode workspace storage. An event listener is then created for the
   * onDidChangeVisibleEditors event. Once we no longer see the file in a visible editor, we can
   * assume the user finished their edits. Description is collected and promise is resolved.
   * @param fromBranch optional name of the branch being pulled
   * @returns a Promise resolving to the string content entered by the user
   */
  async getPullRequestDescription(fromBranch?: string): Promise<string> {
    // Create a temporary file with the stub
    const descriptionFile = path.resolve(this.context.storageUri!.fsPath, "prdescription.txt");
    const prDescriptionStub = `
# Please enter the description for this Pull Request.
# Lines starting with '#' will be ignored, and an empty message aborts the pull request.
#
# You are requesting to pull ${fromBranch ? `branch ${fromBranch}` : "this branch"} into main.
#`;
    writeFileSync(descriptionFile, prDescriptionStub);

    // Open it for the user to edit
    await vscode.workspace
      .openTextDocument(vscode.Uri.file(descriptionFile))
      .then((doc) => vscode.window.showTextDocument(doc));
    console.log("Showing the file");

    // When the file closes, resolve the promise with the content
    return new Promise<string>((resolve, reject) => {
      let disposable = vscode.window.onDidChangeVisibleTextEditors((editors) => {
        if (!editors.map((editor) => editor.document.fileName).includes(descriptionFile)) {
          disposable.dispose();
          // Grab all lines that don't start with "#"
          const description = readFileSync(descriptionFile)
            .toString()
            .split("\n")
            .filter((line) => !line.startsWith("#"))
            .join("\n");
          // Remove the file since no longer needed
          rmSync(descriptionFile);
          // Resolve or reject the promise
          if (description !== "") {
            resolve(description);
          } else {
            reject("Pull Request description must not be empty");
          }
        }
      });
    });
  }
}

/**
 * Builds the JSON payload for a BitBucket Pull Request between two remote branches of a repo.
 * @param projectKey one of the supported project keys
 * @param repo slug of the repository targetted
 * @param fromBranch branch name to pull from
 * @param toBranch branch name to pull into
 * @param reviewers list of reviewer user IDs
 * @param title title for this PR
 * @param description description for this PR
 * @returns JSON payload
 */
function buildPullRequestPayload(
  projectKey: SupportedProject,
  repo: string,
  fromBranch: string,
  toBranch: string,
  reviewers: string[],
  title: string,
  description: string
): string {
  return JSON.stringify(
    {
      title: title,
      description: description,
      reviewers: reviewers.map((user) => ({ role: "REVIEWER", user: { name: user } })),
      fromRef: {
        repository: {
          slug: repo,
          project: {
            key: projectKey,
          },
        },
        displayId: fromBranch,
        id: `refs/heads/${fromBranch}`,
        type: "BRANCH",
      },
      toRef: {
        repository: {
          slug: repo,
          project: {
            key: projectKey,
          },
        },
        displayId: toBranch,
        id: `refs/heads/${toBranch}`,
        type: "BRANCH",
      },
    },
    null,
    2
  );
}

type SupportedProject = "DEXT2" | "DPE2";

const extensionsTeam: { name: string; id: string }[] = [
  { name: "Michael Lundstrom", id: "Michael.Lundstrom" },
  { name: "Florent Duchateau", id: "Florent.Duchateau" },
  { name: "David Lopes", id: "david.lopes" },
  { name: "Diego Morales", id: "Diego.Morales" },
  { name: "David Mass", id: "david.mass" },
  { name: "James Kitson", id: "james.kitson" },
  { name: "Vagiz Duseev", id: "vagiz.duseev" },
  { name: "Radu Stefan", id: "radu.stefan" },
  { name: "Ben Davidson", id: "ben.davidson" },
  { name: "Brayden Neale", id: "Brayden.Neale" },
];
