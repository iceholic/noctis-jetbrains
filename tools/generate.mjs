import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noctisThemes, upstream } from "./noctis-source.mjs";

const THEME_DIR_PATH = "src/main/resources/themes";
const SCHEME_DIR_PATH = "src/main/resources/colors";
const PLUGIN_XML_PATH = "src/main/resources/META-INF/plugin.xml";
const PLUGIN_ID = "io.github.iceholic.noctis";
const PLUGIN_NAME = "Noctis Theme";
const PLUGIN_VENDOR = "iceholic";
const PLUGIN_VENDOR_URL = "https://github.com/iceholic/noctis-jetbrains";
const PLUGIN_VERSION = "0.2.1";
const PLUGIN_DESCRIPTION = [
  "<p>",
  '  Noctis Theme brings the <a href="https://github.com/liviuschera/noctis">Noctis</a>',
  "  color collection to IntelliJ Platform IDEs with coordinated editor schemes and IDE UI themes.",
  "</p>",
  "<ul>",
  "  <li><b>11 Noctis variants</b>: Lux, Hibernus, Lilac, Noctis, Azureus, Bordo, Obscuro, Sereno, Uva, Viola, and Minimus.</li>",
  "  <li><b>Full IDE surface coverage</b>: editor tabs, tool windows, status bar, lists, trees, tables, popups, forms, menus, VCS labels, and icon palette colors.</li>",
  "  <li><b>Editor schemes included</b>: syntax colors, search highlights, diagnostics, diff/VCS lines, terminal colors, whitespace, caret, gutter, and line numbers.</li>",
  "  <li><b>Light and dark themes</b> tuned from the upstream VS Code palette while following JetBrains UI conventions.</li>",
  "</ul>",
  "<p>",
  "  View screenshots and source code on",
  '  <a href="https://github.com/iceholic/noctis-jetbrains">GitHub</a>, or install from',
  '  <a href="https://plugins.jetbrains.com/plugin/32673-noctis-theme/">JetBrains Marketplace</a>.',
  "</p>"
].join("\n");

// IntelliJ scheme XML expects numeric EFFECT_TYPE codes (see TextAttributes/EffectType),
// string names such as "WAVE_UNDERSCORE" are silently ignored by the IDE.
const EFFECT_TYPE_CODES = {
  BOXED: 0,
  LINE_UNDERSCORE: 1,
  WAVE_UNDERSCORE: 2,
  STRIKEOUT: 3,
  BOLD_LINE: 4,
  BOLD_DOTTED_LINE: 5
};

function stripHash(color) {
  return color.replace(/^#/, "").toLowerCase();
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xmlOption(name, value, indent = "    ") {
  return `${indent}<option name="${xmlEscape(name)}" value="${xmlEscape(value)}" />`;
}

function colorAttribute(name, colorOrOptions, fontType = 0) {
  const options =
    typeof colorOrOptions === "string"
      ? { foreground: colorOrOptions, fontType }
      : { ...colorOrOptions };
  const optionLines = [];

  if (options.foreground) {
    optionLines.push(xmlOption("FOREGROUND", stripHash(options.foreground), ""));
  }
  if (options.background) {
    optionLines.push(xmlOption("BACKGROUND", stripHash(options.background), ""));
  }
  if (options.effectColor) {
    optionLines.push(xmlOption("EFFECT_COLOR", stripHash(options.effectColor), ""));
  }
  if (options.errorStripeColor) {
    optionLines.push(xmlOption("ERROR_STRIPE_COLOR", stripHash(options.errorStripeColor), ""));
  }
  if (options.effectType) {
    const effectCode = EFFECT_TYPE_CODES[options.effectType];
    if (effectCode === undefined) {
      throw new Error(`unknown effect type "${options.effectType}" for attribute "${name}"`);
    }
    optionLines.push(xmlOption("EFFECT_TYPE", String(effectCode), ""));
  }
  if (options.fontType) {
    optionLines.push(xmlOption("FONT_TYPE", String(options.fontType), ""));
  }

  return [
    `    <option name="${xmlEscape(name)}">`,
    "      <value>",
    ...optionLines.map((line) => `        ${line}`),
    "      </value>",
    "    </option>"
  ].join("\n");
}

function themeJsonPath(theme) {
  return `${THEME_DIR_PATH}/${theme.id}.theme.json`;
}

function schemeXmlPath(theme) {
  return `${SCHEME_DIR_PATH}/${theme.name}.xml`;
}

function schemeReference(theme) {
  return `/colors/${theme.name}.xml`;
}

function themeProviderId(theme) {
  const suffix = theme.id === "noctis" ? "noctis" : theme.id.replace(/^noctis-/, "");
  return `${PLUGIN_ID}.${suffix}`;
}

// New UI checkboxes are SVG icons tinted through named palette colors; dark LaFs
// read the ".Dark" suffixed keys, so both variants are emitted for every theme.
function checkboxPaletteKeys(ui) {
  const palette = {
    "Checkbox.Background.Default": ui.inputBackground,
    "Checkbox.Border.Default": ui.borderStrong,
    "Checkbox.Background.Selected": ui.accent,
    "Checkbox.Border.Selected": ui.accent,
    "Checkbox.Foreground.Selected": ui.accentForeground,
    "Checkbox.Focus.Wide": ui.accentBright,
    "Checkbox.Focus.Thin.Default": ui.accentBright,
    "Checkbox.Focus.Thin.Selected": ui.accentBright,
    "Checkbox.Background.Disabled": ui.widgetBackground,
    "Checkbox.Border.Disabled": ui.borderSubtle,
    "Checkbox.Foreground.Disabled": ui.textInactive
  };
  const keys = {};
  for (const [key, value] of Object.entries(palette)) {
    keys[key] = value;
    keys[`${key}.Dark`] = value;
  }
  return keys;
}

// VS Code Noctis scrollbars: translucent accent thumb over a fully transparent track.
function scrollBarKeys(ui, editor) {
  const thumb = `${ui.accent}44`;
  const hoverThumb = `${ui.accent}88`;
  const transparentTrack = `${editor.background}00`;
  const keys = {};
  for (const prefix of ["ScrollBar", "ScrollBar.Transparent", "ScrollBar.Mac", "ScrollBar.Mac.Transparent"]) {
    keys[`${prefix}.thumbColor`] = thumb;
    keys[`${prefix}.thumbBorderColor`] = thumb;
    keys[`${prefix}.hoverThumbColor`] = hoverThumb;
    keys[`${prefix}.hoverThumbBorderColor`] = hoverThumb;
    keys[`${prefix}.trackColor`] = transparentTrack;
    keys[`${prefix}.hoverTrackColor`] = transparentTrack;
  }
  return keys;
}

function buildThemeJson(themeSource) {
  const { name, dark, syntax, workbench } = themeSource;
  const { editor, ui } = workbench;
  const controlForeground = ui.textMuted;
  // Upstream list.activeSelectionBackground / list.hoverBackground / list.focusBackground.
  const controlSelectionBackground = ui.listSelection;
  const controlFocusBackground = ui.listFocus;
  const controlHoverBackground = ui.listHover;
  const toolWindowSelectionBackground = ui.listSelection;
  const theme = {
    name,
    dark,
    author: "Liviu Schera / Noctis JetBrains port",
    editorScheme: schemeReference(themeSource),
    colors: {
      noctisBackground: editor.background,
      noctisSidebar: ui.sideBarBackground,
      noctisPanel: ui.popupBackground,
      noctisAccent: ui.accent,
      noctisAccentBright: ui.accentBright,
      noctisSelection: ui.listSelection,
      noctisStatus: ui.statusBarBackground,
      noctisWarning: ui.warning,
      noctisError: ui.error
    },
    ui: {
      "*": {
        background: "noctisBackground",
        foreground: editor.foreground,
        selectionBackground: controlSelectionBackground,
        selectionForeground: ui.listSelectionForeground,
        inactiveBackground: "noctisSidebar",
        disabledForeground: ui.textInactive,
        infoForeground: ui.description
      },
      "ActionButton.hoverBackground": controlHoverBackground,
      "ActionButton.pressedBackground": controlSelectionBackground,
      "ActionButton.selectedBackground": controlSelectionBackground,
      "Banner.foreground": editor.foreground,
      "Banner.infoBackground": ui.widgetSelectedBackground,
      "Banner.infoBorderColor": ui.accentBright,
      "Banner.warningBackground": `${ui.warning}33`,
      "Banner.warningBorderColor": ui.warning,
      "Banner.errorBackground": `${ui.error}22`,
      "Banner.errorBorderColor": ui.error,
      "Borders.color": ui.borderSubtle,
      "Borders.ContrastBorderColor": ui.borderStrong,
      // Secondary buttons stay neutral; default (primary) buttons take the upstream
      // teal button.background fill, matching VS Code where actions are filled.
      "Button.startBackground": editor.background,
      "Button.endBackground": editor.background,
      "Button.startBorderColor": ui.borderStrong,
      "Button.endBorderColor": ui.borderStrong,
      "Button.foreground": editor.foreground,
      "Button.focusedBorderColor": ui.accent,
      "Button.disabledText": ui.textInactive,
      "Button.default.startBackground": ui.buttonBackground,
      "Button.default.endBackground": ui.buttonBackground,
      "Button.default.startBorderColor": ui.buttonBackground,
      "Button.default.endBorderColor": ui.buttonBackground,
      "Button.default.foreground": ui.buttonForeground,
      "Button.default.focusedBorderColor": ui.buttonHover,
      "CheckBox.background": editor.background,
      "CheckBox.foreground": editor.foreground,
      "CheckBox.focusColor": ui.accent,
      ...checkboxPaletteKeys(ui),
      "ComboBox.background": ui.inputBackground,
      "ComboBox.foreground": ui.inputForeground,
      "ComboBox.nonEditableBackground": ui.widgetBackground,
      "ComboBox.selectionBackground": controlSelectionBackground,
      "ComboBox.ArrowButton.background": ui.inputBackground,
      "ComboBox.ArrowButton.nonEditableBackground": ui.widgetBackground,
      "ComboBox.ArrowButton.iconColor": ui.accent,
      "Component.borderColor": ui.borderSubtle,
      "Component.errorFocusColor": ui.error,
      "Component.focusColor": `${ui.accent}55`,
      "Component.focusedBorderColor": ui.accent,
      "Component.infoForeground": ui.description,
      "Component.warningFocusColor": ui.warning,
      "ContextHelp.foreground": ui.description,
      "Counter.background": ui.accent,
      "Counter.foreground": ui.accentForeground,
      "CompletionPopup.background": ui.widgetBackground,
      "CompletionPopup.foreground": ui.inputForeground,
      "CompletionPopup.matchForeground": ui.accent,
      "CompletionPopup.selectedGrayedForeground": ui.textMuted,
      "CompletionPopup.selectionBackground": ui.widgetSelectedBackground,
      "CompletionPopup.selectionForeground": editor.foreground,
      "Debugger.Variables.changedValueForeground": ui.modified,
      "Debugger.Variables.errorMessageForeground": ui.error,
      "Debugger.Variables.evaluatingExpressionForeground": ui.accent,
      "DefaultTabs.background": ui.editorHeaderBackground,
      "DefaultTabs.hoverBackground": ui.tabHoverBackground,
      "DefaultTabs.inactiveColoredFileBackground": ui.tabInactiveBackground,
      "DefaultTabs.selectedBackground": ui.tabActiveBackground,
      "DefaultTabs.selectedForeground": ui.accent,
      "DefaultTabs.underlinedTabBackground": ui.tabActiveBackground,
      "DefaultTabs.underlinedTabForeground": ui.accent,
      "DefaultTabs.underlineColor": ui.accentBright,
      "DefaultTabs.unselectedBackground": ui.tabInactiveBackground,
      "DefaultTabs.unselectedForeground": ui.textMuted,
      "EditorPane.background": editor.background,
      "EditorPane.foreground": editor.foreground,
      "EditorTextField.background": ui.inputBackground,
      "EditorTextField.borderColor": ui.borderSubtle,
      "EditorTextField.foreground": editor.foreground,
      "EditorTextField.inactiveBackground": ui.inputBackground,
      "EditorTabs.background": ui.editorHeaderBackground,
      "EditorTabs.borderColor": ui.borderStrong,
      "EditorTabs.hoverBackground": ui.tabHoverBackground,
      "EditorTabs.inactiveColoredFileBackground": ui.tabInactiveBackground,
      "EditorTabs.inactiveMaskColor": `${editor.background}00`,
      "EditorTabs.modifiedItemForeground": ui.success,
      "EditorTabs.selectedBackground": ui.tabActiveBackground,
      "EditorTabs.selectedForeground": ui.accent,
      "EditorTabs.underlinedTabBackground": ui.tabActiveBackground,
      "EditorTabs.underlinedTabForeground": ui.accent,
      "EditorTabs.underlineColor": ui.accentBright,
      "EditorTabs.unselectedBackground": ui.tabInactiveBackground,
      "EditorTabs.unselectedForeground": ui.textMuted,
      "Focus.color": ui.accent,
      "Label.foreground": editor.foreground,
      "Label.infoForeground": ui.description,
      "Label.disabledForeground": ui.textInactive,
      // Upstream textLink.foreground uses the bright accent (#00c6e0 in Lux).
      "Link.activeForeground": ui.accentBright,
      "Link.hoverForeground": ui.accentBright,
      "Link.pressedForeground": ui.accent,
      "Link.visitedForeground": ui.accent,
      "List.background": ui.sideBarBackground,
      "List.foreground": controlForeground,
      "List.focusBackground": controlFocusBackground,
      "List.focusForeground": editor.foreground,
      "List.hoverBackground": controlHoverBackground,
      "List.hoverForeground": editor.foreground,
      "List.inactiveSelectionBackground": ui.listInactiveSelection,
      "List.inactiveSelectionForeground": ui.textInactive,
      "List.dropCellBackground": ui.listDrop,
      "List.selectionBackground": controlSelectionBackground,
      "List.selectionForeground": ui.listSelectionForeground,
      "List.selectionInactiveBackground": ui.listInactiveSelection,
      // Upstream titleBar.activeBackground matches the side bar shade.
      "MainToolbar.background": ui.sideBarBackground,
      "MainToolbar.borderColor": ui.borderTransparent,
      "MainToolbar.foreground": editor.foreground,
      "MainToolbar.Dropdown.hoverBackground": controlHoverBackground,
      "MainToolbar.Icon.hoverBackground": controlHoverBackground,
      "Menu.background": ui.popupBackground,
      "Menu.foreground": ui.textMuted,
      "Menu.borderColor": ui.borderSubtle,
      "Menu.selectionBackground": controlHoverBackground,
      "Menu.selectionForeground": ui.accent,
      "MenuItem.background": ui.popupBackground,
      "MenuItem.foreground": ui.textMuted,
      "MenuItem.selectionBackground": controlHoverBackground,
      "MenuItem.selectionForeground": ui.accent,
      "NavBar.background": editor.background,
      "NavBar.borderColor": ui.borderTransparent,
      "NavBar.hoverBackground": controlHoverBackground,
      "NavBar.inactiveForeground": ui.textMuted,
      "NavBar.selectedBackground": controlSelectionBackground,
      "NavBar.selectedForeground": editor.foreground,
      "Notification.ToolWindow.errorForeground": ui.error,
      "Notification.ToolWindow.warningForeground": ui.warningMuted,
      "Notification.background": ui.widgetBackground,
      "Notification.borderColor": ui.borderSubtle,
      "Notification.errorBackground": `${ui.error}22`,
      "Notification.foreground": editor.foreground,
      "Notification.linkForeground": ui.accentBright,
      "Notification.warningBackground": `${ui.warning}22`,
      "Panel.background": editor.background,
      "PasswordField.background": ui.inputBackground,
      "PasswordField.caretForeground": editor.cursor,
      "PasswordField.foreground": ui.inputForeground,
      "Popup.borderColor": ui.borderStrong,
      "Popup.Advertiser.foreground": ui.textMuted,
      "Popup.Header.activeBackground": ui.sideBarHeader,
      "Popup.Header.inactiveBackground": ui.sideBarBackground,
      "Popup.separatorColor": ui.sideBarHeader,
      "PopupMenu.background": ui.popupBackground,
      "PopupMenu.foreground": ui.textMuted,
      "ProgressBar.foreground": ui.accentBright,
      "ProgressBar.progressColor": ui.accentBright,
      "ProgressBar.indeterminateStartColor": ui.accent,
      "ProgressBar.indeterminateEndColor": ui.accentBright,
      "ProgressBar.trackColor": ui.borderSubtle,
      "ProgressBar.passedColor": ui.success,
      "ProgressBar.failedColor": ui.error,
      ...scrollBarKeys(ui, editor),
      "SearchField.background": ui.inputBackground,
      "SearchField.foreground": ui.inputForeground,
      "SearchField.infoForeground": ui.inputPlaceholder,
      "SearchEverywhere.Advertiser.foreground": ui.textMuted,
      "SearchEverywhere.Header.background": ui.sideBarHeader,
      "SearchEverywhere.SearchField.background": ui.inputBackground,
      "SearchEverywhere.SearchField.foreground": ui.inputForeground,
      "SearchEverywhere.SearchField.borderColor": ui.borderSubtle,
      "SearchEverywhere.Tab.selectedBackground": controlSelectionBackground,
      "SearchEverywhere.Tab.selectedForeground": editor.foreground,
      "Separator.foreground": ui.sideBarHeader,
      "SidePanel.background": ui.sideBarBackground,
      "SidePanel.foreground": controlForeground,
      "SpeedSearch.background": ui.popupBackground,
      "SpeedSearch.foreground": editor.foreground,
      "SpeedSearch.borderColor": ui.accent,
      "SpeedSearch.errorForeground": ui.error,
      "Spinner.background": ui.inputBackground,
      "Spinner.foreground": ui.inputForeground,
      "StatusBar.Widget.HoverBackground": controlHoverBackground,
      "StatusBar.Widget.borderColor": ui.borderTransparent,
      "StatusBar.Widget.foreground": ui.accent,
      "StatusBar.background": ui.statusBarBackground,
      "StatusBar.borderColor": ui.borderTransparent,
      // Upstream statusBar.foreground is the accent color, not muted text.
      "StatusBar.foreground": ui.accent,
      "TabbedPane.underlineColor": ui.accentBright,
      "TabbedPane.contentAreaColor": ui.borderStrong,
      "TabbedPane.hoverColor": controlHoverBackground,
      "TabbedPane.focusColor": controlFocusBackground,
      "Table.background": ui.sideBarBackground,
      "Table.foreground": controlForeground,
      "Table.gridColor": ui.sideBarHeader,
      "Table.hoverBackground": controlHoverBackground,
      "Table.selectionBackground": controlSelectionBackground,
      "Table.selectionForeground": ui.listSelectionForeground,
      "TextPane.background": ui.inputBackground,
      "TextPane.caretForeground": editor.cursor,
      "TextPane.foreground": editor.foreground,
      "TextArea.background": ui.inputBackground,
      "TextArea.caretForeground": editor.cursor,
      "TextArea.foreground": editor.foreground,
      "TextField.background": ui.inputBackground,
      "TextField.caretForeground": editor.cursor,
      "TextField.foreground": editor.foreground,
      "TextField.inactiveBackground": ui.widgetBackground,
      "TextField.inactiveForeground": ui.textMuted,
      "TitlePane.background": ui.sideBarBackground,
      "TitlePane.inactiveBackground": ui.sideBarBackground,
      "TitlePane.infoForeground": ui.textMuted,
      "ToolTip.background": ui.popupBackground,
      "ToolTip.foreground": editor.foreground,
      "ToolTip.borderColor": ui.borderSubtle,
      "ToolWindow.Button.foreground": ui.textMuted,
      "ToolWindow.Button.hoverBackground": controlHoverBackground,
      "ToolWindow.Button.selectedBackground": toolWindowSelectionBackground,
      "ToolWindow.Button.selectedForeground": ui.accent,
      "ToolWindow.Header.background": ui.sideBarHeader,
      "ToolWindow.Header.inactiveBackground": ui.sideBarBackground,
      // Upstream panel tabs: no fill, accent foreground plus bright accent underline.
      "ToolWindow.HeaderTab.hoverBackground": controlHoverBackground,
      "ToolWindow.HeaderTab.inactiveForeground": ui.textMuted,
      "ToolWindow.HeaderTab.selectedBackground": ui.sideBarHeader,
      "ToolWindow.HeaderTab.selectedForeground": ui.accent,
      "ToolWindow.HeaderTab.underlineColor": ui.accentBright,
      "ToolWindow.Stripe.background": editor.background,
      "ToolWindow.Stripe.hoverBackground": controlHoverBackground,
      "ToolWindow.StripeButton.hoverBackground": controlHoverBackground,
      "ToolWindow.StripeButton.selectedBackground": toolWindowSelectionBackground,
      "ToolWindow.StripeButton.selectedForeground": ui.accent,
      "ToolWindow.background": ui.sideBarBackground,
      "Tree.background": ui.sideBarBackground,
      "Tree.foreground": controlForeground,
      "Tree.hash": ui.sideBarHeader,
      "Tree.hoverBackground": controlHoverBackground,
      "Tree.modifiedItemForeground": ui.successBright,
      "Tree.selectionBackground": controlSelectionBackground,
      "Tree.selectionForeground": ui.listSelectionForeground,
      "Tree.selectionInactiveBackground": ui.listInactiveSelection,
      "VersionControl.FileHistory.Commit.selectedBranchBackground": controlSelectionBackground,
      "VersionControl.GitLog.Commit.currentBranchBackground": controlSelectionBackground,
      "VersionControl.Log.Commit.unmatchedForeground": ui.textMuted,
      "VersionControl.RefLabel.backgroundBase": ui.sideBarHeader,
      "VersionControl.RefLabel.foreground": editor.foreground,
      "ValidationTooltip.errorBackground": `${ui.error}22`,
      "ValidationTooltip.errorBorderColor": ui.error,
      "ValidationTooltip.warningBackground": `${ui.warning}22`,
      "ValidationTooltip.warningBorderColor": ui.warning
    },
    icons: {
      ColorPalette: {
        "Actions.Blue": ui.accent,
        "Actions.Green": ui.success,
        "Actions.Red": ui.error,
        "Actions.Yellow": ui.warning,
        "Objects.Blue": syntax.misc,
        "Objects.Green": syntax.string,
        "Objects.Red": syntax.tag,
        "Objects.Yellow": syntax.variable,
        "Objects.Purple": syntax.number,
        "Objects.Grey": ui.textMuted,
        "Objects.BlackText": syntax.text
      }
    }
  };

  return `${JSON.stringify(theme, null, 2)}\n`;
}

function buildEditorSchemeXml(themeSource) {
  const { name, dark, syntax, workbench } = themeSource;
  const { editor, ui, vcs, terminal } = workbench;
  const colors = [
    ["CARET_COLOR", stripHash(editor.cursor)],
    ["CARET_ROW_COLOR", stripHash(editor.lineHighlight)],
    ["GUTTER_BACKGROUND", stripHash(editor.background)],
    ["INDENT_GUIDE", stripHash(editor.indentGuide)],
    ["LINE_NUMBERS_COLOR", stripHash(editor.lineNumber)],
    ["LINE_NUMBER_ON_CARET_ROW_COLOR", stripHash(editor.activeLineNumber)],
    ["RIGHT_MARGIN_COLOR", stripHash(editor.ruler)],
    // The editor selection ColorKey is SELECTION_BACKGROUND in scheme XML.
    ["SELECTION_BACKGROUND", stripHash(editor.selection)],
    ["SOFT_WRAP_SIGN_COLOR", stripHash(editor.whitespace)],
    ["TEARLINE_COLOR", stripHash(editor.ruler)],
    ["WHITESPACES", stripHash(editor.whitespace)],
    ["ADDED_LINES_COLOR", stripHash(vcs.addedLine)],
    ["MODIFIED_LINES_COLOR", stripHash(vcs.modifiedLine)],
    ["DELETED_LINES_COLOR", stripHash(vcs.deletedLine)],
    ["FILESTATUS_ADDED", stripHash(vcs.added)],
    ["FILESTATUS_MODIFIED", stripHash(vcs.modified)],
    ["FILESTATUS_DELETED", stripHash(vcs.deleted)],
    ["FILESTATUS_IGNORED", stripHash(vcs.ignored)],
    ["FILESTATUS_MERGED_WITH_CONFLICTS", stripHash(vcs.conflicted)],
    ["CONSOLE_BACKGROUND_KEY", stripHash(terminal.background)],
    ["CONSOLE_NORMAL_OUTPUT", stripHash(terminal.foreground)],
    ["CONSOLE_ERROR_OUTPUT", stripHash(ui.error)],
    ["CONSOLE_USER_INPUT", stripHash(syntax.variable)],
    ["CONSOLE_BLACK_OUTPUT", stripHash(terminal.black)],
    ["CONSOLE_RED_OUTPUT", stripHash(terminal.red)],
    ["CONSOLE_GREEN_OUTPUT", stripHash(terminal.green)],
    ["CONSOLE_YELLOW_OUTPUT", stripHash(terminal.yellow)],
    ["CONSOLE_BLUE_OUTPUT", stripHash(terminal.blue)],
    ["CONSOLE_MAGENTA_OUTPUT", stripHash(terminal.magenta)],
    ["CONSOLE_CYAN_OUTPUT", stripHash(terminal.cyan)],
    ["CONSOLE_GRAY_OUTPUT", stripHash(terminal.white)],
    ["CONSOLE_BRIGHT_BLACK_OUTPUT", stripHash(terminal.brightBlack)],
    ["CONSOLE_BRIGHT_RED_OUTPUT", stripHash(terminal.brightRed)],
    ["CONSOLE_BRIGHT_GREEN_OUTPUT", stripHash(terminal.brightGreen)],
    ["CONSOLE_BRIGHT_YELLOW_OUTPUT", stripHash(terminal.brightYellow)],
    ["CONSOLE_BRIGHT_BLUE_OUTPUT", stripHash(terminal.brightBlue)],
    ["CONSOLE_BRIGHT_MAGENTA_OUTPUT", stripHash(terminal.brightMagenta)],
    ["CONSOLE_BRIGHT_CYAN_OUTPUT", stripHash(terminal.brightCyan)],
    ["CONSOLE_BRIGHT_WHITE_OUTPUT", stripHash(terminal.brightWhite)]
  ];

  const attributes = [
    // TEXT carries the default editor foreground/background; without it the
    // editor falls back to the parent scheme colors.
    colorAttribute("TEXT", { foreground: editor.foreground, background: editor.background }),
    // Upstream scopes entire "source.*" bodies as VARIABLE, so plain identifiers are orange.
    colorAttribute("DEFAULT_IDENTIFIER", syntax.variable),
    colorAttribute("DEFAULT_KEYWORD", syntax.keyword, 1),
    colorAttribute("DEFAULT_STRING", syntax.string),
    // constant.character.escape maps to the MISC blue upstream.
    colorAttribute("DEFAULT_VALID_STRING_ESCAPE", syntax.misc),
    colorAttribute("DEFAULT_INVALID_STRING_ESCAPE", syntax.invalid, 1),
    colorAttribute("DEFAULT_NUMBER", syntax.number),
    colorAttribute("DEFAULT_LINE_COMMENT", syntax.comment, 2),
    colorAttribute("DEFAULT_BLOCK_COMMENT", syntax.comment, 2),
    colorAttribute("DEFAULT_DOC_COMMENT", syntax.comment, 2),
    colorAttribute("DEFAULT_DOC_COMMENT_TAG", syntax.tag, 1),
    colorAttribute("DEFAULT_DOC_COMMENT_TAG_VALUE", syntax.variable),
    colorAttribute("DEFAULT_DOC_COMMENT_MARKUP", syntax.misc),
    colorAttribute("DEFAULT_FUNCTION_DECLARATION", syntax.function),
    colorAttribute("DEFAULT_FUNCTION_CALL", syntax.function),
    colorAttribute("DEFAULT_INSTANCE_METHOD", syntax.function),
    colorAttribute("DEFAULT_STATIC_METHOD", syntax.function),
    // variable.parameter is bold upstream.
    colorAttribute("DEFAULT_PARAMETER", { foreground: syntax.variable, fontType: 1 }),
    colorAttribute("DEFAULT_REASSIGNED_PARAMETER", { foreground: syntax.variable, fontType: 1, effectColor: ui.warningMuted, effectType: "BOLD_DOTTED_LINE" }),
    colorAttribute("DEFAULT_LOCAL_VARIABLE", syntax.variable),
    colorAttribute("DEFAULT_REASSIGNED_LOCAL_VARIABLE", { foreground: syntax.variable, effectColor: ui.warningMuted, effectType: "BOLD_DOTTED_LINE" }),
    colorAttribute("DEFAULT_GLOBAL_VARIABLE", syntax.variable),
    // variable.other.property is orange italic upstream.
    colorAttribute("DEFAULT_INSTANCE_FIELD", { foreground: syntax.variable, fontType: 2 }),
    colorAttribute("DEFAULT_STATIC_FIELD", syntax.constant),
    colorAttribute("DEFAULT_CONSTANT", syntax.constant),
    // entity.name.type / storage.type map to the ANNOTATION brown, no italics.
    colorAttribute("DEFAULT_CLASS_NAME", syntax.annotation),
    colorAttribute("DEFAULT_INTERFACE_NAME", syntax.annotation),
    colorAttribute("DEFAULT_ENUM_NAME", syntax.annotation),
    colorAttribute("DEFAULT_TYPE_PARAMETER", syntax.annotation),
    // storage.type.annotation is orange bold upstream (@Annotation, decorators).
    colorAttribute("DEFAULT_METADATA", { foreground: syntax.variable, fontType: 1 }),
    colorAttribute("DEFAULT_PREDEFINED_SYMBOL", syntax.support),
    colorAttribute("DEFAULT_LABEL", syntax.tag),
    colorAttribute("DEFAULT_TAG", syntax.tag),
    colorAttribute("DEFAULT_ATTRIBUTE", syntax.constant),
    colorAttribute("DEFAULT_ENTITY", syntax.constant),
    colorAttribute("DEFAULT_OPERATION_SIGN", syntax.keyword, 1),
    colorAttribute("DEFAULT_PARENTHESES", syntax.text),
    colorAttribute("DEFAULT_BRACES", syntax.text),
    colorAttribute("DEFAULT_BRACKETS", syntax.text),
    // Noctis signature punctuation: bold separators, pink bold accessor dots.
    colorAttribute("DEFAULT_COMMA", { foreground: syntax.text, fontType: 1 }),
    colorAttribute("DEFAULT_DOT", { foreground: syntax.keyword, fontType: 1 }),
    colorAttribute("DEFAULT_SEMICOLON", { foreground: syntax.text, fontType: 1 }),
    colorAttribute("DEFAULT_BAD_CHARACTER", syntax.invalid, 1),
    colorAttribute("DEFAULT_TEMPLATE_LANGUAGE_COLOR", { background: editor.rangeHighlight }),
    colorAttribute("DEFAULT_MARKUP_HEADING", syntax.keyword, 1),
    colorAttribute("DEFAULT_MARKUP_BOLD", { foreground: syntax.text, fontType: 1 }),
    colorAttribute("DEFAULT_MARKUP_ITALIC", { foreground: syntax.text, fontType: 2 }),
    // markup.inline.raw maps to STRINGINTERPOLATED upstream.
    colorAttribute("DEFAULT_MARKUP_CODE", { foreground: syntax.stringInterpolated, background: ui.sideBarBackground }),
    // markup.quote maps to CONSTANT plus italics upstream.
    colorAttribute("DEFAULT_MARKUP_QUOTE", { foreground: syntax.constant, background: ui.sideBarBackground, fontType: 2 }),
    // markup.underline.link maps to SUPPORT upstream.
    colorAttribute("DEFAULT_MARKUP_LINK", { foreground: syntax.support, effectColor: syntax.support, effectType: "LINE_UNDERSCORE" }),
    colorAttribute("DEFAULT_MARKUP_LIST", { foreground: syntax.text, fontType: 1 }),
    colorAttribute("FOLDED_TEXT_ATTRIBUTES", { foreground: syntax.comment, background: editor.rangeHighlight }),
    colorAttribute("INJECTED_LANGUAGE_FRAGMENT", { background: editor.rangeHighlight }),
    colorAttribute("TODO_DEFAULT_ATTRIBUTES", { foreground: ui.modified, fontType: 3 }),
    colorAttribute("HYPERLINK_ATTRIBUTES", { foreground: syntax.misc, effectColor: syntax.misc, effectType: "LINE_UNDERSCORE" }),
    colorAttribute("FOLLOWED_HYPERLINK_ATTRIBUTES", { foreground: syntax.number, effectColor: syntax.number, effectType: "LINE_UNDERSCORE" }),
    colorAttribute("BREADCRUMBS_DEFAULT", { foreground: ui.textMuted }),
    colorAttribute("BREADCRUMBS_INACTIVE", { foreground: ui.textMuted }),
    colorAttribute("BREADCRUMBS_HOVERED", { foreground: editor.foreground, background: ui.listHover }),
    colorAttribute("BREADCRUMBS_CURRENT", { foreground: ui.accent, background: editor.lineHighlight }),
    colorAttribute("TEXT_SEARCH_RESULT_ATTRIBUTES", { foreground: syntax.text, background: editor.findMatch, fontType: 1 }),
    colorAttribute("SEARCH_RESULT_ATTRIBUTES", { foreground: syntax.text, background: editor.findMatch, fontType: 1 }),
    colorAttribute("WRITE_SEARCH_RESULT_ATTRIBUTES", { foreground: syntax.text, background: editor.findMatchHighlight }),
    colorAttribute("IDENTIFIER_UNDER_CARET_ATTRIBUTES", { background: editor.wordHighlight }),
    colorAttribute("WRITE_IDENTIFIER_UNDER_CARET_ATTRIBUTES", { background: editor.wordHighlightStrong }),
    colorAttribute("MATCHED_BRACE_ATTRIBUTES", { foreground: syntax.text, background: editor.bracketMatchBackground, effectColor: editor.bracketMatchBorder, effectType: "BOXED" }),
    colorAttribute("UNMATCHED_BRACE_ATTRIBUTES", { foreground: syntax.invalid, effectColor: syntax.invalid, effectType: "WAVE_UNDERSCORE" }),
    colorAttribute("ERRORS_ATTRIBUTES", { foreground: syntax.invalid, effectColor: ui.error, errorStripeColor: ui.error, effectType: "WAVE_UNDERSCORE" }),
    colorAttribute("WARNING_ATTRIBUTES", { effectColor: ui.warning, errorStripeColor: ui.warning, effectType: "WAVE_UNDERSCORE" }),
    colorAttribute("WEAK_WARNING_ATTRIBUTES", { effectColor: ui.warningMuted, errorStripeColor: ui.warningMuted, effectType: "BOLD_DOTTED_LINE" }),
    colorAttribute("INFO_ATTRIBUTES", { effectColor: ui.accentBright, errorStripeColor: ui.accentBright, effectType: "BOLD_DOTTED_LINE" }),
    colorAttribute("INFORMATION_ATTRIBUTES", { effectColor: ui.hint, errorStripeColor: ui.hint, effectType: "BOLD_DOTTED_LINE" }),
    colorAttribute("DIFF_INSERTED", { background: vcs.addedLine }),
    colorAttribute("DIFF_MODIFIED", { background: vcs.modifiedLine }),
    colorAttribute("DIFF_DELETED", { background: vcs.deletedLine }),
    colorAttribute("NOT_USED_ELEMENT_ATTRIBUTES", { foreground: ui.textInactive }),
    colorAttribute("DEPRECATED_ATTRIBUTES", { foreground: ui.textInactive, effectColor: ui.textInactive, effectType: "STRIKEOUT" })
  ];

  return [
    `<scheme name="${xmlEscape(name)}" version="142" parent_scheme="${dark ? "Darcula" : "Default"}">`,
    "  <metaInfo>",
    `    <property name="createdBy">Noctis JetBrains generator from ${xmlEscape(upstream.repository)}</property>`,
    `    <property name="upstreamVersion">${xmlEscape(upstream.version)}</property>`,
    `    <property name="upstreamThemePath">${xmlEscape(themeSource.upstreamPath)}</property>`,
    "  </metaInfo>",
    "  <colors>",
    ...colors.map(([colorName, value]) => xmlOption(colorName, value)),
    "  </colors>",
    "  <attributes>",
    ...attributes,
    "  </attributes>",
    "</scheme>",
    ""
  ].join("\n");
}

function buildPluginXml(themes) {
  return [
    "<idea-plugin>",
    `  <id>${PLUGIN_ID}</id>`,
    `  <name>${PLUGIN_NAME}</name>`,
    `  <version>${PLUGIN_VERSION}</version>`,
    '  <idea-version since-build="233"/>',
    "  <depends>com.intellij.modules.platform</depends>",
    `  <vendor url="${PLUGIN_VENDOR_URL}">${PLUGIN_VENDOR}</vendor>`,
    "  <description><![CDATA[",
    ...PLUGIN_DESCRIPTION.split("\n").map((line) => `    ${line}`),
    "  ]]></description>",
    "  <change-notes><![CDATA[",
    "    <ul>",
    "      <li>Expand the plugin Overview with theme coverage, editor scheme details, and project links.</li>",
    "      <li>Refresh Marketplace metadata for the Noctis Theme listing.</li>",
    "    </ul>",
    "  ]]></change-notes>",
    '  <extensions defaultExtensionNs="com.intellij">',
    ...themes.map((theme) => `    <themeProvider id="${themeProviderId(theme)}" path="/themes/${theme.id}.theme.json"/>`),
    "  </extensions>",
    "</idea-plugin>",
    ""
  ].join("\n");
}

function buildProjectFiles(themes) {
  const files = {};

  for (const theme of themes) {
    files[themeJsonPath(theme)] = { type: "json", content: buildThemeJson(theme) };
    files[schemeXmlPath(theme)] = { type: "xml", content: buildEditorSchemeXml(theme) };
  }

  files[PLUGIN_XML_PATH] = { type: "xml", content: buildPluginXml(themes) };
  return files;
}

export function generateNoctisThemeProject(options = {}) {
  const files = buildProjectFiles(noctisThemes);

  if (!options.outDir) {
    return files;
  }

  return writeGeneratedFiles(options.outDir, files);
}

export function generateLuxThemeProject(options = {}) {
  const luxTheme = noctisThemes.find((theme) => theme.id === "noctis-lux");
  const files = buildProjectFiles([luxTheme]);

  if (!options.outDir) {
    return files;
  }

  return writeGeneratedFiles(options.outDir, files);
}

async function writeGeneratedFiles(outDir, files) {
  const written = [];

  for (const [relativePath, file] of Object.entries(files)) {
    const absolutePath = join(outDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
    written.push(absolutePath);
  }

  return { files, written };
}

async function main() {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await generateNoctisThemeProject({ outDir: projectRoot });
  for (const path of result.written) {
    console.log(`wrote ${path}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
