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

// Colors from design system palette
const darkColors: ThemeColors = {
  background: "oklch(0.1 0.015 250)",
  foreground: "rgb(238, 239, 241)", // gray-200
  selection: "rgba(112, 160, 255, 0.3)", // blue-500
  activeLine: "rgb(25, 26, 31)", // gray-1100
  cursor: "rgb(112, 160, 255)", // blue-500
  lineNumber: "rgb(106, 111, 129)", // gray-600
  lineNumberActive: "rgb(188, 190, 200)", // gray-500
  gutterBackground: "oklch(0.1 0.015 250)",
  matchingBracketBg: "rgba(101, 215, 157, 0.2)", // green-400
  matchingBracketOutline: "rgb(101, 215, 157)", // green-400

  keyword: "rgb(112, 160, 255)", // blue-500
  string: "rgb(101, 215, 157)", // green-400
  number: "rgb(197, 156, 249)", // purple-500
  comment: "rgb(106, 111, 129)", // gray-600
  function: "rgb(255, 155, 192)", // carmine-400
  variable: "rgb(230, 231, 234)", // gray-300
  type: "rgb(143, 180, 255)", // blue-400
  operator: "rgb(255, 155, 192)", // carmine-400
  punctuation: "rgb(213, 215, 221)", // gray-400
  bool: "rgb(197, 156, 249)", // purple-500
  builtin: "rgb(197, 156, 249)", // purple-500

  error: "rgb(231, 87, 80)", // red-700
  errorBg: "rgba(231, 87, 80, 0.15)",
  warning: "rgb(242, 186, 42)", // yellow-400
  warningBg: "rgba(242, 186, 42, 0.15)",
  info: "rgb(112, 160, 255)", // blue-500
  infoBg: "rgba(112, 160, 255, 0.15)",
};

const lightColors: ThemeColors = {
  background: "#ffffff",
  foreground: "rgb(39, 41, 48)", // gray-900
  selection: "rgba(0, 45, 214, 0.15)", // blue-1000
  activeLine: "rgb(247, 247, 248)", // gray-100
  cursor: "rgb(0, 45, 214)", // blue-1000
  lineNumber: "rgb(106, 111, 129)", // gray-600
  lineNumberActive: "rgb(39, 41, 48)", // gray-900
  gutterBackground: "#ffffff",
  matchingBracketBg: "rgba(2, 114, 64, 0.15)", // green-900
  matchingBracketOutline: "rgb(2, 114, 64)", // green-900

  keyword: "rgb(0, 45, 214)", // blue-1000
  string: "rgb(2, 114, 64)", // green-900
  number: "rgb(108, 33, 198)", // purple-1000
  comment: "rgb(106, 111, 129)", // gray-600
  function: "rgb(190, 26, 97)", // carmine-900
  variable: "rgb(39, 41, 48)", // gray-900
  type: "rgb(0, 53, 245)", // blue-900
  operator: "rgb(190, 26, 97)", // carmine-900
  punctuation: "rgb(53, 55, 65)", // gray-800
  bool: "rgb(108, 33, 198)", // purple-1000
  builtin: "rgb(108, 33, 198)", // purple-1000

  error: "rgb(197, 18, 10)", // red-900
  errorBg: "rgba(197, 18, 10, 0.08)",
  warning: "rgb(151, 108, 0)", // yellow-800
  warningBg: "rgba(151, 108, 0, 0.08)",
  info: "rgb(0, 45, 214)", // blue-1000
  infoBg: "rgba(0, 45, 214, 0.08)",
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
