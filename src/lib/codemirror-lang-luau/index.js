import { LRLanguage, LanguageSupport } from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";
import { parser } from "./parser.js";

const luauHighlight = styleTags({
  "do then end while for in repeat until if elseif else return break": t.controlKeyword,
  "local function": t.definitionKeyword,
  "and or not": t.operatorKeyword,
  "read write": t.modifier,
  "typeof": t.operatorKeyword,
  "ContinueStatement/continue": t.controlKeyword,
  "TypeDeclaration/type ExportTypeDeclaration/type TypeFunctionDeclaration/type ExportTypeFunctionDeclaration/type": t.definitionKeyword,
  "ExportTypeDeclaration/export ExportTypeFunctionDeclaration/export": t.definitionKeyword,
  "true false": t.bool,
  "nil": t.null,
  Number: t.number,
  String: t.string,
  StringContentDouble: t.string,
  StringContentSingle: t.string,
  Escape: t.string,
  LongString: t.string,
  InterpChunk: t.string,
  InterpStart: t.string,
  InterpEnd: t.string,
  LineComment: t.lineComment,
  LongComment: t.blockComment,
  Identifier: t.variableName,
  Name: t.variableName,
  "Param/Binding/Name/Identifier": t.definition(t.variableName),
  "ForNumericStatement/Binding/Name/Identifier": t.definition(t.variableName),
  "ForGenericStatement/BindingList/Binding/Name/Identifier": t.definition(t.variableName),
  TypeName: t.typeName,
  "TypeName/Identifier TypeName/Name/Identifier": t.typeName,
  "GenericTypePack/Name/Identifier": t.typeName,
  "TypeDeclaration/Identifier ExportTypeDeclaration/Identifier TypeFunctionDeclaration/Identifier ExportTypeFunctionDeclaration/Identifier": t.definition(t.typeName),
  "TypeDeclaration/Name/Identifier ExportTypeDeclaration/Name/Identifier TypeFunctionDeclaration/Name/Identifier ExportTypeFunctionDeclaration/Name/Identifier": t.definition(t.typeName),
  "GenericTypeParam/Identifier GenericTypeParam/Name/Identifier": t.definition(t.typeName),
  "GenericTypeParamWithDefault/Identifier GenericTypeParamWithDefault/Name/Identifier": t.definition(t.typeName),
  "GenericTypeParam/GenericTypePack/Name/Identifier GenericTypeParamWithDefault/GenericTypePack/Name/Identifier": t.definition(t.typeName),
  "FunctionName/Identifier FunctionName/Name/Identifier": t.function(t.variableName),
  "LocalFunctionDeclaration/Identifier LocalFunctionDeclaration/Name/Identifier": t.function(t.variableName),
  "CallExpression/PrimaryExpression/Name CallExpression/PrimaryExpression/Name/Identifier": t.function(t.variableName),
  "CallExpression/FieldSuffix/Name CallExpression/FieldSuffix/Name/Identifier": t.function(t.variableName),
  "CallSuffix/Name CallSuffix/Name/Identifier": t.function(t.variableName),
  "BoundType/Identifier BoundType/Name/Identifier": t.definition(t.variableName),
  Attribute: t.meta,
  AssignOp: t.definitionOperator,
  CompoundAssignOp: t.definitionOperator,
  CompareOp: t.compareOperator,
  ShiftOp: t.bitwiseOperator,
  UnaryOp: t.operator,
  "TypeAnnotation/TypeColon ReturnType/TypeColon VarArgAnnotation/TypeColon TableProp/TypeColon TableIndexer/TypeColon BoundType/TypeColon": t.typeOperator,
  "TypeCast TypeArrow": t.typeOperator,
  "..": t.arithmeticOperator,
  ".": t.derefOperator,
  ", ;": t.separator,
  TypeColon: t.punctuation,
  ParenL: t.paren,
  ParenR: t.paren,
  BracketL: t.squareBracket,
  BracketR: t.squareBracket,
  BraceL: t.brace,
  BraceR: t.brace,
  "InterpOpen InterpClose": t.special(t.brace),
});

export const luauLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [luauHighlight],
  }),
  languageData: {
    commentTokens: { line: "--", block: { open: "--[[", close: "]]" } },
  },
});

export function luau() {
  return new LanguageSupport(luauLanguage);
}
