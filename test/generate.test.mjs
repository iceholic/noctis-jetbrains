import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateLuxThemeProject, generateNoctisThemeProject } from "../tools/generate.mjs";
import { noctisThemes } from "../tools/noctis-source.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function themePath(theme) {
  return `src/main/resources/themes/${theme.id}.theme.json`;
}

function schemePath(theme) {
  return `src/main/resources/colors/${theme.name}.xml`;
}

test("generateNoctisThemeProject creates JetBrains plugin resources for every upstream Noctis theme", () => {
  const files = generateNoctisThemeProject();

  assert.equal(noctisThemes.length, 11);
  assert.equal(Object.keys(files).length, noctisThemes.length * 2 + 1);
  assert.equal(files["src/main/resources/META-INF/plugin.xml"].type, "xml");

  for (const themeSource of noctisThemes) {
    const themeFile = files[themePath(themeSource)];
    const schemeFile = files[schemePath(themeSource)];

    assert.equal(themeFile.type, "json", `missing theme JSON for ${themeSource.name}`);
    assert.equal(schemeFile.type, "xml", `missing editor scheme XML for ${themeSource.name}`);

    const theme = JSON.parse(themeFile.content);
    assert.equal(theme.name, themeSource.name);
    assert.equal(theme.dark, themeSource.dark);
    assert.equal(theme.editorScheme, `/colors/${themeSource.name}.xml`);
    assert.equal(theme.ui["EditorPane.background"], themeSource.workbench.editor.background);
    // Selections must follow upstream list.activeSelectionBackground.
    assert.equal(theme.ui["Tree.selectionBackground"], themeSource.workbench.ui.listSelection);
    assert.equal(theme.icons.ColorPalette["Actions.Blue"], themeSource.workbench.ui.accent);
  }
});

test("Noctis Lux generation remains available as a compatibility entrypoint", () => {
  const files = generateLuxThemeProject();

  assert.deepEqual(Object.keys(files), [
    "src/main/resources/themes/noctis-lux.theme.json",
    "src/main/resources/colors/Noctis Lux.xml",
    "src/main/resources/META-INF/plugin.xml"
  ]);

  const theme = JSON.parse(files["src/main/resources/themes/noctis-lux.theme.json"].content);
  assert.equal(theme.name, "Noctis Lux");
  assert.equal(theme.dark, false);
  assert.equal(theme.ui["EditorPane.background"], "#fef8ec");
  assert.equal(theme.icons.ColorPalette["Actions.Blue"], "#0099ad");
});

test("plugin XML registers all generated themes", () => {
  const files = generateNoctisThemeProject();
  const pluginXml = files["src/main/resources/META-INF/plugin.xml"].content;

  assert.match(pluginXml, /<id>com.noctis.intellij<\/id>/);
  assert.match(pluginXml, /Noctis theme collection port for IntelliJ Platform IDEs/);

  for (const themeSource of noctisThemes) {
    assert.match(pluginXml, new RegExp(`path="/themes/${themeSource.id}\\.theme\\.json"`));
  }

  assert.match(pluginXml, /<themeProvider id="com.noctis.intellij.lux" path="\/themes\/noctis-lux.theme.json"\/>/);
  assert.match(pluginXml, /<themeProvider id="com.noctis.intellij.noctis" path="\/themes\/noctis.theme.json"\/>/);
});

test("themes cover the main JetBrains IDE surfaces", () => {
  const files = generateNoctisThemeProject();

  for (const themeSource of noctisThemes) {
    const theme = JSON.parse(files[themePath(themeSource)].content);
    const ui = theme.ui;

    assert.ok(Object.keys(ui).length >= 90, `${themeSource.name} should cover more than the minimal UI surface`);

    for (const key of [
      "MainToolbar.background",
      "StatusBar.background",
      "StatusBar.foreground",
      "EditorTabs.background",
      "EditorTabs.selectedBackground",
      "EditorTabs.hoverBackground",
      "ToolWindow.HeaderTab.selectedBackground",
      "CompletionPopup.background",
      "CompletionPopup.selectionBackground",
      "SearchEverywhere.SearchField.background",
      "Notification.background",
      "Notification.borderColor",
      "Table.selectionBackground",
      "CheckBox.focusColor",
      "Checkbox.Background.Selected",
      "Checkbox.Background.Selected.Dark",
      "Counter.background",
      "Banner.infoBackground",
      "ScrollBar.Mac.Transparent.hoverThumbColor"
    ]) {
      assert.ok(Object.hasOwn(ui, key), `${themeSource.name} missing UI key ${key}`);
    }

    assert.equal(ui["StatusBar.background"], themeSource.workbench.ui.statusBarBackground);
    // Upstream statusBar.foreground is the accent color.
    assert.equal(ui["StatusBar.foreground"], themeSource.workbench.ui.accent);
    assert.equal(ui["EditorTabs.selectedForeground"], themeSource.workbench.ui.accent);
    assert.equal(ui["CompletionPopup.matchForeground"], themeSource.workbench.ui.accent);
    // Primary buttons keep the upstream teal fill, secondary buttons stay neutral.
    assert.equal(ui["Button.default.startBackground"], themeSource.workbench.ui.buttonBackground);
    assert.equal(ui["Button.default.foreground"], themeSource.workbench.ui.buttonForeground);
    assert.equal(ui["Button.foreground"], themeSource.workbench.editor.foreground);
    assert.ok(!Object.hasOwn(ui, "Button.background"), `${themeSource.name} should not use the unsupported Button.background key`);
  }
});

test("editor schemes cover code, markup, diagnostics, diff, terminal, and light/dark parents", () => {
  const files = generateNoctisThemeProject();

  for (const themeSource of noctisThemes) {
    const scheme = files[schemePath(themeSource)].content;
    const parentScheme = themeSource.dark ? "Darcula" : "Default";

    assert.match(scheme, new RegExp(`<scheme name="${themeSource.name}" version="142" parent_scheme="${parentScheme}">`));
    assert.match(scheme, new RegExp(`<property name="upstreamThemePath">${themeSource.upstreamPath.replaceAll(".", "\\.")}</property>`));

    for (const colorName of [
      "CONSOLE_BACKGROUND_KEY",
      "CONSOLE_NORMAL_OUTPUT",
      "CONSOLE_BRIGHT_BLUE_OUTPUT",
      "ADDED_LINES_COLOR",
      "MODIFIED_LINES_COLOR",
      "DELETED_LINES_COLOR",
      "WHITESPACES",
      "SELECTION_BACKGROUND",
      "SEARCH_RESULT_ATTRIBUTES"
    ]) {
      assert.match(scheme, new RegExp(`<option name="${colorName}"`), `${themeSource.name} missing color ${colorName}`);
    }

    for (const attributeName of [
      "TEXT",
      "DEFAULT_INSTANCE_METHOD",
      "DEFAULT_STATIC_METHOD",
      "DEFAULT_CONSTANT",
      "DEFAULT_ENUM_NAME",
      "DEFAULT_DOC_COMMENT_TAG",
      "DEFAULT_DOC_COMMENT_TAG_VALUE",
      "DEFAULT_REASSIGNED_LOCAL_VARIABLE",
      "DEFAULT_TEMPLATE_LANGUAGE_COLOR",
      "DEFAULT_MARKUP_HEADING",
      "DEFAULT_MARKUP_BOLD",
      "DEFAULT_MARKUP_ITALIC",
      "DEFAULT_MARKUP_CODE",
      "DEFAULT_MARKUP_LINK",
      "BREADCRUMBS_DEFAULT",
      "FOLDED_TEXT_ATTRIBUTES",
      "ERRORS_ATTRIBUTES",
      "WARNING_ATTRIBUTES"
    ]) {
      assert.match(scheme, new RegExp(`<option name="${attributeName}">`), `${themeSource.name} missing attribute ${attributeName}`);
    }

    // Effect types must be numeric codes; WAVE_UNDERSCORE serializes as 2.
    assert.match(scheme, /<option name="EFFECT_TYPE" value="2" \/>/);
    assert.ok(!/EFFECT_TYPE" value="[A-Z]/.test(scheme), `${themeSource.name} contains non-numeric EFFECT_TYPE`);
  }
});

test("generated resources are checked in without drift", async () => {
  const files = generateNoctisThemeProject();

  for (const [relativePath, generated] of Object.entries(files)) {
    const checkedIn = await readFile(join(projectRoot, relativePath), "utf8");
    assert.equal(checkedIn, generated.content, `${relativePath} is out of date`);
  }
});

test("plugin icon resources are present", async () => {
  const lightIcon = await readFile(join(projectRoot, "src/main/resources/META-INF/pluginIcon.svg"), "utf8");
  const darkIcon = await readFile(join(projectRoot, "src/main/resources/META-INF/pluginIcon_dark.svg"), "utf8");

  assert.match(lightIcon, /fill="#fef8ec"/);
  assert.match(lightIcon, /fill="#005661"/);
  assert.match(darkIcon, /fill="#052529"/);
  assert.match(darkIcon, /fill="#b2cacd"/);
});

test("generateNoctisThemeProject writes files when outDir is provided", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "noctis-jetbrains-"));

  const result = await generateNoctisThemeProject({ outDir: temporaryDirectory });

  assert.equal(result.written.length, noctisThemes.length * 2 + 1);
  assert.ok(result.written.some((path) => path.endsWith("noctis-lux.theme.json")));
  assert.ok(result.written.some((path) => path.endsWith("Noctis Lux.xml")));
  assert.ok(result.written.some((path) => path.endsWith("noctis-minimus.theme.json")));
  assert.ok(result.written.some((path) => path.endsWith("Noctis Minimus.xml")));
  assert.ok(result.written.some((path) => path.endsWith("plugin.xml")));
});
