export type PotentiallyUnknown<T> = T | { type: "___UNKNOWN___" };

export interface Program {
  type: "Program";
  directives?: Directive[];
  body?: Body[];
}

export interface Directive {
  type: "Directive";
  directive: string;
}

export interface StringLiteral {
  type: "StringLiteral";
  value: string;
}
export type Body = PotentiallyUnknown<
  | ExportNamedDeclaration
  | ExportDefaultDeclaration
  | FunctionDeclaration
  | VariableDeclaration
  | ExpressionStatement
>;

export interface ExportNamedDeclaration {
  type: "ExportNamedDeclaration";
  declaration?: Declaration;
  specifiers?: ExportSpecifier[];
}

export interface ExportDefaultDeclaration {
  type: "ExportDefaultDeclaration";
  declaration: PotentiallyUnknown<Declaration> | IdentifierReference;
  exported: IdentifierName;
}

export interface ExportSpecifier {
  type: "ExportSpecifier";
  local: IdentifierName;
  exported: IdentifierName;
}

export interface IdentifierName {
  type: "IdentifierName";
  name: string;
}

export type Declaration = PotentiallyUnknown<
  FunctionDeclaration | VariableDeclaration
>;

export interface FunctionDeclaration {
  type: "FunctionDeclaration";
  id?: BindingIdentifier;
  body?: FunctionBody;
}

export interface BindingIdentifier {
  type: "BindingIdentifier";
  name: string;
}

export interface FunctionBody {
  type: "FunctionBody";
  directives?: Directive[];
}

export interface VariableDeclaration {
  type: "VariableDeclaration";
  declarations: VariableDeclarator[];
}

export interface BindingPattern {
  type: "BindingPattern";
  kind: BindingIdentifier;
}

export interface VariableDeclarator {
  type: "VariableDeclarator";
  id: BindingPattern;
  init: PotentiallyUnknown<Expression>;
}

export type Expression = PotentiallyUnknown<
  ArrowExpression | FunctionExpression | AssignmentExpression | CallExpression
>;

export interface ArrowExpression {
  type: "ArrowExpression";
  body: FunctionBody;
}

export interface FunctionExpression {
  type: "FunctionExpression";
  id?: BindingIdentifier;
  body: FunctionBody;
}

export interface AssignmentExpression {
  type: "AssignmentExpression";
  operator: string;
  left: PotentiallyUnknown<StaticMemberExpression>;
  right: Expression | IdentifierReference;
}

export interface StaticMemberExpression {
  type: "StaticMemberExpression";
  object: IdentifierReference;
  property: IdentifierName;
}

export interface CallExpression {
  type: "CallExpression";
  callee: PotentiallyUnknown<StaticMemberExpression | IdentifierReference>;
}

export interface IdentifierReference {
  type: "IdentifierReference";
  name: string;
}

export interface ExpressionStatement {
  type: "ExpressionStatement";
  expression: Expression;
}
