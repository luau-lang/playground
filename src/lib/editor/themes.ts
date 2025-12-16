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

const darkColors: ThemeColors = {
  background: "oklch(0.1 0.015 250)",
  foreground: "oklch(0.9 0.01 250)",
  selection: "rgba(60, 130, 200, 0.4)",
  activeLine: "oklch(0.15 0.01 250)",
  cursor: "oklch(0.6 0.25 270)",
  lineNumber: "oklch(0.45 0.02 250)",
  lineNumberActive: "oklch(0.7 0.02 250)",
  gutterBackground: "oklch(0.1 0.015 250)",
  matchingBracketBg: "oklch(0.25 0.05 160)",
  matchingBracketOutline: "oklch(0.4 0.1 160)",

  keyword: "oklch(0.75 0.15 300)",
  string: "oklch(0.7 0.15 140)",
  number: "oklch(0.75 0.12 70)",
  comment: "oklch(0.5 0.02 250)",
  function: "oklch(0.75 0.15 220)",
  variable: "oklch(0.85 0.05 250)",
  type: "oklch(0.7 0.15 180)",
  operator: "oklch(0.7 0.1 50)",
  punctuation: "oklch(0.65 0.02 250)",
  bool: "oklch(0.75 0.12 70)",
  builtin: "oklch(0.75 0.12 200)",

  error: "oklch(0.65 0.2 25)",
  errorBg: "oklch(0.2 0.08 25)",
  warning: "oklch(0.75 0.15 85)",
  warningBg: "oklch(0.2 0.06 85)",
  info: "oklch(0.65 0.15 220)",
  infoBg: "oklch(0.15 0.04 220)",
};

const lightColors: ThemeColors = {
  background: "#ffffff",
  foreground: "oklch(0.2 0.02 250)",
  selection: "rgba(60, 130, 200, 0.25)",
  activeLine: "oklch(0.97 0.005 250)",
  cursor: "oklch(0.5 0.28 270)",
  lineNumber: "oklch(0.6 0.02 250)",
  lineNumberActive: "oklch(0.3 0.02 250)",
  gutterBackground: "#ffffff",
  matchingBracketBg: "oklch(0.85 0.1 160)",
  matchingBracketOutline: "oklch(0.6 0.15 160)",

  keyword: "oklch(0.45 0.2 300)",
  string: "oklch(0.45 0.15 140)",
  number: "oklch(0.5 0.15 50)",
  comment: "oklch(0.55 0.02 250)",
  function: "oklch(0.45 0.2 220)",
  variable: "oklch(0.25 0.02 250)",
  type: "oklch(0.45 0.15 180)",
  operator: "oklch(0.45 0.12 50)",
  punctuation: "oklch(0.4 0.02 250)",
  bool: "oklch(0.5 0.15 50)",
  builtin: "oklch(0.45 0.15 200)",

  error: "oklch(0.55 0.22 25)",
  errorBg: "oklch(0.97 0.04 25)",
  warning: "oklch(0.55 0.18 85)",
  warningBg: "oklch(0.97 0.04 85)",
  info: "oklch(0.5 0.18 220)",
  infoBg: "oklch(0.97 0.02 220)",
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
          borderLeftColor: colors.cursor,
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
          backgroundColor: colors.activeLine,
          color: colors.lineNumberActive,
        },
        ".cm-activeLine": {
          backgroundColor: colors.activeLine,
        },
        ".cm-line": {
          padding: "0 16px 0 4px",
        },
        ".cm-matchingBracket": {
          backgroundColor: colors.matchingBracketBg,
          outline: `1px solid ${colors.matchingBracketOutline}`,
        },

        // Tooltip styling
        ".cm-tooltip": {
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--bg-tertiary)",
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
      },
      { dark: isDark }
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
      ])
    ),
  ];
}

// ============================================================================
// Exported Themes
// ============================================================================

export const darkTheme = createTheme(darkColors, true);
export const lightTheme = createTheme(lightColors, false);
