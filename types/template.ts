import { ObjectId } from 'mongodb';

/** Shared template and placeholder typing used across the app. */
export type TableMode = 'row_data' | 'column_data';
export type ListStyle = 'bulleted' | 'numbered' | 'plain';
export type TextAlignStyle = 'left' | 'center' | 'right' | 'justify';

export interface ColumnStyle {
  align?: TextAlignStyle;
  color?: string;
  backgroundColor?: string;
}

/** Base schema discriminant for all placeholder value types. */
export interface BaseTypeSchema {
  kind: string;
}

export interface StringTypeSchema extends BaseTypeSchema {
  kind: 'string';
}

export interface IntegerTypeSchema extends BaseTypeSchema {
  kind: 'integer';
}

export interface ImageTypeSchema extends BaseTypeSchema {
  kind: 'image';
  dynamic_fields?: string[];
  static_values?: Record<string, unknown>;
}

export interface HyperlinkTypeSchema extends BaseTypeSchema {
  kind: 'hyperlink';
  dynamic_fields?: string[];
  static_values?: Record<string, unknown>;
}

export interface ListTypeSchema extends BaseTypeSchema {
  kind: 'list';
  item_type: ComponentTypeSchema;
  style?: ListStyle;
  min_items?: number;
  max_items?: number;
}

export interface ContainerTypeSchema extends BaseTypeSchema {
  kind: 'container';
  mode?: 'tuple' | 'repeat';
  component_types?: ComponentTypeSchema[];
  item_type?: ComponentTypeSchema;
  min_items?: number;
  max_items?: number;
}

export interface RepeatTypeSchema extends BaseTypeSchema {
  kind: 'repeat';
  item_type: ComponentTypeSchema;
  min_items?: number;
  max_items?: number;
  base_variable?: string;
  layout_template?: string;
}

export interface CustomLayoutTextNode {
  kind: 'text';
  value: string;
}

export interface CustomLayoutTokenNode {
  kind: 'token';
  token_id: string;
  prefix?: string;
  suffix?: string;
}

export interface CustomLayoutNewlineNode {
  kind: 'newline';
}

export type CustomLayoutNode =
  | CustomLayoutTextNode
  | CustomLayoutTokenNode
  | CustomLayoutNewlineNode;

/**
 * A token is a reusable component in the token library.
 * Can be a simple type (string, integer) or complex type (list, table).
 * For complex types with nested structure, supports nested token_registry.
 */
export interface TokenLibraryItemSchema extends BaseTypeSchema {
  id: string;
  label?: string;
  kind: ComponentTypeSchema['kind']; // Can be 'string', 'list', 'table', 'integer', 'image', etc.
  // For complex token types (list, table), define nested structure
  token_registry?: Record<string, ComponentTypeSchema>;
  token_labels?: Record<string, string>;
  layout_template?: string;
  layout_nodes?: CustomLayoutNode[];
  // List/Table specific attributes (if kind is 'list' or 'table')
  item_type?: ComponentTypeSchema; // for list tokens
  style?: ListStyle; // for list tokens
  mode?: TableMode; // for table tokens
  headers?: string[]; // for table tokens
  dynamic_headers?: boolean; // for table tokens
  column_types?: Record<string, ComponentTypeSchema>; // for table tokens
  row_types?: Record<string, ComponentTypeSchema>; // for table tokens
  caption?: string; // static caption for table tokens
  dynamic_fields?: string[]; // dynamic attributes for image/hyperlink/table tokens
  static_values?: Record<string, unknown>; // fixed values for non-dynamic attributes
}

/** @deprecated Use TokenLibraryItemSchema instead */
export type CustomPlaceholderItemSchema = TokenLibraryItemSchema;

export interface CustomTypeSchema extends BaseTypeSchema {
  kind: 'custom';
  base_variable: string;
  value_type: ComponentTypeSchema;
  // Token library replaces the old "items" concept
  token_library?: TokenLibraryItemSchema[];
  // Legacy fields for backward compatibility
  items?: CustomPlaceholderItemSchema[];
  token_registry?: Record<string, ComponentTypeSchema>;
  token_labels?: Record<string, string>;
  layout_template: string;
  layout_nodes?: CustomLayoutNode[];
  repeat?: boolean;
}

export interface PageTypeSchema extends BaseTypeSchema {
  kind: 'page';
  component_types: ComponentTypeSchema[];
}

export interface HeaderTypeSchema extends BaseTypeSchema {
  kind: 'header';
  component_types: ComponentTypeSchema[];
}

export interface FooterTypeSchema extends BaseTypeSchema {
  kind: 'footer';
  component_types: ComponentTypeSchema[];
}

export interface PageBreakTypeSchema extends BaseTypeSchema {
  kind: 'page_break';
}

export interface TableTypeSchema extends BaseTypeSchema {
  kind: 'table';
  mode?: TableMode;
  headers?: string[];
  dynamic_headers?: boolean;
  column_types?: Record<string, ComponentTypeSchema>;
  row_types?: Record<string, ComponentTypeSchema>;
  caption?: string; // static caption defined at template creation time
  dynamic_fields?: string[];
  static_values?: Record<string, unknown>;
  column_styles?: Record<string, ColumnStyle>;
}

/** Union of every placeholder schema supported by the editor and backend. */
export type ComponentTypeSchema =
  | StringTypeSchema
  | IntegerTypeSchema
  | ImageTypeSchema
  | HyperlinkTypeSchema
  | ListTypeSchema
  | ContainerTypeSchema
  | RepeatTypeSchema
  | CustomTypeSchema
  | PageTypeSchema
  | HeaderTypeSchema
  | FooterTypeSchema
  | PageBreakTypeSchema
  | TableTypeSchema;

/** Maps each placeholder key to the schema expected for its value. */
export type PlaceholderKeyTypeMap = Record<string, ComponentTypeSchema>;

/** Payload for image placeholders. */
export interface ImageValue {
  src: string;
  alt: string;
  source?: 'url' | 'file';
  mime_type?: string;
  file_name?: string;
}

/** Payload for hyperlink placeholders. */
export interface HyperlinkValue {
  alias: string;
  url: string;
}

/** Row-based table payload. */
export interface TableRowDataValue {
  caption?: ComponentValue;
  rows: Array<Record<string, unknown>>;
}

/** Column-based table payload. */
export interface TableColumnDataValue {
  caption?: ComponentValue;
  columns: Record<string, Record<string, unknown>>;
}

/** Composite payload for container placeholders. */
export interface ContainerValue {
  components: ComponentValue[];
}

export interface PageValue {
  components: ComponentValue[];
}

export interface HeaderValue {
  components: ComponentValue[];
}

export interface FooterValue {
  components: ComponentValue[];
}

/** Composite payload for list placeholders. */
export interface ListValue {
  items: ComponentValue[];
  style?: ListStyle;
}

export interface RepeatValue {
  items: ComponentValue[];
}

export interface CustomValue {
  data: unknown;
}

/** Primitive values that can appear inside typed composite payloads. */
export type PrimitiveComponentValue = string | number;

/** Any supported value that a placeholder can carry. */
export type ComponentValue =
  | PrimitiveComponentValue
  | ImageValue
  | HyperlinkValue
  | ListValue
  | ContainerValue
  | RepeatValue
  | CustomValue
  | PageValue
  | HeaderValue
  | FooterValue
  | TableRowDataValue
  | TableColumnDataValue;

/**
 * Template document structure in MongoDB
 */
export interface Template {
  _id: ObjectId;
  name: string;
  version: string;
  template: Record<string, any>; // ProseMirror/Tiptap JSON document
  tag_ids?: ObjectId[]; // Internal MongoDB ObjectId references linking to associated Tags
  created_on: Date;
  updated_on: Date;
}

/**
 * Input type for creating a new template
 */
export interface TemplateInput {
  name: string;
  version: string;
  template: Record<string, any>;
  tag_ids?: string[]; // Array of Tag ObjectIds passed as strings from the client
}

/**
 * Input type for updating an existing template
 */
export interface TemplateUpdate {
  name?: string;
  version?: string;
  template?: Record<string, any>;
  tag_ids?: string[]; // Array of Tag ObjectIds passed as strings from the client
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Frontend-friendly template shape returned by the API (serialized ObjectIds → strings).
 * Used across all client-side pages and components.
 */
export interface TemplateData {
  _id: string;
  name: string;
  version: string;
  template: Record<string, any>;
  tag_ids?: string[];
  created_on: string;
  updated_on: string;
}
