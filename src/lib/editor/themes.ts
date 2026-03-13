/**
 * CodeMirror Themes for Luau Playground
 *
 * Custom light and dark themes that match the playground's design.
 */

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";

// ============================================================================
// Theme Colors
// ============================================================================

interface ThemeColors {
  background: string;
  foreground: string;
  selection: string;
  activeLine: string;
  cursor: string;
  lineNumber: string;
  lineNumberActive: string;
  gutterBackground: string;
  matchingBracketBg: string;
  matchingBracketOutline: string;

  // Syntax
  keyword: string;
  string: string;
  number: string;
  comment: string;
  function: string;
  variable: string;
  type: string;
  operator: string;
  punctuation: string;
  bool: string;
  builtin: string;

  // Diagnostics
  error: string;
  errorBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
}

// Colors from design system palette (using CSS variables from app.css)
const darkColors: ThemeColors = {
  background: "var(--editor-surface-0)",
  foreground: "var(--color-extended-gray-200)",
  selection: "color-mix(in srgb, var(--color-blue-500) 30%, transparent)",
  activeLine: "var(--editor-surface-100)",
  cursor: "var(--color-blue-500)",
  lineNumber: "var(--color-extended-gray-600)",
  lineNumberActive: "var(--color-extended-gray-500)",
  gutterBackground: "var(--editor-surface-0)",
  matchingBracketBg: "color-mix(in srgb, var(--color-green-900) 40%, transparent)",
  matchingBracketOutline: "color-mix(in srgb, var(--color-green-900) 80%, transparent)",

  keyword: "var(--color-blue-500)",
  string: "var(--color-green-400)",
  number: "var(--color-purple-500)",
  comment: "var(--color-extended-gray-600)",
  function: "var(--color-carmine-400)",
  variable: "var(--color-extended-gray-300)",
  type: "var(--color-blue-400)",
  operator: "var(--color-carmine-400)",
  punctuation: "var(--color-extended-gray-400)",
  bool: "var(--color-purple-500)",
  builtin: "var(--color-purple-500)",

  error: "var(--color-red-700)",
  errorBg: "color-mix(in srgb, var(--color-red-700) 15%, transparent)",
  warning: "var(--color-yellow-400)",
  warningBg: "color-mix(in srgb, var(--color-yellow-400) 15%, transparent)",
  info: "var(--color-blue-500)",
  infoBg: "color-mix(in srgb, var(--color-blue-500) 15%, transparent)",
};

const lightColors: ThemeColors = {
  background: "var(--editor-surface-0)",
  foreground: "var(--color-extended-gray-900)",
  selection: "color-mix(in srgb, var(--color-blue-1000) 15%, transparent)",
  activeLine: "var(--editor-surface-100)",
  cursor: "var(--color-blue-1000)",
  lineNumber: "var(--color-extended-gray-600)",
  lineNumberActive: "var(--color-extended-gray-900)",
  gutterBackground: "var(--editor-surface-0)",
  matchingBracketBg: "color-mix(in srgb, var(--color-green-400) 30%, transparent)",
  matchingBracketOutline: "color-mix(in srgb, var(--color-green-400) 70%, transparent)",

  keyword: "var(--color-blue-1000)",
  string: "var(--color-green-900)",
  number: "var(--color-purple-1000)",
  comment: "var(--color-extended-gray-600)",
  function: "var(--color-carmine-900)",
  variable: "var(--color-extended-gray-900)",
  type: "var(--color-blue-900)",
  operator: "var(--color-carmine-900)",
  punctuation: "var(--color-extended-gray-800)",
  bool: "var(--color-purple-1000)",
  builtin: "var(--color-purple-1000)",

  error: "var(--color-red-900)",
  errorBg: "color-mix(in srgb, var(--color-red-900) 8%, transparent)",
  warning: "var(--color-yellow-800)",
  warningBg: "color-mix(in srgb, var(--color-yellow-800) 8%, transparent)",
  info: "var(--color-blue-1000)",
  infoBg: "color-mix(in srgb, var(--color-blue-1000) 8%, transparent)",
};

// ============================================================================
// Theme Factory
// ============================================================================

function createTheme(colors: ThemeColors, isDark: boolean): Extension {
  return [
    EditorView.theme(
      {
        "&": {
          backgroundColor: colors.background,
          color: colors.foreground,
        },
        ".cm-content": {
          caretColor: colors.cursor,
          fontFamily: "var(--font-mono)",
          position: "relative",
          zIndex: "1",
        },
        ".cm-cursor, .cm-dropCursor": {
          borderLeft: `2px solid ${colors.cursor}`,
          marginLeft: "-1px",
        },
        ".cm-scroller": {
          position: "relative",
        },
        ".cm-selectionLayer": {
          zIndex: "10 !important",
          pointerEvents: "none",
        },
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
          backgroundColor: `${colors.selection} !important`,
        },
        ".cm-gutters": {
          backgroundColor: colors.gutterBackground,
          color: colors.lineNumber,
          borderRight: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "transparent",
          color: colors.lineNumber,
        },
        "&.cm-focused .cm-activeLineGutter": {
          backgroundColor: colors.activeLine,
          color: colors.lineNumberActive,
        },
        ".cm-activeLine": {
          backgroundColor: "transparent",
        },
        "&.cm-focused .cm-activeLine": {
          backgroundColor: colors.activeLine,
        },
        ".cm-line": {
          padding: "0 16px 0 4px",
        },
        ".cm-matchingBracket": {
          backgroundColor: `${colors.matchingBracketBg} !important`,
          outline: `1px solid ${colors.matchingBracketOutline}`,
        },
        ".cm-selectionMatch": {
          backgroundColor: colors.matchingBracketBg,
        },
        ".cm-searchMatch": {
          backgroundColor: colors.matchingBracketBg,
        },
        ".cm-searchMatch-selected": {
          backgroundColor: colors.matchingBracketOutline,
        },

        // Tooltip styling
        ".cm-tooltip": {
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          boxShadow: "none",
          borderRadius: "4px",
          overflow: "hidden",
        },
        ".cm-diagnostic": {
          padding: "10px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          lineHeight: "1.5",
          borderLeft: "4px solid transparent",
        },
        ".cm-diagnostic-error": {
          // borderLeftColor: colors.error,
          backgroundColor: colors.errorBg,
        },
        ".cm-diagnostic-warning": {
          // borderLeftColor: colors.warning,
          backgroundColor: colors.warningBg,
        },
        ".cm-diagnostic-info": {
          // borderLeftColor: colors.info,
          backgroundColor: colors.infoBg,
        },

        // Autocomplete styling
        ".cm-completionDetail": {
          fontSize: "0.85em",
          opacity: "0.6",
          marginLeft: "0.5em",
        },

        // Search panel styling
        ".cm-panels": {
          backgroundColor: "var(--bg-secondary)",
          borderTop: "1px solid var(--bg-tertiary)",
        },
        ".cm-panels-bottom": {
          borderTop: "1px solid var(--bg-tertiary)",
          borderBottom: "none",
        },
        ".cm-panel.cm-search": {
          padding: "8px 12px",
          fontFamily: "inherit",
        },
        // Text input styling - matches buttons
        ".cm-textfield": {
          backgroundColor: "var(--bg-editor) !important",
          border: "1px solid var(--border-color) !important",
          borderRadius: "6px !important",
          padding: "6px 12px !important",
          fontSize: "14px !important",
          color: "var(--text-primary) !important",
          outline: "none !important",
          height: "32px !important",
          boxSizing: "border-box !important",
          verticalAlign: "middle !important",
        },
        ".cm-textfield:focus": {
          borderColor: "var(--accent) !important",
          boxShadow: "0 0 0 1px var(--accent) !important",
        },
        // Checkbox styling
        ".cm-search input[type='checkbox']": {
          width: "16px !important",
          height: "16px !important",
          accentColor: "var(--accent)",
          cursor: "pointer",
          margin: "0 !important",
          verticalAlign: "middle !important",
        },
        // Label styling - centered with checkbox
        ".cm-search label": {
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "var(--text-secondary)",
          fontSize: "14px",
          cursor: "pointer",
          verticalAlign: "middle",
          height: "32px",
        },
        // Button styling - matches Button component secondary variant
        ".cm-search button": {
          padding: "6px 12px !important",
          fontSize: "14px !important",
          fontWeight: "500",
          borderRadius: "6px !important",
          border: "none !important",
          cursor: "pointer",
          backgroundImage: "none !important",
          backgroundColor: "var(--bg-tertiary) !important",
          color: "var(--text-primary) !important",
          transition: "background-color 0.15s",
          height: "32px",
          boxSizing: "border-box",
        },
        ".cm-search button:hover": {
          backgroundColor: "var(--bg-primary) !important",
        },
        ".cm-search button[name='close']": {
          backgroundColor: "transparent !important",
          color: "var(--text-secondary)",
          padding: "4px 8px",
        },
        ".cm-search button[name='close']:hover": {
          backgroundColor: "transparent !important",
          color: "var(--text-primary)",
        },
      },
      { dark: isDark },
    ),

    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.keyword, color: colors.keyword },
        { tag: tags.string, color: colors.string },
        { tag: tags.number, color: colors.number },
        { tag: tags.bool, color: colors.bool },
        { tag: tags.null, color: colors.bool },
        { tag: tags.comment, color: colors.comment, fontStyle: "italic" },
        { tag: tags.function(tags.variableName), color: colors.function },
        { tag: tags.variableName, color: colors.variable },
        {
          tag: [
            tags.standard(tags.variableName),
            tags.definition(tags.variableName),
          ],
          color: colors.builtin,
        },
        { tag: tags.typeName, color: colors.type },
        { tag: tags.operator, color: colors.operator },
        { tag: tags.punctuation, color: colors.punctuation },
        { tag: tags.bracket, color: colors.punctuation },
      ]),
    ),
  ];
}

// ============================================================================
// Exported Themes
// ============================================================================

export const darkTheme = createTheme(darkColors, true);
export const lightTheme = createTheme(lightColors, false);
