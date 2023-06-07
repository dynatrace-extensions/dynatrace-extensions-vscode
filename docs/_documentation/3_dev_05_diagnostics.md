---
title: 🩺 Diagnostics
permalink: /docs/dev/diagnostics
toc: true
toc_sticky: true
---

Many times perfectly valid YAML still produces a manifest that causes issues when we upload the
extension to Dynatrace or later when it tries to execute. Many of these situations can be caught
early and the add-on aims to bring these to light so you can fix them and reduce the number of
deployment attempts.

## How do diagnostics work in VS Code?

On every document change (edit of the extension manifest), the diagnostics suite will trigger
an update of all diagnostic items applicable to that file. Based on findings, relevant content
is highlighted within the manifest and hovering over the highlight will provide more details
about the issue.

Some issues may provide a "Quick fix" link as part of the hover information. If this is availble
it will trigger a content change of the document in order to solve the issue highlighted.

Finally, if "Error" severity issues are present (highlighted red), the add-on will not build
the extension. You must first resolve these issues before a build can continue.

## Currently implemented diagnostics

> Note: The code itself doesn't mean anything, it just provides a unique identifier within all
> diagnostics that may come up in VS Code.

<table>
  <tr>
    <th>Code</th>
    <th>Severity</th>
    <th>What does it mean?</th>
  </tr>
  <tr>
    <td>DEC001</td>
    <td>❌</td>
    <td>Your extension doesn't have a name, and this is mandatory.</td>
  </tr>
  <tr>
    <td>DEC002</td>
    <td>❌</td>
    <td>Your extension's name must not be longer than 50 characters.</td>
  </tr>
  <tr>
    <td>DEC003</td>
    <td>❌</td>
    <td>
      Your extension's name is invalid. It must only contain lowercase letters, numbers,
      hyphens, underscores, or dots.
    </td>
  </tr>
  <tr>
    <td>DEC004</td>
    <td>❌</td>
    <td>Your extension's name must start with <code>custom:</code> but doesn't.</td>
  </tr>
  <tr>
    <td>DEC005</td>
    <td>⚠️</td>
    <td>
      Internal Dynatrace extension names must not start with <code>custom:</code>.
    </td>
  </tr>
  <tr>
    <td>DEC006</td>
    <td>⚠️</td>
    <td>Metrics of type count should have keys ending in ".count" or "_count".</td>
  </tr>
  <tr>
    <td>DEC007</td>
    <td>⚠️</td>
    <td>Metrics of type gauge should not have keys ending in ".count" or "_count".</td>
  </tr>
  <tr>
    <td>DEC008</td>
    <td>❌</td>
    <td>You referenced this card key in a screen layout but it does not have a definition.</td>
  </tr>
  <tr>
    <td>DEC009</td>
    <td>⚠️</td>
    <td>You defined this card but you're not referencing it in the screen layout.</td>
  </tr>
  <tr>
    <td>DEC010</td>
    <td>⚠️</td>
    <td>There is no online data about this OID. You may want to validate it.</td>
  </tr>
  <tr>
    <td>DEC011</td>
    <td>❌</td>
    <td>This OID is not readable. The access permissions (MAX-ACCESS) don't allow it.</td>
  </tr>
  <tr>
    <td>DEC012</td>
    <td>❌</td>
    <td>This OID returns a string but you're using it as a metric value.</td>
  </tr>
  <tr>
    <td>DEC013</td>
    <td>⚠️</td>
    <td>This OID returns a Counter but you're using as a Gauge metric.</td>
  </tr>
  <tr>
    <td>DEC014</td>
    <td>⚠️</td>
    <td>This OID returns a Gauge but you're using it as a Counter metric.</td>
  </tr>
  <tr>
    <td>DEC015</td>
    <td>❌</td>
    <td>Invalid OID syntax. OID must not start/end with '.' and may only contain dots and digits.</td>
  </tr>
  <tr>
    <td>DEC016</td>
    <td>❌</td>
    <td>Invalid OID syntax. OIDs must not end in '.0' when 'table' is set to 'true' in the subgroup.</td>
  </tr>
  <tr>
    <td>DEC017</td>
    <td>❌</td>
    <td>Invalid OID syntax. OIDs must end in '.0' when 'table' is set to 'false' in the subgroup.</td>
  </tr>
  <tr>
    <td>DEC018</td>
    <td>❌</td>
    <td>Online data lists this OID as static but you're using it inside a 'table' subgroup.</td>
  </tr>
  <tr>
    <td>DEC019</td>
    <td>❌</td>
    <td>Online data maps this OID to table entries but you're not using it inside a 'table' subgroup.</td>
  </tr>
</table>
